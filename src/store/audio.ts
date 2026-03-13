import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ElevenLabsVoice, ChapterAudio, AudioVersion, ElevenLabsModel } from '../lib/tts-types';
import { DEFAULT_NARRATOR_VOICE } from '../lib/tts-types';

// Legacy alias
type OpenAIVoice = ElevenLabsVoice;

interface AudioState {
  // Playback
  playing: boolean;
  currentChapterId: string | null;
  currentTime: number;
  duration: number;
  volume: number;

  // Mini player visibility
  miniPlayerVisible: boolean;
  sidebarPlayerVisible: boolean;

  // Generated audio cache (with version history)
  chapterAudio: Record<string, ChapterAudio>;

  // Voice config
  narratorVoice: ElevenLabsVoice;
  characterVoices: Record<string, ElevenLabsVoice>;
  multiVoice: boolean;
  ttsModel: ElevenLabsModel;
  speed: number;

  // Generation
  generating: string | null;
  error: string | null;

  // Actions
  setPlaying: (playing: boolean) => void;
  setCurrentChapter: (id: string | null) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  setMiniPlayerVisible: (visible: boolean) => void;
  setSidebarPlayerVisible: (visible: boolean) => void;
  addChapterAudio: (chapterId: string, audio: Omit<ChapterAudio, 'activeVersion' | 'versions'>) => void;
  removeChapterAudio: (chapterId: string) => void;
  removeAudioVersion: (chapterId: string, version: number) => void;
  setActiveVersion: (chapterId: string, version: number) => void;
  setNarratorVoice: (voice: ElevenLabsVoice) => void;
  setCharacterVoice: (name: string, voice: ElevenLabsVoice) => void;
  setMultiVoice: (enabled: boolean) => void;
  setTtsModel: (model: ElevenLabsModel) => void;
  setSpeed: (speed: number) => void;
  setGenerating: (id: string | null) => void;
  setError: (error: string | null) => void;
}

/** Migrate old ChapterAudio entries that lack version fields */
function ensureVersioned(audio: ChapterAudio): ChapterAudio {
  if (audio.versions && audio.versions.length > 0) return audio;
  const v1: AudioVersion = {
    version: 1,
    audioUrl: audio.audioUrl,
    sceneAudioUrls: audio.sceneAudioUrls,
    durationEstimate: audio.durationEstimate,
    generatedAt: audio.generatedAt,
  };
  return { ...audio, activeVersion: 1, versions: [v1] };
}

/** Migrate old OpenAI voice IDs to ElevenLabs — returns input if already an ElevenLabs ID */
function migrateVoiceId(voice: string): ElevenLabsVoice {
  const MIGRATION_MAP: Record<string, string> = {
    alloy: 'XrExE9yKIg1WjnnlVkGX',    // Matilda
    ash: 'iP95p4xoKVk53GoZ742B',       // Chris
    ballad: 'pFZP5JQG7iQjIQuC4Bku',    // Lily
    coral: 'EXAVITQu4vr4xnSDxMaL',     // Sarah
    echo: 'onwK4e9ZLuTAKqWW03F9',      // Daniel
    fable: 'JBFqnCBsd6RMkjVDRZzb',     // George
    nova: 'FGY2WhTYpPnrIDTdsKH5',      // Laura
    onyx: 'pNInz6obpgDQGcFmaJgB',      // Adam
    sage: 'onwK4e9ZLuTAKqWW03F9',      // Daniel
    shimmer: 'cgSgspJ2msm6clMCkdW9',   // Jessica
  };
  return MIGRATION_MAP[voice] || voice;
}

/** Migrate old model IDs */
function migrateModelId(model: string): ElevenLabsModel {
  const MODEL_MAP: Record<string, ElevenLabsModel> = {
    'gpt-4o-mini-tts': 'eleven_flash_v2_5',
    'tts-1': 'eleven_turbo_v2_5',
    'tts-1-hd': 'eleven_v3',
    'eleven_multilingual_v2': 'eleven_v3',
  };
  return MODEL_MAP[model] || (model as ElevenLabsModel);
}

export const useAudioStore = create<AudioState>()(persist((set, get) => ({
  playing: false,
  currentChapterId: null,
  currentTime: 0,
  duration: 0,
  volume: 1,
  miniPlayerVisible: false,
  sidebarPlayerVisible: false,
  chapterAudio: {},
  narratorVoice: DEFAULT_NARRATOR_VOICE,
  characterVoices: {},
  multiVoice: true,
  ttsModel: 'eleven_v3',
  speed: 1.0,
  generating: null,
  error: null,

  setPlaying: (playing) => set({ playing, miniPlayerVisible: playing ? true : get().miniPlayerVisible }),
  setCurrentChapter: (id) => set({ currentChapterId: id, currentTime: 0 }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setMiniPlayerVisible: (visible) => set({ miniPlayerVisible: visible }),
  setSidebarPlayerVisible: (visible) => set({ sidebarPlayerVisible: visible }),

  addChapterAudio: (chapterId, audio) =>
    set((s) => {
      const existing = s.chapterAudio[chapterId];
      const migrated = existing ? ensureVersioned(existing) : null;
      const prevVersions = migrated?.versions || [];
      const nextVersion = prevVersions.length + 1;

      const newVersion: AudioVersion = {
        version: nextVersion,
        audioUrl: audio.audioUrl,
        sceneAudioUrls: audio.sceneAudioUrls,
        sceneIds: audio.sceneIds,
        durationEstimate: audio.durationEstimate,
        generatedAt: audio.generatedAt,
        voiceConfig: {
          narratorVoice: s.narratorVoice,
          model: s.ttsModel,
          speed: s.speed,
        },
      };

      // Keep max 10 versions
      const allVersions = [...prevVersions, newVersion].slice(-10);

      const updated: ChapterAudio = {
        chapterId,
        audioUrl: audio.audioUrl,
        sceneAudioUrls: audio.sceneAudioUrls,
        sceneIds: audio.sceneIds,
        durationEstimate: audio.durationEstimate,
        generatedAt: audio.generatedAt,
        activeVersion: nextVersion,
        versions: allVersions,
      };

      return { chapterAudio: { ...s.chapterAudio, [chapterId]: updated } };
    }),

  removeChapterAudio: (chapterId) =>
    set((s) => {
      const { [chapterId]: _, ...rest } = s.chapterAudio;
      return { chapterAudio: rest };
    }),

  removeAudioVersion: (chapterId, version) =>
    set((s) => {
      const existing = s.chapterAudio[chapterId];
      if (!existing) return s;
      const migrated = ensureVersioned(existing);
      const filtered = migrated.versions.filter((v) => v.version !== version);
      if (filtered.length === 0) {
        const { [chapterId]: _, ...rest } = s.chapterAudio;
        return { chapterAudio: rest };
      }
      const active = filtered.find((v) => v.version === migrated.activeVersion) || filtered[filtered.length - 1];
      return {
        chapterAudio: {
          ...s.chapterAudio,
          [chapterId]: {
            chapterId,
            audioUrl: active.audioUrl,
            sceneAudioUrls: active.sceneAudioUrls,
            sceneIds: active.sceneIds,
            durationEstimate: active.durationEstimate,
            generatedAt: active.generatedAt,
            activeVersion: active.version,
            versions: filtered,
          },
        },
      };
    }),

  setActiveVersion: (chapterId, version) =>
    set((s) => {
      const existing = s.chapterAudio[chapterId];
      if (!existing) return s;
      const migrated = ensureVersioned(existing);
      const target = migrated.versions.find((v) => v.version === version);
      if (!target) return s;
      return {
        chapterAudio: {
          ...s.chapterAudio,
          [chapterId]: {
            ...migrated,
            audioUrl: target.audioUrl,
            sceneAudioUrls: target.sceneAudioUrls,
            sceneIds: target.sceneIds,
            durationEstimate: target.durationEstimate,
            generatedAt: target.generatedAt,
            activeVersion: version,
          },
        },
      };
    }),

  setNarratorVoice: (voice) => set({ narratorVoice: voice }),
  setCharacterVoice: (name, voice) =>
    set((s) => ({ characterVoices: { ...s.characterVoices, [name]: voice } })),
  setMultiVoice: (enabled) => set({ multiVoice: enabled }),
  setTtsModel: (model) => set({ ttsModel: model }),
  setSpeed: (speed) => set({ speed }),
  setGenerating: (id) => set({ generating: id, miniPlayerVisible: id ? true : get().miniPlayerVisible }),
  setError: (error) => set({ error }),
}), {
  name: 'theodore-audio',
  partialize: (state) => ({
    chapterAudio: state.chapterAudio,
    narratorVoice: state.narratorVoice,
    characterVoices: state.characterVoices,
    multiVoice: state.multiVoice,
    ttsModel: state.ttsModel,
    speed: state.speed,
    volume: state.volume,
  }),
  // Migrate persisted state from OpenAI voices/models to ElevenLabs
  migrate: (persistedState: any, version: number) => {
    if (persistedState) {
      // Migrate narrator voice
      if (persistedState.narratorVoice) {
        persistedState.narratorVoice = migrateVoiceId(persistedState.narratorVoice);
      }
      // Migrate character voices
      if (persistedState.characterVoices) {
        const migrated: Record<string, string> = {};
        for (const [name, voice] of Object.entries(persistedState.characterVoices)) {
          migrated[name] = migrateVoiceId(voice as string);
        }
        persistedState.characterVoices = migrated;
      }
      // Migrate TTS model
      if (persistedState.ttsModel) {
        persistedState.ttsModel = migrateModelId(persistedState.ttsModel);
      }
    }
    return persistedState;
  },
  version: 2,
}));
