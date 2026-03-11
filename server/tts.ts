// ========== Text-to-Speech Service — OpenAI TTS ==========
// Multi-voice audiobook generation with dialogue parsing and character voice routing

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ========== Types ==========

export type OpenAIVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer';

export interface TTSSegment {
  type: 'narration' | 'dialogue';
  text: string;
  speaker?: string; // character name for dialogue
  voice: OpenAIVoice;
}

export interface VoiceMap {
  narrator: OpenAIVoice;
  characters: Record<string, OpenAIVoice>; // characterName → voice
}

export interface TTSRequest {
  chapterId: string;
  prose: string;
  voiceMap: VoiceMap;
  model?: 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts';
  speed?: number; // 0.25 – 4.0
  multiVoice?: boolean; // if false, use narrator for everything
}

export interface TTSResult {
  audioUrl: string;
  durationEstimate: number; // seconds
  segments: number;
  creditsUsed: number;
}

// ========== Constants ==========

const AUDIO_DIR = path.join(process.cwd(), 'uploads', 'audio');
// ~150 words per minute at normal speed, ~2.5 chars per word average
const CHARS_PER_SECOND = 14;
// Credits: 2 per chapter (TTS is cheaper than generation)
const CREDITS_PER_CHAPTER = 2;

export const OPENAI_VOICES: { id: OpenAIVoice; name: string; desc: string; gender: string; tone: string }[] = [
  { id: 'alloy', name: 'Alloy', desc: 'Balanced & versatile narrator', gender: 'neutral', tone: 'balanced' },
  { id: 'ash', name: 'Ash', desc: 'Warm, conversational', gender: 'male', tone: 'warm' },
  { id: 'ballad', name: 'Ballad', desc: 'Soft & gentle', gender: 'neutral', tone: 'gentle' },
  { id: 'coral', name: 'Coral', desc: 'Warm & friendly', gender: 'female', tone: 'warm' },
  { id: 'echo', name: 'Echo', desc: 'Clear & neutral', gender: 'male', tone: 'neutral' },
  { id: 'fable', name: 'Fable', desc: 'Expressive storyteller', gender: 'neutral', tone: 'dramatic' },
  { id: 'nova', name: 'Nova', desc: 'Young & energetic', gender: 'female', tone: 'energetic' },
  { id: 'onyx', name: 'Onyx', desc: 'Deep & authoritative', gender: 'male', tone: 'deep' },
  { id: 'sage', name: 'Sage', desc: 'Wise & measured', gender: 'neutral', tone: 'calm' },
  { id: 'shimmer', name: 'Shimmer', desc: 'Bright & optimistic', gender: 'female', tone: 'bright' },
];

// ========== Dialogue Parser ==========

/**
 * Splits prose into narration and dialogue segments.
 * Identifies quoted speech and attempts to attribute speakers
 * by looking for "said Character" / "Character said" patterns nearby.
 */
export function parseDialogue(prose: string, knownCharacters: string[]): TTSSegment[] {
  const segments: TTSSegment[] = [];
  // Match quoted dialogue (both " and ")
  const dialogueRegex = /[\u201C"]((?:[^\u201D"\\]|\\.)*)[\u201D"]/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = dialogueRegex.exec(prose)) !== null) {
    // Add narration before this dialogue
    const before = prose.slice(lastIndex, match.index).trim();
    if (before) {
      segments.push({ type: 'narration', text: before, voice: 'alloy' });
    }

    const dialogueText = match[1];
    const speaker = attributeSpeaker(prose, match.index, match[0].length, knownCharacters);

    segments.push({
      type: 'dialogue',
      text: dialogueText,
      speaker: speaker || undefined,
      voice: 'alloy', // will be overridden by voice map
    });

    lastIndex = match.index + match[0].length;
  }

  // Remaining narration after last dialogue
  const remaining = prose.slice(lastIndex).trim();
  if (remaining) {
    segments.push({ type: 'narration', text: remaining, voice: 'alloy' });
  }

  // If no dialogue found, return whole prose as narration
  if (segments.length === 0) {
    segments.push({ type: 'narration', text: prose, voice: 'alloy' });
  }

  return segments;
}

/**
 * Look around the dialogue for speaker attribution patterns:
 * "...", said Character  |  Character said, "..."  |  "..." Character replied
 */
function attributeSpeaker(prose: string, matchStart: number, matchLength: number, characters: string[]): string | null {
  if (characters.length === 0) return null;

  // Look at text before and after the quote (100 chars each direction)
  const windowBefore = prose.slice(Math.max(0, matchStart - 120), matchStart);
  const windowAfter = prose.slice(matchStart + matchLength, matchStart + matchLength + 120);
  const window = windowBefore + ' ' + windowAfter;

  // Sort by name length descending to match "Mary Jane" before "Mary"
  const sorted = [...characters].sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    // Check for name in attribution context
    const nameParts = name.split(' ');
    const firstName = nameParts[0];

    // Common attribution patterns
    const patterns = [
      new RegExp(`${firstName}\\s+(said|asked|replied|whispered|shouted|murmured|exclaimed|muttered|called|yelled|hissed|sighed|growled|snapped|laughed|cried|screamed|demanded)`, 'i'),
      new RegExp(`(said|asked|replied|whispered|shouted|murmured|exclaimed|muttered|called|yelled|hissed|sighed|growled|snapped|laughed|cried|screamed|demanded)\\s+${firstName}`, 'i'),
      new RegExp(`${firstName}\\s*[',]`, 'i'), // "Character, ..." or "Character's"
    ];

    for (const pattern of patterns) {
      if (pattern.test(window)) {
        return name;
      }
    }
  }

  return null;
}

/**
 * Applies voice assignments to parsed segments.
 */
export function applyVoiceMap(segments: TTSSegment[], voiceMap: VoiceMap): TTSSegment[] {
  return segments.map(seg => {
    if (seg.type === 'narration') {
      return { ...seg, voice: voiceMap.narrator };
    }
    if (seg.type === 'dialogue' && seg.speaker) {
      // Look for character name match (case-insensitive, partial match)
      const speakerLower = seg.speaker.toLowerCase();
      for (const [charName, voice] of Object.entries(voiceMap.characters)) {
        if (speakerLower.includes(charName.toLowerCase()) || charName.toLowerCase().includes(speakerLower)) {
          return { ...seg, voice };
        }
      }
    }
    // Default dialogue to narrator if no character match
    return { ...seg, voice: voiceMap.narrator };
  });
}

// ========== OpenAI TTS API ==========

function ensureAudioDir() {
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

async function callOpenAITTS(text: string, voice: OpenAIVoice, model: string, speed: number): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      response_format: 'mp3',
      speed,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI TTS error ${response.status}: ${(err as any).error?.message || response.statusText}`);
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

  const model = req.model || 'gpt-4o-mini-tts';
  const speed = req.speed || 1.0;
  const voiceMap = req.voiceMap;

  let audioBuffers: Buffer[];

  if (req.multiVoice && req.knownCharacters && req.knownCharacters.length > 0) {
    // Parse dialogue and route to character voices
    let segments = parseDialogue(req.prose, req.knownCharacters);
    segments = applyVoiceMap(segments, voiceMap);

    // Merge consecutive segments with the same voice to reduce API calls
    const merged = mergeConsecutiveSegments(segments);

    // Generate audio for each segment
    audioBuffers = [];
    for (const seg of merged) {
      if (!seg.text.trim()) continue;
      const buf = await callOpenAITTS(seg.text, seg.voice, model, speed);
      audioBuffers.push(buf);
    }
  } else {
    // Single voice — narrator reads everything
    const buf = await callOpenAITTS(req.prose, voiceMap.narrator, model, speed);
    audioBuffers = [buf];
  }

  // Concatenate MP3 buffers (MP3 frames are self-contained, so simple concat works)
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
export async function generateVoicePreview(voice: OpenAIVoice, text?: string): Promise<Buffer> {
  const previewText = text || 'The morning light crept through the curtains, painting golden stripes across the wooden floor.';
  return callOpenAITTS(previewText, voice, 'gpt-4o-mini-tts', 1.0);
}

// ========== Helpers ==========

function mergeConsecutiveSegments(segments: TTSSegment[]): TTSSegment[] {
  if (segments.length === 0) return segments;

  const merged: TTSSegment[] = [{ ...segments[0] }];

  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];

    if (prev.voice === curr.voice) {
      // Merge: add a space between narration, or appropriate separator
      prev.text = prev.text + ' ' + curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
