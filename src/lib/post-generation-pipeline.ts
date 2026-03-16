/**
 * Post-generation pipeline — automatically runs after chapter prose is generated.
 * Orchestrates: scene decomposition → dialogue tagging → SFX tagging → entity scanning.
 * All steps are fire-and-forget from the caller's perspective.
 */

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { useSettingsStore } from '../store/settings';
import { generateText } from './generate';
import { buildSceneDecompositionPrompt, buildSceneProseSplitPrompt } from './prompt-builder';
import { tagDialogue } from './dialogue-tagger';
import { tagSFX } from './sfx-tagger';
import { generateId } from './utils';
import type { Scene } from '../types';

/**
 * Lightweight post-edit pipeline — runs after AI-driven edits.
 * Only re-scans entities (fast) and re-tags the affected scene's dialogue.
 * Debounced to avoid firing on rapid successive edits.
 */
const postEditTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function schedulePostEditPipeline(chapterId: string, editedSceneId?: string): void {
  const existing = postEditTimers.get(chapterId);
  if (existing) clearTimeout(existing);

  postEditTimers.set(chapterId, setTimeout(async () => {
    postEditTimers.delete(chapterId);
    console.info('[PostEdit Pipeline] Running for chapter', chapterId);

    try {
      // Re-scan entities (picks up new characters, locations, etc. from edits)
      await runEntityScan(chapterId);

      // If a specific scene was edited, re-tag just that scene
      if (editedSceneId) {
        const store = useStore.getState();
        const chapter = store.chapters.find((c) => c.id === chapterId);
        const scene = chapter?.scenes?.find((s) => s.id === editedSceneId);
        if (chapter && scene?.prose?.trim()) {
          const project = store.projects.find((p) => p.id === chapter.projectId);
          if (project) {
            const characterEntries = useCanonStore.getState().getProjectEntries(project.id).filter((e) => e.type === 'character');
            const characterNames = characterEntries.map((e) => e.name);

            const tagged = await tagDialogue(scene.prose, characterNames, project.id, chapter.id);
            store.updateScene(chapter.id, scene.id, { prose: tagged });
            store.syncScenesToProse(chapterId);
          }
        }
      }
    } catch (e) {
      console.warn('[PostEdit Pipeline] Error (non-blocking):', e);
    }

    console.info('[PostEdit Pipeline] Complete');
  }, 3000)); // 3 second debounce
}

/** Run the full post-generation pipeline for a chapter. */
export async function runPostGenerationPipeline(chapterId: string): Promise<void> {
  const store = useStore.getState();
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter?.prose?.trim()) return;

  console.info('[PostGen Pipeline] Starting for chapter', chapter.number, chapterId);

  // Run entity scanning and scene decomposition in parallel
  const [, scenes] = await Promise.all([
    runEntityScan(chapterId).catch((e) => console.warn('[PostGen] Entity scan failed:', e)),
    runSceneDecomposition(chapterId).catch((e) => {
      console.warn('[PostGen] Scene decomposition failed:', e);
      return null;
    }),
  ]);

  // If scenes were generated, run dialogue + SFX tagging on each scene
  if (scenes?.length) {
    await runSceneTagging(chapterId, scenes).catch((e) =>
      console.warn('[PostGen] Scene tagging failed:', e),
    );
  }

  console.info('[PostGen Pipeline] Complete for chapter', chapter.number);
}

/** Step 1: AI-powered entity/artifact scanning with refinement */
async function runEntityScan(chapterId: string): Promise<void> {
  console.info('[PostGen] Running entity scan...');
  await useStore.getState().rescanChapterMetadata(chapterId);
  console.info('[PostGen] Entity scan complete');
}

/** Step 2: Scene decomposition — break prose into scenes */
async function runSceneDecomposition(chapterId: string): Promise<Scene[] | null> {
  const store = useStore.getState();
  const settings = useSettingsStore.getState().settings;
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter?.prose?.trim()) return null;

  const project = store.projects.find((p) => p.id === chapter.projectId);
  if (!project) return null;

  // Skip if chapter already has scenes
  if (chapter.scenes?.length) {
    console.info('[PostGen] Chapter already has scenes, skipping decomposition');
    return chapter.scenes;
  }

  console.info('[PostGen] Running scene decomposition...');

  const allChapters = store.getProjectChapters(project.id);
  const canonEntries = useCanonStore.getState().getProjectEntries(project.id);

  const prompt = buildSceneDecompositionPrompt({
    project,
    chapter,
    allChapters,
    canonEntries,
    settings,
    writingMode: 'draft',
    generationType: 'scene-outline',
  });

  const result = await generateText({
    prompt,
    model: settings.ai.preferredModel || 'gpt-4.1',
    maxTokens: 1500,
    action: 'generate-chapter-outline',
    projectId: project.id,
    chapterId,
  });

  const text = (result.text || '').trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('[PostGen] Invalid scene decomposition response');
    return null;
  }

  const parsed = JSON.parse(jsonMatch[0]) as { title: string; summary: string; order: number }[];
  const newScenes: Scene[] = parsed.map((s, i) => ({
    id: generateId(),
    title: s.title || `Scene ${i + 1}`,
    summary: s.summary || '',
    prose: '',
    order: s.order || i + 1,
    status: 'outline' as const,
  }));

  // Split existing prose across new scenes
  try {
    const splitPrompt = buildSceneProseSplitPrompt(
      chapter,
      newScenes.map((s) => ({ title: s.title, summary: s.summary, order: s.order })),
    );
    const splitResult = await generateText({
      prompt: splitPrompt,
      model: settings.ai.preferredModel || 'gpt-4.1',
      maxTokens: 4000,
      action: 'generate-chapter-outline',
      projectId: project.id,
      chapterId,
    });
    const splitText = (splitResult.text || '').trim();
    const splitJsonMatch = splitText.match(/\[[\s\S]*\]/);
    if (splitJsonMatch) {
      const splitParsed = JSON.parse(splitJsonMatch[0]) as { order: number; prose: string }[];
      for (const seg of splitParsed) {
        const targetScene = newScenes.find((s) => s.order === seg.order);
        if (targetScene && seg.prose) {
          targetScene.prose = seg.prose;
          targetScene.status = 'drafted';
        }
      }
    }
  } catch (e) {
    console.warn('[PostGen] Failed to split prose into scenes:', e);
  }

  store.setChapterScenes(chapterId, newScenes);
  console.info('[PostGen] Scene decomposition complete:', newScenes.length, 'scenes');
  return newScenes;
}

/** Step 3: Tag dialogue and SFX in each scene */
async function runSceneTagging(chapterId: string, scenes: Scene[]): Promise<void> {
  const store = useStore.getState();
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter) return;

  const project = store.projects.find((p) => p.id === chapter.projectId);
  if (!project) return;

  const characterEntries = useCanonStore.getState().getProjectEntries(project.id).filter((e) => e.type === 'character');
  const characterNames = characterEntries.map((e) => e.name);

  console.info('[PostGen] Tagging', scenes.length, 'scenes (dialogue + SFX)...');

  // Process scenes sequentially to avoid rate limits
  for (const scene of scenes) {
    if (!scene.prose?.trim()) continue;

    try {
      // Dialogue tagging
      const tagged = await tagDialogue(scene.prose, characterNames, project.id, chapter.id);
      store.updateScene(chapter.id, scene.id, { prose: tagged });

      // SFX tagging
      const sfxTagged = await tagSFX(tagged, project.id, chapter.id);
      store.updateScene(chapter.id, scene.id, { prose: sfxTagged });

      // Intro + ambient SFX suggestions
      try {
        const sfxResult = await generateText({
          prompt: `Read this scene and suggest sound effects for audiobook production.

You need to provide:
1. **intro** — 1 short sound that plays at the VERY START of the scene to set the mood/location (e.g. "car engine idling", "birds chirping at dawn", "bar chatter and clinking glasses", "wind howling"). This is the first thing the listener hears before narration begins.
2. **background** — 1-3 ambient/environmental sounds that loop throughout the scene (e.g. "gentle rain", "distant traffic", "crackling fireplace").

Scene:
${scene.prose.slice(0, 2000)}

Return ONLY valid JSON, no markdown fences:
{ "intro": "sound description", "background": ["ambient sound 1", "ambient sound 2"] }`,
          model: 'gpt-4.1-mini',
          maxTokens: 200,
          temperature: 0.3,
          action: 'sfx-ambience',
          projectId: project.id,
          chapterId: chapter.id,
        });

        const parsed = JSON.parse(sfxResult.text.trim()) as { intro?: string; background?: string[] };
        const existingSfx = scene.sfx || [];
        const existingPrompts = new Set(existingSfx.map((s) => s.prompt.toLowerCase()));
        const newSfx: typeof existingSfx = [];

        // Add intro SFX
        if (parsed.intro && !existingPrompts.has(parsed.intro.toLowerCase())) {
          newSfx.push({
            id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            prompt: parsed.intro,
            position: 'start' as const,
            enabled: true,
            source: 'suggested' as const,
          });
        }

        // Add background/ambient SFX
        if (Array.isArray(parsed.background)) {
          for (const amb of parsed.background) {
            if (typeof amb === 'string' && !existingPrompts.has(amb.toLowerCase())) {
              newSfx.push({
                id: `sfx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                prompt: amb,
                position: 'background' as const,
                enabled: true,
                source: 'suggested' as const,
              });
            }
          }
        }

        if (newSfx.length > 0) {
          const freshScene = useStore.getState().chapters.find((c) => c.id === chapter.id)?.scenes?.find((s) => s.id === scene.id);
          store.updateScene(chapter.id, scene.id, {
            sfx: [...(freshScene?.sfx || []), ...newSfx],
          });
        }
      } catch {
        // SFX suggestions are non-critical
      }
    } catch (e) {
      console.warn(`[PostGen] Tagging failed for scene "${scene.title}":`, e);
    }
  }

  // Sync scene prose back to chapter
  store.syncScenesToProse(chapterId);
  console.info('[PostGen] Scene tagging complete');
}
