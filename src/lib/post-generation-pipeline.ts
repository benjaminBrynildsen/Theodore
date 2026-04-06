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
import { FEATURES } from './feature-flags';
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
  // Wait for the initial prose save debounce to fire (500ms debounce + buffer)
  await new Promise((r) => setTimeout(r, 800));

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

  // Clear existing scenes on regeneration so we get fresh decomposition
  if (chapter.scenes?.length) {
    console.info('[PostGen] Clearing old scenes for fresh decomposition...');
    store.updateChapter(chapterId, { scenes: [] });
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

  // Split prose across scenes using AI paragraph-to-scene mapping
  if (chapter.prose?.trim()) {
    const paragraphs = chapter.prose.split(/\n\n+/).filter((p) => p.trim());
    
    try {
      // Ask AI to assign each paragraph to a scene based on content/location
      const sceneList = newScenes.map((s) => `Scene ${s.order}: "${s.title}" — ${s.summary}`).join('\n');
      const paragraphList = paragraphs.map((p, i) => `[P${i + 1}]: ${p.slice(0, 150)}...`).join('\n');
      
      const mapResult = await generateText({
        prompt: `You have ${newScenes.length} scenes and ${paragraphs.length} paragraphs from a chapter. Assign each paragraph to the scene it belongs to based on LOCATION, CHARACTERS PRESENT, and NARRATIVE CONTEXT.

SCENES:
${sceneList}

PARAGRAPHS (showing first 150 chars each):
${paragraphList}

Return ONLY a JSON array of scene numbers, one per paragraph, in order. Example for 8 paragraphs across 3 scenes: [1,1,1,2,2,3,3,3]
Paragraphs must stay in order — scene numbers can only stay the same or increase, never decrease.`,
        model: 'gpt-4.1-mini',
        maxTokens: 200,
        temperature: 0.1,
        action: 'generate-chapter-outline',
        projectId: project.id,
        chapterId,
      });

      const mapText = (mapResult.text || '').trim();
      const jsonMatch = mapText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const assignments = JSON.parse(jsonMatch[0]) as number[];
        if (assignments.length === paragraphs.length) {
          // Group paragraphs by scene assignment
          for (let i = 0; i < assignments.length; i++) {
            const sceneOrder = assignments[i];
            const scene = newScenes.find((s) => s.order === sceneOrder);
            if (scene) {
              scene.prose = scene.prose ? scene.prose + '\n\n' + paragraphs[i] : paragraphs[i];
              scene.status = 'drafted';
            }
          }
        } else {
          throw new Error('Assignment length mismatch');
        }
      } else {
        throw new Error('No JSON array in response');
      }
    } catch (e) {
      console.warn('[PostGen] AI paragraph mapping failed, falling back to even split:', e);
      // Fallback: even split by paragraphs
      const perScene = Math.ceil(paragraphs.length / newScenes.length);
      for (let i = 0; i < newScenes.length; i++) {
        const slice = paragraphs.slice(i * perScene, (i + 1) * perScene);
        if (slice.length) {
          newScenes[i].prose = slice.join('\n\n');
          newScenes[i].status = 'drafted';
        }
      }
    }
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

      // SFX tagging (V2 — disabled for V1)
      if (FEATURES.SFX_ENABLED) {
        const sfxTagged = await tagSFX(tagged, project.id, chapter.id);
        store.updateScene(chapter.id, scene.id, { prose: sfxTagged });

        // Intro + ambient SFX suggestions
        try {
          const sfxResult = await generateText({
            prompt: `Read this scene and suggest sound effects for audiobook production.

You need to provide:
1. **intro** — 1 short ONE-SHOT sound (2-4 seconds) that plays ONCE at the very start to establish the scene (e.g. "a single car door slamming shut", "a rooster crowing once at dawn", "the clink of a glass being set on a bar", "a gust of wind through trees"). This must NOT be a looping/ambient sound — it should be a distinct, singular moment that sets the mood. Think: a specific sound event, not ongoing atmosphere.
2. **background** — 1-3 ambient/environmental sounds that LOOP throughout the scene (e.g. "gentle rain", "distant traffic", "crackling fireplace"). These are ongoing atmospheric sounds.

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
      }
    } catch (e) {
      console.warn(`[PostGen] Tagging failed for scene "${scene.title}":`, e);
    }
  }

  // Sync scene prose back to chapter
  store.syncScenesToProse(chapterId);
  console.info('[PostGen] Scene tagging complete');
}

/** Light pipeline — entity scan only, no scene decomposition. Used after "Generate Full Chapter". */
export async function runPostGenerationPipelineLight(chapterId: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));

  const store = useStore.getState();
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter?.prose?.trim()) return;

  console.info('[PostGen Light] Starting for chapter', chapter.number, chapterId);
  await runEntityScan(chapterId).catch((e) => console.warn('[PostGen Light] Entity scan failed:', e));
  console.info('[PostGen Light] Complete');
}
