// Shared TTS types for frontend — ElevenLabs voices

// Voice IDs are ElevenLabs alphanumeric strings (custom/cloned voices also supported)
export type ElevenLabsVoice = string;

// Legacy alias for gradual migration
export type OpenAIVoice = ElevenLabsVoice;

export interface VoiceInfo {
  id: ElevenLabsVoice;
  name: string;
  desc: string;
  gender: 'male' | 'female' | 'neutral';
  tone: string;
}

// Curated ElevenLabs pre-made voices for audiobook narration
export const ELEVENLABS_VOICES: VoiceInfo[] = [
  // ---- MALE ----
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Deep & authoritative', gender: 'male', tone: 'deep' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Warm & friendly', gender: 'male', tone: 'warm' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', desc: 'Crisp & commanding', gender: 'male', tone: 'energetic' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', desc: 'Calm & measured', gender: 'male', tone: 'calm' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Clear narrator', gender: 'male', tone: 'neutral' },

  // ---- FEMALE ----
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', desc: 'Warm & balanced', gender: 'female', tone: 'warm' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', desc: 'Confident & assertive', gender: 'female', tone: 'energetic' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', desc: 'Soft & gentle', gender: 'female', tone: 'gentle' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', desc: 'Warm storyteller', gender: 'female', tone: 'warm' },
  { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Dorothy', desc: 'Pleasant & bright', gender: 'female', tone: 'bright' },

  // ---- VERSATILE / NARRATOR ----
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', desc: 'Rich storyteller', gender: 'neutral', tone: 'dramatic' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm & expressive', gender: 'neutral', tone: 'balanced' },
];

// Legacy alias
export const OPENAI_VOICES = ELEVENLABS_VOICES;

// Default narrator voice (Matilda — warm storyteller)
export const DEFAULT_NARRATOR_VOICE = 'XrExE9yKIg1WjnnlVkGX';

// Default character fallbacks by gender
export const DEFAULT_MALE_VOICE = 'onwK4e9ZLuTAKqWW03F9'; // Daniel
export const DEFAULT_FEMALE_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel
export const DEFAULT_NEUTRAL_VOICE = 'JBFqnCBsd6RMkjVDRZzb'; // George

// ElevenLabs model options
export type ElevenLabsModel = 'eleven_multilingual_v2' | 'eleven_turbo_v2_5' | 'eleven_flash_v2_5';

// Helper to find voice info by ID
export function getVoiceInfo(voiceId: string): VoiceInfo | undefined {
  return ELEVENLABS_VOICES.find(v => v.id === voiceId);
}

// Helper to get voice display name
export function getVoiceName(voiceId: string): string {
  return getVoiceInfo(voiceId)?.name || voiceId.slice(0, 8);
}

export interface AudioVersion {
  version: number;
  audioUrl: string;
  sceneAudioUrls?: string[];
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
  durationEstimate: number;
  generatedAt: string;
  activeVersion: number;
  versions: AudioVersion[];
}
