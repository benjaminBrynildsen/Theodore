// ========== Scene Emotional Metadata + Music Types ==========

// ---- Emotion System ----

export type EmotionCategory =
  | 'joy' | 'sorrow' | 'tension' | 'dread' | 'wonder'
  | 'anger' | 'longing' | 'triumph' | 'serenity' | 'chaos'
  | 'intimacy' | 'isolation' | 'reverence' | 'defiance';

export type MusicGenre =
  | 'orchestral' | 'ambient' | 'electronic' | 'folk'
  | 'cinematic' | 'jazz' | 'piano-solo' | 'choral'
  | 'world' | 'rock' | 'minimal';

export type Tempo = 'adagio' | 'andante' | 'moderato' | 'allegro' | 'presto';

export interface EmotionalArc {
  start: EmotionCategory;
  end: EmotionCategory;
  pivot?: {
    emotion: EmotionCategory;
    trigger: string; // what causes the shift ("the letter arrives")
    position: number; // 0-100 (percentage through the scene)
  };
}

export interface SceneEmotionalMetadata {
  // Core mood
  primaryEmotion: EmotionCategory;
  secondaryEmotion?: EmotionCategory;
  intensity: number; // 0-100

  // Emotional arc within the scene
  arc: EmotionalArc;

  // Descriptive tags (freeform, AI-generated)
  moodTags: string[]; // e.g. ["claustrophobic", "rain-soaked", "breathless"]

  // Music hints
  tempo: Tempo;
  suggestedGenre: MusicGenre;
  musicPrompt?: string; // AI-generated Suno prompt ready to fire

  // Transition from previous scene
  transitionSmoothness?: number; // 0-100 — how jarring is the shift from the previous scene

  // Analysis metadata
  analyzedAt?: string;
  proseHash?: string; // hash of prose at analysis time — detect staleness
  confidence: number; // 0-100

  // User overrides (merged on top of AI-generated values)
  userOverrides?: Partial<Pick<SceneEmotionalMetadata,
    'primaryEmotion' | 'secondaryEmotion' | 'intensity' | 'arc' |
    'moodTags' | 'tempo' | 'suggestedGenre' | 'musicPrompt'
  >>;
}

// ---- Suno / Music ----

export type TrackStatus = 'generating' | 'ready' | 'failed';

export interface SunoTrack {
  id: string;
  sceneId: string;
  sunoJobId?: string;
  audioUrl: string;
  title: string;
  prompt: string;
  genre: string;
  durationSeconds: number;
  generatedAt: string;
  status: TrackStatus;
}

export interface SceneMusicMapping {
  sceneId: string;
  activeTrackId: string | null;
  tracks: SunoTrack[]; // version history, max 5
}

// ---- Emotion Palette (for X-Ray rendering) ----

export const EMOTION_COLORS: Record<EmotionCategory, string> = {
  joy: '#FFD700',
  sorrow: '#4A6FA5',
  tension: '#D4380D',
  dread: '#1A1A2E',
  wonder: '#7B68EE',
  anger: '#CC0000',
  longing: '#B07BAC',
  triumph: '#FFB020',
  serenity: '#7EC8E3',
  chaos: '#FF4500',
  intimacy: '#E88D9D',
  isolation: '#708090',
  reverence: '#DAA520',
  defiance: '#DC3545',
};

export const TEMPO_BPM: Record<Tempo, { min: number; max: number; label: string }> = {
  adagio: { min: 55, max: 75, label: 'Slow & solemn' },
  andante: { min: 76, max: 100, label: 'Walking pace' },
  moderato: { min: 101, max: 120, label: 'Moderate' },
  allegro: { min: 121, max: 150, label: 'Fast & lively' },
  presto: { min: 151, max: 180, label: 'Very fast & intense' },
};
