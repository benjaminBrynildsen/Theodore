// Builds (or rebuilds) a book's arc map — character arcs and artifact
// journeys — with one AI call and saves it on the project. Runs after the
// thread map when there is one, so arcs line up with the plot's reveals.
// Progress mirrors the thread planner: elapsed time while the model reads the
// outline, then a running count of characters and objects as they arrive.

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { useSettingsStore } from '../store/settings';
import { useGenerationStore } from '../store/generation';
import { useAuthStore } from '../store/auth';
import { analysisModel } from './models';
import { buildArcPlanPrompt, parseArcPlan, type ArcPlan } from './story-arcs';
import { runPlanRequest, savedJobId } from './plan-transport';
import { threadMapPct } from './thread-planner';
import { resolveCanonEntry } from './story-memory';
import { junkNameReason } from './canon-cleanup';
import type { CharacterEntry } from '../types/canon';
import { recordProjectAuthorship } from './authorship-log';

export interface ArcMapProgress {
  phase: 'reading' | 'mapping' | 'saving';
  found: number;
  expected: number;
  elapsedMs: number;
  /** 0-100, for a progress bar. */
  pct: number;
}

const JOB_KEY = (projectId: string) => `theodore:arc-map-job:${projectId}`;

const inFlight = new Map<string, Promise<ArcPlan>>();
const progressByProject = new Map<string, ArcMapProgress>();
const listeners = new Map<string, Set<(p: ArcMapProgress | null) => void>>();

function emit(projectId: string, p: ArcMapProgress | null) {
  if (p) progressByProject.set(projectId, p);
  else progressByProject.delete(projectId);
  for (const cb of listeners.get(projectId) || []) cb(p);
}

export function subscribeArcMapProgress(projectId: string, cb: (p: ArcMapProgress | null) => void): () => void {
  if (!listeners.has(projectId)) listeners.set(projectId, new Set());
  listeners.get(projectId)!.add(cb);
  cb(progressByProject.get(projectId) || null);
  return () => { listeners.get(projectId)?.delete(cb); };
}

/** Roughly how many characters + objects the planner maps (mirrors the prompt's ranges). */
export function expectedArcCount(chapterCount: number): number {
  if (chapterCount >= 16) return 9;
  if (chapterCount >= 9) return 7;
  return 4;
}

export function pendingArcMap(projectId: string): Promise<ArcPlan> | undefined {
  return inFlight.get(projectId);
}

/** Resume an arc-map job left running when the page was closed or reloaded. */
export function resumeArcMapIfPending(projectId: string): Promise<ArcPlan> | undefined {
  if (inFlight.has(projectId)) return inFlight.get(projectId);
  const jobId = savedJobId(JOB_KEY(projectId));
  if (!jobId || !useAuthStore.getState().user) return undefined;
  return buildArcMap(projectId, { resumeJobId: jobId });
}

/** Objects the arc map plans become canon entries, so they're in the story bible from the start. */
function addPlannedObjectsToCanon(projectId: string, plan: ArcPlan): void {
  const canon = useCanonStore.getState();
  const current = canon.getProjectEntries(projectId);
  for (const a of plan.artifacts) {
    if (junkNameReason(a.name) || resolveCanonEntry(a.name, current, ['artifact'])) continue;
    const entry = canon.createArtifact(projectId, a.name);
    entry.description = [a.description, a.significance].filter(Boolean).join(' — ') || `Planned object; appears in Chapter ${a.introducedIn}.`;
    entry.tags = Array.from(new Set([...(entry.tags || []), 'arc-map']));
    entry.notes = `Planned by the arc map: appears in Ch.${a.introducedIn}, pays off in Ch.${a.payoffIn}.`;
    canon.addEntry(entry);
    current.push(entry);
  }
}

/**
 * The map's character limits and supporting cast go into the story bible:
 * a limit fills an empty "Condition & limits", and a recurring character
 * with no profile yet gets one, so the writer sees them like any lead.
 * Never overwrites what the author wrote.
 */
function syncPlannedCastToCanon(projectId: string, plan: ArcPlan): void {
  const canon = useCanonStore.getState();
  const current = canon.getProjectEntries(projectId);
  const people = [
    ...plan.characters.map((c) => ({ name: c.name, who: '', limits: c.limits, role: c.role })),
    ...(plan.cast || []).map((m) => ({ name: m.name, who: m.who, limits: m.limits, role: 'supporting' as const })),
  ];
  for (const p of people) {
    if (junkNameReason(p.name)) continue;
    const existing = resolveCanonEntry(p.name, current, ['character']) as CharacterEntry | undefined;
    if (existing) {
      if (p.limits && !existing.character?.condition?.trim()) {
        canon.updateEntry(existing.id, { character: { ...existing.character, condition: p.limits } } as Partial<CharacterEntry>);
      }
      continue;
    }
    if (!p.who) continue; // arc characters without a profile are rare; the cast note is what describes someone new
    const entry = canon.createCharacter(projectId, p.name);
    entry.description = p.who;
    entry.character.role = p.role;
    if (p.limits) entry.character.condition = p.limits;
    entry.tags = Array.from(new Set([...(entry.tags || []), 'arc-map']));
    entry.notes = 'Added from the character & object map.';
    canon.addEntry(entry);
    current.push(entry);
  }
}

export function buildArcMap(projectId: string, opts: { resumeJobId?: string } = {}): Promise<ArcPlan> {
  const existing = inFlight.get(projectId);
  if (existing) return existing;

  const work = (async () => {
    const store = useStore.getState();
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error('Project not found');
    const chapters = store.getProjectChapters(projectId);
    if (chapters.length < 2) throw new Error('Add at least two chapters to build the character & object map.');
    const canon = useCanonStore.getState().getProjectEntries(projectId);
    const genre = project.narrativeControls?.genreEmphasis?.length
      ? project.narrativeControls.genreEmphasis.join(', ')
      : undefined;

    const expected = expectedArcCount(chapters.length);
    const startedAt = Date.now();
    let found = 0;
    let phase: ArcMapProgress['phase'] = 'reading';
    const report = () => {
      const elapsedMs = Date.now() - startedAt;
      const p: ArcMapProgress = { phase, found, expected, elapsedMs, pct: threadMapPct(phase, elapsedMs, found, expected) };
      emit(projectId, p);
      const gen = useGenerationStore.getState();
      const subtitle = phase === 'reading'
        ? `Reading your outline… ${Math.round(elapsedMs / 1000)}s`
        : phase === 'saving' ? 'Saving the map…' : `${found} of ~${expected} characters & objects mapped`;
      if (gen.kind === 'map-arcs') gen.setProgress(p.pct, subtitle);
      else if (gen.kind === 'create-project' && gen.phase !== 'done') gen.setSubtitle(`Mapping character arcs · ${subtitle}`);
    };

    const gen = useGenerationStore.getState();
    const ownsBar = !gen.kind || gen.phase === 'done';
    if (ownsBar) gen.start({ kind: 'map-arcs', label: project.title, subtitle: 'Reading your outline…' });
    report();
    const ticker = setInterval(report, 1000);

    let text = '';
    let failure: string | null = null;
    const onPartial = (full: string) => {
      text = full;
      phase = 'mapping';
      const n = (full.match(/"name"\s*:/g) || []).length;
      if (n !== found) {
        found = n;
        report();
      }
    };
    try {
      text = await runPlanRequest({
        action: 'plan-arcs',
        jobKey: JOB_KEY(projectId),
        label: 'character & object map',
        prompt: opts.resumeJobId ? '' : buildArcPlanPrompt({
          title: project.title,
          genre,
          chapters,
          canon,
          threadPlan: project.threadPlan,
        }),
        model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel),
        projectId,
      }, onPartial, opts.resumeJobId);
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    } finally {
      clearInterval(ticker);
    }

    try {
      if (failure) throw new Error(failure);
      phase = 'saving';
      report();
      const plan = parseArcPlan(text, chapters.length);
      if (!plan) throw new Error('The character & object map came back incomplete. Try again.');
      useStore.getState().updateProject(projectId, { arcPlan: plan });
      recordProjectAuthorship(projectId, { kind: 'ai-plan-arcs', model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel), note: `${plan.characters.length} character arcs, ${plan.artifacts.length} objects` });
      addPlannedObjectsToCanon(projectId, plan);
      syncPlannedCastToCanon(projectId, plan);
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
