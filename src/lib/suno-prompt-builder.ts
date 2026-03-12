// ========== Deterministic Suno Prompt Builder ==========
// Translates SceneEmotionalMetadata into a Suno API prompt string.
// Used as fallback when AI-generated musicPrompt is not available.

import type { SceneEmotionalMetadata, EmotionCategory, Tempo, MusicGenre } from '../types/music';
import { TEMPO_BPM } from '../types/music';

const EMOTION_DESCRIPTORS: Record<EmotionCategory, { mood: string; instruments: string; key: string }> = {
  joy:        { mood: 'uplifting, warm, celebratory',        instruments: 'strings, piano, light percussion',  key: 'major key' },
  sorrow:     { mood: 'melancholic, heavy, reflective',      instruments: 'cello, piano, muted strings',       key: 'minor key' },
  tension:    { mood: 'tense, suspenseful, building',        instruments: 'low strings, synth pads, ticking',  key: 'dissonant minor' },
  dread:      { mood: 'dark, foreboding, ominous',           instruments: 'deep brass, drone, sparse piano',   key: 'diminished, atonal' },
  wonder:     { mood: 'ethereal, awe-inspiring, expansive',  instruments: 'harp, choir, shimmering synths',    key: 'lydian mode' },
  anger:      { mood: 'aggressive, fierce, relentless',      instruments: 'distorted strings, war drums, brass', key: 'minor key, aggressive' },
  longing:    { mood: 'yearning, bittersweet, nostalgic',    instruments: 'solo violin, acoustic guitar, piano', key: 'minor key, wistful' },
  triumph:    { mood: 'victorious, powerful, soaring',       instruments: 'full orchestra, horns, timpani',    key: 'major key, bold' },
  serenity:   { mood: 'peaceful, calm, meditative',          instruments: 'ambient pads, soft piano, flute',   key: 'major key, gentle' },
  chaos:      { mood: 'chaotic, frantic, overwhelming',      instruments: 'dissonant orchestra, percussion, electronic glitch', key: 'atonal, shifting' },
  intimacy:   { mood: 'tender, close, vulnerable',           instruments: 'solo piano, acoustic guitar, soft vocals', key: 'major/minor, intimate' },
  isolation:  { mood: 'lonely, sparse, desolate',            instruments: 'solo instrument, ambient drone, wind', key: 'minor key, sparse' },
  reverence:  { mood: 'sacred, solemn, majestic',            instruments: 'organ, choir, bells',                key: 'modal, church modes' },
  defiance:   { mood: 'rebellious, determined, fierce',      instruments: 'electric guitar, driving drums, brass', key: 'minor key, power chords' },
};

const GENRE_TAGS: Record<MusicGenre, string> = {
  orchestral:  'orchestral film score',
  ambient:     'ambient atmospheric soundscape',
  electronic:  'electronic cinematic',
  folk:        'folk acoustic',
  cinematic:   'cinematic underscore',
  jazz:        'jazz noir',
  'piano-solo': 'solo piano',
  choral:      'choral ensemble',
  world:       'world music ethnic',
  rock:        'cinematic rock',
  minimal:     'minimalist contemporary classical',
};

/**
 * Build a Suno-ready music prompt from emotional metadata.
 * Returns a natural-language description suitable for Suno's text-to-music API.
 */
export function buildSunoPrompt(metadata: SceneEmotionalMetadata): string {
  // Use user overrides if present
  const emotion = metadata.userOverrides?.primaryEmotion || metadata.primaryEmotion;
  const secondary = metadata.userOverrides?.secondaryEmotion || metadata.secondaryEmotion;
  const intensity = metadata.userOverrides?.intensity ?? metadata.intensity;
  const tempo = metadata.userOverrides?.tempo || metadata.tempo;
  const genre = metadata.userOverrides?.suggestedGenre || metadata.suggestedGenre;
  const moodTags = metadata.userOverrides?.moodTags || metadata.moodTags;

  // If there's an AI-generated or user-overridden musicPrompt, prefer that
  const customPrompt = metadata.userOverrides?.musicPrompt || metadata.musicPrompt;
  if (customPrompt) return customPrompt;

  const emotionDesc = EMOTION_DESCRIPTORS[emotion] || EMOTION_DESCRIPTORS.serenity;
  const genreTag = GENRE_TAGS[genre] || GENRE_TAGS.cinematic;
  const bpmRange = TEMPO_BPM[tempo] || TEMPO_BPM.moderato;
  const bpm = Math.round((bpmRange.min + bpmRange.max) / 2);

  const parts: string[] = [];

  // Genre and mood
  parts.push(`${genreTag}, ${emotionDesc.mood}`);

  // Instruments
  parts.push(emotionDesc.instruments);

  // Key and tonality
  parts.push(emotionDesc.key);

  // BPM
  parts.push(`${bpm} BPM`);

  // Intensity modifier
  if (intensity >= 80) parts.push('intense, powerful, building to climax');
  else if (intensity >= 60) parts.push('moderately intense, dynamic');
  else if (intensity <= 20) parts.push('very subtle, barely there, underscore');
  else if (intensity <= 40) parts.push('gentle, subdued, background');

  // Secondary emotion blend
  if (secondary && secondary !== emotion) {
    const secondDesc = EMOTION_DESCRIPTORS[secondary];
    if (secondDesc) parts.push(`with undertones of ${secondDesc.mood.split(',')[0]}`);
  }

  // Mood tags as atmosphere
  if (moodTags.length > 0) {
    parts.push(`atmosphere: ${moodTags.slice(0, 4).join(', ')}`);
  }

  // Arc transition note
  if (metadata.arc.start !== metadata.arc.end) {
    const startDesc = EMOTION_DESCRIPTORS[metadata.arc.start]?.mood.split(',')[0] || metadata.arc.start;
    const endDesc = EMOTION_DESCRIPTORS[metadata.arc.end]?.mood.split(',')[0] || metadata.arc.end;
    parts.push(`transitions from ${startDesc} to ${endDesc}`);
  }

  // No vocals for underscore
  parts.push('instrumental only, no vocals');

  return parts.join(', ');
}

/**
 * Estimate target duration for a scene's background music based on word count.
 * Assumes ~150 words per minute reading speed.
 */
export function estimateSceneDuration(wordCount: number): number {
  return Math.max(30, Math.ceil((wordCount / 150) * 60)); // minimum 30 seconds
}
