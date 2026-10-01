// Builds (or rebuilds) a book's thread map with one streamed AI call and saves
// it on the project. Works for brand-new outlines and for books with chapters
// already written — written chapters anchor where their threads start.
//
// Streaming keeps the connection alive through the model's thinking time and
// lets us report progress: elapsed time while it reads the outline, then a
// running count of threads as they arrive.

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { useSettingsStore } from '../store/settings';
import { useGenerationStore } from '../store/generation';
import { generateStream } from './generate';
import { useAuthStore } from '../store/auth';
import { analysisModel } from './models';
import { getStructureById } from './story-structures';
import { buildThreadPlanPrompt, parseThreadPlan, type ThreadPlan } from './story-threads';

export interface ThreadMapProgress {
  phase: 'reading' | 'mapping' | 'saving';
  threadsFound: number;
  threadsExpected: number;
  elapsedMs: number;
  /** 0-100, for a progress bar. */
  pct: number;
}

const inFlight = new Map<string, Promise<ThreadPlan>>();
const progressByProject = new Map<string, ThreadMapProgress>();
const listeners = new Map<string, Set<(p: ThreadMapProgress | null) => void>>();

function emit(projectId: string, p: ThreadMapProgress | null) {
  if (p) progressByProject.set(projectId, p);
  else progressByProject.delete(projectId);
  for (const cb of listeners.get(projectId) || []) cb(p);
}

export function subscribeThreadMapProgress(projectId: string, cb: (p: ThreadMapProgress | null) => void): () => void {
  if (!listeners.has(projectId)) listeners.set(projectId, new Set());
  listeners.get(projectId)!.add(cb);
  cb(progressByProject.get(projectId) || null);
  return () => { listeners.get(projectId)?.delete(cb); };
}

/** Roughly how many threads the planner asks for, given the chapter count (mirrors the prompt). */
export function expectedThreadCount(chapterCount: number): number {
  if (chapterCount >= 16) return 20;
  if (chapterCount >= 9) return 14;
  return 9;
}

/** Reading the outline creeps toward 20%; mapping fills 20-95% by threads found. */
export function threadMapPct(phase: ThreadMapProgress['phase'], elapsedMs: number, found: number, expected: number): number {
  if (phase === 'saving') return 98;
  if (phase === 'reading') return Math.round(20 * (1 - Math.exp(-elapsedMs / 45_000)));
  return Math.round(20 + 75 * Math.min(1, found / Math.max(1, expected)));
}

// ---------- Transport ----------
// Signed-in users run the map as a server-side job and poll for it, so the
// work survives iOS suspending the page (phone locked, app switched) — a
// single long request is killed in that case ("Load failed"). Guests, who
// can't create jobs, stream instead.

const JOB_KEY = (projectId: string) => `theodore:thread-map-job:${projectId}`;
const POLL_MS = 2000;
const GIVE_UP_MS = 12 * 60 * 1000;

interface ThreadRequest {
  prompt: string;
  model: string;
  projectId: string;
}

function savedJobId(projectId: string): string | null {
  try { return localStorage.getItem(JOB_KEY(projectId)); } catch { return null; }
}
function saveJobId(projectId: string, jobId: string | null) {
  try {
    if (jobId) localStorage.setItem(JOB_KEY(projectId), jobId);
    else localStorage.removeItem(JOB_KEY(projectId));
  } catch { /* storage unavailable */ }
}

const sleep = (ms: number) => new Promise<void>((resolve) => {
  // Wake early when the page becomes visible again (timers stall while hidden).
  const done = () => { clearTimeout(t); document.removeEventListener('visibilitychange', onVis); resolve(); };
  const onVis = () => { if (document.visibilityState === 'visible') done(); };
  const t = setTimeout(done, ms);
  document.addEventListener('visibilitychange', onVis);
});

async function pollJob(jobId: string, onPartial: (text: string) => void): Promise<string> {
  const started = Date.now();
  for (;;) {
    let res: Response | null = null;
    try {
      res = await fetch(`/api/generate/job/${encodeURIComponent(jobId)}`, { credentials: 'include' });
    } catch {
      // Network blip or suspended page — keep waiting; the job runs server-side.
    }
    if (res?.status === 404) throw new Error('The thread map job was lost. Try again.');
    if (res?.ok) {
      const data = await res.json().catch(() => null) as { status?: string; text?: string; partial?: string; error?: string } | null;
      if (data?.status === 'complete') return data.text || '';
      if (data?.status === 'error') throw new Error(data.error || 'Thread map failed.');
      if (data?.partial) onPartial(data.partial);
    }
    if (Date.now() - started > GIVE_UP_MS) throw new Error('The thread map is taking too long. Try again.');
    await sleep(POLL_MS);
  }
}

async function requestViaJob(req: ThreadRequest, onPartial: (text: string) => void, resumeJobId?: string | null): Promise<string> {
  let jobId = resumeJobId || null;
  if (!jobId) {
    const res = await fetch('/api/generate/job', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: req.prompt, model: req.model, maxTokens: 8000, action: 'plan-threads', projectId: req.projectId }),
    });
    if (res.status === 402) throw new Error('INSUFFICIENT_CREDITS');
    const data = await res.json().catch(() => ({})) as { jobId?: string; error?: string };
    if (!res.ok || !data.jobId) throw new Error(data.error || `Thread map failed (${res.status}).`);
    jobId = data.jobId;
    saveJobId(req.projectId, jobId);
  }
  try {
    return await pollJob(jobId, onPartial);
  } finally {
    saveJobId(req.projectId, null);
  }
}

async function requestViaStream(req: ThreadRequest, onPartial: (text: string) => void): Promise<string> {
  let text = '';
  let failure: string | null = null;
  await generateStream(
    { prompt: req.prompt, model: req.model, maxTokens: 8000, action: 'plan-threads', projectId: req.projectId },
    (chunk) => { text += chunk; onPartial(text); },
    undefined,
    (error) => { failure = error; },
  );
  if (failure) throw new Error(failure);
  return text;
}

/** Resume a thread-map job left running when the page was closed or reloaded. */
export function resumeThreadMapIfPending(projectId: string): Promise<ThreadPlan> | undefined {
  if (inFlight.has(projectId)) return inFlight.get(projectId);
  const jobId = savedJobId(projectId);
  if (!jobId || !useAuthStore.getState().user) return undefined;
  return buildThreadMap(projectId, { resumeJobId: jobId });
}

export function buildThreadMap(projectId: string, opts: { resumeJobId?: string } = {}): Promise<ThreadPlan> {
  const existing = inFlight.get(projectId);
  if (existing) return existing;

  const work = (async () => {
    const store = useStore.getState();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');
    const chapters = store.getProjectChapters(projectId);
    if (chapters.length < 2) throw new Error('Add at least two chapters to build a thread map.');
    const canon = useCanonStore.getState().getProjectEntries(projectId);
    const structure = getStructureById(project.storyStructureId || 'plot-pyramid');
    const genre = project.narrativeControls?.genreEmphasis?.length
      ? project.narrativeControls.genreEmphasis.join(', ')
      : undefined;

    const expected = expectedThreadCount(chapters.length);
    const startedAt = Date.now();
    let found = 0;
    let phase: ThreadMapProgress['phase'] = 'reading';
    const report = () => {
      const elapsedMs = Date.now() - startedAt;
      const p: ThreadMapProgress = { phase, threadsFound: found, threadsExpected: expected, elapsedMs, pct: threadMapPct(phase, elapsedMs, found, expected) };
      emit(projectId, p);
      const gen = useGenerationStore.getState();
      const subtitle = phase === 'reading'
        ? `Reading your outline… ${Math.round(elapsedMs / 1000)}s`
        : phase === 'saving' ? 'Saving the map…' : `${found} of ~${expected} threads mapped`;
      if (gen.kind === 'map-threads') gen.setProgress(p.pct, subtitle);
      // During project creation the bar belongs to 'create-project' — just narrate.
      else if (gen.kind === 'create-project' && gen.phase !== 'done') gen.setSubtitle(`Mapping plot threads · ${subtitle}`);
    };

    // The global bar may already be showing project creation — don't take it over.
    const gen = useGenerationStore.getState();
    const ownsBar = !gen.kind || gen.phase === 'done';
    if (ownsBar) gen.start({ kind: 'map-threads', label: project.title, subtitle: 'Reading your outline…' });
    report();
    const ticker = setInterval(report, 1000);

    let text = '';
    let failure: string | null = null;
    const onPartial = (full: string) => {
      text = full;
      phase = 'mapping';
      const n = (full.match(/"title"\s*:/g) || []).length;
      if (n !== found) {
        found = n;
        report();
      }
    };
    try {
      const req: ThreadRequest = {
        prompt: opts.resumeJobId ? '' : buildThreadPlanPrompt({
          title: project.title,
          genre,
          chapters,
          canon,
          structureName: structure && !structure.isProcess ? structure.name : undefined,
        }),
        model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel),
        projectId,
      };
      text = useAuthStore.getState().user
        ? await requestViaJob(req, onPartial, opts.resumeJobId)
        : await requestViaStream(req, onPartial);
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    } finally {
      clearInterval(ticker);
    }

    try {
      if (failure) throw new Error(failure === 'INSUFFICIENT_CREDITS' ? 'INSUFFICIENT_CREDITS' : failure);
      phase = 'saving';
      report();
      const plan = parseThreadPlan(text, chapters.length);
      if (!plan) throw new Error('The thread map came back incomplete. Try again.');
      useStore.getState().updateProject(projectId, { threadPlan: plan });
      if (ownsBar) useGenerationStore.getState().setPhase('done');
      return plan;
    } catch (e) {
      if (ownsBar) useGenerationStore.getState().end();
      throw e;
    }
  })();

  inFlight.set(projectId, work);
  work.finally(() => {
    inFlight.delete(projectId);
    emit(projectId, null);
  }).catch(() => {});
  return work;
}

/** The in-progress build for a project, if one is running (e.g. started at creation). */
export function pendingThreadMap(projectId: string): Promise<ThreadPlan> | undefined {
  return inFlight.get(projectId);
}
