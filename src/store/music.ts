// ========== Music Store ==========
// Manages scene music tracks (Suno-generated) and emotional analysis state

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SceneMusicMapping, SunoTrack } from '../types/music';
import type { SceneEmotionalMetadata } from '../types/music';

interface MusicState {
  // Music tracks per scene
  sceneTracks: Record<string, SceneMusicMapping>;

  // Music playback
  musicPlaying: boolean;
  currentMusicSceneId: string | null;
  musicVolume: number; // 0-1, typically ducked to 0.15-0.3 behind TTS

  // Generation
  generating: string | null; // sceneId being generated
  analyzing: string | null; // sceneId being analyzed

  // UI
  showXRay: boolean;

  // Actions — music tracks
  addTrack: (sceneId: string, track: SunoTrack) => void;
  setActiveTrack: (sceneId: string, trackId: string) => void;
  removeTrack: (sceneId: string, trackId: string) => void;
  getSceneTracks: (sceneId: string) => SceneMusicMapping | null;

  // Actions — playback
  setMusicPlaying: (playing: boolean) => void;
  setCurrentMusicScene: (sceneId: string | null) => void;
  setMusicVolume: (volume: number) => void;

  // Actions — generation
  setGenerating: (sceneId: string | null) => void;
  setAnalyzing: (sceneId: string | null) => void;

  // Actions — UI
  setShowXRay: (show: boolean) => void;
}

export const useMusicStore = create<MusicState>()(persist((set, get) => ({
  sceneTracks: {},
  musicPlaying: false,
  currentMusicSceneId: null,
  musicVolume: 0.2,
  generating: null,
  analyzing: null,
  showXRay: false,

  addTrack: (sceneId, track) => set((s) => {
    const existing = s.sceneTracks[sceneId] || { sceneId, activeTrackId: null, tracks: [] };
    const tracks = [...existing.tracks, track].slice(-5); // keep max 5 versions
    return {
      sceneTracks: {
        ...s.sceneTracks,
        [sceneId]: { sceneId, activeTrackId: track.id, tracks },
      },
    };
  }),

  setActiveTrack: (sceneId, trackId) => set((s) => {
    const existing = s.sceneTracks[sceneId];
    if (!existing) return s;
    return {
      sceneTracks: {
        ...s.sceneTracks,
        [sceneId]: { ...existing, activeTrackId: trackId },
      },
    };
  }),

  removeTrack: (sceneId, trackId) => set((s) => {
    const existing = s.sceneTracks[sceneId];
    if (!existing) return s;
    const tracks = existing.tracks.filter(t => t.id !== trackId);
    if (tracks.length === 0) {
      const { [sceneId]: _, ...rest } = s.sceneTracks;
      return { sceneTracks: rest };
    }
    const activeTrackId = existing.activeTrackId === trackId
      ? tracks[tracks.length - 1].id
      : existing.activeTrackId;
    return {
      sceneTracks: {
        ...s.sceneTracks,
        [sceneId]: { sceneId, activeTrackId, tracks },
      },
    };
  }),

  getSceneTracks: (sceneId) => get().sceneTracks[sceneId] || null,

  setMusicPlaying: (playing) => set({ musicPlaying: playing }),
  setCurrentMusicScene: (sceneId) => set({ currentMusicSceneId: sceneId }),
  setMusicVolume: (volume) => set({ musicVolume: volume }),
  setGenerating: (sceneId) => set({ generating: sceneId }),
  setAnalyzing: (sceneId) => set({ analyzing: sceneId }),
  setShowXRay: (show) => set({ showXRay: show }),
}), {
  name: 'theodore-music',
  partialize: (state) => ({
    sceneTracks: state.sceneTracks,
    musicVolume: state.musicVolume,
    showXRay: state.showXRay,
  }),
}));
