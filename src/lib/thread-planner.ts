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
import { runPlanRequest, savedJobId, type PlanRequest } from './plan-transport';
import { useAuthStore } from '../store/auth';
import { analysisModel } from './models';
import { getStructureById } from './story-structures';
import { buildThreadPlanPrompt, parseThreadPlan, type ThreadPlan } from './story-threads';
import { recordProjectAuthorship } from './authorship-log';

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

const JOB_KEY = (projectId: string) => `theodore:thread-map-job:${projectId}`;

/** Resume a thread-map job left running when the page was closed or reloaded. */
export function resumeThreadMapIfPending(projectId: string): Promise<ThreadPlan> | undefined {
  if (inFlight.has(projectId)) return inFlight.get(projectId);
  const jobId = savedJobId(JOB_KEY(projectId));
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
      const req: PlanRequest = {
        action: 'plan-threads',
        jobKey: JOB_KEY(projectId),
        label: 'thread map',
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
      text = await runPlanRequest(req, onPartial, opts.resumeJobId);
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
      recordProjectAuthorship(projectId, { kind: 'ai-plan-threads', model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel), note: `${plan.threads.length} plot lines across ${plan.chapterCount} chapters` });
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
