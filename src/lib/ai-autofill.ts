// AI Auto-fill system for canon entries
// Currently uses mock data — will connect to real AI API later
// Every field is auto-generated but fully editable

import type { CharacterEntry, LocationEntry, SystemEntry, ArtifactEntry, RuleEntry, EventEntry } from '../types/canon';

// Simulates AI generating rich metadata from a name + description
// In production: sends context (all project data, premises, existing canon) to AI

export function autoFillCharacter(entry: CharacterEntry): CharacterEntry['character'] {
  const name = entry.name;
  const desc = entry.description;
  
  // This is where the AI call would go — for now, smart defaults based on what exists
  return {
    ...entry.character,
    fullName: entry.character.fullName || name,
    age: entry.character.age || 'Early 30s',
    gender: entry.character.gender || '',
    pronouns: entry.character.pronouns || '',
    species: entry.character.species || 'Human',
    occupation: entry.character.occupation || '',
    role: entry.character.role || 'supporting',
    aliases: entry.character.aliases.length ? entry.character.aliases : [],
    
    appearance: {
      physical: entry.character.appearance.physical || `[AI will describe ${name}'s physical appearance based on story context]`,
      distinguishingFeatures: entry.character.appearance.distinguishingFeatures || '',
      style: entry.character.appearance.style || '',
    },

    personality: {
      traits: entry.character.personality.traits.length ? entry.character.personality.traits : ['Determined', 'Guarded', 'Observant'],
      strengths: entry.character.personality.strengths.length ? entry.character.personality.strengths : ['Resilient', 'Analytical'],
      flaws: entry.character.personality.flaws.length ? entry.character.personality.flaws : ['Isolates when stressed', 'Struggles to trust'],
      fears: entry.character.personality.fears.length ? entry.character.personality.fears : ['Abandonment', 'Repeating past mistakes'],
      desires: entry.character.personality.desires.length ? entry.character.personality.desires : ['Connection', 'Understanding'],
      values: entry.character.personality.values.length ? entry.character.personality.values : ['Truth', 'Independence'],
      quirks: entry.character.personality.quirks.length ? entry.character.personality.quirks : [],
      speechPattern: entry.character.personality.speechPattern || `Tends to be precise with words. Uses metaphors from their background.`,
      innerVoice: entry.character.personality.innerVoice || `Self-critical but quietly hopeful. Often argues with themselves.`,
    },

    background: {
      birthplace: entry.character.background.birthplace || '',
      upbringing: entry.character.background.upbringing || `[AI will generate based on story context and character description]`,
      family: entry.character.background.family.length ? entry.character.background.family : [
        { name: '', relation: 'Mother', alive: true, description: '' },
        { name: '', relation: 'Father', alive: true, description: '' },
      ],
      education: entry.character.background.education || '',
      formativeEvents: entry.character.background.formativeEvents.length ? entry.character.background.formativeEvents : [
        { age: 'Childhood', event: 'A defining early experience', impact: 'Shaped their core worldview' },
      ],
      secrets: entry.character.background.secrets.length ? entry.character.background.secrets : [],
      trauma: entry.character.background.trauma || '',
      proudestMoment: entry.character.background.proudestMoment || '',
    },

    relationships: entry.character.relationships,

    arc: {
      startingState: entry.character.arc.startingState || `${name} begins the story...`,
      internalConflict: entry.character.arc.internalConflict || '',
      externalConflict: entry.character.arc.externalConflict || '',
      wantVsNeed: {
        want: entry.character.arc.wantVsNeed.want || '',
        need: entry.character.arc.wantVsNeed.need || '',
      },
      growthDirection: entry.character.arc.growthDirection || '',
      currentState: entry.character.arc.currentState || 'Beginning of story',
      endingState: entry.character.arc.endingState || '',
    },

    storyState: {
      ...entry.character.storyState,
      alive: true,
      emotionalState: entry.character.storyState.emotionalState || 'Guarded but curious',
    },
  };
}

export function autoFillLocation(entry: LocationEntry): LocationEntry['location'] {
  const name = entry.name;
  
  return {
    ...entry.location,
    fullName: entry.location.fullName || name,
    locationType: entry.location.locationType || '',
    aliases: entry.location.aliases.length ? entry.location.aliases : [],
    
    geography: {
      region: entry.location.geography.region || '',
      country: entry.location.geography.country || '',
      area: entry.location.geography.area || '',
      coordinates: entry.location.geography.coordinates || '',
      climate: entry.location.geography.climate || '',
      terrain: entry.location.geography.terrain || '',
      size: entry.location.geography.size || '',
    },

    history: {
      founded: entry.location.history.founded || '',
      founder: entry.location.history.founder || '',
      majorEvents: entry.location.history.majorEvents.length ? entry.location.history.majorEvents : [
        { year: '', event: `${name} was established` },
      ],
      ownership: entry.location.history.ownership.length ? entry.location.history.ownership : [],
      culturalSignificance: entry.location.history.culturalSignificance || `[AI will analyze ${name}'s role in the story]`,
      legends: entry.location.history.legends || '',
    },

    currentState: {
      condition: entry.location.currentState.condition || '',
      population: entry.location.currentState.population || '',
      governance: entry.location.currentState.governance || '',
      economy: entry.location.currentState.economy || '',
      atmosphere: entry.location.currentState.atmosphere || `[AI will describe the mood and feeling of ${name}]`,
      sensoryDetails: {
        sights: entry.location.currentState.sensoryDetails.sights || '',
        sounds: entry.location.currentState.sensoryDetails.sounds || '',
        smells: entry.location.currentState.sensoryDetails.smells || '',
        textures: entry.location.currentState.sensoryDetails.textures || '',
      },
    },

    storyRelevance: {
      firstAppearance: entry.location.storyRelevance.firstAppearance || 1,
      significance: entry.location.storyRelevance.significance || '',
      secretsHidden: entry.location.storyRelevance.secretsHidden,
      dangerLevel: entry.location.storyRelevance.dangerLevel || 'Low',
      accessRules: entry.location.storyRelevance.accessRules || '',
      connectedLocations: entry.location.storyRelevance.connectedLocations,
    },
  };
}

// For the chat creation flow — auto-generate canon entries from the conversation
export interface AutoGeneratedCanon {
  characters: { name: string; description: string; role: 'protagonist' | 'antagonist' | 'supporting' | 'minor' }[];
  locations: { name: string; description: string }[];
  systems: { name: string; description: string }[];
  artifacts: { name: string; description: string }[];
}

export function extractCanonFromConversation(messages: string[]): AutoGeneratedCanon {
  const text = messages.join(' ');
  const unique = <T,>(arr: T[], keyFn: (v: T) => string) => {
    const seen = new Set<string>();
    return arr.filter((item) => {
      const key = keyFn(item).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const STOP_NAMES = new Set([
    'Theodore', 'Story', 'Novel', 'Chapter', 'Book', 'AI', 'System', 'World', 'Magic', 'Fantasy', 'Sci', 'Fi',
  ]);

  const characterMatches = Array.from(text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g))
    .map((m) => m[1])
    .filter((name) => name.length > 2 && !STOP_NAMES.has(name));

  const locationMatches = Array.from(text.matchAll(/\b(?:in|at|under|beneath|inside)\s+the\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/g))
    .map((m) => m[1]);

  const systemMatches = Array.from(text.matchAll(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:magic|system|protocol|order|law)\b/gi))
    .map((m) => `${m[1]} System`);

  const artifactMatches = Array.from(text.matchAll(/\b(?:the\s+)?([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\s+(?:key|artifact|codex|amulet|sword|book)\b/gi))
    .map((m) => `${m[1]} ${m[0].split(' ').pop()}`);

  const characters = unique(
    characterMatches.map((name, idx) => ({
      name,
      description: idx === 0 ? 'Primary character identified from planning chat.' : 'Character identified from planning chat.',
      role: (idx === 0 ? 'protagonist' : 'supporting') as 'protagonist' | 'supporting',
    })),
    (c) => c.name,
  ).slice(0, 8);

  const locations = unique(
    locationMatches.map((name) => ({
      name,
      description: 'Location identified from planning chat.',
    })),
    (l) => l.name,
  ).slice(0, 8);

  const systems = unique(
    systemMatches.map((name) => ({
      name,
      description: 'World/system concept identified from planning chat.',
    })),
    (s) => s.name,
  ).slice(0, 6);

  const artifacts = unique(
    artifactMatches.map((name) => ({
      name,
      description: 'Artifact/object identified from planning chat.',
    })),
    (a) => a.name,
  ).slice(0, 6);

  if (!characters.length) {
    characters.push({ name: 'Protagonist', description: 'The main character of the story.', role: 'protagonist' });
  }
  if (!locations.length) {
    locations.push({ name: 'Primary Setting', description: 'Main setting identified from planning chat.' });
  }

  return {
    characters,
    locations,
    systems,
    artifacts,
  };
}
