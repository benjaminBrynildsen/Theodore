import { create } from 'zustand';
import type { OpenAIVoice, ChapterAudio } from '../lib/tts-types';

interface AudioState {
  // Playback
  playing: boolean;
  currentChapterId: string | null;
  currentTime: number;
  duration: number;

  // Generated audio cache
  chapterAudio: Record<string, ChapterAudio>;

  // Voice config
  narratorVoice: OpenAIVoice;
  characterVoices: Record<string, OpenAIVoice>; // characterName → voice
  multiVoice: boolean;
  ttsModel: 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts';
  speed: number;

  // Generation
  generating: string | null; // chapterId being generated
  error: string | null;

  // Actions
  setPlaying: (playing: boolean) => void;
  setCurrentChapter: (id: string | null) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  addChapterAudio: (chapterId: string, audio: ChapterAudio) => void;
  removeChapterAudio: (chapterId: string) => void;
  setNarratorVoice: (voice: OpenAIVoice) => void;
  setCharacterVoice: (name: string, voice: OpenAIVoice) => void;
  setMultiVoice: (enabled: boolean) => void;
  setTtsModel: (model: 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts') => void;
  setSpeed: (speed: number) => void;
  setGenerating: (id: string | null) => void;
  setError: (error: string | null) => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  playing: false,
  currentChapterId: null,
  currentTime: 0,
  duration: 0,
  chapterAudio: {},
  narratorVoice: 'alloy',
  characterVoices: {},
  multiVoice: true,
  ttsModel: 'gpt-4o-mini-tts',
  speed: 1.0,
  generating: null,
  error: null,

  setPlaying: (playing) => set({ playing }),
  setCurrentChapter: (id) => set({ currentChapterId: id, currentTime: 0 }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  addChapterAudio: (chapterId, audio) =>
    set((s) => ({ chapterAudio: { ...s.chapterAudio, [chapterId]: audio } })),
  removeChapterAudio: (chapterId) =>
    set((s) => {
      const { [chapterId]: _, ...rest } = s.chapterAudio;
      return { chapterAudio: rest };
    }),
  setNarratorVoice: (voice) => set({ narratorVoice: voice }),
  setCharacterVoice: (name, voice) =>
    set((s) => ({ characterVoices: { ...s.characterVoices, [name]: voice } })),
  setMultiVoice: (enabled) => set({ multiVoice: enabled }),
  setTtsModel: (model) => set({ ttsModel: model }),
  setSpeed: (speed) => set({ speed }),
  setGenerating: (id) => set({ generating: id }),
  setError: (error) => set({ error }),
}));
