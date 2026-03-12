// ========== Text-to-Speech Service — ElevenLabs TTS ==========
// Multi-voice audiobook generation with dialogue parsing and character voice routing

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ========== Types ==========

export type ElevenLabsVoice = string;
// Legacy alias
export type OpenAIVoice = ElevenLabsVoice;

export interface TTSSegment {
  type: 'narration' | 'dialogue';
  text: string;
  speaker?: string; // character name for dialogue
  voice: ElevenLabsVoice;
  tone?: string; // delivery instructions (e.g. "whispering, tense")
}

export interface VoiceMap {
  narrator: ElevenLabsVoice;
  characters: Record<string, ElevenLabsVoice>; // characterName → voice ID
}

export interface TTSRequest {
  chapterId: string;
  prose: string;
  voiceMap: VoiceMap;
  model?: 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5';
  speed?: number; // 0.5 – 2.0
  multiVoice?: boolean; // if false, use narrator for everything
  characterDescriptions?: Record<string, string>; // characterName → personality/speech description
  narratorStyle?: string; // e.g. "dramatic audiobook narrator"
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
    // Find the quote that follows this tag
    const afterTag = prose.slice(tagMatch.index + tagMatch[0].length);
    const quoteMatch = afterTag.match(/^[\u201C"]/);
    if (quoteMatch) {
      const quotePos = tagMatch.index + tagMatch[0].length;
      taggedSpeakers.set(quotePos, tagMatch[1].trim());
    }
  }

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = dialogueRegex.exec(prose)) !== null) {
    const before = prose.slice(lastIndex, match.index).trim();
    // Strip all [Name] tags from narration text (they're speaker markers, not spoken)
    const cleanBefore = before.replace(/\[([^\]]+)\]\s*/g, '').trim();
    if (cleanBefore) {
      segments.push({ type: 'narration', text: cleanBefore, voice: '' });
    }

    const dialogueText = match[1];
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

  const remaining = prose.slice(lastIndex).replace(/\[([^\]]+)\]\s*/g, '').trim();
  if (remaining) {
    segments.push({ type: 'narration', text: remaining, voice: '' });
  }

  if (segments.length === 0) {
    segments.push({ type: 'narration', text: prose, voice: '' });
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

// ========== Main Generation ==========

/**
 * Generate audiobook audio for a chapter.
 * If multiVoice is true, parses dialogue and uses character voices.
 * Otherwise generates the whole chapter with the narrator voice.
 */
export async function generateChapterAudio(req: TTSRequest & { knownCharacters?: string[] }): Promise<TTSResult> {
  ensureAudioDir();

  const model = req.model || 'eleven_multilingual_v2';
  const speed = req.speed || 1.0;
  const voiceMap = req.voiceMap;

  let audioBuffers: Buffer[];

  if (req.multiVoice && req.knownCharacters && req.knownCharacters.length > 0) {
    let segments = parseDialogue(req.prose, req.knownCharacters);
    segments = applyVoiceMap(segments, voiceMap);

    // Log voice routing for debugging
    const dialogueSegs = segments.filter(s => s.type === 'dialogue');
    const uniqueVoices = [...new Set(segments.map(s => s.voice))];
    const voiceNames = uniqueVoices.map(v => {
      const info = ELEVENLABS_VOICES.find(ev => ev.id === v);
      return info ? info.name : v.slice(0, 8);
    });
    console.log(`[TTS] Multi-voice: ${segments.length} segments, ${dialogueSegs.length} dialogue, voices: ${voiceNames.join(', ')}`);
    for (const seg of dialogueSegs.slice(0, 5)) {
      const voiceInfo = ELEVENLABS_VOICES.find(v => v.id === seg.voice);
      console.log(`  [TTS] "${seg.text.slice(0, 50)}..." → speaker: ${seg.speaker || 'unknown'}, voice: ${voiceInfo?.name || seg.voice.slice(0, 8)}, tone: ${seg.tone || 'neutral'}`);
    }

    // Merge consecutive segments with the same voice and tone
    const merged = mergeConsecutiveSegments(segments);

    audioBuffers = [];
    for (const seg of merged) {
      if (!seg.text.trim()) continue;
      const buf = await callElevenLabsTTS(seg.text, seg.voice, model, speed, seg.tone);
      audioBuffers.push(buf);
    }
  } else {
    const buf = await callElevenLabsTTS(req.prose, voiceMap.narrator, model, speed);
    audioBuffers = [buf];
  }

  // Concatenate MP3 buffers
  const combined = Buffer.concat(audioBuffers);

  // Save to file
  const hash = crypto.createHash('md5').update(req.chapterId + Date.now()).digest('hex').slice(0, 12);
  const filename = `ch-${hash}.mp3`;
  const filepath = path.join(AUDIO_DIR, filename);
  fs.writeFileSync(filepath, combined);

  const durationEstimate = Math.round(req.prose.length / CHARS_PER_SECOND / speed);

  return {
    audioUrl: `/uploads/audio/${filename}`,
    durationEstimate,
    segments: audioBuffers.length,
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

    if (prev.voice === curr.voice && prev.tone === curr.tone) {
      prev.text = prev.text + ' ' + curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
