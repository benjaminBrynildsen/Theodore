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
  ageRange?: string; // children's books only
  narrativeControls: NarrativeControls;
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

// ========== Scene Types ==========

export type SceneStatus = 'outline' | 'drafted' | 'edited';

export interface Scene {
  id: string;
  title: string;
  summary: string;
  prose: string;
  order: number;
  status: SceneStatus;
}

export interface EditChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sceneId?: string;
  timestamp: string;
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
