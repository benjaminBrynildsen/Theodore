import { create } from 'zustand';
import { generateId } from '../lib/utils';
import type { AnyCanonEntry, CanonType, CharacterEntry, LocationEntry, SystemEntry, ArtifactEntry, RuleEntry, EventEntry } from '../types/canon';

interface CanonState {
  entries: AnyCanonEntry[];
  activeEntryId: string | null;
  editingEntryId: string | null;

  addEntry: (entry: AnyCanonEntry) => void;
  updateEntry: (id: string, updates: Partial<AnyCanonEntry>) => void;
  deleteEntry: (id: string) => void;
  setActiveEntry: (id: string | null) => void;
  setEditingEntry: (id: string | null) => void;
  getProjectEntries: (projectId: string) => AnyCanonEntry[];
  getEntriesByType: (projectId: string, type: CanonType) => AnyCanonEntry[];
  getEntry: (id: string) => AnyCanonEntry | undefined;
  
  // Factory methods for creating blank entries
  createCharacter: (projectId: string, name: string) => CharacterEntry;
  createLocation: (projectId: string, name: string) => LocationEntry;
  createSystem: (projectId: string, name: string) => SystemEntry;
  createArtifact: (projectId: string, name: string) => ArtifactEntry;
  createRule: (projectId: string, name: string) => RuleEntry;
  createEvent: (projectId: string, name: string) => EventEntry;
}

const now = () => new Date().toISOString();

export const useCanonStore = create<CanonState>((set, get) => ({
  entries: [],
  activeEntryId: null,
  editingEntryId: null,

  addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  updateEntry: (id, updates) => set((s) => ({
    entries: s.entries.map((e) => e.id === id ? { ...e, ...updates, updatedAt: now() } as AnyCanonEntry : e),
  })),
  deleteEntry: (id) => set((s) => ({
    entries: s.entries.filter((e) => e.id !== id),
    activeEntryId: s.activeEntryId === id ? null : s.activeEntryId,
  })),
  setActiveEntry: (id) => set({ activeEntryId: id }),
  setEditingEntry: (id) => set({ editingEntryId: id }),
  getProjectEntries: (projectId) => get().entries.filter((e) => e.projectId === projectId),
  getEntriesByType: (projectId, type) => get().entries.filter((e) => e.projectId === projectId && e.type === type),
  getEntry: (id) => get().entries.find((e) => e.id === id),

  createCharacter: (projectId, name) => {
    const entry: CharacterEntry = {
      id: generateId(), projectId, type: 'character', name, description: '', tags: [], notes: '',
      version: 1, linkedCanonIds: [], createdAt: now(), updatedAt: now(),
      character: {
        fullName: name, aliases: [], age: '', gender: '', pronouns: '', species: 'Human',
        occupation: '', role: 'supporting',
        appearance: { physical: '', distinguishingFeatures: '', style: '' },
        personality: { traits: [], strengths: [], flaws: [], fears: [], desires: [], values: [], quirks: [], speechPattern: '', innerVoice: '' },
        background: { birthplace: '', upbringing: '', family: [], education: '', formativeEvents: [], secrets: [], trauma: '', proudestMoment: '' },
        relationships: [],
        arc: { startingState: '', internalConflict: '', externalConflict: '', wantVsNeed: { want: '', need: '' }, growthDirection: '', currentState: '', endingState: '' },
        storyState: { alive: true, currentLocation: '', knowledgeState: [], emotionalState: '', allegiance: '', lastSeenChapter: 0 },
      },
    };
    return entry;
  },

  createLocation: (projectId, name) => {
    const entry: LocationEntry = {
      id: generateId(), projectId, type: 'location', name, description: '', tags: [], notes: '',
      version: 1, linkedCanonIds: [], createdAt: now(), updatedAt: now(),
      location: {
        fullName: name, aliases: [], locationType: '',
        geography: { region: '', country: '', area: '', coordinates: '', climate: '', terrain: '', size: '' },
        history: { founded: '', founder: '', majorEvents: [], ownership: [], culturalSignificance: '', legends: '' },
        currentState: { condition: '', population: '', governance: '', economy: '', atmosphere: '',
          sensoryDetails: { sights: '', sounds: '', smells: '', textures: '' } },
        storyRelevance: { firstAppearance: 0, significance: '', secretsHidden: [], dangerLevel: '', accessRules: '', connectedLocations: [] },
      },
    };
    return entry;
  },

  createSystem: (projectId, name) => {
    const entry: SystemEntry = {
      id: generateId(), projectId, type: 'system', name, description: '', tags: [], notes: '',
      version: 1, linkedCanonIds: [], createdAt: now(), updatedAt: now(),
      system: {
        systemType: 'other',
        rules: { corePrinciples: [], limitations: [], costs: '', exceptions: [] },
        structure: { hierarchy: '', components: [], interactions: '', history: '', whoControls: '', whoIsAffected: '' },
        storyImpact: { conflictsCreated: [], powersEnabled: [], socialConsequences: '', vulnerabilities: [] },
      },
    };
    return entry;
  },

  createArtifact: (projectId, name) => {
    const entry: ArtifactEntry = {
      id: generateId(), projectId, type: 'artifact', name, description: '', tags: [], notes: '',
      version: 1, linkedCanonIds: [], createdAt: now(), updatedAt: now(),
      artifact: {
        artifactType: '',
        physical: { appearance: '', material: '', size: '', weight: '', condition: '', distinguishingMarks: '' },
        properties: { abilities: [], limitations: [], activationMethod: '', sideEffects: '', power: '' },
        history: { creator: '', creationDate: '', purpose: '', previousOwners: [], legends: '', currentLocation: '', currentOwner: '' },
        storyRelevance: { firstAppearance: 0, significance: '', whoSeeksIt: [], prophecy: '' },
      },
    };
    return entry;
  },

  createRule: (projectId, name) => {
    const entry: RuleEntry = {
      id: generateId(), projectId, type: 'rule', name, description: '', tags: [], notes: '',
      version: 1, linkedCanonIds: [], createdAt: now(), updatedAt: now(),
      rule: {
        ruleType: 'immutable', scope: '', statement: '', enforcement: '', consequences: '',
        exceptions: [], origin: '', knownBy: [], canBeBroken: false, hasBeenBroken: false,
        brokenBy: '', brokenConsequences: '',
      },
    };
    return entry;
  },

  createEvent: (projectId, name) => {
    const entry: EventEntry = {
      id: generateId(), projectId, type: 'event', name, description: '', tags: [], notes: '',
      version: 1, linkedCanonIds: [], createdAt: now(), updatedAt: now(),
      event: {
        eventType: 'historical', date: '', duration: '', location: '', summary: '', cause: '',
        consequences: [], participants: [], casualties: '', winners: '', losers: '',
        impact: { immediate: '', longTerm: '', culturalMemory: '', stillRelevant: true, triggeredEvents: [] },
        storyConnection: { chapterReferences: [], foreshadowed: false, revealedInChapter: 0, knownByCharacters: [] },
      },
    };
    return entry;
  },
}));
