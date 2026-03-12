// ========== Project Types ==========

export type ProjectType = 'book' | 'screenplay' | 'tv-series' | 'film' | 'musical' | 'documentary';
export type BookSubtype = 'novel' | 'short-stories' | 'childrens-book';

export type ProjectStatus = 'active' | 'archived' | 'completed';

export interface Project {
  id: string;
  title: string;
  type: ProjectType;
  subtype?: BookSubtype;
  targetLength: 'short' | 'medium' | 'long' | 'epic';
  toneBaseline: string;
  assistanceLevel: number; // 1-5, light to heavy
  ageRange?: string; // deprecated, use childrensBookSettings
  childrensBookSettings?: ChildrensBookSettings;
  narrativeControls: NarrativeControls;
  storyStructureId?: string; // one of the 9 story structures (see story-structures.ts)
  coverUrl?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

// ========== Narrative Controls ==========

export interface NarrativeControls {
  toneMood: {
    lightDark: number;      // 0-100
    hopefulGrim: number;
    whimsicalSerious: number;
  };
  pacing: 'slow' | 'balanced' | 'fast';
  dialogueWeight: 'sparse' | 'balanced' | 'heavy';
  focusMix: {
    character: number;  // 0-100
    plot: number;
    world: number;
  };
  genreEmphasis: GenreEmphasis[];
}

export type GenreEmphasis = 'adventure' | 'mystery' | 'romance' | 'horror' | 'philosophical';

// ========== Children's Book Settings ==========

export type AgeRange = '0-2' | '3-5' | '6-8' | '9-12';
export type IllustrationStyle = 'watercolor' | 'cartoon' | 'realistic' | 'collage' | 'pencil' | 'digital';

export interface CharacterVisual {
  name: string;
  description: string; // e.g. "A small brown rabbit with floppy ears, wearing a blue jacket"
}

export interface ChildrensBookSettings {
  ageRange: AgeRange;
  illustrationStyle: IllustrationStyle;
  wordsPerSpread: number; // target words per page spread
  spreadCount: number; // total spreads (replaces chapter count)
  hasRhyme: boolean;
  moralLesson?: string;
  // Style consistency fields
  styleGuide?: string; // e.g. "Soft watercolor with muted earth tones, whimsical forest setting"
  characterVisuals?: CharacterVisual[]; // visual descriptions for consistent character rendering
}

export const AGE_RANGE_LABELS: Record<AgeRange, string> = {
  '0-2': 'Board Book (0–2)',
  '3-5': 'Picture Book (3–5)',
  '6-8': 'Early Reader (6–8)',
  '9-12': 'Chapter Book (9–12)',
};

export const AGE_RANGE_DEFAULTS: Record<AgeRange, { wordsPerSpread: number; spreadCount: number }> = {
  '0-2': { wordsPerSpread: 10, spreadCount: 10 },
  '3-5': { wordsPerSpread: 40, spreadCount: 16 },
  '6-8': { wordsPerSpread: 80, spreadCount: 16 },
  '9-12': { wordsPerSpread: 200, spreadCount: 12 },
};

// ========== Scene Types ==========

export type SceneStatus = 'outline' | 'drafted' | 'edited';

export interface SceneSFX {
  id: string;
  prompt: string;         // e.g. "rain on a tin roof", "busy cafe ambiance"
  audioUrl?: string;       // cached URL after generation
  position: 'start' | 'end' | 'background'; // when to play relative to scene
  enabled: boolean;        // user can toggle off
  durationSeconds?: number;
}

export interface Scene {
  id: string;
  title: string;
  summary: string;
  prose: string;
  order: number;
  status: SceneStatus;
  emotionalMetadata?: import('./music').SceneEmotionalMetadata;
  sfx?: SceneSFX[];
}

export interface EditChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sceneId?: string;
  timestamp: string;
}

export interface ProseSelection {
  text: string;
  startOffset: number;
  endOffset: number;
  sceneName?: string;
}

// ========== Chapter Types ==========

export type ChapterStatus =
  | 'premise-only'
  | 'draft-generated'
  | 'human-edited'
  | 'canon-locked'
  | 'out-of-alignment';

export interface Chapter {
  id: string;
  projectId: string;
  number: number;
  title: string;
  timelinePosition: number;
  status: ChapterStatus;
  premise: PremiseCard;
  prose: string;
  referencedCanonIds: string[];
  aiIntentMetadata?: AiIntentMetadata;
  validationStatus: ValidationStatus;
  scenes?: Scene[];
  editChatHistory?: EditChatMessage[];
  imageUrl?: string;
  illustrationNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PremiseCard {
  purpose: string;
  changes: string;
  characters: string[];
  emotionalBeat: string;
  setupPayoff: { setup: string; payoff: string }[];
  constraints: string[];
}

export interface AiIntentMetadata {
  model: string;
  role: string;
  prompt: string;
  generatedAt: string;
}

// ========== Canon Types ==========

export type CanonType = 'character' | 'location' | 'system' | 'artifact' | 'rule' | 'event';

export interface CanonEntry {
  id: string;
  projectId: string;
  type: CanonType;
  name: string;
  description: string;
  properties: Record<string, any>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Character extends CanonEntry {
  type: 'character';
  properties: {
    traits: string[];
    voice: string;
    arcState: string;
    relationships: { characterId: string; relationship: string }[];
    knowledgeState: string[];
    alive: boolean;
  };
}

export interface Location extends CanonEntry {
  type: 'location';
  properties: {
    geography: string;
    rules: string[];
    access: string;
    ownership: string;
  };
}

// ========== Validation ==========

export interface ValidationStatus {
  isValid: boolean;
  checks: ValidationCheck[];
  lastValidated?: string;
}

export interface ValidationCheck {
  type: 'canon' | 'timeline' | 'rule' | 'obligation';
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
  overridden?: boolean;
}

// ========== Writing ==========

export type WritingMode = 'draft' | 'canon-safe' | 'exploration' | 'polish';

export type GenerationType = 
  | 'full-chapter' 
  | 'scene-outline' 
  | 'dialogue-first' 
  | 'action-skeleton';

// ========== AI Roles ==========

export type AiRole = 
  | 'architect' 
  | 'lorekeeper' 
  | 'continuity-judge' 
  | 'dialogue-pass' 
  | 'prose-polisher' 
  | 'red-team';

export interface AiAgent {
  role: AiRole;
  label: string;
  description: string;
  model: string;
  active: boolean;
}
