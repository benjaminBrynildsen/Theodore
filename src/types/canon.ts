// ========== Rich Canon Data Models ==========

export type CanonType = 'character' | 'location' | 'system' | 'artifact' | 'rule' | 'event';

export interface CanonBase {
  id: string;
  projectId: string;
  type: CanonType;
  name: string;
  description: string;
  imageUrl?: string;
  tags: string[];
  notes: string;
  version: number;
  linkedCanonIds: string[]; // cross-references
  createdAt: string;
  updatedAt: string;
}

// ========== CHARACTER ==========

export interface CharacterEntry extends CanonBase {
  type: 'character';
  character: {
    // Identity
    fullName: string;
    aliases: string[];
    age: string;
    gender: string;
    pronouns: string;
    species: string; // human, elf, AI, etc.
    occupation: string;
    role: 'protagonist' | 'antagonist' | 'supporting' | 'minor' | 'mentioned';
    
    // Appearance
    appearance: {
      physical: string;
      distinguishingFeatures: string;
      style: string; // clothing, aesthetic
    };

    // Personality
    personality: {
      traits: string[];
      strengths: string[];
      flaws: string[];
      fears: string[];
      desires: string[];
      values: string[];
      quirks: string[];
      speechPattern: string;
      innerVoice: string; // how they think
    };

    // Background
    background: {
      birthplace: string;
      upbringing: string;
      family: FamilyMember[];
      education: string;
      formativeEvents: FormativeEvent[];
      secrets: string[];
      trauma: string;
      proudestMoment: string;
    };

    // Relationships
    relationships: Relationship[];

    // Arc
    arc: {
      startingState: string;
      internalConflict: string;
      externalConflict: string;
      wantVsNeed: { want: string; need: string };
      growthDirection: string;
      currentState: string;
      endingState: string;
    };

    // Story State (changes as story progresses)
    storyState: {
      alive: boolean;
      currentLocation: string;
      knowledgeState: string[]; // what they know
      emotionalState: string;
      allegiance: string;
      lastSeenChapter: number;
    };
  };
}

export interface FamilyMember {
  name: string;
  relation: string; // mother, father, sister, mentor, etc.
  alive: boolean;
  description: string;
}

export interface FormativeEvent {
  age: string;
  event: string;
  impact: string; // how it shaped them
}

export interface Relationship {
  characterId: string;
  characterName: string;
  type: string; // friend, rival, lover, mentor, enemy, etc.
  dynamic: string; // description of the dynamic
  history: string;
  tension: string;
  currentState: string;
}

// ========== LOCATION ==========

export interface LocationEntry extends CanonBase {
  type: 'location';
  location: {
    // Geography
    geography: {
      region: string;
      country: string;
      area: string; // city, rural, wilderness, etc.
      coordinates: string; // fictional or real
      climate: string;
      terrain: string;
      size: string;
    };

    // Identity
    fullName: string;
    aliases: string[];
    locationType: string; // city, building, room, forest, planet, etc.
    
    // History
    history: {
      founded: string;
      founder: string;
      majorEvents: { year: string; event: string }[];
      ownership: OwnershipRecord[];
      culturalSignificance: string;
      legends: string;
    };

    // Current State
    currentState: {
      condition: string;
      population: string;
      governance: string;
      economy: string;
      atmosphere: string; // mood, feeling
      sensoryDetails: {
        sights: string;
        sounds: string;
        smells: string;
        textures: string;
      };
    };

    // Story Relevance
    storyRelevance: {
      firstAppearance: number; // chapter
      significance: string;
      secretsHidden: string[];
      dangerLevel: string;
      accessRules: string;
      connectedLocations: string[];
    };
  };
}

export interface OwnershipRecord {
  owner: string;
  period: string;
  howAcquired: string;
  howLost: string;
}

// ========== SYSTEM (magic, tech, politics, etc.) ==========

export interface SystemEntry extends CanonBase {
  type: 'system';
  system: {
    systemType: 'magic' | 'technology' | 'political' | 'economic' | 'religious' | 'social' | 'biological' | 'other';
    
    // Rules
    rules: {
      corePrinciples: string[];
      limitations: string[];
      costs: string; // what using it costs
      exceptions: string[];
    };

    // Structure
    structure: {
      hierarchy: string;
      components: string[];
      interactions: string; // how parts interact
      history: string;
      whoControls: string;
      whoIsAffected: string;
    };

    // Story Impact
    storyImpact: {
      conflictsCreated: string[];
      powersEnabled: string[];
      socialConsequences: string;
      vulnerabilities: string[];
    };
  };
}

// ========== ARTIFACT ==========

export interface ArtifactEntry extends CanonBase {
  type: 'artifact';
  artifact: {
    artifactType: string; // weapon, book, jewelry, vehicle, document, etc.
    
    // Physical
    physical: {
      appearance: string;
      material: string;
      size: string;
      weight: string;
      condition: string;
      distinguishingMarks: string;
    };

    // Properties
    properties: {
      abilities: string[];
      limitations: string[];
      activationMethod: string;
      sideEffects: string;
      power: string;
    };

    // History
    history: {
      creator: string;
      creationDate: string;
      purpose: string;
      previousOwners: { name: string; period: string; fate: string }[];
      legends: string;
      currentLocation: string;
      currentOwner: string;
    };

    // Story Relevance
    storyRelevance: {
      firstAppearance: number;
      significance: string;
      whoSeeksIt: string[];
      prophecy: string;
    };
  };
}

// ========== RULE ==========

export interface RuleEntry extends CanonBase {
  type: 'rule';
  rule: {
    ruleType: 'immutable' | 'bendable' | 'social' | 'physical' | 'magical';
    scope: string; // what it applies to
    statement: string; // the rule itself
    enforcement: string; // how it's enforced
    consequences: string; // what happens when broken
    exceptions: string[];
    origin: string; // where the rule comes from
    knownBy: string[]; // who knows about it
    canBeBroken: boolean;
    hasBeenBroken: boolean;
    brokenBy: string;
    brokenConsequences: string;
  };
}

// ========== MAJOR EVENT ==========

export interface EventEntry extends CanonBase {
  type: 'event';
  event: {
    eventType: 'historical' | 'political' | 'natural' | 'personal' | 'supernatural' | 'military';
    
    // When & Where
    date: string;
    duration: string;
    location: string;
    
    // What Happened
    summary: string;
    cause: string;
    consequences: string[];
    
    // Who Was Involved
    participants: { name: string; role: string }[];
    casualties: string;
    winners: string;
    losers: string;
    
    // Impact
    impact: {
      immediate: string;
      longTerm: string;
      culturalMemory: string; // how it's remembered
      stillRelevant: boolean;
      triggeredEvents: string[]; // chain reactions
    };

    // Story Connection
    storyConnection: {
      chapterReferences: number[];
      foreshadowed: boolean;
      revealedInChapter: number;
      knownByCharacters: string[];
    };
  };
}

export type AnyCanonEntry = CharacterEntry | LocationEntry | SystemEntry | ArtifactEntry | RuleEntry | EventEntry;
