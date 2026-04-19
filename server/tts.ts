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
  /^(pause|short pause|long pause|dramatic pause|clears throat)$/i,
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

// ========== TTS Pacing Pass ==========

/**
 * Pre-process prose for more natural TTS delivery.
 * Adds micro-pauses at natural breath points without changing meaning.
 */
// Voice-specific pacing: some voices are naturally faster and need more pauses.
// Fable = v1.11 baseline. Rushed voices get v1.12+ expanded pauses.
const RUSHED_VOICES = new Set(['alloy', 'echo', 'shimmer', 'marin', 'cedar', 'onyx', 'nova', 'ash', 'sage', 'verse', 'ballad', 'coral']);

function addTTSPacing(text: string, voice?: string): string {
  let result = text;
  const cleanVoice = (voice || '').replace(/^openai:/, '').toLowerCase();
  const isRushed = RUSHED_VOICES.has(cleanVoice);

  // Helper: repeat \n — rushed voices get double + 2 extra on each
  const nl = (count: number) => '\n'.repeat(isRushed ? count * 2 + 2 : count);
  // Sentences get an extra +3 for rushed voices on top of that
  const snl = (count: number) => '\n'.repeat(isRushed ? count * 2 + 5 : count);

  // 0. Strip asterisks (narrator reads them aloud)
  result = result.replace(/\*/g, '');

  // v1.11 baseline (fable) / v1.12+ for rushed voices (alloy etc.)
  // 1. Paragraph breaks
  result = result.replace(/\n\n+/g, `${nl(7)}—${nl(7)}`);

  // 2. Every sentence boundary — extra pauses for rushed voices
  result = result.replace(/([.!?])\s+([A-Z])/g, `$1${snl(6)}$2`);

  // 3. Before dialogue after narration
  const dlgMatch = isRushed ? 17 : 6; // match the sentence boundary count for regex
  result = result.replace(new RegExp(`([.!?])${'\n'.repeat(dlgMatch)}([""\\u201C])`, 'g'), `$1${nl(7)}$2`);

  // 4. After dialogue closing before narration
  result = result.replace(/([""\u201D][.!?]?)\s+([A-Z][a-z])/g, `$1${nl(7)}$2`);

  // 5. Dialogue comma attribution
  result = result.replace(/([""\u201D]),?\s+([a-z])/g, `$1,${nl(6)}$2`);

  // 6. Em dash pauses
  result = result.replace(/\s*—\s*/g, `${nl(5)}—${nl(5)}`);

  // 7. Semicolons
  result = result.replace(/;\s+/g, `;${nl(6)}`);

  // 8. Ellipsis — more dots for rushed voices
  const dots = isRushed ? '. . . . . . . . . . . . . . . .' : '. . . . . . . .';
  result = result.replace(/\.{3}/g, dots);
  result = result.replace(/…/g, dots);

  return result;
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
  provider?: 'elevenlabs' | 'openai' | 'fish' | 'grok';
  model?: string;
  speed?: number; // 0.5 – 2.0
  multiVoice?: boolean; // if false, use narrator for everything
  characterDescriptions?: Record<string, string>; // characterName → personality/speech description
  narratorStyle?: string; // e.g. "dramatic audiobook narrator"
  sceneSFX?: SceneSFXInput[]; // scene-level SFX (background ambience, intro/outro sounds)
  chapterNumber?: number;   // prepend "Chapter N: Title" announcement
  chapterTitle?: string;
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

// Credit cost is now character-based — imported from billing.ts at call site
// Legacy constant kept for reference only
const CREDITS_PER_CHAPTER_LEGACY = 2;

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const OPENAI_API = 'https://api.openai.com/v1/audio/speech';

const OPENAI_TTS_INSTRUCTIONS = `You are a professional audiobook narrator delivering a compelling, emotionally rich performance.

PACING — THIS IS THE MOST CRITICAL INSTRUCTION:
- Read SLOWLY. Much slower than you think. Like a premium Audible narrator, not a podcast host.
- PAUSE between EVERY sentence. Every single one. Hold real silence — at least a full beat — before starting the next sentence.
- Treat every period, exclamation mark, and question mark as a FULL STOP. Do not rush into the next sentence.
- Paragraph breaks and line breaks mean LONG pauses — hold for TWO full beats of silence.
- Before and after dialogue: pause noticeably. The listener needs to register the speaker change.
- Scene transitions deserve the LONGEST pauses — three full beats of silence.
- Em dashes and ellipses mean DELIBERATE pauses — hold them.
- When you encounter multiple line breaks in a row, that means an even LONGER pause. Honor every single one.
- If in doubt, pause LONGER rather than shorter. Rushing is the #1 worst thing a narrator can do.

VOCAL DELIVERY:
- DO NOT be monotone. This is the most important rule. Your voice must rise and fall with the story.
- Use a wide dynamic range — go soft and intimate for tender moments, then build to full energy for action or confrontation.
- Vary your pitch significantly between sentences. High energy for excitement, low and quiet for tension or sadness.
- Dialogue MUST sound like real people talking. Each speaker should have noticeably different energy, pitch, and rhythm.
- Angry dialogue: louder, faster, clipped. Sad dialogue: slower, softer, heavier. Excited dialogue: higher pitch, faster pace.
- Whispered or tense lines should drop dramatically in volume and intensity.
- Narration should shift tone to match the scene — don't narrate a battle scene the same way you narrate a love scene.
- Lean into emotion. If a character is heartbroken, let your voice crack slightly. If they're furious, let the edge come through.

TRANSITIONS:
- Pause briefly before and after dialogue — don't rush from narration into quotes.
- Scene breaks or paragraph shifts deserve a full beat of silence.
- Build tension gradually — don't peak too early in dramatic passages.

OVERALL:
- This is a novel, not a summary. Perform it, don't just read it.
- Prioritize emotional expressiveness and dynamic range above all else.
- If a moment is meant to land hard, let it land. Don't rush past it.
- The listener should FEEL the story, not just hear words.`;

async function callOpenAITTS(text: string, voice: string, speed = 1.0): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI TTS');

  const cleanedVoice = (voice || 'alloy').replace(/^openai:/, '');
  const response = await fetch(OPENAI_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: cleanedVoice,
      input: text,
      instructions: OPENAI_TTS_INSTRUCTIONS,
      speed: Math.max(0.5, Math.min(2.0, speed || 1.0)),
      format: 'mp3',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    if (response.status === 429 || detail.includes('insufficient_quota')) {
      throw new Error('Audio generation is temporarily unavailable due to API limits. Please try again later.');
    }
    throw new Error(`OpenAI TTS error ${response.status}: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ========== Grok (xAI) TTS ==========

const GROK_TTS_API = 'https://api.x.ai/v1/tts';

// xAI hard limit is 15,000 chars per request. We cap our chunks much lower
// (~5500) to keep parallel generation fast and avoid any silent cut-off
// behaviour on boundary-sized inputs.
const GROK_MAX_CHARS_PER_REQUEST = 14500;

async function callGrokTTS(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY is required for Grok TTS');

  // Hard guard so we never accidentally send > 15K chars and get a truncated response.
  const safeText = text.length > GROK_MAX_CHARS_PER_REQUEST
    ? text.slice(0, GROK_MAX_CHARS_PER_REQUEST)
    : text;
  const cleanedVoice = (voiceId || 'eve').replace(/^grok:/, '');

  const response = await fetch(GROK_TTS_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: safeText,
      voice_id: cleanedVoice,
      language: 'en',
      output_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    if (response.status === 429) {
      throw new Error('Grok TTS rate limit — please retry in a moment.');
    }
    throw new Error(`Grok TTS error ${response.status}: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ========== Fish Audio TTS ==========

import { encode as msgpackEncode } from '@msgpack/msgpack';

const FISH_AUDIO_API = 'https://api.fish.audio/v1/tts';

export interface FishAudioVoiceInfo {
  id: string;
  name: string;
  desc: string;
  gender: string;
  tone: string;
}

// Curated narration voices — high quality, popular, English
export const FISH_AUDIO_VOICES: FishAudioVoiceInfo[] = [
  { id: '933563129e564b19a115bedd57b7406a', name: 'Sarah', desc: 'Soft & intimate narrator', gender: 'female', tone: 'warm' },
  { id: 'bf322df2096a46f18c579d0baa36f41d', name: 'Adrian', desc: 'Deep & dramatic storyteller', gender: 'male', tone: 'deep' },
  { id: '536d3a5e000945adb7038665781a4aca', name: 'Ethan', desc: 'Clear & professional', gender: 'male', tone: 'calm' },
  { id: 'e3cd384158934cc9a01029cd7d278634', name: 'Laura', desc: 'Warm & confident', gender: 'female', tone: 'warm' },
  { id: 'b347db033a6549378b48d00acb0d06cd', name: 'Selene', desc: 'Gentle & meditative', gender: 'female', tone: 'gentle' },
  { id: '400b2a2c4aa44afc87b6d14adf0dd13c', name: 'Chosen', desc: 'British · deep & dramatic', gender: 'male', tone: 'dramatic' },
  { id: '5e79e8f5d2b345f98baa8c83c947532d', name: 'Paddington', desc: 'Deep & wise narrator', gender: 'male', tone: 'deep' },
  { id: '4858e0be678c4449bf3a7646186edd42', name: 'Nahida', desc: 'Gentle & empathetic', gender: 'female', tone: 'warm' },
];

// Cache for Fish Audio preview URLs (signed, expire in 1hr — refresh every 30min)
let fishPreviewCache: Record<string, string> = {};
let fishPreviewFetchedAt = 0;
const FISH_PREVIEW_TTL = 30 * 60 * 1000;

export async function getFishVoicesWithPreviews(): Promise<(FishAudioVoiceInfo & { previewUrl?: string })[]> {
  if (Object.keys(fishPreviewCache).length > 0 && Date.now() - fishPreviewFetchedAt < FISH_PREVIEW_TTL) {
    return FISH_AUDIO_VOICES.map(v => ({ ...v, previewUrl: fishPreviewCache[v.id] }));
  }

  try {
    const results = await Promise.all(
      FISH_AUDIO_VOICES.map(async (voice) => {
        try {
          const res = await fetch(`https://api.fish.audio/model/${voice.id}`);
          if (!res.ok) return voice;
          const data = await res.json() as any;
          const sample = data.samples?.[0];
          const previewUrl = sample?.audio || undefined;
          if (previewUrl) fishPreviewCache[voice.id] = previewUrl;
          return { ...voice, previewUrl };
        } catch {
          return voice;
        }
      })
    );
    fishPreviewFetchedAt = Date.now();
    return results;
  } catch {
    return FISH_AUDIO_VOICES;
  }
}

/**
 * Add natural pacing for Fish Audio using [pause] / [long pause] tags.
 * Fish S2-pro supports inline tags: [pause], [long pause], [whisper],
 * [laughing], [sigh], [excited], [angry], [sad], [emphasis], etc.
 */
function addFishPacing(text: string): string {
  let result = text;

  // A/B test CONFIRMED: (break) creates real pauses in Fish Audio S2-pro.
  // (long-break) does NOT work. Stack multiple (break) for longer pauses.
  // Works with both normalize=true and normalize=false.

  // 0. Strip asterisks (narrator reads them aloud)
  result = result.replace(/\*/g, '');

  // 1. Protect common abbreviations
  const abbrevs = ['Mr', 'Mrs', 'Ms', 'Dr', 'St', 'Jr', 'Sr', 'Prof', 'Gen', 'Gov', 'Sgt', 'Cpl', 'Lt', 'Col', 'Capt', 'Rev', 'vs', 'etc', 'approx'];
  for (const a of abbrevs) {
    result = result.replace(new RegExp(`\\b${a}\\.`, 'g'), `${a}\u00B7`);
  }

  const closeQuotes = '[""\u201D\u201C\'\u2019\u2018\u00BB)\\]]';

  // 2. Every sentence boundary → (break)
  result = result.replace(new RegExp(`([.!?])(${closeQuotes}?)[ \\t]+`, 'g'), '$1$2 (break) ');
  result = result.replace(new RegExp(`([.!?])(${closeQuotes}?)\\n(?!\\n)`, 'g'), '$1$2 (break) ');
  result = result.replace(new RegExp(`([.!?])(${closeQuotes})(${closeQuotes})[ \\t]+`, 'g'), '$1$2$3 (break) ');

  // 3. Before/after dialogue → double (break)
  const openQuotes = '[""\u201C\u2018\u00AB]';
  result = result.replace(new RegExp(`\\(break\\) (${openQuotes})`, 'g'), '(break) (break) $1');
  result = result.replace(new RegExp(`(${closeQuotes}[.!?]) \\(break\\) ([A-Z])`, 'g'), '$1 (break) (break) $2');
  result = result.replace(/(["\u201D\u201C]),?\s+([a-z])/g, '$1, (break) $2');

  // 4. Em dashes
  result = result.replace(/\s*—\s*/g, ' (break) ');

  // 5. Semicolons and colons
  result = result.replace(/;\s+/g, '; (break) ');
  result = result.replace(/:\s+/g, ': (break) ');

  // 6. Ellipsis → (break)
  result = result.replace(/\.{3}/g, '(break)');
  result = result.replace(/…/g, '(break)');

  // 7. Paragraph breaks → triple (break) for scene-change feel
  result = result.replace(/\n\n+/g, ' (break) (break) (break) ');

  // 8. Convert any remaining bracket tags
  result = result.replace(/\[(pause|short pause)\]/gi, '(break)');
  result = result.replace(/\[(long pause|dramatic pause)\]/gi, '(break) (break)');

  // Deduplicate: max 4 consecutive (break)
  result = result.replace(/(\(break\)\s*){5,}/g, '(break) (break) (break) (break) ');

  // Clean up
  result = result.replace(/  +/g, ' ');
  result = result.replace(/\u00B7/g, '.');

  return result;
}

// Build a spoken chapter title announcement with provider-specific pauses
function buildChapterAnnouncement(
  number: number,
  title: string | undefined,
  provider: string,
): string {
  const t = title?.trim();
  switch (provider) {
    case 'fish':
      return t
        ? `Chapter ${number}. (break) (break) (break) ${t}. (break) (break) (break) (break) `
        : `Chapter ${number}. (break) (break) (break) (break) `;
    case 'openai':
    case 'grok':
      return t
        ? `Chapter ${number}.\n\n\n\n\n\n\n—\n\n\n\n\n\n\n${t}.\n\n\n\n\n\n\n—\n\n\n\n\n\n\n\n`
        : `Chapter ${number}.\n\n\n\n\n\n\n—\n\n\n\n\n\n\n\n`;
    default: // elevenlabs
      return t
        ? `Chapter ${number}... ... ... ${t}... ... ... ... \n\n`
        : `Chapter ${number}... ... ... ... \n\n`;
  }
}

// Cached 0.8-second silence buffer for inter-chunk pauses (Fish Audio path).
// Generated once via ffmpeg, reused for every generation.
let _silenceCache: Buffer | null = null;
async function getFishSilenceBuffer(): Promise<Buffer> {
  if (_silenceCache) return _silenceCache;
  return new Promise((resolve, reject) => {
    const args = ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.8',
      '-b:a', '192k', '-f', 'mp3', 'pipe:1'];
    const proc = execFile('ffmpeg', args, { encoding: 'buffer', maxBuffer: 200_000 }, (err, stdout) => {
      if (err) {
        // Fallback: 50ms of MP3 silence frame (valid MPEG audio frame header + padding)
        console.warn('[tts] ffmpeg silence generation failed, using minimal fallback');
        _silenceCache = Buffer.alloc(400, 0);
        resolve(_silenceCache);
        return;
      }
      _silenceCache = stdout as unknown as Buffer;
      resolve(_silenceCache);
    });
  });
}

async function callFishAudioTTS(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  if (!apiKey) throw new Error('FISH_AUDIO_API_KEY is required for Fish Audio TTS');

  const body = msgpackEncode({
    text: text,
    reference_id: voiceId,
    format: 'mp3',
    mp3_bitrate: 192,
    normalize: false,
    latency: 'normal',
  });

  const response = await fetch(FISH_AUDIO_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/msgpack',
      'model': 's2-pro',
    },
    body: body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    if (response.status === 429) {
      throw new Error('Fish Audio rate limit — too many concurrent requests. Please try again.');
    }
    throw new Error(`Fish Audio TTS error ${response.status}: ${detail}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

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
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Playful & bright', gender: 'female', tone: 'bright' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', desc: 'Professional & warm', gender: 'female', tone: 'warm' },
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
const LOG_FILE = path.join(process.cwd(), 'uploads', 'audio', 'tts.log');
function ttsLog(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(`[TTS] ${msg}`);
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
}

export async function generateChapterAudio(req: TTSRequest & { knownCharacters?: string[]; onProgress?: (pct: number) => void }): Promise<TTSResult> {
  ensureAudioDir();
  ttsLog(`START generateChapterAudio chapterId=${req.chapterId} prose=${req.prose.length}chars`);

  // Sanitize model: if it's an OpenAI model but we're on the ElevenLabs path, use default
  const rawModel = req.model || 'eleven_v3';
  const model = rawModel.startsWith('openai') ? 'eleven_v3' : rawModel;
  const speed = req.speed || 1.0;
  const voiceMap = req.voiceMap;

  // Budget provider path: OpenAI TTS (single-voice, no multi-character routing)
  // Only use OpenAI path if provider is explicitly 'openai' — don't guess from model name
  if ((req.provider || '').toLowerCase() === 'openai') {
    const clean = stripCharacterTags(req.prose)
      .replace(/\{sfx:[^}]+\}\s*/g, '')
      .replace(/\*/g, '')
      .trim();
    const announcement = req.chapterNumber
      ? buildChapterAnnouncement(req.chapterNumber, req.chapterTitle, 'openai')
      : '';
    let proseBody = clean;
    if (req.chapterNumber) {
      proseBody = proseBody.replace(/^Chapter\s+\d+[.:]\s*[^\n]*/i, '').trim();
    }
    const paced = announcement + addTTSPacing(proseBody, voiceMap.narrator);
    const openaiSpeed = Math.max(0.5, Math.min(2.0, (req.speed ?? 1.0)));

    // OpenAI TTS has a ~4096 token input limit. Chunk long text by paragraphs
    // to stay safely under the limit (~1500 tokens ≈ 6000 chars).
    const MAX_CHUNK_CHARS = 5500;
    const chunks: string[] = [];
    if (paced.length <= MAX_CHUNK_CHARS) {
      chunks.push(paced);
    } else {
      const paragraphs = paced.split(/\n\n+/);
      let current = '';
      for (const para of paragraphs) {
        if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
          chunks.push(current.trim());
          current = para;
        } else {
          current += (current ? '\n\n' : '') + para;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      // Safety: if any single chunk is still too long, split by sentences
      const safeChunks: string[] = [];
      for (const chunk of chunks) {
        if (chunk.length <= MAX_CHUNK_CHARS) {
          safeChunks.push(chunk);
        } else {
          const sentences = chunk.match(/[^.!?]+[.!?]+[\s]*/g) || [chunk];
          let sc = '';
          for (const s of sentences) {
            if (sc.length + s.length > MAX_CHUNK_CHARS && sc.length > 0) {
              safeChunks.push(sc.trim());
              sc = s;
            } else {
              sc += s;
            }
          }
          if (sc.trim()) safeChunks.push(sc.trim());
        }
      }
      chunks.length = 0;
      chunks.push(...safeChunks);
    }

    ttsLog(`OpenAI TTS: ${chunks.length} chunks for ${paced.length} chars (parallel)`);
    // Generate all chunks in parallel
    const audioBuffers = await Promise.all(
      chunks.map(async (chunk, ci) => {
        const buf = await callOpenAITTS(chunk, voiceMap.narrator, openaiSpeed);
        req.onProgress?.(Math.round(((ci + 1) / chunks.length) * 100));
        return buf;
      })
    );

    // Concatenate MP3 buffers (MP3 frames are independently decodable)
    const combined = Buffer.concat(audioBuffers);
    const hash = crypto.createHash('md5').update(req.chapterId + Date.now()).digest('hex').slice(0, 12);
    const filename = `ch-${hash}.mp3`;
    const filepath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filepath, combined);
    const durationEstimate = Math.round(clean.length / CHARS_PER_SECOND / openaiSpeed);
    // Budget tier pricing: ~5x cheaper than ElevenLabs baseline in Theodore credits
    const creditsUsed = Math.max(20, Math.ceil(clean.length / 1000) * 20);
    return {
      audioUrl: `/uploads/audio/${filename}`,
      durationEstimate,
      segments: chunks.length,
      creditsUsed,
    };
  }

  // ── Grok (xAI) path: single-voice, budget pricing ──
  // xAI allows 15K chars per request — we chunk much smaller for parallelism
  // and to match the pacing/boundary logic we already use for OpenAI.
  if ((req.provider || '').toLowerCase() === 'grok') {
    const clean = stripCharacterTags(req.prose)
      .replace(/\{sfx:[^}]+\}\s*/g, '')
      .replace(/\*/g, '')
      .trim();
    const announcement = req.chapterNumber
      ? buildChapterAnnouncement(req.chapterNumber, req.chapterTitle, 'grok')
      : '';
    let proseBody = clean;
    if (req.chapterNumber) {
      proseBody = proseBody.replace(/^Chapter\s+\d+[.:]\s*[^\n]*/i, '').trim();
    }
    // Grok takes plain text — our OpenAI-style pacing adds newline pauses
    // that Grok reads as natural breaths, so reuse it for now.
    const paced = announcement + addTTSPacing(proseBody, voiceMap.narrator);

    // Chunk long text. Keep chunks well below xAI's 15K limit for safety +
    // parallelism. Split on paragraph boundaries first, with sentence-level
    // fallback for ultra-long paragraphs so we never cut mid-sentence.
    const MAX_CHUNK_CHARS = 5500;
    const chunks: string[] = [];
    if (paced.length <= MAX_CHUNK_CHARS) {
      chunks.push(paced);
    } else {
      const paragraphs = paced.split(/\n\n+/);
      let current = '';
      for (const para of paragraphs) {
        if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
          chunks.push(current.trim());
          current = para;
        } else {
          current += (current ? '\n\n' : '') + para;
        }
      }
      if (current.trim()) chunks.push(current.trim());
      // Safety: if any single chunk is still too long, split by sentences
      const safeChunks: string[] = [];
      for (const chunk of chunks) {
        if (chunk.length <= MAX_CHUNK_CHARS) {
          safeChunks.push(chunk);
        } else {
          const sentences = chunk.match(/[^.!?]+[.!?]+[\s]*/g) || [chunk];
          let sc = '';
          for (const s of sentences) {
            if (sc.length + s.length > MAX_CHUNK_CHARS && sc.length > 0) {
              safeChunks.push(sc.trim());
              sc = s;
            } else {
              sc += s;
            }
          }
          if (sc.trim()) safeChunks.push(sc.trim());
        }
      }
      chunks.length = 0;
      chunks.push(...safeChunks);
    }

    // Filter out empty/whitespace-only chunks — past Fish bug caused duplicates.
    const validChunks = chunks.filter(c => c.replace(/[.\s,;:!?\-—]/g, '').length > 0);
    ttsLog(`Grok TTS: ${validChunks.length} chunks for ${paced.length} chars (parallel), voice=${voiceMap.narrator}`);

    // Generate all chunks in parallel. If any one fails, fail the whole
    // generation — partial audio would silently drop a segment of the chapter.
    const audioBuffers = await Promise.all(
      validChunks.map(async (chunk, ci) => {
        const buf = await callGrokTTS(chunk, voiceMap.narrator);
        req.onProgress?.(Math.round(((ci + 1) / validChunks.length) * 100));
        return buf;
      })
    );

    // Concatenate MP3 buffers (MP3 frames are independently decodable)
    const combined = Buffer.concat(audioBuffers);
    const hash = crypto.createHash('md5').update(req.chapterId + Date.now()).digest('hex').slice(0, 12);
    const filename = `ch-${hash}.mp3`;
    const filepath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filepath, combined);
    const durationEstimate = Math.round(clean.length / CHARS_PER_SECOND);
    // Grok is ~$4.20/1M chars (cheaper than OpenAI's $15/1M).
    // Pricing: 6 credits per 1K chars, min 10 — matches budget-tier feel.
    const creditsUsed = Math.max(10, Math.ceil(clean.length / 1000) * 6);
    return {
      audioUrl: `/uploads/audio/${filename}`,
      durationEstimate,
      segments: validChunks.length,
      creditsUsed,
    };
  }

  // ── Fish Audio path: single-voice, high-quality narration ──
  if ((req.provider || '').toLowerCase() === 'fish') {
    const clean = stripCharacterTags(req.prose)
      .replace(/\{sfx:[^}]+\}\s*/g, '')
      .trim();
    const announcement = req.chapterNumber
      ? buildChapterAnnouncement(req.chapterNumber, req.chapterTitle, 'fish')
      : '';
    // Strip any existing "Chapter N" / "Chapter N: Title" from the start of prose
    // to avoid the narrator saying the chapter title twice
    let proseBody = clean;
    if (req.chapterNumber) {
      proseBody = proseBody.replace(/^Chapter\s+\d+[.:]\s*[^\n]*/i, '').trim();
    }
    // Add announcement AFTER pacing so its pauses aren't deduplicated
    const paced = announcement + addFishPacing(proseBody);

    // Smaller chunks + parallel generation for speed.
    // Fish Audio's concurrency limit is 5 (starter tier), so we target 3-5 chunks.
    const MAX_CHUNK_CHARS = 3000;
    const chunks: string[] = [];
    const paragraphs = paced.split(/\n\n+/);
    let current = '';
    for (const para of paragraphs) {
      if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
        chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    // Strip 'fish:' prefix from voice ID
    const fishVoiceId = voiceMap.narrator.replace(/^fish:/, '');
    ttsLog(`Fish Audio TTS: ${chunks.length} chunks for ${paced.length} chars (parallel), voice=${fishVoiceId}`);

    // Filter out empty/whitespace-only chunks that would cause duplicate audio
    const validChunks = chunks.filter(c => c.replace(/[.\s,;:!?\-—]/g, '').length > 0);
    ttsLog(`Fish Audio TTS: ${validChunks.length} valid chunks (${chunks.length - validChunks.length} empty removed)`);

    // Generate chunks sequentially — concurrency is handled at the scene level
    // (multiple scenes run in parallel, so each scene's chunks must be sequential
    // to avoid exceeding Fish Audio's 5 concurrent request limit)
    const audioBuffers: Buffer[] = [];
    for (let ci = 0; ci < validChunks.length; ci++) {
      const buf = await callFishAudioTTS(validChunks[ci], fishVoiceId);
      audioBuffers.push(buf);
      req.onProgress?.(Math.round(((ci + 1) / validChunks.length) * 100));
    }

    // Insert 0.8s of silence between chunks for natural paragraph pauses.
    // MP3 silence: a valid silent MPEG frame repeated. We use ffmpeg-generated
    // silence cached in memory to avoid shelling out on every generation.
    const silenceBuf = await getFishSilenceBuffer();
    const parts: Buffer[] = [];
    for (let i = 0; i < audioBuffers.length; i++) {
      parts.push(audioBuffers[i]);
      if (i < audioBuffers.length - 1) parts.push(silenceBuf);
    }
    const combined = Buffer.concat(parts);
    const hash = crypto.createHash('md5').update(req.chapterId + Date.now()).digest('hex').slice(0, 12);
    const filename = `ch-${hash}.mp3`;
    const filepath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filepath, combined);
    const durationEstimate = Math.round(clean.length / CHARS_PER_SECOND);
    // Same credit cost as OpenAI (similar API price)
    const creditsUsed = Math.max(20, Math.ceil(clean.length / 1000) * 20);
    return {
      audioUrl: `/uploads/audio/${filename}`,
      durationEstimate,
      segments: chunks.length,
      creditsUsed,
    };
  }

  // Collect all scene-level SFX — auto-generate audio for any that are missing
  const allSFX = req.sceneSFX || [];
  console.log(`[TTS] Raw sceneSFX received (${allSFX.length}):`);
  for (const s of allSFX) {
    console.log(`  [TTS]   "${s.prompt}" pos=${s.position} enabled=${s.enabled} hasAudio=${!!s.audioUrl}`);
  }

  // Auto-generate audio for enabled SFX without audioUrl
  // Generate missing SFX in parallel to minimize total wait time
  const sfxToGenerate = allSFX.filter(s => {
    if (!s.enabled || !s.prompt) return false;
    return !s.audioUrl || !fs.existsSync(path.join(process.cwd(), s.audioUrl));
  });
  if (sfxToGenerate.length > 0) {
    console.log(`[TTS] Auto-generating ${sfxToGenerate.length} SFX clips in parallel...`);
    await Promise.allSettled(
      sfxToGenerate.map(async (s) => {
        const duration = s.position === 'background' ? 15 : 4;
        // Prefix prompts for quality/style based on position
        const sfxPrompt = s.position === 'start'
          ? `Single one-shot sound effect, not looping: ${s.prompt}`
          : s.position === 'background'
          ? `Clean, clear, high-quality ambient sound: ${s.prompt}`
          : s.prompt;
        try {
          console.log(`[TTS] Generating SFX: "${sfxPrompt}" (${s.position}, ${duration}s)`);
          const result = await generateSFX({ prompt: sfxPrompt, durationSeconds: duration });
          s.audioUrl = result.audioUrl;
          console.log(`[TTS] SFX ready: "${s.prompt}" → ${result.audioUrl}`);
        } catch (e: any) {
          console.error(`[TTS] SFX failed: "${s.prompt}": ${e.message}`);
          s.audioUrl = '';
        }
      })
    );
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

  // Prepend chapter announcement for ElevenLabs
  const elAnnouncement = req.chapterNumber
    ? buildChapterAnnouncement(req.chapterNumber, req.chapterTitle, 'elevenlabs')
    : '';
  let elProse = req.prose;
  if (req.chapterNumber) {
    elProse = elProse.replace(/^Chapter\s+\d+[.:]\s*[^\n]*/i, '').trim();
  }
  const proseWithAnnouncement = elAnnouncement + elProse;

  // Parse prose into segments (narration, dialogue, sfx markers)
  let segments: TTSSegment[];
  if (req.multiVoice && req.knownCharacters && req.knownCharacters.length > 0) {
    segments = parseDialogue(proseWithAnnouncement, req.knownCharacters);
    segments = applyVoiceMap(segments, voiceMap);
  } else {
    // Single-voice mode: parse for SFX markers only, force narrator voice on everything
    segments = parseDialogue(proseWithAnnouncement, []);
    segments = segments.map(s => ({ ...s, voice: voiceMap.narrator }));
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
  const totalSpeechSegs = merged.filter(s => s.type !== 'sfx' && s.text.trim()).length;
  let completedSpeechSegs = 0;

  for (const seg of merged) {
    if (seg.type === 'sfx') {
      pendingSFX.push(seg.sfxPrompt || '');
      continue;
    }
    if (!seg.text.trim()) continue;
    // ElevenLabs rejects inputs that are empty after stripping speaker tags/emojis
    const textContent = seg.text.replace(/\[[^\]]+\]/g, '').replace(/[\u{1F600}-\u{1F9FF}]/gu, '').trim();
    if (!textContent) continue;

    // If there are pending SFX (inline sound effects), add natural pauses
    // around them so narration doesn't feel rushed
    let ttsText = seg.text;
    if (pendingSFX.length > 0 && speechBuffers.length > 0) {
      // Add a pause at the start of text following an SFX marker
      ttsText = '... ' + ttsText;
    }

    const buf = await callElevenLabsTTS(ttsText, seg.voice, model, speed, seg.tone);
    completedSpeechSegs++;
    req.onProgress?.(Math.round((completedSpeechSegs / totalSpeechSegs) * 90)); // cap at 90%, final 10% for mixing

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
  ttsLog(`SPEECH CONCAT: ${speechBuffers.length} buffers → ${combined.length} bytes`);

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
    ttsLog(`MIXING SFX: inline=${inlineSFXFiles.length} bg=${backgroundSFX.length} intro=${introSFX.length} outro=${outroSFX.length}`);
    combined = await mixAllSFX(combined, speechBuffers, inlineSFXFiles, backgroundSFX, introSFX, outroSFX);
    ttsLog(`MIX COMPLETE: combined.length=${combined.length}`);
    // Clean up temp inline SFX files
    for (const f of inlineSFXFiles) {
      try { fs.unlinkSync(f.audioUrl); } catch {}
    }
  }

  // Save to file
  ttsLog(`REACHED SAVE POINT | chapterId=${req.chapterId} | combined.length=${combined.length}`);

  const hash = crypto.createHash('md5').update(req.chapterId + Date.now()).digest('hex').slice(0, 12);
  const filename = `ch-${hash}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);
  try {
    ensureAudioDir();
    const logMsg = `[${new Date().toISOString()}] Writing ${(combined.length / 1024).toFixed(0)}KB to ${filepath}\n`;
    fs.appendFileSync(path.join(AUDIO_DIR, 'write.log'), logMsg);
    console.log(`[TTS] Writing ${(combined.length / 1024).toFixed(0)}KB to ${filepath}`);
    fs.writeFileSync(filepath, combined);
    const exists = fs.existsSync(filepath);
    const stat = exists ? fs.statSync(filepath) : null;
    const successMsg = `[${new Date().toISOString()}] Saved: ${filepath} (exists=${exists}, size=${stat?.size || 0})\n`;
    fs.appendFileSync(path.join(AUDIO_DIR, 'write.log'), successMsg);
    console.log(`[TTS] Saved audio: ${filepath} (exists=${exists}, size=${stat?.size || 0})`);
  } catch (writeErr: any) {
    const errMsg = `[${new Date().toISOString()}] FAILED: ${writeErr.message} | AUDIO_DIR=${AUDIO_DIR} | filepath=${filepath} | combined.length=${combined.length}\n`;
    try { fs.appendFileSync(path.join(AUDIO_DIR, 'write.log'), errMsg); } catch {}
    console.error(`[TTS] FAILED to write audio file: ${writeErr.message}`);
  }

  const durationEstimate = Math.round(req.prose.length / CHARS_PER_SECOND / speed);

  // Character-based credit cost: 100 credits per 1,000 characters
  const charCount = req.prose.length;
  const creditsUsed = Math.max(100, Math.ceil(charCount / 1000) * 100);

  return {
    audioUrl: `/uploads/audio/${filename}`,
    durationEstimate,
    segments: speechBuffers.length,
    creditsUsed,
  };
}

/**
 * Generate a short voice preview clip.
 */
export async function generateVoicePreview(voiceId: string, text?: string): Promise<Buffer> {
  const previewText = text || 'The morning light crept through the curtains, painting golden stripes across the wooden floor.';

  if (voiceId.startsWith('openai:')) {
    return callOpenAITTS(previewText, voiceId, 1.0);
  }

  if (voiceId.startsWith('grok:')) {
    return callGrokTTS(previewText, voiceId);
  }

  return callElevenLabsTTS(previewText, voiceId as ElevenLabsVoice, 'eleven_flash_v2_5', 1.0);
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
    console.log(`[TTS] Generating inline SFX on-the-fly: "${prompt}"`);
    const result = await generateSFX({ prompt, durationSeconds: 3 });
    console.log(`[TTS] Inline SFX generated: ${result.audioUrl}`);
    if (result.audioUrl) {
      return await downloadSFXFile(result.audioUrl);
    }
  } catch (e: any) {
    console.error(`[TTS] Failed to generate inline SFX for "${prompt}":`, e.message || e);
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
 * - Narration: full volume (1.0), delayed by intro duration
 * - Background SFX: looped for full duration, 40% vol, 2s fade-in, 3s fade-out, acompressor
 * - Inline SFX: overlaid at segment boundaries, 50% vol, acompressor
 * - Intro SFX: plays for up to 5s BEFORE narration starts, 60% vol, 1.5s fade-in/out, acompressor
 * - Outro SFX: starts 5s before narration ends, 60% vol, 2s fade-out, acompressor
 * - amix normalize=0 prevents volume redistribution when tracks end (no distortion)
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

    // Inline SFX: overlay at specific time with a brief gap before narration resumes
    for (const sfx of inlineSFX) {
      inputs.push('-i', sfx.audioUrl);
      const timeOffset = segTimeOffsets[sfx.atSpeechIndex] || 0;
      // Place SFX slightly before the segment starts (0.3s overlap with end of prev segment)
      const ms = Math.max(0, Math.round((timeOffset - 0.3) * 1000));
      filterParts.push(`[${inputIdx}:a]acompressor=threshold=-20dB:ratio=4:makeup=4dB,volume=__INL_VOL__,adelay=${ms}|${ms}[inl${inputIdx}]`);
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

        // Crossfade loop: no silence gaps — ambient BG should be seamless
        const clipDuration = await getAudioDuration(bgRawPath);
        try {
          // Apply short crossfade at boundaries for seamless looping
          await new Promise<void>((resolve, reject) => {
            const padArgs = [
              '-i', bgRawPath,
              '-af', `afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, clipDuration - 1.5)}:d=1.5`,
              '-y', bgPath,
            ];
            const proc = require('child_process').spawn('ffmpeg', padArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
            proc.on('close', (code: number) => code === 0 ? resolve() : reject(new Error(`pad exit ${code}`)));
            proc.on('error', reject);
          });
          console.log(`[TTS] BG SFX crossfade-ready: ${clipDuration.toFixed(1)}s (seamless loop)`);
        } catch (e) {
          console.warn(`[TTS] BG crossfade failed, using raw:`, e);
          fs.copyFileSync(bgRawPath, bgPath);
        }

        inputs.push('-i', bgPath);
        // Loop bg to cover full output (intro delay + narration), then trim
        const paddedDuration = clipDuration;
        // aloop loop=N means N additional plays (total = N+1), add extra for safety
        const totalOutputDuration = narrationDuration + 15; // generous buffer for intro delay
        const totalPlays = Math.ceil(totalOutputDuration / paddedDuration) + 1;
        const loopCount = Math.max(1, totalPlays);
        // acompressor evens out volume differences between SFX clips without buffering entire stream
        // Trim must cover intro delay + narration duration so bg doesn't cut out early
        const bgTrimDur = Math.ceil(narrationDuration + 10); // extra buffer, will be trimmed by amix duration=first
        filterParts.push(`[${inputIdx}:a]aloop=loop=${loopCount}:size=2e+09,atrim=0:${bgTrimDur},acompressor=threshold=-20dB:ratio=4:makeup=4dB,volume=__BG_VOL__,afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, bgTrimDur - 3)}:d=3[bg${inputIdx}]`);
        mixLabels.push(`[bg${inputIdx}]`);
        inputIdx++;
        console.log(`[TTS] BG SFX looping ${loopCount}+1 plays (${paddedDuration.toFixed(1)}s each) for ${narrationDuration.toFixed(1)}s narration`);
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
        // Play intro SFX once (no loop, no trim). Narration starts after max(introDuration, 5s).
        const fadeOutStart = Math.max(0, introDuration - 1.5);
        inputs.push('-i', introPath);
        filterParts.push(`[${inputIdx}:a]asetpts=PTS-STARTPTS,acompressor=threshold=-20dB:ratio=4:makeup=4dB,volume=__INTRO_VOL__,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=1.5[intro${inputIdx}]`);
        mixLabels.push(`[intro${inputIdx}]`);
        // Narration starts at 5s minimum, or after intro ends if longer than 5s
        introDelayMs += Math.round(Math.max(5, introDuration) * 1000);
        inputIdx++;
        console.log(`[TTS] Intro SFX: "${introSFXList[i].prompt}" ${introDuration.toFixed(1)}s (one-shot, narration at ${Math.max(5, introDuration).toFixed(1)}s)`);
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
        filterParts.push(`[${inputIdx}:a]acompressor=threshold=-20dB:ratio=4:makeup=4dB,volume=__OUTRO_VOL__,adelay=${outroStart}|${outroStart},afade=t=out:st=3:d=2[outro${inputIdx}]`);
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
        // Shift inline SFX delays (they should play relative to narration start, not absolute start)
        if (filterParts[i].includes('[inl')) {
          filterParts[i] = filterParts[i].replace(/adelay=(\d+)\|(\d+)/, (_, d1, d2) => {
            return `adelay=${parseInt(d1) + introDelayMs}|${parseInt(d2) + introDelayMs}`;
          });
        }
        // Shift outro delays
        if (filterParts[i].includes('[outro')) {
          filterParts[i] = filterParts[i].replace(/adelay=(\d+)\|(\d+)/, (_, d1, d2) => {
            return `adelay=${parseInt(d1) + introDelayMs}|${parseInt(d2) + introDelayMs}`;
          });
        }
        // Shift background SFX to start after intro ends
        if (filterParts[i].includes('[bg')) {
          // Add adelay to bg filter — insert before acompressor
          filterParts[i] = filterParts[i].replace(
            /acompressor/,
            `adelay=${introDelayMs}|${introDelayMs},acompressor`,
          );
        }
      }
    }

    // With normalize=0, amix sums inputs directly (no division by N)
    // So volume values are direct: 1.0 = full, 0.5 = half, etc.
    const totalInputs = inputIdx;
    // Background: 40% of narration volume — ambient bed
    const bgVol = '0.40';
    // Inline SFX: 50% — present but doesn't overpower narration
    const inlVol = '0.50';
    // Intro/Outro: 60% — noticeable transition, plays alone or under quiet narration
    const introOutroVol = '0.60';
    for (let i = 0; i < filterParts.length; i++) {
      filterParts[i] = filterParts[i]
        .replace(/__BG_VOL__/g, bgVol)
        .replace(/__INL_VOL__/g, inlVol)
        .replace(/__INTRO_VOL__/g, introOutroVol)
        .replace(/__OUTRO_VOL__/g, introOutroVol);
    }
    // Narration at full volume (1.0)
    if (introDelayMs > 0) {
      filterParts.unshift(`[0:a]volume=1.0,adelay=${introDelayMs}|${introDelayMs}[narr]`);
    } else {
      filterParts.unshift(`[0:a]volume=1.0[narr]`);
    }
    const allMixInputs = `[narr]${mixLabels.join('')}`;
    // duration=first: runs until the first input (narration) ends
    // Since narration is adelay'd by introDelayMs, intro plays during that leading silence
    // Background aloop is infinite so we MUST use duration=first, not longest
    // normalize=0 prevents amix from redistributing volume when tracks end (causes distortion)
    // dropout_transition=0 prevents volume ramping when inputs drop out  
    // duration=first: narration (first input) determines total length
    // Narration includes introDelayMs of leading silence, so intro SFX plays during that gap
    filterParts.push(`${allMixInputs}amix=inputs=${totalInputs}:duration=first:dropout_transition=0:normalize=0[out]`);

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
