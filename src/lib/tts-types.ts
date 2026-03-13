// Shared TTS types for frontend — ElevenLabs voices

// Voice IDs are ElevenLabs alphanumeric strings (custom/cloned voices also supported)
export type ElevenLabsVoice = string;

// Legacy alias for gradual migration
export type OpenAIVoice = ElevenLabsVoice;

export type AgeCategory = 'child' | 'teen' | 'young' | 'middle' | 'old';

export interface VoiceInfo {
  id: ElevenLabsVoice;
  name: string;
  desc: string;
  gender: 'male' | 'female' | 'neutral';
  age: AgeCategory;
  tone: string;
  // Rich metadata from ElevenLabs labels
  accent?: string;        // e.g. 'american', 'british', 'australian', 'indian'
  useCase?: string;       // e.g. 'narration', 'conversational', 'characters'
  descriptive?: string;   // personality trait e.g. 'classy', 'ground reporter', 'strong'
  description?: string;   // full voice description text
}

// Curated ElevenLabs pre-made voices for audiobook narration
// All IDs verified against the ElevenLabs /v1/voices API (2026-03-12)
export const ELEVENLABS_VOICES: VoiceInfo[] = [
  // ──── MALE ────

  // Young male
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Energetic & social', gender: 'male', age: 'young', tone: 'neutral', accent: 'american', useCase: 'narration', descriptive: 'energetic', description: 'Young American male, great for energetic and social characters' },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', desc: 'Fierce warrior', gender: 'male', age: 'young', tone: 'intense', accent: 'american', useCase: 'characters', descriptive: 'strong', description: 'Intense young voice ideal for fierce, warrior-type characters' },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', desc: 'Charming & down-to-earth', gender: 'male', age: 'young', tone: 'warm', accent: 'american', useCase: 'conversational', descriptive: 'casual', description: 'Casual and easygoing, perfect for approachable male leads' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Relaxed optimist', gender: 'male', age: 'young', tone: 'casual', accent: 'american', useCase: 'conversational', descriptive: 'friendly', description: 'Laid-back young voice with an optimistic warmth' },

  // Middle-aged male
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Dominant & firm', gender: 'male', age: 'middle', tone: 'deep', accent: 'american', useCase: 'narration', descriptive: 'deep', description: 'Deep authoritative voice, great for commanders and villains' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Steady broadcaster', gender: 'male', age: 'middle', tone: 'calm', accent: 'british', useCase: 'narration', descriptive: 'classy', description: 'British male with a calm, refined delivery. Great for scholars and diplomats' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', desc: 'Deep & comforting', gender: 'male', age: 'middle', tone: 'deep', accent: 'american', useCase: 'narration', descriptive: 'deep', description: 'Deep resonant voice ideal for narration and storytelling' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Wise & balanced', gender: 'male', age: 'middle', tone: 'authoritative', accent: 'american', useCase: 'narration', descriptive: 'strong', description: 'Authoritative and wise, suited for leaders, commanders, and elder figures' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Husky trickster', gender: 'male', age: 'middle', tone: 'raspy', accent: 'transatlantic', useCase: 'characters', descriptive: 'intense', description: 'Raspy, husky voice perfect for rogues, mercenaries, and tricksters' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', desc: 'Deep & confident', gender: 'male', age: 'middle', tone: 'casual', accent: 'australian', useCase: 'conversational', descriptive: 'casual', description: 'Australian male with a confident, casual tone' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Smooth & trustworthy', gender: 'male', age: 'middle', tone: 'smooth', accent: 'american', useCase: 'narration', descriptive: 'smooth', description: 'Smooth polished voice for nobles, aristocrats, and suave characters' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', desc: 'Laid-back & resonant', gender: 'male', age: 'middle', tone: 'casual', accent: 'american', useCase: 'conversational', descriptive: 'ground reporter', description: 'Relaxed resonant voice, good for travelers and folksy characters' },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', desc: 'Relaxed & informative', gender: 'male', age: 'middle', tone: 'neutral', accent: 'american', useCase: 'narration', descriptive: 'confident', description: 'Neutral, informative delivery perfect for matter-of-fact characters' },

  // ──── FEMALE ────

  // Young female
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Mature & reassuring', gender: 'female', age: 'young', tone: 'gentle', accent: 'american', useCase: 'narration', descriptive: 'soft', description: 'Soft and reassuring, suited for sensitive, poetic, or romantic characters' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', desc: 'Playful & bright', gender: 'female', age: 'young', tone: 'bright', accent: 'american', useCase: 'conversational', descriptive: 'expressive', description: 'Bright animated voice for cheerful, bubbly, and youthful characters' },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', desc: 'Professional & warm', gender: 'female', age: 'young', tone: 'warm', accent: 'american', useCase: 'narration', descriptive: 'pleasant', description: 'Warm professional voice for nurturing, elegant, and kind characters' },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', desc: 'Enthusiastic & quirky', gender: 'female', age: 'young', tone: 'energetic', accent: 'american', useCase: 'characters', descriptive: 'upbeat', description: 'Energetic spirited voice for adventurous, bold, and assertive characters' },

  // Middle-aged female
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Velvety actress', gender: 'female', age: 'middle', tone: 'warm', accent: 'british', useCase: 'narration', descriptive: 'warm', description: 'British female with a velvety, theatrical quality. Great for wise women and storytellers' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', desc: 'Clear & engaging', gender: 'female', age: 'middle', tone: 'authoritative', accent: 'british', useCase: 'narration', descriptive: 'confident', description: 'Confident British female for commanding, regal, and powerful characters' },

  // ──── VERSATILE / NARRATOR ────
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Knowledgeable & professional', gender: 'neutral', age: 'young', tone: 'dramatic', accent: 'american', useCase: 'narration', descriptive: 'warm', description: 'Professional and expressive, ideal for audiobook narration' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm & captivating storyteller', gender: 'neutral', age: 'middle', tone: 'balanced', accent: 'british', useCase: 'narration', descriptive: 'warm', description: 'Warm captivating British storyteller voice' },
];

// Legacy alias
export const OPENAI_VOICES = ELEVENLABS_VOICES;

// Default narrator voice (Matilda — warm storyteller)
export const DEFAULT_NARRATOR_VOICE = 'XrExE9yKIg1WjnnlVkGX';

// Default character fallbacks by gender
export const DEFAULT_MALE_VOICE = 'onwK4e9ZLuTAKqWW03F9'; // Daniel
export const DEFAULT_FEMALE_VOICE = 'EXAVITQu4vr4xnSDxMaL'; // Sarah
export const DEFAULT_NEUTRAL_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George

// ElevenLabs model options
export type ElevenLabsModel = 'eleven_v3' | 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5';

// Migration map: old OpenAI names + deprecated ElevenLabs IDs → valid voice IDs
const LEGACY_VOICE_MAP: Record<string, string> = {
  // OpenAI voice names
  alloy: 'XrExE9yKIg1WjnnlVkGX',     // → Matilda
  ash: 'iP95p4xoKVk53GoZ742B',        // → Chris
  ballad: 'pFZP5JQG7iQjIQuC4Bku',     // → Lily
  coral: 'EXAVITQu4vr4xnSDxMaL',      // → Sarah
  echo: 'onwK4e9ZLuTAKqWW03F9',       // → Daniel
  fable: 'JBFqnCBsd6RMkjVDRZzb',      // → George
  nova: 'FGY2WhTYpPnrIDTdsKH5',       // → Laura
  onyx: 'pNInz6obpgDQGcFmaJgB',       // → Adam
  sage: 'onwK4e9ZLuTAKqWW03F9',       // → Daniel
  shimmer: 'cgSgspJ2msm6clMCkdW9',    // → Jessica
  // Deprecated ElevenLabs voice IDs → nearest valid voice
  'ErXwobaYiN019PkySvjV': 'iP95p4xoKVk53GoZ742B',  // Antoni → Chris (warm young male)
  'TxGEqnHWrfWFTfGW9XjX': 'iP95p4xoKVk53GoZ742B',  // Josh → Chris (warm young male)
  'yoZ06aMxZJJ28mfd3POQ': 'N2lVS1w4EtoT3dr4eOWO',  // Sam → Callum (raspy)
  'CYw3kZ02Hs0563khs1Fj': 'bIHbv24MWmeRgasZH58o',  // Dave → Will (casual)
  'GBv7mTt0atIp3Br8iCZE': 'onwK4e9ZLuTAKqWW03F9',  // Thomas → Daniel (calm)
  'g5CIjZEefAph4nQFvHAz': 'SAz9YHcvj6GT2YYXdXww',  // Ethan → River (soft)
  'bVMeCyTHy58xNoL34h3p': 'TX3LPaxmHKxFdv7VOQHJ',  // Jeremy → Liam (energetic)
  'zcAOhNBS3c14rBihAFp1': 'cjVigY5qzO86Huf0OWal',  // Giovanni → Eric (smooth)
  'VR6AewLTigWG4xSOukaG': 'pNInz6obpgDQGcFmaJgB',  // Arnold → Adam (commanding)
  'ODq5zmih8GrVes37Dizd': 'SOYHLrjzK2X1ezoPC6cr',  // Patrick → Harry (fierce)
  '2EiwWnXFnvU5JabPnv8n': 'N2lVS1w4EtoT3dr4eOWO',  // Clyde → Callum (gruff)
  'Zlb1dXrM653N07WRdFW3': 'onwK4e9ZLuTAKqWW03F9',  // Joseph → Daniel (refined)
  '5Q0t7uMcjvnagumLfvZi': 'SAz9YHcvj6GT2YYXdXww',  // Paul → River (neutral)
  'D38z5RcWu1voky8WS1ja': 'nPczCjzI2devNBz1zQrb',  // Fin → Brian (deep)
  'ZQe5CZNOzWyzPSCn5a3c': 'pqHfZKP75CvOlQylNhV4',  // James → Bill (wise)
  'flq6f7yk4E4fJM5XTYuZ': 'JBFqnCBsd6RMkjVDRZzb',  // Michael → George (narrator)
  't0jbNlBVZ17f02VDIeMI': 'N2lVS1w4EtoT3dr4eOWO',  // Jessie → Callum (raspy)
  'jBpfuIE2acCO8z3wKNLl': 'cgSgspJ2msm6clMCkdW9',  // Gigi → Jessica (bright)
  'zrHiDhphv9ZnVXBqCLjz': 'cgSgspJ2msm6clMCkdW9',  // Mimi → Jessica (playful)
  '21m00Tcm4TlvDq8ikWAM': 'EXAVITQu4vr4xnSDxMaL',  // Rachel → Sarah
  'ThT5KcBeYPX3keUQqHPh': 'hpp4J3VqNfWAUOO0d1Us',  // Dorothy → Bella (warm)
  'AZnzlk1XvdvUeBnXmlld': 'FGY2WhTYpPnrIDTdsKH5',  // Domi → Laura (energetic)
  'LcfcDJNUP1GQjkzn1xUU': 'EXAVITQu4vr4xnSDxMaL',  // Emily → Sarah (gentle)
  'jsCqWAovK2LkecY7zXl4': 'FGY2WhTYpPnrIDTdsKH5',  // Freya → Laura (energetic)
  'oWAxZDx7w5VEj9dCyTzz': 'hpp4J3VqNfWAUOO0d1Us',  // Grace → Bella (warm)
  'piTKgcLEGmPE4e6mEKli': 'EXAVITQu4vr4xnSDxMaL',  // Nicole → Sarah (gentle)
  'XB0fDUnXU5powFXDhCwa': 'Xb7hH8MSUJpSbSDYk0k2',  // Charlotte → Alice (confident)
  'z9fAnlkpzviPz146aGWa': 'pFZP5JQG7iQjIQuC4Bku',  // Glinda → Lily (dramatic)
  'pMsXgVXv3BLzUgSXRplE': 'hpp4J3VqNfWAUOO0d1Us',  // Serena → Bella (warm)
};

// Resolve a voice ID, migrating legacy OpenAI names if needed
export function resolveVoiceId(voiceId: string): ElevenLabsVoice {
  return LEGACY_VOICE_MAP[voiceId] || voiceId;
}

// Helper to find voice info by ID
export function getVoiceInfo(voiceId: string): VoiceInfo | undefined {
  const resolved = resolveVoiceId(voiceId);
  return ELEVENLABS_VOICES.find(v => v.id === resolved);
}

// Helper to get voice display name
export function getVoiceName(voiceId: string): string {
  return getVoiceInfo(voiceId)?.name || voiceId.slice(0, 8);
}

export interface AudioVersion {
  version: number;
  audioUrl: string;
  sceneAudioUrls?: string[];
  sceneIds?: string[];
  durationEstimate: number;
  generatedAt: string;
  voiceConfig?: {
    narratorVoice: string;
    model: string;
    speed: number;
  };
}

export interface ChapterAudio {
  chapterId: string;
  audioUrl: string;
  sceneAudioUrls?: string[];
  sceneIds?: string[];          // scene IDs matching sceneAudioUrls for music lookup
  durationEstimate: number;
  generatedAt: string;
  activeVersion: number;
  versions: AudioVersion[];
}
