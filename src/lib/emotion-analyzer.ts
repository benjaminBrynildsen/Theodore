// ========== Scene Emotional Analyzer ==========
// AI-driven prose analysis that generates emotional metadata + Suno music prompts

import { generateText } from './generate';
import type { Scene, NarrativeControls } from '../types';
import type { SceneEmotionalMetadata, EmotionCategory, Tempo, MusicGenre } from '../types/music';

interface AnalyzeSceneInput {
  scene: Scene;
  chapterEmotionalBeat?: string;
  previousSceneEndEmotion?: EmotionCategory;
  nextSceneStartEmotion?: EmotionCategory;
  narrativeControls?: NarrativeControls;
  projectId: string;
  chapterId: string;
}

/** Simple hash for staleness detection */
export function hashProse(prose: string): string {
  let hash = 0;
  for (let i = 0; i < prose.length; i++) {
    const char = prose.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/** Check if a scene's emotional metadata is stale (prose changed since analysis) */
export function isMetadataStale(scene: Scene): boolean {
  if (!scene.emotionalMetadata?.proseHash) return true;
  if (!scene.prose?.trim()) return false;
  return scene.emotionalMetadata.proseHash !== hashProse(scene.prose);
}

const EMOTION_LIST = 'joy, sorrow, tension, dread, wonder, anger, longing, triumph, serenity, chaos, intimacy, isolation, reverence, defiance';
const TEMPO_LIST = 'adagio, andante, moderato, allegro, presto';
const GENRE_LIST = 'orchestral, ambient, electronic, folk, cinematic, jazz, piano-solo, choral, world, rock, minimal';

function buildAnalysisPrompt(input: AnalyzeSceneInput): string {
  const { scene, chapterEmotionalBeat, previousSceneEndEmotion, nextSceneStartEmotion, narrativeControls } = input;

  const lines: string[] = [
    'You are a literary analyst specializing in emotional mapping for audiobook production.',
    'Analyze the following scene prose and return a JSON object describing its emotional profile.',
    '',
    '## Scene Prose',
    '```',
    scene.prose.slice(0, 6000), // cap at ~6k chars to control tokens
    '```',
    '',
  ];

  if (scene.title) lines.push(`Scene title: "${scene.title}"`);
  if (scene.summary) lines.push(`Scene summary: ${scene.summary}`);
  if (chapterEmotionalBeat) lines.push(`Chapter emotional beat: ${chapterEmotionalBeat}`);
  if (previousSceneEndEmotion) lines.push(`Previous scene ended on: ${previousSceneEndEmotion}`);
  if (nextSceneStartEmotion) lines.push(`Next scene starts with: ${nextSceneStartEmotion}`);

  if (narrativeControls) {
    const { toneMood } = narrativeControls;
    lines.push(`Project tone: light/dark=${toneMood.lightDark}/100, hopeful/grim=${toneMood.hopefulGrim}/100, whimsical/serious=${toneMood.whimsicalSerious}/100`);
    lines.push(`Pacing: ${narrativeControls.pacing}, Dialogue weight: ${narrativeControls.dialogueWeight}`);
  }

  lines.push('');
  lines.push('## Required JSON Output');
  lines.push('Return ONLY valid JSON, no markdown fences, no explanation. Schema:');
  lines.push(`{
  "primaryEmotion": one of [${EMOTION_LIST}],
  "secondaryEmotion": one of [${EMOTION_LIST}] or null,
  "intensity": number 0-100,
  "arc": {
    "start": emotion at scene opening,
    "end": emotion at scene close,
    "pivot": { "emotion": mid-shift emotion, "trigger": "what causes it", "position": 0-100 } or null
  },
  "moodTags": ["adjective1", "adjective2", ...] (3-6 freeform mood descriptors),
  "tempo": one of [${TEMPO_LIST}],
  "suggestedGenre": one of [${GENRE_LIST}],
  "musicPrompt": "A natural-language Suno prompt for background music. Include genre, mood, instruments, BPM hint, and atmosphere. Example: 'Melancholic piano solo slowly building tension, minor key, 80 BPM, cinematic underscore, distant rain atmosphere'",
  "transitionSmoothness": number 0-100 (how smooth is the emotional transition from the previous scene, 100=seamless, 0=jarring),
  "confidence": number 0-100
}`);

  return lines.join('\n');
}

/**
 * Analyze a scene's prose and return emotional metadata.
 * Uses the project's AI generation endpoint.
 */
export async function analyzeSceneEmotion(input: AnalyzeSceneInput): Promise<SceneEmotionalMetadata> {
  const prompt = buildAnalysisPrompt(input);

  const result = await generateText({
    prompt,
    model: 'gpt-4.1',
    maxTokens: 800,
    temperature: 0.3,
    action: 'emotion-analysis',
    projectId: input.projectId,
    chapterId: input.chapterId,
  });

  const raw = result.text.trim();
  // Strip markdown fences if the model wraps it
  const jsonStr = raw.replace(/^```json?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(jsonStr);

  // Validate and normalize
  const metadata: SceneEmotionalMetadata = {
    primaryEmotion: validateEmotion(parsed.primaryEmotion) || 'serenity',
    secondaryEmotion: validateEmotion(parsed.secondaryEmotion) || undefined,
    intensity: clamp(parsed.intensity ?? 50, 0, 100),
    arc: {
      start: validateEmotion(parsed.arc?.start) || validateEmotion(parsed.primaryEmotion) || 'serenity',
      end: validateEmotion(parsed.arc?.end) || validateEmotion(parsed.primaryEmotion) || 'serenity',
      pivot: parsed.arc?.pivot ? {
        emotion: validateEmotion(parsed.arc.pivot.emotion) || 'tension',
        trigger: String(parsed.arc.pivot.trigger || ''),
        position: clamp(parsed.arc.pivot.position ?? 50, 0, 100),
      } : undefined,
    },
    moodTags: Array.isArray(parsed.moodTags) ? parsed.moodTags.slice(0, 8).map(String) : [],
    tempo: validateTempo(parsed.tempo) || 'moderato',
    suggestedGenre: validateGenre(parsed.suggestedGenre) || 'cinematic',
    musicPrompt: typeof parsed.musicPrompt === 'string' ? parsed.musicPrompt : undefined,
    transitionSmoothness: parsed.transitionSmoothness != null ? clamp(parsed.transitionSmoothness, 0, 100) : undefined,
    confidence: clamp(parsed.confidence ?? 70, 0, 100),
    analyzedAt: new Date().toISOString(),
    proseHash: hashProse(input.scene.prose),
  };

  return metadata;
}

/**
 * Analyze all scenes in a chapter sequentially.
 * Each scene gets context from the previous scene's end-state.
 */
export async function analyzeChapterScenes(
  scenes: Scene[],
  opts: {
    chapterEmotionalBeat?: string;
    narrativeControls?: NarrativeControls;
    projectId: string;
    chapterId: string;
  },
  onProgress?: (sceneIndex: number, total: number) => void,
): Promise<Map<string, SceneEmotionalMetadata>> {
  const sorted = [...scenes].filter(s => s.prose?.trim()).sort((a, b) => a.order - b.order);
  const results = new Map<string, SceneEmotionalMetadata>();
  let prevEndEmotion: EmotionCategory | undefined;

  for (let i = 0; i < sorted.length; i++) {
    const scene = sorted[i];
    const nextScene = sorted[i + 1];

    onProgress?.(i, sorted.length);

    try {
      const metadata = await analyzeSceneEmotion({
        scene,
        chapterEmotionalBeat: opts.chapterEmotionalBeat,
        previousSceneEndEmotion: prevEndEmotion,
        nextSceneStartEmotion: nextScene?.emotionalMetadata?.arc?.start,
        narrativeControls: opts.narrativeControls,
        projectId: opts.projectId,
        chapterId: opts.chapterId,
      });

      results.set(scene.id, metadata);
      prevEndEmotion = metadata.arc.end;
    } catch (e) {
      console.error(`[EmotionAnalyzer] Failed to analyze scene ${scene.title || scene.id}:`, e);
    }
  }

  return results;
}

// ---- Validators ----

const VALID_EMOTIONS = new Set<EmotionCategory>([
  'joy', 'sorrow', 'tension', 'dread', 'wonder', 'anger',
  'longing', 'triumph', 'serenity', 'chaos', 'intimacy',
  'isolation', 'reverence', 'defiance',
]);

const VALID_TEMPOS = new Set<Tempo>(['adagio', 'andante', 'moderato', 'allegro', 'presto']);

const VALID_GENRES = new Set<MusicGenre>([
  'orchestral', 'ambient', 'electronic', 'folk', 'cinematic',
  'jazz', 'piano-solo', 'choral', 'world', 'rock', 'minimal',
]);

function validateEmotion(val: any): EmotionCategory | null {
  return typeof val === 'string' && VALID_EMOTIONS.has(val as EmotionCategory) ? val as EmotionCategory : null;
}

function validateTempo(val: any): Tempo | null {
  return typeof val === 'string' && VALID_TEMPOS.has(val as Tempo) ? val as Tempo : null;
}

function validateGenre(val: any): MusicGenre | null {
  return typeof val === 'string' && VALID_GENRES.has(val as MusicGenre) ? val as MusicGenre : null;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
