// ========== Text-to-Speech Service — ElevenLabs TTS ==========
// Multi-voice audiobook generation with dialogue parsing and character voice routing

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { generateSFX } from './sfx.js';

// ========== Direction Tag Detection ==========

/** Direction tags that ElevenLabs V3 understands natively */
const DIRECTION_PATTERNS = [
  /^(whisper|shout|cry|laugh|sigh|gasp|groan|sob|scoff|chuckle|snicker|yawn|scream|moan|cough)s?$/i,
  /^(excited|sad|angry|annoyed|sarcastic|bitter|hopeful|fearful|disgusted|surprised|amused|tender|dramatic|gentle|urgent|hesitant|confident|nervous|cold|warm|deadpan|monotone|thoughtful|slow|fast|quiet|loud|longing)$/i,
  /^(whispering|shouting|crying|laughing|sighing|gasping|sobbing)$/i,
  /^(pause|dramatic pause|clears throat)$/i,
  /ly$/i, // adverbs: softly, angrily, etc.
];

function isDirectionTag(tag: string): boolean {
  const t = tag.trim();
  return DIRECTION_PATTERNS.some(p => p.test(t));
}

/** Strip character name tags but keep direction tags for V3 */
function stripCharacterTags(text: string): string {
  return text.replace(/\[([^\]]+)\]\s*/g, (full, inner) => {
    return isDirectionTag(inner) ? full : '';
  });
}

/** Convert pacing direction tags to natural pauses for TTS */
function expandPacingTags(text: string): string {
  return text
    .replace(/\[dramatic pause\]/gi, '... ... ...')
    .replace(/\[pause\]/gi, '... ...')
    .replace(/\[thoughtful\]/gi, '... [thoughtful]')
    .replace(/\[slowly\]/gi, '[slowly]');
}

// ========== Types ==========

export type ElevenLabsVoice = string;
// Legacy alias
export type OpenAIVoice = ElevenLabsVoice;

export interface TTSSegment {
  type: 'narration' | 'dialogue' | 'sfx';
  text: string;
  speaker?: string; // character name for dialogue
  voice: ElevenLabsVoice;
  tone?: string; // delivery instructions (e.g. "whispering, tense")
  sfxPrompt?: string; // for sfx segments: the sound description
}

// SFX data passed from frontend scene data
export interface SceneSFXInput {
  prompt: string;
  audioUrl?: string;
  position: 'start' | 'end' | 'background' | 'inline';
  enabled: boolean;
}

export interface VoiceMap {
  narrator: ElevenLabsVoice;
  characters: Record<string, ElevenLabsVoice>; // characterName → voice ID
}

export interface TTSRequest {
  chapterId: string;
  prose: string;
  voiceMap: VoiceMap;
  model?: 'eleven_v3' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5';
  speed?: number; // 0.5 – 2.0
  multiVoice?: boolean; // if false, use narrator for everything
  characterDescriptions?: Record<string, string>; // characterName → personality/speech description
  narratorStyle?: string; // e.g. "dramatic audiobook narrator"
  sceneSFX?: SceneSFXInput[]; // scene-level SFX (background ambience, intro/outro sounds)
}

export interface TTSResult {
  audioUrl: string;
  durationEstimate: number; // seconds
  segments: number;
  creditsUsed: number;
}

// ========== Constants ==========

const AUDIO_DIR = path.join(process.cwd(), 'uploads', 'audio');
const CHARS_PER_SECOND = 14;
const CREDITS_PER_CHAPTER = 2;

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

export interface ElevenLabsVoiceInfo {
  id: string;
  name: string;
  desc: string;
  gender: string;
  tone: string;
  age?: string;
  accent?: string;
  useCase?: string;
  descriptive?: string;
  description?: string;
  previewUrl?: string;
}

// All IDs verified against ElevenLabs /v1/voices API (2026-03-12)
export const ELEVENLABS_VOICES: ElevenLabsVoiceInfo[] = [
  // Young male
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Energetic & social', gender: 'male', tone: 'neutral' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', desc: 'Fierce warrior', gender: 'male', tone: 'intense' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', desc: 'Charming & down-to-earth', gender: 'male', tone: 'warm' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Relaxed optimist', gender: 'male', tone: 'casual' },
  // Middle-aged male
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Dominant & firm', gender: 'male', tone: 'deep' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Steady broadcaster', gender: 'male', tone: 'calm' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Deep & comforting', gender: 'male', tone: 'deep' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Wise & balanced', gender: 'male', tone: 'authoritative' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Husky trickster', gender: 'male', tone: 'raspy' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Deep & confident', gender: 'male', tone: 'casual' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Smooth & trustworthy', gender: 'male', tone: 'smooth' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', desc: 'Laid-back & resonant', gender: 'male', tone: 'casual' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', desc: 'Relaxed & informative', gender: 'male', tone: 'neutral' },
  // Young female
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Mature & reassuring', gender: 'female', tone: 'gentle' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Playful & bright', gender: 'female', tone: 'bright' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', desc: 'Professional & warm', gender: 'female', tone: 'warm' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', desc: 'Enthusiastic & quirky', gender: 'female', tone: 'energetic' },
  // Middle-aged female
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Velvety actress', gender: 'female', tone: 'warm' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Clear & engaging', gender: 'female', tone: 'authoritative' },
  // Versatile
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Knowledgeable & professional', gender: 'neutral', tone: 'dramatic' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm & captivating storyteller', gender: 'neutral', tone: 'balanced' },
];

// Legacy alias
export const OPENAI_VOICES = ELEVENLABS_VOICES;

// Cache for preview URLs fetched from ElevenLabs API
let previewUrlCache: Record<string, string> | null = null;
let previewUrlFetchedAt = 0;
const PREVIEW_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch preview URLs from ElevenLabs' voice API (free, no credits).
 * Each pre-made voice includes a preview_url in its metadata.
 */
// Cache for combined voices (premade + user library)
let fullVoiceCache: ElevenLabsVoiceInfo[] | null = null;

export async function getVoicesWithPreviews(): Promise<ElevenLabsVoiceInfo[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return ELEVENLABS_VOICES;

  // Use cache if fresh
  if (fullVoiceCache && previewUrlCache && Date.now() - previewUrlFetchedAt < PREVIEW_CACHE_TTL) {
    return fullVoiceCache;
  }

  try {
    // Try authenticated endpoint first (returns premade + user library voices)
    const response = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { 'xi-api-key': apiKey },
    });

    let apiVoices: any[] = [];
    if (response.ok) {
      const data = await response.json() as any;
      apiVoices = data.voices || [];
    }

    // Use the authenticated endpoint as the source of truth
    // Only voices in the user's account (library + premade they've added) are returned
    if (apiVoices.length > 0) {
      previewUrlCache = {};
      const merged: ElevenLabsVoiceInfo[] = [];
      const seenIds = new Set<string>();

      // Map ElevenLabs age labels to our AgeCategory
      const ageMap: Record<string, string> = {
        young: 'young', middle_aged: 'middle', old: 'old', elderly: 'old', teen: 'teen', child: 'child',
      };

      for (const voice of apiVoices) {
        if (!voice.voice_id || seenIds.has(voice.voice_id)) continue;
        seenIds.add(voice.voice_id);
        if (voice.preview_url) previewUrlCache[voice.voice_id] = voice.preview_url;

        const labels = voice.labels || {};
        // Normalize accent (e.g., 'en-british' → 'british', 'us southern' → 'american')
        let accent = (labels.accent || '').toLowerCase().replace(/^en-/, '');
        if (accent.startsWith('us ')) accent = 'american';

        merged.push({
          id: voice.voice_id,
          name: voice.name?.split(' - ')[0]?.trim() || voice.name || 'Unknown',
          desc: voice.name?.includes(' - ') ? voice.name.split(' - ').slice(1).join(' - ').trim() : (voice.description?.slice(0, 60) || ''),
          gender: labels.gender || 'neutral',
          tone: labels.descriptive || labels.use_case || 'neutral',
          age: ageMap[labels.age] || labels.age || undefined,
          accent: accent || undefined,
          useCase: labels.use_case || undefined,
          descriptive: labels.descriptive || undefined,
          description: voice.description || undefined,
          previewUrl: voice.preview_url || undefined,
        });
      }

      previewUrlFetchedAt = Date.now();
      fullVoiceCache = merged;
      console.log(`[TTS] Loaded ${merged.length} voices from ElevenLabs account`);
      return merged;
    }

    // Fallback: only if API key doesn't work at all, use hardcoded voices
    previewUrlFetchedAt = Date.now();
    fullVoiceCache = ELEVENLABS_VOICES;
    console.log(`[TTS] Fallback: using ${fullVoiceCache.length} hardcoded voices (API key may be invalid)`);
    return fullVoiceCache;
  } catch (err: any) {
    console.warn('[TTS] Error fetching voices:', err.message);
    return ELEVENLABS_VOICES;
  }
}

// ========== Dialogue Parser ==========

/**
 * Splits a text chunk into interleaved narration and inline SFX segments.
 * SFX segments are placed BEFORE the narration they precede, so the sound
 * plays at the start of (overlaid on) the following text.
 * e.g. "{sfx:footsteps} Susie walked into the room" →
 *   [sfx:footsteps] then [narration: "Susie walked into the room"]
 */
function pushNarrationWithSFX(segments: TTSSegment[], text: string) {
  const sfxRegex = /\{sfx:([^}]+)\}/g;
  let lastIdx = 0;
  let sfxMatch: RegExpExecArray | null;

  while ((sfxMatch = sfxRegex.exec(text)) !== null) {
    // Text BEFORE this sfx tag belongs to the previous narration chunk
    const before = expandPacingTags(stripCharacterTags(text.slice(lastIdx, sfxMatch.index))).trim();
    if (before) {
      segments.push({ type: 'narration', text: before, voice: '' });
    }
    // SFX marker — will be overlaid on the NEXT narration/dialogue segment
    segments.push({ type: 'sfx', text: '', voice: '', sfxPrompt: sfxMatch[1].trim() });
    lastIdx = sfxMatch.index + sfxMatch[0].length;
  }

  const rest = expandPacingTags(stripCharacterTags(text.slice(lastIdx).replace(/\{sfx:[^}]+\}\s*/g, ''))).trim();
  if (rest) {
    segments.push({ type: 'narration', text: rest, voice: '' });
  }
}

/**
 * Splits prose into narration and dialogue segments.
 * Identifies quoted speech and attempts to attribute speakers
 * by looking for "said Character" / "Character said" patterns nearby.
 */
export function parseDialogue(prose: string, knownCharacters: string[]): TTSSegment[] {
  const segments: TTSSegment[] = [];
  const dialogueRegex = /[\u201C"]((?:[^\u201D"\\]|\\.)*)[\u201D"]/g;

  // First pass: build a map of dialogue positions → tagged speaker from [Name] patterns
  // Pattern: [CharacterName] followed by optional whitespace then opening quote
  const taggedSpeakers = new Map<number, string>();
  const tagRegex = /\[([^\]]+)\]\s*(?=[\u201C"])/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(prose)) !== null) {
    const tagName = tagMatch[1].trim();
    // Skip direction tags — they're not character names
    if (isDirectionTag(tagName)) continue;
    // Find the quote that follows this tag
    const afterTag = prose.slice(tagMatch.index + tagMatch[0].length);
    const quoteMatch = afterTag.match(/^[\u201C"]/);
    if (quoteMatch) {
      const quotePos = tagMatch.index + tagMatch[0].length;
      taggedSpeakers.set(quotePos, tagName);
    }
  }

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = dialogueRegex.exec(prose)) !== null) {
    const before = prose.slice(lastIndex, match.index).trim();
    // Extract inline SFX markers from narration, then clean text
    pushNarrationWithSFX(segments, before);

    let dialogueText = expandPacingTags(match[1].replace(/\{sfx:[^}]+\}\s*/g, '')).trim();
    // Check for direction tags before the quote (e.g. [whispering] [Jack] "text")
    const preContext = prose.slice(Math.max(0, match.index - 60), match.index);
    const dirMatches = [...preContext.matchAll(/\[([^\]]+)\]/g)];
    const dirTags = dirMatches.filter(m => isDirectionTag(m[1])).map(m => `[${m[1]}]`);
    if (dirTags.length > 0) {
      dialogueText = `${dirTags.join(' ')} ${dialogueText}`;
    }
    // Use tagged speaker if available, otherwise fall back to heuristic
    const taggedSpeaker = taggedSpeakers.get(match.index);
    const speaker = taggedSpeaker || attributeSpeaker(prose, match.index, match[0].length, knownCharacters);
    const tone = detectTone(prose, match.index, match[0].length);

    segments.push({
      type: 'dialogue',
      text: dialogueText,
      speaker: speaker || undefined,
      voice: '', // will be overridden by voice map
      tone,
    });

    lastIndex = match.index + match[0].length;
  }

  const remaining = prose.slice(lastIndex).trim();
  if (remaining) {
    pushNarrationWithSFX(segments, remaining);
  }

  if (segments.length === 0) {
    const cleanProse = expandPacingTags(stripCharacterTags(prose.replace(/\{sfx:[^}]+\}\s*/g, ''))).trim();
    segments.push({ type: 'narration', text: cleanProse || prose, voice: '' });
  }

  return segments;
}

function attributeSpeaker(prose: string, matchStart: number, matchLength: number, characters: string[]): string | null {
  if (characters.length === 0) return null;

  const windowBefore = prose.slice(Math.max(0, matchStart - 120), matchStart);
  const windowAfter = prose.slice(matchStart + matchLength, matchStart + matchLength + 120);
  const window = windowBefore + ' ' + windowAfter;

  const sorted = [...characters].sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    const nameParts = name.split(' ');
    const firstName = nameParts[0];

    const patterns = [
      new RegExp(`${firstName}\\s+(said|asked|replied|whispered|shouted|murmured|exclaimed|muttered|called|yelled|hissed|sighed|growled|snapped|laughed|cried|screamed|demanded)`, 'i'),
      new RegExp(`(said|asked|replied|whispered|shouted|murmured|exclaimed|muttered|called|yelled|hissed|sighed|growled|snapped|laughed|cried|screamed|demanded)\\s+${firstName}`, 'i'),
      new RegExp(`${firstName}\\s*[',]`, 'i'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(window)) {
        return name;
      }
    }
  }

  return null;
}

// ========== Tone Detection ==========

interface ToneCue {
  keywords: string[];
  tone: string;
}

const TONE_CUES: ToneCue[] = [
  { keywords: ['whispered', 'whisper', 'whispering'], tone: 'whispering, hushed, intimate' },
  { keywords: ['shouted', 'shout', 'shouting', 'yelled', 'yell', 'yelling', 'bellowed', 'roared'], tone: 'shouting, loud, forceful' },
  { keywords: ['screamed', 'scream', 'screaming', 'shrieked'], tone: 'screaming, panicked, shrill' },
  { keywords: ['hissed', 'hiss', 'hissing'], tone: 'hissing, venomous, low and sharp' },
  { keywords: ['growled', 'growl', 'snarled', 'snarl'], tone: 'growling, menacing, low and threatening' },
  { keywords: ['snapped', 'snap', 'barked'], tone: 'snapping, curt, impatient' },
  { keywords: ['murmured', 'murmur', 'mumbled', 'muttered'], tone: 'murmuring, soft, under the breath' },
  { keywords: ['pleaded', 'begged', 'implored'], tone: 'pleading, desperate, emotional' },
  { keywords: ['laughed', 'chuckled', 'giggled'], tone: 'laughing, amused, light' },
  { keywords: ['cried', 'sobbed', 'wept'], tone: 'crying, tearful, broken voice' },
  { keywords: ['stammered', 'stuttered', 'faltered'], tone: 'stammering, nervous, halting' },
  { keywords: ['demanded', 'commanded', 'ordered'], tone: 'commanding, authoritative, firm' },
  { keywords: ['sighed'], tone: 'sighing, weary, resigned' },
  { keywords: ['gasped'], tone: 'gasping, breathless, shocked' },
  { keywords: ['angrily', 'furious', 'furiously', 'rage', 'raging'], tone: 'angry, intense, heated' },
  { keywords: ['sadly', 'sorrowful', 'mournful', 'grief'], tone: 'sad, heavy, mournful' },
  { keywords: ['softly', 'gently', 'tenderly'], tone: 'soft, gentle, tender' },
  { keywords: ['coldly', 'icily', 'flatly'], tone: 'cold, detached, emotionless' },
  { keywords: ['excitedly', 'eagerly', 'breathlessly'], tone: 'excited, energetic, breathless' },
  { keywords: ['nervously', 'anxiously', 'fearfully'], tone: 'nervous, anxious, shaky' },
  { keywords: ['sarcastically', 'dryly', 'mockingly'], tone: 'sarcastic, dry, mocking' },
  { keywords: ['quietly', 'barely audible', 'under .* breath'], tone: 'very quiet, barely above a whisper' },
  { keywords: ['tears streaming', 'eyes welling', 'voice breaking', 'voice cracked'], tone: 'emotional, voice cracking, holding back tears' },
  { keywords: ['through gritted teeth', 'jaw clenched', 'fists clenched'], tone: 'tense, restrained fury, speaking through clenched teeth' },
  { keywords: ['voice trembling', 'hands shaking', 'trembled'], tone: 'trembling, fearful, unsteady' },
];

function detectTone(prose: string, matchStart: number, matchLength: number): string | undefined {
  const windowBefore = prose.slice(Math.max(0, matchStart - 150), matchStart).toLowerCase();
  const windowAfter = prose.slice(matchStart + matchLength, matchStart + matchLength + 150).toLowerCase();
  const context = windowBefore + ' ' + windowAfter;

  const matched: string[] = [];
  for (const cue of TONE_CUES) {
    for (const kw of cue.keywords) {
      if (kw.includes('.*') ? new RegExp(kw, 'i').test(context) : context.includes(kw)) {
        matched.push(cue.tone);
        break;
      }
    }
  }

  if (matched.length === 0) return undefined;
  const unique = [...new Set(matched)];
  return unique.slice(0, 2).join('; ');
}

function detectNarrationTone(text: string): string | undefined {
  const lower = text.toLowerCase();
  if (/\b(battle|sword|blood|clash|explosion|roar)\b/.test(lower)) return 'dramatic, intense, action-paced';
  if (/\b(crept|silence|shadow|darkness|still|eerie|quiet)\b/.test(lower)) return 'hushed, suspenseful, atmospheric';
  if (/\b(tears|grief|loss|mourn|funeral|farewell)\b/.test(lower)) return 'somber, reflective, measured pace';
  if (/\b(joy|celebration|laughter|smile|bright|warm sun)\b/.test(lower)) return 'warm, uplifting, gentle energy';
  return undefined;
}

/**
 * Applies voice assignments to parsed segments.
 */
export function applyVoiceMap(segments: TTSSegment[], voiceMap: VoiceMap): TTSSegment[] {
  return segments.map(seg => {
    if (seg.type === 'narration') {
      const tone = seg.tone || detectNarrationTone(seg.text);
      return { ...seg, voice: voiceMap.narrator, tone };
    }
    if (seg.type === 'dialogue' && seg.speaker) {
      const speakerLower = seg.speaker.toLowerCase();
      for (const [charName, voice] of Object.entries(voiceMap.characters)) {
        if (speakerLower.includes(charName.toLowerCase()) || charName.toLowerCase().includes(speakerLower)) {
          return { ...seg, voice };
        }
      }
    }
    return { ...seg, voice: voiceMap.narrator };
  });
}

// ========== ElevenLabs TTS API ==========

function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

/**
 * Compute dynamic voice_settings based on detected tone.
 * - stability: lower = more expressive/emotional, higher = more consistent
 * - similarity_boost: how closely to match the base voice
 * - style: expressiveness (0-1), only on v2 models
 */
function toneToVoiceSettings(tone?: string): { stability: number; similarity_boost: number; style: number } {
  const defaults = { stability: 0.5, similarity_boost: 0.75, style: 0.4 };
  if (!tone) return defaults;

  const t = tone.toLowerCase();

  // Whisper/quiet — high stability, low style
  if (t.includes('whisper') || t.includes('quiet') || t.includes('hushed')) {
    return { stability: 0.7, similarity_boost: 0.8, style: 0.2 };
  }
  // Shouting/screaming — low stability, high style for expressiveness
  if (t.includes('shout') || t.includes('scream') || t.includes('yell') || t.includes('loud')) {
    return { stability: 0.25, similarity_boost: 0.7, style: 0.8 };
  }
  // Emotional (crying, pleading, trembling)
  if (t.includes('crying') || t.includes('tearful') || t.includes('pleading') || t.includes('trembling') || t.includes('emotional')) {
    return { stability: 0.3, similarity_boost: 0.75, style: 0.7 };
  }
  // Angry/tense
  if (t.includes('angry') || t.includes('fury') || t.includes('tense') || t.includes('growl') || t.includes('hiss')) {
    return { stability: 0.35, similarity_boost: 0.7, style: 0.65 };
  }
  // Dramatic/intense
  if (t.includes('dramatic') || t.includes('intense') || t.includes('action')) {
    return { stability: 0.35, similarity_boost: 0.75, style: 0.6 };
  }
  // Cold/detached
  if (t.includes('cold') || t.includes('detached') || t.includes('emotionless')) {
    return { stability: 0.8, similarity_boost: 0.8, style: 0.1 };
  }
  // Warm/gentle
  if (t.includes('warm') || t.includes('gentle') || t.includes('soft') || t.includes('tender')) {
    return { stability: 0.6, similarity_boost: 0.8, style: 0.3 };
  }
  // Sarcastic
  if (t.includes('sarcastic') || t.includes('mocking') || t.includes('dry')) {
    return { stability: 0.45, similarity_boost: 0.75, style: 0.55 };
  }
  // Nervous/anxious
  if (t.includes('nervous') || t.includes('anxious') || t.includes('stammer')) {
    return { stability: 0.3, similarity_boost: 0.75, style: 0.5 };
  }
  // Suspenseful
  if (t.includes('suspenseful') || t.includes('atmospheric')) {
    return { stability: 0.55, similarity_boost: 0.8, style: 0.45 };
  }

  return defaults;
}

async function callElevenLabsTTS(
  text: string,
  voiceId: ElevenLabsVoice,
  model: string,
  speed: number,
  tone?: string
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const voiceSettings = toneToVoiceSettings(tone);
  // Log first 120 chars to verify direction tags are being sent to ElevenLabs
  const dirTags = text.match(/\[[^\]]+\]/g);
  if (dirTags && dirTags.length > 0) {
    console.log(`[TTS] Sending to ElevenLabs (${model}): ${dirTags.join(', ')} | "${text.slice(0, 100)}..."`);
  }

  const body: Record<string, any> = {
    text,
    model_id: model,
    voice_settings: {
      stability: voiceSettings.stability,
      similarity_boost: voiceSettings.similarity_boost,
      style: voiceSettings.style,
      use_speaker_boost: true,
    },
  };

  // Map speed to ElevenLabs format (they don't have a direct speed param in the same way,
  // but we can adjust via the output_format and use SSML or speed settings if available)
  // For now, we'll note this in the request — ElevenLabs V2 doesn't have a speed parameter
  // in the TTS endpoint, but the turbo/flash models are inherently faster

  // V3 has a 5,000 char limit; v2 has 10,000. Chunk if needed.
  const charLimit = model.includes('v3') ? 4800 : 9500;
  if (text.length > charLimit) {
    return callElevenLabsTTSChunked(text, voiceId, model, speed, charLimit, body);
  }

  const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = (err as any).detail?.message || (err as any).detail || (err as any).error || response.statusText;
    throw new Error(`ElevenLabs TTS error ${response.status}: ${detail}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Split long text into chunks at sentence boundaries, generate each, and concatenate */
async function callElevenLabsTTSChunked(
  text: string, voiceId: ElevenLabsVoice, model: string, speed: number,
  charLimit: number, bodyTemplate: Record<string, any>
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > charLimit && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    const url = `${ELEVENLABS_API}/text-to-speech/${voiceId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({ ...bodyTemplate, text: chunk }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const detail = (err as any).detail?.message || (err as any).detail || response.statusText;
      throw new Error(`ElevenLabs TTS error ${response.status}: ${detail}`);
    }
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  return Buffer.concat(buffers);
}

// ========== Main Generation ==========

/**
 * Generate audiobook audio for a chapter.
 * If multiVoice is true, parses dialogue and uses character voices.
 * Otherwise generates the whole chapter with the narrator voice.
 */
export async function generateChapterAudio(req: TTSRequest & { knownCharacters?: string[] }): Promise<TTSResult> {
  ensureAudioDir();

  const model = req.model || 'eleven_v3';
  const speed = req.speed || 1.0;
  const voiceMap = req.voiceMap;

  // Collect all scene-level SFX — auto-generate audio for any that are missing
  const allSFX = req.sceneSFX || [];
  console.log(`[TTS] Raw sceneSFX received (${allSFX.length}):`);
  for (const s of allSFX) {
    console.log(`  [TTS]   "${s.prompt}" pos=${s.position} enabled=${s.enabled} hasAudio=${!!s.audioUrl}`);
  }

  // Auto-generate audio for enabled SFX without audioUrl
  for (const s of allSFX) {
    if (s.enabled && !s.audioUrl && s.prompt) {
      try {
        console.log(`[TTS] Auto-generating SFX audio for: "${s.prompt}" (${s.position})`);
        const duration = s.position === 'background' ? 30 : 5;
        const result = await generateSFX({ prompt: s.prompt, durationSeconds: duration });
        s.audioUrl = result.audioUrl;
        console.log(`[TTS] Auto-generated SFX: "${s.prompt}" → ${result.audioUrl}`);
      } catch (e: any) {
        console.error(`[TTS] Failed to auto-generate SFX "${s.prompt}":`, e.message);
      }
    }
  }

  const sceneSFX = allSFX.filter(s => s.enabled && s.audioUrl);
  const backgroundSFX = sceneSFX.filter(s => s.position === 'background');
  const introSFX = sceneSFX.filter(s => s.position === 'start');
  const outroSFX = sceneSFX.filter(s => s.position === 'end');
  console.log(`[TTS] Ready SFX: ${sceneSFX.length} total, ${backgroundSFX.length} bg, ${introSFX.length} intro, ${outroSFX.length} outro`);

  // Log direction tags found in prose
  const directionTagsFound = req.prose.match(/\[[^\]]+\]/g) || [];
  console.log(`[TTS] Direction tags in prose: ${directionTagsFound.length}`, directionTagsFound.slice(0, 10));
  console.log(`[TTS] Prose first 200 chars: ${req.prose.slice(0, 200)}`);

  // Parse prose into segments (narration, dialogue, sfx markers)
  let segments: TTSSegment[];
  if (req.multiVoice && req.knownCharacters && req.knownCharacters.length > 0) {
    segments = parseDialogue(req.prose, req.knownCharacters);
    segments = applyVoiceMap(segments, voiceMap);
  } else {
    segments = parseDialogue(req.prose, []);
    segments = applyVoiceMap(segments, voiceMap);
    // Ensure all segments have narrator voice
    segments = segments.map(s => s.voice ? s : { ...s, voice: voiceMap.narrator });
  }

  // Log routing
  const dialogueSegs = segments.filter(s => s.type === 'dialogue');
  const sfxSegs = segments.filter(s => s.type === 'sfx');
  const uniqueVoices = [...new Set(segments.filter(s => s.voice).map(s => s.voice))];
  const voiceNames = uniqueVoices.map(v => {
    const info = ELEVENLABS_VOICES.find(ev => ev.id === v);
    return info ? info.name : v.slice(0, 8);
  });
  console.log(`[TTS] ${segments.length} segments, ${dialogueSegs.length} dialogue, ${sfxSegs.length} inline SFX, voices: ${voiceNames.join(', ')}`);
  // Log segments with direction tags to verify they survive parsing
  for (const seg of segments) {
    if (seg.type !== 'sfx' && /\[[^\]]+\]/.test(seg.text)) {
      console.log(`[TTS] Segment with tags: [${seg.type}] "${seg.text.slice(0, 100)}"`);
    }
  }

  // Merge consecutive speech segments (preserves sfx markers between them)
  const merged = mergeConsecutiveSegments(segments);

  // Generate TTS for speech segments, track inline SFX with their timestamps
  // Inline SFX are overlaid on top of the narration at the point they appear — not concatenated
  const speechBuffers: Buffer[] = [];
  // Track: at what byte offset in the concatenated speech does each inline SFX go?
  // We'll convert to time offset later using ffmpeg
  const inlineSFXOverlays: { sfxPrompt: string; afterSpeechIndex: number }[] = [];

  let pendingSFX: string[] = []; // SFX prompts waiting to be attached to the next speech segment

  for (const seg of merged) {
    if (seg.type === 'sfx') {
      pendingSFX.push(seg.sfxPrompt || '');
      continue;
    }
    if (!seg.text.trim()) continue;
    // ElevenLabs rejects inputs that are empty after stripping speaker tags/emojis
    const textContent = seg.text.replace(/\[[^\]]+\]/g, '').replace(/[\u{1F600}-\u{1F9FF}]/gu, '').trim();
    if (!textContent) continue;

    const buf = await callElevenLabsTTS(seg.text, seg.voice, model, speed, seg.tone);

    // Attach any pending SFX to play at the START of this speech segment
    for (const sfxPrompt of pendingSFX) {
      inlineSFXOverlays.push({ sfxPrompt, afterSpeechIndex: speechBuffers.length });
    }
    pendingSFX = [];

    speechBuffers.push(buf);
  }

  // If there are trailing SFX with no following speech, attach to the last segment
  if (pendingSFX.length > 0 && speechBuffers.length > 0) {
    for (const sfxPrompt of pendingSFX) {
      inlineSFXOverlays.push({ sfxPrompt, afterSpeechIndex: speechBuffers.length - 1 });
    }
  }

  // Intro/outro SFX are now mixed via ffmpeg (not concatenated) for volume control + fade
  // Skip the old prepend/append approach
  console.log(`[TTS] Will mix ${introSFX.length} intro, ${outroSFX.length} outro via ffmpeg`);

  // Concatenate speech into one buffer
  let combined = Buffer.concat(speechBuffers);

  // Resolve inline SFX audio files and compute byte offsets → time offsets
  // Then overlay them + background SFX in a single ffmpeg pass
  const inlineSFXFiles: { audioUrl: string; atSpeechIndex: number }[] = [];
  for (const overlay of inlineSFXOverlays) {
    const resolved = await resolveInlineSFX(overlay.sfxPrompt, sceneSFX);
    if (resolved) {
      // Save to temp file for ffmpeg
      const tmpPath = path.join(AUDIO_DIR, `tmp-inline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.mp3`);
      fs.writeFileSync(tmpPath, resolved);
      inlineSFXFiles.push({ audioUrl: tmpPath, atSpeechIndex: overlay.afterSpeechIndex });
      console.log(`  [TTS] Inline SFX: "${overlay.sfxPrompt}" → overlay at segment ${overlay.afterSpeechIndex}`);
    }
  }

  // Mix everything with ffmpeg: inline SFX overlays + background loops + intro/outro
  if (inlineSFXFiles.length > 0 || backgroundSFX.length > 0 || introSFX.length > 0 || outroSFX.length > 0) {
    combined = await mixAllSFX(combined, speechBuffers, inlineSFXFiles, backgroundSFX, introSFX, outroSFX);
    // Clean up temp inline SFX files
    for (const f of inlineSFXFiles) {
      try { fs.unlinkSync(f.audioUrl); } catch {}
    }
  }

  // Save to file
  const hash = crypto.createHash('md5').update(req.chapterId + Date.now()).digest('hex').slice(0, 12);
  const filename = `ch-${hash}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filepath, combined);

  const durationEstimate = Math.round(req.prose.length / CHARS_PER_SECOND / speed);

  return {
    audioUrl: `/uploads/audio/${filename}`,
    durationEstimate,
    segments: speechBuffers.length,
    creditsUsed: CREDITS_PER_CHAPTER,
  };
}

/**
 * Generate a short voice preview clip.
 */
export async function generateVoicePreview(voiceId: ElevenLabsVoice, text?: string): Promise<Buffer> {
  const previewText = text || 'The morning light crept through the curtains, painting golden stripes across the wooden floor.';
  return callElevenLabsTTS(previewText, voiceId, 'eleven_flash_v2_5', 1.0);
}

// ========== Helpers ==========

function mergeConsecutiveSegments(segments: TTSSegment[]): TTSSegment[] {
  if (segments.length === 0) return segments;

  const merged: TTSSegment[] = [{ ...segments[0] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    // Never merge SFX segments — they need to stay as discrete audio insertion points
    if (curr.type === 'sfx' || prev.type === 'sfx') {
      merged.push({ ...curr });
    } else if (prev.voice === curr.voice && prev.tone === curr.tone) {
      prev.text = prev.text + ' ' + curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Read an SFX file from the local uploads directory.
 * audioUrl is a relative path like /uploads/sfx/sfx-abc123.mp3
 */
async function downloadSFXFile(audioUrl: string): Promise<Buffer | null> {
  try {
    // Convert URL path to local file path
    const localPath = path.join(process.cwd(), audioUrl);
    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath);
    }
    console.warn(`[TTS] SFX file not found: ${localPath}`);
    return null;
  } catch (e) {
    console.error(`[TTS] Failed to read SFX file ${audioUrl}:`, e);
    return null;
  }
}

/**
 * Try to find a matching SFX audio file for an inline {sfx:prompt} tag.
 * Matches against scene SFX entries by prompt similarity.
 * Falls back to generating a short SFX clip if no match found.
 */
async function resolveInlineSFX(prompt: string, sceneSFX: SceneSFXInput[]): Promise<Buffer | null> {
  if (!prompt) return null;
  const lower = prompt.toLowerCase();

  // Check scene SFX for a matching audio file
  for (const sfx of sceneSFX) {
    if (sfx.audioUrl && (sfx.prompt.toLowerCase().includes(lower) || lower.includes(sfx.prompt.toLowerCase()))) {
      const buf = await downloadSFXFile(sfx.audioUrl);
      if (buf) return buf;
    }
  }

  // No match found — generate a short SFX on the fly
  try {
    const { generateSFX } = await import('./sfx.js');
    const result = await generateSFX({ prompt, durationSeconds: 3 });
    if (result.audioUrl) {
      return await downloadSFXFile(result.audioUrl);
    }
  } catch (e) {
    console.warn(`[TTS] Could not generate inline SFX for "${prompt}":`, e);
  }

  return null;
}

/**
 * Get the duration of an MP3 buffer in seconds using ffprobe.
 */
async function getAudioDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) { resolve(0); return; }
      resolve(parseFloat(stdout.trim()) || 0);
    });
  });
}

/**
 * Single ffmpeg pass to mix all audio layers:
 * - Inline SFX: overlaid at specific timestamps (50% volume)
 * - Background SFX: looped for full duration (5% volume)
 * - Intro SFX: plays from start with fade-in, lower volume (15%), fades out after 5s
 * - Outro SFX: plays at end with fade-out (15%)
 */
async function mixAllSFX(
  narrationBuf: Buffer,
  speechBuffers: Buffer[],
  inlineSFX: { audioUrl: string; atSpeechIndex: number }[],
  bgSFX: SceneSFXInput[],
  introSFXList: SceneSFXInput[] = [],
  outroSFXList: SceneSFXInput[] = [],
): Promise<Buffer> {
  const tmpDir = path.join(AUDIO_DIR, 'tmp-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Write narration
    const narrationPath = path.join(tmpDir, 'narration.mp3');
    fs.writeFileSync(narrationPath, narrationBuf);

    // Get narration total duration
    const narrationDuration = await getAudioDuration(narrationPath);

    // Get duration of each speech segment to compute time offsets
    const segDurations: number[] = [];
    for (let i = 0; i < speechBuffers.length; i++) {
      const segPath = path.join(tmpDir, `seg-${i}.mp3`);
      fs.writeFileSync(segPath, speechBuffers[i]);
      const dur = await getAudioDuration(segPath);
      segDurations.push(dur);
    }

    // Compute cumulative time offset for each segment
    const segTimeOffsets: number[] = [];
    let cumTime = 0;
    for (const dur of segDurations) {
      segTimeOffsets.push(cumTime);
      cumTime += dur;
    }

    // Build ffmpeg inputs and filter
    const inputs = ['-i', narrationPath];
    const filterParts: string[] = [];
    const mixLabels: string[] = [];
    let inputIdx = 1;

    // Inline SFX: overlay at specific time, play once, 50% volume
    for (const sfx of inlineSFX) {
      inputs.push('-i', sfx.audioUrl);
      const timeOffset = segTimeOffsets[sfx.atSpeechIndex] || 0;
      const ms = Math.round(timeOffset * 1000);
      filterParts.push(`[${inputIdx}:a]volume=0.5,adelay=${ms}|${ms}[inl${inputIdx}]`);
      mixLabels.push(`[inl${inputIdx}]`);
      inputIdx++;
    }

    // Background SFX: pad with silence gap between loops, keep volume low
    for (let i = 0; i < bgSFX.length; i++) {
      console.log(`[TTS] Loading BG SFX: "${bgSFX[i].prompt}" from ${bgSFX[i].audioUrl}`);
      const buf = await downloadSFXFile(bgSFX[i].audioUrl!);
      if (buf) {
        const bgRawPath = path.join(tmpDir, `bg-raw-${i}.mp3`);
        const bgPath = path.join(tmpDir, `bg-${i}.mp3`);
        fs.writeFileSync(bgRawPath, buf);
        console.log(`[TTS] BG SFX raw: ${bgRawPath} (${(buf.length / 1024).toFixed(0)}KB)`);

        // Add silence gap between loop repetitions: fade out → silence → fade in
        const clipDuration = await getAudioDuration(bgRawPath);
        const silenceGap = Math.min(6, Math.max(3, Math.round(clipDuration * 0.75)));
        try {
          await new Promise<void>((resolve, reject) => {
            const padArgs = [
              '-i', bgRawPath,
              '-af', `afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, clipDuration - 1.5)}:d=1.5,apad=pad_dur=${silenceGap}`,
              '-y', bgPath,
            ];
            const proc = require('child_process').spawn('ffmpeg', padArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
            proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`pad exit ${code}`)));
            proc.on('error', reject);
          });
          console.log(`[TTS] BG SFX padded: ${clipDuration.toFixed(1)}s + ${silenceGap}s gap`);
        } catch (e) {
          console.warn(`[TTS] BG padding failed, using raw:`, e);
          fs.copyFileSync(bgRawPath, bgPath);
        }

        inputs.push('-i', bgPath);
        filterParts.push(`[${inputIdx}:a]aloop=loop=-1:size=2e+09,volume=__BG_VOL__[bg${inputIdx}]`);
        mixLabels.push(`[bg${inputIdx}]`);
        inputIdx++;
      } else {
        console.error(`[TTS] BG SFX file not found or empty: ${bgSFX[i].audioUrl}`);
      }
    }

    // Intro SFX: plays BEFORE narration starts
    // We prepend the intro and delay everything else by the intro duration
    let introDelayMs = 0;
    for (let i = 0; i < introSFXList.length; i++) {
      const buf = await downloadSFXFile(introSFXList[i].audioUrl!);
      if (buf) {
        const introPath = path.join(tmpDir, `intro-${i}.mp3`);
        fs.writeFileSync(introPath, buf);
        const introDuration = await getAudioDuration(introPath);
        // Trim to max 5 seconds, fade in 1.5s, fade out last 1.5s, 20% volume
        const trimDur = Math.min(introDuration, 5);
        const fadeOutStart = Math.max(0, trimDur - 1.5);
        inputs.push('-i', introPath);
        filterParts.push(`[${inputIdx}:a]atrim=0:${trimDur},asetpts=PTS-STARTPTS,volume=__INTRO_VOL__,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=1.5[intro${inputIdx}]`);
        mixLabels.push(`[intro${inputIdx}]`);
        introDelayMs += Math.round(trimDur * 1000);
        inputIdx++;
        console.log(`[TTS] Intro SFX: "${introSFXList[i].prompt}" ${trimDur.toFixed(1)}s before narration`);
      }
    }

    // Outro SFX: delay to near end, fade out over 2s, 15% volume
    for (let i = 0; i < outroSFXList.length; i++) {
      const buf = await downloadSFXFile(outroSFXList[i].audioUrl!);
      if (buf) {
        const outroPath = path.join(tmpDir, `outro-${i}.mp3`);
        fs.writeFileSync(outroPath, buf);
        inputs.push('-i', outroPath);
        // Start 5 seconds before end of narration
        const outroStart = Math.max(0, Math.round((narrationDuration - 5) * 1000));
        filterParts.push(`[${inputIdx}:a]volume=__OUTRO_VOL__,adelay=${outroStart}|${outroStart},afade=t=out:st=3:d=2[outro${inputIdx}]`);
        mixLabels.push(`[outro${inputIdx}]`);
        inputIdx++;
        console.log(`[TTS] Outro SFX: "${outroSFXList[i].prompt}" at ${outroStart}ms`);
      }
    }

    if (inputIdx === 1) return narrationBuf; // nothing to mix

    // If intro exists, delay narration so intro plays first
    // Also shift all inline SFX and outro by the intro delay
    if (introDelayMs > 0) {
      for (let i = 0; i < filterParts.length; i++) {
        // Shift inline SFX delays (they should play relative to narration, not intro)
        const inlMatch = filterParts[i].match(/^(\[\d+:a\]volume=0\.5,adelay=)(\d+)\|(\d+)(\[inl\d+\])$/);
        if (inlMatch) {
          const newDelay = parseInt(inlMatch[2]) + introDelayMs;
          filterParts[i] = `${inlMatch[1]}${newDelay}|${newDelay}${inlMatch[4]}`;
        }
        // Shift outro delays
        const outroMatch = filterParts[i].match(/^(\[\d+:a\]volume=__OUTRO_VOL__,adelay=)(\d+)\|(\d+)(,.+\[outro\d+\])$/);
        if (outroMatch) {
          const newDelay = parseInt(outroMatch[2]) + introDelayMs;
          filterParts[i] = `${outroMatch[1]}${newDelay}|${newDelay}${outroMatch[4]}`;
        }
        // Background SFX loops from the very start (plays during intro too) — no shift needed
      }
    }

    // Mix all tracks — boost volumes to compensate for amix averaging (divides by N)
    const totalInputs = inputIdx;
    // Background: want ~10% of narration — subtle ambient bed, not competing with voice.
    // amix divides by N, narration boosted by N, so bg = 0.10 * N effective.
    const bgVol = (0.10 * totalInputs).toFixed(2);
    for (let i = 0; i < filterParts.length; i++) {
      filterParts[i] = filterParts[i].replace('__BG_VOL__', bgVol);
    }
    // Inline SFX: want ~25% of narration — noticeable but not jarring
    const inlVol = (0.25 * totalInputs).toFixed(2);
    for (let i = 0; i < filterParts.length; i++) {
      filterParts[i] = filterParts[i].replace(/volume=0\.5,adelay/g, `volume=${inlVol},adelay`);
    }
    // Intro/Outro: want ~15% of narration — gentle transitions
    const introOutroVol = (0.15 * totalInputs).toFixed(2);
    for (let i = 0; i < filterParts.length; i++) {
      filterParts[i] = filterParts[i].replace('__INTRO_VOL__', introOutroVol);
      filterParts[i] = filterParts[i].replace('__OUTRO_VOL__', introOutroVol);
    }
    // Delay narration by intro duration and boost volume
    if (introDelayMs > 0) {
      filterParts.unshift(`[0:a]volume=${totalInputs}.0,adelay=${introDelayMs}|${introDelayMs}[narr]`);
    } else {
      filterParts.unshift(`[0:a]volume=${totalInputs}.0[narr]`);
    }
    const allMixInputs = `[narr]${mixLabels.join('')}`;
    // duration=first: runs until the first input (narration) ends
    // Since narration is adelay'd by introDelayMs, intro plays during that leading silence
    // Background aloop is infinite so we MUST use duration=first, not longest
    filterParts.push(`${allMixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=2[out]`);

    const filterComplex = filterParts.join(';');
    console.log(`[TTS] ffmpeg filter_complex: ${filterComplex}`);
    const outputPath = path.join(tmpDir, 'mixed.mp3');

    const args = [
      ...inputs,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-codec:a', 'libmp3lame',
      '-q:a', '2',
      '-y',
      outputPath,
    ];

    console.log(`[TTS] ffmpeg mixing: ${inlineSFX.length} inline, ${bgSFX.length} bg, ${introSFXList.length} intro, ${outroSFXList.length} outro`);

    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', args, { timeout: 120000 }, (err, _stdout, stderr) => {
        if (err) {
          console.error('[TTS] ffmpeg mix error:', stderr);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    if (fs.existsSync(outputPath)) {
      console.log(`[TTS] SFX mix complete`);
      return fs.readFileSync(outputPath);
    }
    return narrationBuf;
  } catch (e) {
    console.error('[TTS] SFX mixing failed, returning narration only:', e);
    return narrationBuf;
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}
