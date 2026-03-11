// Shared TTS types for frontend

export type OpenAIVoice = 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo' | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer';

export interface VoiceInfo {
  id: OpenAIVoice;
  name: string;
  desc: string;
  gender: string;
  tone: string;
}

export const OPENAI_VOICES: VoiceInfo[] = [
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

export interface ChapterAudio {
  chapterId: string;
  audioUrl: string;
  durationEstimate: number;
  generatedAt: string;
}
