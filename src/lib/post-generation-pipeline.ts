/**
 * Post-generation pipeline — automatically runs after chapter prose is generated.
 * Orchestrates: scene decomposition → dialogue tagging → SFX tagging → entity scanning.
 * All steps are fire-and-forget from the caller's perspective.
 */

import { useStore } from '../store';
import { useCanonStore } from '../store/canon';
import { useSettingsStore } from '../store/settings';
import { useAuthStore } from '../store/auth';
import { generateText } from './generate';
import { analysisModel } from './models';
import { buildSceneDecompositionPrompt, buildSceneProseSplitPrompt } from './prompt-builder';
import { tagDialogue } from './dialogue-tagger';
import { tagSFX } from './sfx-tagger';
import { FEATURES } from './feature-flags';
import { generateId } from './utils';
import type { Chapter, Scene } from '../types';
import { threadsForChapter } from './story-threads';
import { arcsForChapter } from './story-arcs';
import { memoryMeta, memoryOutdated, needsReextraction, resolveCanonEntry, type CharacterStateRecord, type NewCanonCandidate } from './story-memory';
import { junkNameReason } from './canon-cleanup';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import {
  EXTRACTION_REQUEST,
  applyContinuityExtraction,
  buildContinuityExtractionPrompt,
  staleNoticeUpdates,
  withIssueDismissed,
} from './continuity-extraction';
import { hasPendingProseRewrite, waitForProseRewrite } from './prose-rewrites';

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

  // Run entity scanning, scene decomposition, and continuity extraction in parallel
  const [, scenes] = await Promise.all([
    runEntityScan(chapterId).catch((e) => console.warn('[PostGen] Entity scan failed:', e)),
    runSceneDecomposition(chapterId).catch((e) => {
      console.warn('[PostGen] Scene decomposition failed:', e);
      return null;
    }),
    runContinuityExtraction(chapterId).catch((e) =>
      console.warn('[PostGen] Continuity extraction failed:', e),
    ),
  ]);

  // If scenes were generated, run dialogue + SFX tagging on each scene
  if (scenes?.length) {
    await runSceneTagging(chapterId, scenes).catch((e) =>
      console.warn('[PostGen] Scene tagging failed:', e),
    );
  }

  // Cascade premise updates to future chapters if this chapter diverged from its premise
  await cascadePremiseUpdates(chapterId).catch((e) =>
    console.warn('[PostGen] Premise cascade failed (non-fatal):', e),
  );

  console.info('[PostGen Pipeline] Complete for chapter', chapter.number);
}

/**
 * After a chapter is generated, check if the actual content diverges from
 * the original premise. If so, use Sonnet to regenerate premises for all
 * subsequent outline-only chapters to maintain story consistency.
 */
async function cascadePremiseUpdates(chapterId: string): Promise<void> {
  const store = useStore.getState();
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter?.prose?.trim()) return;

  const project = store.projects.find((p) => p.id === chapter.projectId);
  if (!project) return;

  const allChapters = store.getProjectChapters(project.id)
    .sort((a, b) => (a.number || 0) - (b.number || 0));

  // Only cascade to future chapters that are still premise-only (no prose)
  const futureOutlineChapters = allChapters.filter(
    (c) => (c.number || 0) > (chapter.number || 0) && (!c.prose?.trim() || c.status === 'premise-only')
  );

  if (futureOutlineChapters.length === 0) {
    console.info('[PostGen Cascade] No future premise-only chapters to update');
    return;
  }

  // Get the actual summary from post-gen metadata, or use first 500 chars of prose
  const meta = chapter.aiIntentMetadata as any;
  const actualSummary = meta?.richSummary || meta?.summary || chapter.prose.slice(0, 500);
  const originalPremise = chapter.premise?.purpose || '';

  // Build context of ALL chapters (including already-generated ones) for full story awareness
  const chapterContext = allChapters.map((c) => {
    const cMeta = c.aiIntentMetadata as any;
    const hasProse = !!c.prose?.trim() && c.status !== 'premise-only';
    const summary = hasProse ? (cMeta?.richSummary || cMeta?.summary || c.prose?.slice(0, 200)) : null;
    return `Ch ${c.number}: "${c.title}" — ${hasProse ? `[WRITTEN] ${summary}` : `[OUTLINE] ${c.premise?.purpose || 'No premise'}`}`;
  }).join('\n');

  const futureContext = futureOutlineChapters.map((c) =>
    `{"number":${c.number},"title":"${c.title}","purpose":"${(c.premise?.purpose || '').replace(/"/g, '\\"')}"}`
  ).join(',\n');

  // The book's maps plan beats for these chapters; premise updates must keep them.
  const plannedBeats = futureOutlineChapters.map((c) => {
    const n = c.number || 0;
    const t = threadsForChapter(project.threadPlan, n);
    const a = arcsForChapter(project.arcPlan, n);
    const beats = [
      ...t.opening.map((x) => `opens "${x.title}"`),
      ...t.hinting.map((x) => `hints "${x.thread.title}"`),
      ...t.revealing.map((x) => `reveals "${x.thread.title}"`),
      ...t.closing.map((x) => `closes "${x.title}"`),
      ...a.arcBeats.map((x) => `${x.arc.name}: ${x.beat.type}`),
      ...a.artifactBeats.map((x) => `${x.artifact.name}: ${x.beat.type}`),
    ];
    return beats.length ? `Ch ${n}: ${beats.join('; ')}` : '';
  }).filter(Boolean).join('\n');

  const prompt = `You are a story editor ensuring plot consistency across a novel outline.

Chapter ${chapter.number} ("${chapter.title}") was just written. Compare what was planned vs what was actually written:

ORIGINAL PREMISE: ${originalPremise}
WHAT WAS ACTUALLY WRITTEN: ${actualSummary}

Full chapter status:
${chapterContext}

The following chapters have NOT been written yet and still have their original outline premises:
[${futureContext}]

Your job: If Chapter ${chapter.number}'s actual content meaningfully diverges from its premise in ways that affect the downstream plot, update the future chapters' premises to maintain story consistency. Consider:
- Character relationships that changed
- Plot points that shifted
- Secrets revealed or concealed differently
- Alliances, betrayals, or deaths that differ from the plan
- Settings or timeline changes

Keep the same general story arc and ending direction, but adjust the specific beats so the story flows naturally from what was ACTUALLY written.
${plannedBeats ? `
PLANNED BEATS (from the book's thread and arc maps) — every updated premise must still deliver these in its chapter; change HOW they happen, never whether:
${plannedBeats}
` : ''}
Return ONLY valid JSON, no markdown:
{"updates":[{"number":3,"title":"Updated Title If Needed","purpose":"Updated premise reflecting the new story direction","changes":"What changed and why"}],"reason":"Brief explanation of what diverged"}

If no updates are needed (the story is still consistent), return:
{"updates":[],"reason":"No significant divergence detected"}`;

  console.info(`[PostGen Cascade] Checking ${futureOutlineChapters.length} future chapters for consistency...`);

  try {
    const result = await generateText({
      prompt,
      model: 'claude-sonnet-4-6',
      maxTokens: 2000,
      temperature: 0.3, // Low temp for consistent, analytical output
      action: 'plan-project', // Exempt from generation lock
    });

    const text = (result.text || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[PostGen Cascade] No JSON in response');
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const updates = parsed.updates || [];

    if (updates.length === 0) {
      console.info('[PostGen Cascade] No updates needed:', parsed.reason);
      return;
    }

    console.info(`[PostGen Cascade] Updating ${updates.length} chapters:`, parsed.reason);

    // Apply updates
    const { api } = await import('./api');
    for (const update of updates) {
      const targetChapter = futureOutlineChapters.find((c) => c.number === update.number);
      if (!targetChapter) continue;

      const newPremise = {
        ...targetChapter.premise,
        purpose: update.purpose || targetChapter.premise?.purpose,
        changes: update.changes || targetChapter.premise?.changes || '',
      };

      const titleUpdate = update.title && update.title !== targetChapter.title
        ? { title: update.title } : {};

      const cascadeMeta = {
        ...((targetChapter.aiIntentMetadata || {}) as Record<string, any>),
        premiseUpdatedAt: new Date().toISOString(),
        premiseUpdatedReason: parsed.reason || 'Plot adjusted for consistency',
        premiseUpdatedFrom: `Ch. ${chapter.number}`,
      };

      store.updateChapter(targetChapter.id, {
        ...titleUpdate,
        premise: newPremise,
        aiIntentMetadata: cascadeMeta as any,
      });

      // Persist to server
      api.updateChapter(targetChapter.id, {
        ...titleUpdate,
        premise: newPremise,
        aiIntentMetadata: cascadeMeta as any,
      }).catch(() => {});

      console.info(`[PostGen Cascade] Updated Ch ${update.number}: ${update.purpose?.slice(0, 80)}...`);
    }

    // Notify user that outlines were updated
    const { useGenerationStore } = await import('../store/generation');
    useGenerationStore.getState().start({
      kind: 'create-project',
      label: `${updates.length} chapter outlines`,
      subtitle: `Updated to match Ch. ${chapter.number}'s new direction`,
      indeterminate: true,
    });
    // Snapshot the kind + label at schedule time. If the store has been
    // taken over by a different operation (e.g. the auto-audio dispatch
    // that fires after chapter gen calls start({ kind: 'generate-audio' })
    // within milliseconds), DON'T flip its phase to done — that was the
    // root cause of the "Complete · ~246s frozen" bug on 2026-06-09.
    const ownerKind = 'create-project';
    const ownerLabel = `${updates.length} chapter outlines`;
    setTimeout(() => {
      const cur = useGenerationStore.getState();
      if (cur.kind === ownerKind && cur.label === ownerLabel) {
        cur.setPhase('done');
      }
    }, 3000);

  } catch (e) {
    console.warn('[PostGen Cascade] Failed:', e);
  }
}

// ---------- Continuity memory extraction ----------

const extractionInFlight = new Set<string>();
const refreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const REFRESH_DEBOUNCE_MS = 60_000;

/** Merge fields into a chapter's aiIntentMetadata, reading the latest copy first. */
function patchChapterMeta(chapterId: string, patch: Record<string, unknown>): void {
  const store = useStore.getState();
  const fresh = store.chapters.find((c) => c.id === chapterId);
  if (!fresh) return;
  store.updateChapter(chapterId, {
    aiIntentMetadata: { ...((fresh.aiIntentMetadata || {}) as Record<string, unknown>), ...patch } as unknown as Chapter['aiIntentMetadata'],
  });
}

/**
 * Re-extract continuity memory once prose has settled after an edit, extend,
 * or rewrite. Called by the chapter store on every prose change; cheap no-op
 * unless the story content actually moved.
 */
export function scheduleContinuityRefresh(chapterId: string, delayMs = REFRESH_DEBOUNCE_MS): void {
  const existing = refreshTimers.get(chapterId);
  if (existing) clearTimeout(existing);
  refreshTimers.set(chapterId, setTimeout(() => {
    refreshTimers.delete(chapterId);
    void refreshContinuityNow(chapterId);
  }, delayMs));
}

/** Run extraction (and the premise cascade) now if the chapter's memory is out of date. */
export async function refreshContinuityNow(chapterId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (extractionInFlight.has(chapterId) || hasPendingProseRewrite(chapterId)) {
    scheduleContinuityRefresh(chapterId, 15_000);
    return;
  }
  const chapter = useStore.getState().chapters.find((c) => c.id === chapterId);
  if (!chapter?.prose?.trim()) return;
  // Guests share a small hourly AI budget; don't spend it on background refreshes.
  if (!opts.force && !useAuthStore.getState().user) return;
  if (!opts.force && !needsReextraction(memoryMeta(chapter), chapter.prose)) return;
  try {
    await runContinuityExtraction(chapterId);
    await cascadePremiseUpdates(chapterId);
  } catch (e) {
    console.warn('[Continuity] Refresh failed (non-fatal):', e);
  }
}

/**
 * Continuity extraction: summaries, open/resolved threads, character + object
 * state, established facts, and contradictions against earlier chapters —
 * one call over the whole chapter.
 */
export async function runContinuityExtraction(chapterId: string): Promise<void> {
  if (extractionInFlight.has(chapterId)) return;
  extractionInFlight.add(chapterId);
  try {
    await waitForProseRewrite(chapterId);
    await extractContinuity(chapterId);
  } finally {
    extractionInFlight.delete(chapterId);
  }
}

async function extractContinuity(chapterId: string): Promise<void> {
  const store = useStore.getState();
  const settings = useSettingsStore.getState().settings;
  const chapter = store.chapters.find((c) => c.id === chapterId);
  if (!chapter?.prose?.trim()) return;
  const project = store.projects.find((p) => p.id === chapter.projectId);
  if (!project) return;
  const sourceProse = chapter.prose;
  const canon = useCanonStore.getState().getProjectEntries(project.id);
  const allChapters = store.getProjectChapters(project.id);

  console.info('[PostGen] Running continuity extraction for ch', chapter.number);
  const result = await generateText({
    prompt: buildContinuityExtractionPrompt({ projectTitle: project.title, chapter, allChapters, canon }),
    model: analysisModel(settings.ai.preferredModel),
    ...EXTRACTION_REQUEST,
    projectId: project.id,
    chapterId: chapter.id,
  });

  const latest = useStore.getState().chapters.find((c) => c.id === chapterId);
  if (!latest) return;
  const applied = applyContinuityExtraction(result.text || '', sourceProse, latest, canon);
  if (!applied) return;
  patchChapterMeta(chapterId, applied.metaPatch);
  console.info('[PostGen] Continuity extracted:', applied.counts);
  addNewCanonFromChapter(project.id, latest, applied.newCanon);
  addAliasesFromChapter((applied.metaPatch.characterState as CharacterStateRecord[] | undefined) || []);

  // A re-extraction that changed established memory can invalidate later
  // chapters that were written on top of it — flag the ones that touch it.
  if (applied.memoryChanges) {
    const fresh = useStore.getState().getProjectChapters(project.id);
    for (const u of staleNoticeUpdates(latest, fresh, applied.memoryChanges)) {
      patchChapterMeta(u.chapterId, { continuityStale: u.continuityStale });
    }
  }
}

/**
 * Re-read written chapters whose memory predates the current extraction
 * format (story clock, who-knows-what), in chapter order so each one is
 * checked against the updated memory before it. Stops at the first failure.
 */
export async function catchUpStoryMemory(
  projectId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const todo = useStore.getState().getProjectChapters(projectId)
    .filter(memoryOutdated)
    .sort((a, b) => a.number - b.number);
  onProgress?.(0, todo.length);
  for (let i = 0; i < todo.length; i++) {
    await runContinuityExtraction(todo[i].id);
    onProgress?.(i + 1, todo.length);
  }
}

/**
 * Create canon entries for new characters, places and objects the extractor
 * found on the page (already validated against junk names and existing canon),
 * and link them to the chapter.
 */
function addNewCanonFromChapter(projectId: string, chapter: Chapter, found: NewCanonCandidate[]): void {
  if (!found.length) return;
  const canon = useCanonStore.getState();
  const current = canon.getProjectEntries(projectId);
  const ids: string[] = [];
  for (const c of found) {
    if (resolveCanonEntry(c.name, current)) continue;
    const entry = c.type === 'character' ? canon.createCharacter(projectId, c.name)
      : c.type === 'location' ? canon.createLocation(projectId, c.name)
      : canon.createArtifact(projectId, c.name);
    entry.description = c.description || `First appears in Chapter ${chapter.number}.`;
    entry.tags = Array.from(new Set([...(entry.tags || []), 'from-story', `chapter-${chapter.number}`]));
    entry.notes = `Added from Chapter ${chapter.number}.`;
    canon.addEntry(entry);
    current.push(entry);
    ids.push(entry.id);
  }
  if (!ids.length) return;
  const latest = useStore.getState().chapters.find((x) => x.id === chapter.id);
  const refs = Array.from(new Set([...(latest?.referencedCanonIds || []), ...ids]));
  useStore.getState().updateChapter(chapter.id, { referencedCanonIds: refs });
  console.info('[PostGen] New canon from chapter', chapter.number, found.map((f) => `${f.type}: ${f.name}`));
}

/** Nicknames and other names the prose used for known characters go into their aliases. */
function addAliasesFromChapter(states: CharacterStateRecord[]): void {
  const canon = useCanonStore.getState();
  for (const s of states) {
    if (!s.canonId || !s.called?.length) continue;
    const entry = canon.getEntry(s.canonId);
    if (entry?.type !== 'character') continue;
    const c = (entry as CharacterEntry).character;
    const known = new Set([entry.name, c.fullName, ...(c.aliases || [])].filter(Boolean).map((n) => n.toLowerCase()));
    const fresh = s.called.filter((n) => n.length <= 40 && !known.has(n.toLowerCase()) && !junkNameReason(n));
    if (!fresh.length) continue;
    canon.updateEntry(entry.id, { character: { ...c, aliases: [...(c.aliases || []), ...fresh].slice(0, 12) } } as Partial<AnyCanonEntry>);
  }
}

/** Mark one continuity issue as dismissed by the author. */
export function dismissContinuityIssue(chapterId: string, issueId: string): void {
  const chapter = useStore.getState().chapters.find((c) => c.id === chapterId);
  if (!chapter) return;
  patchChapterMeta(chapterId, { continuityIssues: withIssueDismissed(chapter, issueId) });
}

/** Clear a "earlier chapter changed" notice without re-checking. */
export function dismissStaleNotice(chapterId: string): void {
  patchChapterMeta(chapterId, { continuityStale: undefined });
}

/** Step 1: AI-powered entity/artifact scanning with refinement */
async function runEntityScan(chapterId: string): Promise<void> {
  console.info('[PostGen] Running entity scan...');
  await useStore.getState().rescanChapterMetadata(chapterId);
  console.info('[PostGen] Entity scan complete');
}

/** Step 2: Scene decomposition — break prose into scenes */
export async function runSceneDecomposition(chapterId: string): Promise<Scene[] | null> {
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
    model: analysisModel(settings.ai.preferredModel),
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
