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
  previewUrl?: string;
}

export const ELEVENLABS_VOICES: ElevenLabsVoiceInfo[] = [
  // Male
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Deep & authoritative', gender: 'male', tone: 'deep' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Warm & friendly', gender: 'male', tone: 'warm' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', desc: 'Crisp & commanding', gender: 'male', tone: 'energetic' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Calm & measured', gender: 'male', tone: 'calm' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Clear narrator', gender: 'male', tone: 'neutral' },
  // Female
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', desc: 'Warm & balanced', gender: 'female', tone: 'warm' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Confident & assertive', gender: 'female', tone: 'energetic' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Soft & gentle', gender: 'female', tone: 'gentle' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Warm storyteller', gender: 'female', tone: 'warm' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', desc: 'Pleasant & bright', gender: 'female', tone: 'bright' },
  // Versatile
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Rich storyteller', gender: 'neutral', tone: 'dramatic' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm & expressive', gender: 'neutral', tone: 'balanced' },
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
export async function getVoicesWithPreviews(): Promise<ElevenLabsVoiceInfo[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return ELEVENLABS_VOICES;

  // Use cache if fresh
  if (previewUrlCache && Date.now() - previewUrlFetchedAt < PREVIEW_CACHE_TTL) {
    return ELEVENLABS_VOICES.map(v => ({
      ...v,
      previewUrl: previewUrlCache![v.id] || undefined,
    }));
  }

  try {
    const response = await fetch(`${ELEVENLABS_API}/voices`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      console.warn('[TTS] Failed to fetch voice previews:', response.status);
      return ELEVENLABS_VOICES;
    }

    const data = await response.json() as any;
    const voices = data.voices || [];

    previewUrlCache = {};
    for (const voice of voices) {
      if (voice.voice_id && voice.preview_url) {
        previewUrlCache[voice.voice_id] = voice.preview_url;
      }
    }
    previewUrlFetchedAt = Date.now();

    console.log(`[TTS] Cached ${Object.keys(previewUrlCache).length} voice preview URLs`);

    return ELEVENLABS_VOICES.map(v => ({
      ...v,
      previewUrl: previewUrlCache![v.id] || undefined,
    }));
  } catch (err: any) {
    console.warn('[TTS] Error fetching voice previews:', err.message);
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

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = dialogueRegex.exec(prose)) !== null) {
    const before = prose.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ type: 'narration', text: before, voice: '' });
    }

    const dialogueText = match[1];
    const speaker = attributeSpeaker(prose, match.index, match[0].length, knownCharacters);
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
