import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { generateId } from '../lib/utils';
import { api } from '../lib/api';
import type { AnyCanonEntry, CanonType, CharacterEntry, LocationEntry, SystemEntry, ArtifactEntry, RuleEntry, EventEntry } from '../types/canon';

// Debounce helper
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};
function debounceSave(key: string, fn: () => Promise<void>, ms = 500) {
  if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
  debounceTimers[key] = setTimeout(() => { fn().catch(console.error); }, ms);
}

// Map DB canon entry (flat data JSONB) to frontend canon entry (typed sub-objects)
function fromDb(row: any): AnyCanonEntry {
  const base = {
    id: row.id,
    projectId: row.projectId || row.project_id,
    type: row.type as CanonType,
    name: row.name,
    description: row.description || '',
    imageUrl: row.imageUrl || row.image_url,
    tags: row.tags || [],
    notes: row.notes || '',
    version: row.version || 1,
    linkedCanonIds: row.linkedCanonIds || row.linked_canon_ids || [],
    createdAt: row.createdAt || row.created_at,
    updatedAt: row.updatedAt || row.updated_at,
  };
  const data = row.data || {};
  
  // Attach type-specific data
  switch (row.type) {
    case 'character':
      return { ...base, character: data } as CharacterEntry;
    case 'location':
      return { ...base, location: data } as LocationEntry;
    case 'system':
      return { ...base, system: data } as SystemEntry;
    case 'artifact':
      return { ...base, artifact: data } as ArtifactEntry;
    case 'rule':
      return { ...base, rule: data } as RuleEntry;
    case 'event':
      return { ...base, event: data } as EventEntry;
    default:
      return base as AnyCanonEntry;
  }
}

// Map frontend canon entry back to DB format
function toDb(entry: AnyCanonEntry): any {
  const { id, projectId, type, name, description, imageUrl, tags, notes, version, linkedCanonIds } = entry;
  let data: any = {};
  
  if ('character' in entry) data = (entry as CharacterEntry).character;
  else if ('location' in entry) data = (entry as LocationEntry).location;
  else if ('system' in entry) data = (entry as SystemEntry).system;
  else if ('artifact' in entry) data = (entry as ArtifactEntry).artifact;
  else if ('rule' in entry) data = (entry as RuleEntry).rule;
  else if ('event' in entry) data = (entry as EventEntry).event;

  return { id, projectId, type, name, description, imageUrl, tags, notes, version, linkedCanonIds, data };
}

interface CanonState {
  entries: AnyCanonEntry[];
  activeEntryId: string | null;
  editingEntryId: string | null;

  loadEntries: (projectId: string) => Promise<void>;
  addEntry: (entry: AnyCanonEntry) => void;
  updateEntry: (id: string, updates: Partial<AnyCanonEntry>) => void;
  deleteEntry: (id: string) => void;
  setActiveEntry: (id: string | null) => void;
  setEditingEntry: (id: string | null) => void;
  getProjectEntries: (projectId: string) => AnyCanonEntry[];
  getEntriesByType: (projectId: string, type: CanonType) => AnyCanonEntry[];
  getEntry: (id: string) => AnyCanonEntry | undefined;
  
  createCharacter: (projectId: string, name: string) => CharacterEntry;
  createLocation: (projectId: string, name: string) => LocationEntry;
  createSystem: (projectId: string, name: string) => SystemEntry;
  createArtifact: (projectId: string, name: string) => ArtifactEntry;
  createRule: (projectId: string, name: string) => RuleEntry;
  createEvent: (projectId: string, name: string) => EventEntry;
}

const now = () => new Date().toISOString();

export const useCanonStore = create<CanonState>()(persist((set, get) => ({
  entries: [],
  activeEntryId: null,
  editingEntryId: null,

  loadEntries: async (projectId: string) => {
    try {
      const rows = await api.listCanon(projectId);
      const mapped = rows.map(fromDb);
      const existingForProject = get().entries.filter(e => e.projectId === projectId);
      // Do not wipe optimistic/local canon entries when backend returns empty.
      if (mapped.length === 0 && existingForProject.length > 0) {
        return;
      }
      const otherEntries = get().entries.filter(e => e.projectId !== projectId);
      // If backend returns a partial set while writes are still landing, preserve local superset.
      if (existingForProject.length > 0 && mapped.length < existingForProject.length) {
        const byId = new Map(existingForProject.map((e) => [e.id, e] as const));
        for (const entry of mapped) {
          byId.set(entry.id, { ...byId.get(entry.id), ...entry } as AnyCanonEntry);
        }
        set({ entries: [...otherEntries, ...Array.from(byId.values())] });
        return;
      }
      // Replace project entries when backend has an equal/greater set.
      set({ entries: [...otherEntries, ...mapped] });
    } catch (e) {
      console.error('Failed to load canon:', e);
    }
  },

  addEntry: (entry) => {
    set((s) => ({ entries: [...s.entries, entry] }));
    api.createCanon(toDb(entry)).catch(e => console.error('Failed to save canon entry:', e));
  },

  updateEntry: (id, updates) => {
    set((s) => ({
      entries: s.entries.map((e) => e.id === id ? { ...e, ...updates, updatedAt: now() } as AnyCanonEntry : e),
    }));
    debounceSave(`canon-${id}`, async () => {
      const entry = get().entries.find(e => e.id === id);
      if (entry) {
        const dbData = toDb(entry);
        await api.updateCanon(id, dbData);
      }
    });
  },

  deleteEntry: (id) => {
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
      activeEntryId: s.activeEntryId === id ? null : s.activeEntryId,
    }));
    api.deleteCanon(id).catch(e => console.error('Failed to delete canon entry:', e));
  },

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
}), {
  name: 'theodore-canon-store',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    entries: state.entries,
    activeEntryId: state.activeEntryId,
    editingEntryId: state.editingEntryId,
  }),
}));
