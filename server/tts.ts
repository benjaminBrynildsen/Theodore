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
  tone?: string; // delivery instructions (e.g. "whispering, tense")
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
  characterDescriptions?: Record<string, string>; // characterName → personality/speech description for voice acting
  narratorStyle?: string; // e.g. "dramatic audiobook narrator with a rich baritone"
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
    const tone = detectTone(prose, match.index, match[0].length);

    segments.push({
      type: 'dialogue',
      text: dialogueText,
      speaker: speaker || undefined,
      voice: 'alloy', // will be overridden by voice map
      tone,
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

// ========== Tone Detection ==========

interface ToneCue {
  keywords: string[];
  tone: string;
}

const TONE_CUES: ToneCue[] = [
  // Delivery verbs (from dialogue tags)
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

  // Adverb/adjective modifiers
  { keywords: ['angrily', 'furious', 'furiously', 'rage', 'raging'], tone: 'angry, intense, heated' },
  { keywords: ['sadly', 'sorrowful', 'mournful', 'grief'], tone: 'sad, heavy, mournful' },
  { keywords: ['softly', 'gently', 'tenderly'], tone: 'soft, gentle, tender' },
  { keywords: ['coldly', 'icily', 'flatly'], tone: 'cold, detached, emotionless' },
  { keywords: ['excitedly', 'eagerly', 'breathlessly'], tone: 'excited, energetic, breathless' },
  { keywords: ['nervously', 'anxiously', 'fearfully'], tone: 'nervous, anxious, shaky' },
  { keywords: ['sarcastically', 'dryly', 'mockingly'], tone: 'sarcastic, dry, mocking' },
  { keywords: ['quietly', 'barely audible', 'under .* breath'], tone: 'very quiet, barely above a whisper' },

  // Context clues
  { keywords: ['tears streaming', 'eyes welling', 'voice breaking', 'voice cracked'], tone: 'emotional, voice cracking, holding back tears' },
  { keywords: ['through gritted teeth', 'jaw clenched', 'fists clenched'], tone: 'tense, restrained fury, speaking through clenched teeth' },
  { keywords: ['voice trembling', 'hands shaking', 'trembled'], tone: 'trembling, fearful, unsteady' },
];

/**
 * Detects delivery tone from the prose context surrounding a dialogue segment.
 * Looks at dialogue tags and narrative beats nearby.
 */
function detectTone(prose: string, matchStart: number, matchLength: number): string | undefined {
  const windowBefore = prose.slice(Math.max(0, matchStart - 150), matchStart).toLowerCase();
  const windowAfter = prose.slice(matchStart + matchLength, matchStart + matchLength + 150).toLowerCase();
  const context = windowBefore + ' ' + windowAfter;

  const matched: string[] = [];
  for (const cue of TONE_CUES) {
    for (const kw of cue.keywords) {
      if (kw.includes('.*') ? new RegExp(kw, 'i').test(context) : context.includes(kw)) {
        matched.push(cue.tone);
        break; // one keyword per cue is enough
      }
    }
  }

  if (matched.length === 0) return undefined;
  // Deduplicate and take the most specific (first 2 matches)
  const unique = [...new Set(matched)];
  return unique.slice(0, 2).join('; ');
}

/**
 * Detects a general narration tone from the text content itself.
 * Used for narration segments to set mood.
 */
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

async function callOpenAITTS(text: string, voice: OpenAIVoice, model: string, speed: number, instructions?: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const body: Record<string, any> = {
    model,
    input: text,
    voice,
    response_format: 'mp3',
    speed,
  };

  // gpt-4o-mini-tts supports the 'instructions' param for tone/emotion guidance
  if (instructions && model === 'gpt-4o-mini-tts') {
    body.instructions = instructions;
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
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
  const charDescs = req.characterDescriptions || {};
  const narratorStyle = req.narratorStyle || 'Professional audiobook narrator. Read with natural pacing, clear enunciation, and appropriate emotional weight for the scene.';

  /**
   * Build instructions string for a TTS segment.
   * Combines: base role, character personality, and detected tone.
   */
  function buildInstructions(seg: TTSSegment): string {
    const parts: string[] = [];

    if (seg.type === 'narration') {
      parts.push(narratorStyle);
    } else if (seg.type === 'dialogue' && seg.speaker) {
      const charDesc = charDescs[seg.speaker];
      if (charDesc) {
        parts.push(`Voice acting as ${seg.speaker}. ${charDesc}`);
      } else {
        parts.push(`Voice acting as ${seg.speaker}. Speak in character with distinct personality.`);
      }
    } else {
      parts.push(narratorStyle);
    }

    if (seg.tone) {
      parts.push(`Delivery: ${seg.tone}.`);
    }

    return parts.join(' ');
  }

  let audioBuffers: Buffer[];

  if (req.multiVoice && req.knownCharacters && req.knownCharacters.length > 0) {
    // Parse dialogue and route to character voices
    let segments = parseDialogue(req.prose, req.knownCharacters);
    segments = applyVoiceMap(segments, voiceMap);

    // Log voice routing for debugging
    const dialogueSegs = segments.filter(s => s.type === 'dialogue');
    const uniqueVoices = [...new Set(segments.map(s => s.voice))];
    console.log(`[TTS] Multi-voice: ${segments.length} segments, ${dialogueSegs.length} dialogue, voices: ${uniqueVoices.join(', ')}`);
    for (const seg of dialogueSegs.slice(0, 5)) {
      console.log(`  [TTS] "${seg.text.slice(0, 50)}..." → speaker: ${seg.speaker || 'unknown'}, voice: ${seg.voice}, tone: ${seg.tone || 'neutral'}`);
    }

    // Merge consecutive segments with the same voice (preserve tone from first segment)
    const merged = mergeConsecutiveSegments(segments);

    // Generate audio for each segment with instructions
    audioBuffers = [];
    for (const seg of merged) {
      if (!seg.text.trim()) continue;
      const instructions = buildInstructions(seg);
      const buf = await callOpenAITTS(seg.text, seg.voice, model, speed, instructions);
      audioBuffers.push(buf);
    }
  } else {
    // Single voice — narrator reads everything with narrator style
    const buf = await callOpenAITTS(req.prose, voiceMap.narrator, model, speed, narratorStyle);
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

    // Only merge if same voice AND same tone (different tones need different instructions)
    if (prev.voice === curr.voice && prev.tone === curr.tone) {
      prev.text = prev.text + ' ' + curr.text;
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}
