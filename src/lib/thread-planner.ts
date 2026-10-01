// Builds (or rebuilds) a book's thread map with one AI call and saves it on
// the project. Works for brand-new outlines and for books with chapters
// already written — written chapters anchor where their threads start.

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { useSettingsStore } from '../store/settings';
import { generateText } from './generate';
import { analysisModel } from './models';
import { getStructureById } from './story-structures';
import { buildThreadPlanPrompt, parseThreadPlan, type ThreadPlan } from './story-threads';

const inFlight = new Map<string, Promise<ThreadPlan>>();

export function buildThreadMap(projectId: string): Promise<ThreadPlan> {
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

    const result = await generateText({
      prompt: buildThreadPlanPrompt({
        title: project.title,
        genre,
        chapters,
        canon,
        structureName: structure && !structure.isProcess ? structure.name : undefined,
      }),
      model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel),
      maxTokens: 8000,
      action: 'plan-threads',
      projectId,
    });
    const plan = parseThreadPlan(result.text || '', chapters.length);
    if (!plan) throw new Error('Could not read the thread map. Try again.');
    useStore.getState().updateProject(projectId, { threadPlan: plan });
    return plan;
  })();
  inFlight.set(projectId, work);
  work.finally(() => inFlight.delete(projectId)).catch(() => {});
  return work;
}

/** The in-progress build for a project, if one is running (e.g. started at creation). */
export function pendingThreadMap(projectId: string): Promise<ThreadPlan> | undefined {
  return inFlight.get(projectId);
}
