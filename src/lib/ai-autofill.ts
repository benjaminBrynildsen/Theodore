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
  const text = messages.join(' ').replace(/\s+/g, ' ').trim();
  const unique = <T,>(arr: T[], keyFn: (v: T) => string) => {
    const seen = new Set<string>();
    return arr.filter((item) => {
      const key = keyFn(item).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const TIME_WORDS = new Set([
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
    'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'Midnight', 'Noon',
    'Spring', 'Summer', 'Autumn', 'Fall', 'Winter',
    'Today', 'Tomorrow', 'Yesterday',
  ]);

  const STOP_NAMES = new Set([
    'Theodore', 'Story', 'Novel', 'Chapter', 'Book', 'AI',
    'Tell', 'What', 'How', 'When', 'Where', 'Why', 'I', 'You', 'We', 'My', 'Our', 'Your',
    'Plan', 'Project', 'Create', 'Ready', 'Settings', 'Proposed', 'Conversation', 'Metadata',
    'Title', 'Length', 'Tone', 'Pacing', 'Character', 'Location', 'Artifact', 'Rule', 'Event', 'Systems',
    'Based', 'Current', 'Primary', 'Setting', 'Protagonist',
    'The',
  ]);

  const sanitize = (raw: string): string => (
    raw
      .replace(/^[\s"'`([{]+|[\s"'`)\]}.,!?;:]+$/g, '')
      .replace(/\s+/g, ' ')
      .replace(/^(?:the|a|an)\s+/i, '')
      .replace(/\s+(?:from|in|at|to|with|and|is|named|called)$/i, '')
      .trim()
  );

  const isTimeLike = (name: string) => {
    const first = name.split(/\s+/)[0];
    return TIME_WORDS.has(name) || TIME_WORDS.has(first);
  };

  const isLikelyNameShape = (name: string) => /^[A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3}$/.test(name);
  const artifactSuffix = /\b(?:Codex|Amulet|Sword|Key|Crown|Orb|Tome|Artifact|Relic|Device|Book)\b$/;
  const systemSuffix = /\b(?:System|Protocol|Order|Law|Magic)\b$/;
  const isArtifactLike = (name: string) => artifactSuffix.test(name);
  const isSystemLike = (name: string) => systemSuffix.test(name);

  const normalizeCandidates = (arr: string[]) => arr
    .map(sanitize)
    .filter((name) => !!name && isLikelyNameShape(name) && !STOP_NAMES.has(name) && !isTimeLike(name));

  const artifactCandidates = normalizeCandidates([
    ...Array.from(text.matchAll(/\b(?:artifact|relic|object|item)\s+(?:is|called|named)\s+(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})\b/g)).map((m) => m[1]),
    ...Array.from(text.matchAll(/\b(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3}\s(?:Codex|Amulet|Sword|Key|Crown|Orb|Tome|Artifact|Relic|Device|Book))\b/g)).map((m) => m[1]),
  ]);

  const systemCandidatesRaw = normalizeCandidates([
    ...Array.from(text.matchAll(/\b(?:system|magic|protocol|order|law)\s+(?:is|called|named)\s+(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})\b/g)).map((m) => m[1]),
    ...Array.from(text.matchAll(/\b(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3}\s(?:System|Protocol|Order|Law|Magic))\b/g)).map((m) => m[1]),
  ]);
  const systemCandidates = systemCandidatesRaw.map((name) => (isSystemLike(name) ? name : `${name} System`));

  const locationCandidates = normalizeCandidates([
    ...Array.from(text.matchAll(/\b(?:in|at|from|to|inside|within|under|near|across|throughout)\s+(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})\b/g)).map((m) => m[1]),
    ...Array.from(text.matchAll(/\b(?:set\s+in)\s+(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})\b/g)).map((m) => m[1]),
    ...Array.from(text.matchAll(/\b(?:[Cc]ity|[Tt]own|[Kk]ingdom|[Rr]ealm|[Ww]orld|[Pp]lanet|[Ss]tation|[Dd]istrict|[Vv]alley|[Ff]orest|[Ii]sland|[Pp]rovince|[Cc]ountry)\s+of\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,3})\b/g)).map((m) => m[1]),
  ]).filter((name) => !isArtifactLike(name) && !isSystemLike(name));

  const artifacts = unique(
    artifactCandidates.map((name) => ({
      name,
      description: 'Artifact/object identified from planning chat.',
    })),
    (a) => a.name,
  ).slice(0, 6);

  const systems = unique(
    systemCandidates.map((name) => ({
      name,
      description: 'World/system concept identified from planning chat.',
    })),
    (s) => s.name,
  ).slice(0, 6);

  const artifactSet = new Set(artifacts.map((a) => a.name.toLowerCase()));
  const systemSet = new Set(systems.map((s) => s.name.toLowerCase()));

  const locations = unique(
    locationCandidates
      .filter((name) => !artifactSet.has(name.toLowerCase()) && !systemSet.has(name.toLowerCase()))
      .map((name) => ({
        name,
        description: 'Location identified from planning chat.',
      })),
    (l) => l.name,
  ).slice(0, 8);

  const locationSet = new Set(locations.map((l) => l.name.toLowerCase()));

  const rolePriority: Record<'minor' | 'supporting' | 'antagonist' | 'protagonist', number> = {
    minor: 0,
    supporting: 1,
    antagonist: 2,
    protagonist: 3,
  };

  const inferRole = (token: string): 'protagonist' | 'antagonist' | 'supporting' | 'minor' => {
    const t = token.toLowerCase();
    if (t === 'protagonist' || t === 'hero' || t === 'heroine') return 'protagonist';
    if (t === 'villain' || t === 'antagonist') return 'antagonist';
    if (t === 'mentor' || t === 'detective' || t === 'captain' || t === 'king' || t === 'queen') return 'supporting';
    return 'minor';
  };

  const characterMap = new Map<string, { name: string; role: 'protagonist' | 'antagonist' | 'supporting' | 'minor' }>();
  const blockedCharacterNames = new Set<string>([
    ...artifactSet,
    ...systemSet,
    ...locationSet,
  ]);

  const addCharacter = (raw: string, role: 'protagonist' | 'antagonist' | 'supporting' | 'minor') => {
    const name = sanitize(raw);
    if (!name || !isLikelyNameShape(name) || STOP_NAMES.has(name) || isTimeLike(name)) return;
    if (blockedCharacterNames.has(name.toLowerCase())) return;
    const existing = characterMap.get(name.toLowerCase());
    if (!existing) {
      characterMap.set(name.toLowerCase(), { name, role });
      return;
    }
    if (rolePriority[role] > rolePriority[existing.role]) {
      characterMap.set(name.toLowerCase(), { name, role });
    }
  };

  for (const m of text.matchAll(/\b([Pp]rotagonist|[Hh]ero|[Hh]eroine|[Vv]illain|[Aa]ntagonist|[Mm]entor|[Dd]etective|[Cc]aptain|[Kk]ing|[Qq]ueen|[Cc]haracter)\b\s*(?:is|named|called)?\s*(?:the\s+)?([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})\b/g)) {
    addCharacter(m[2], inferRole(m[1]));
  }

  for (const m of text.matchAll(/\b(?:named|name is|about|follows|following|with)\s+([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})\b/g)) {
    addCharacter(m[1], 'supporting');
  }

  const properNounCandidates = normalizeCandidates(
    Array.from(text.matchAll(/\b([A-Z][A-Za-z'-]*(?:\s+[A-Z][A-Za-z'-]*){0,2})\b/g)).map((m) => m[1]),
  );
  const properFreq = new Map<string, number>();
  for (const name of properNounCandidates) {
    const k = name.toLowerCase();
    properFreq.set(k, (properFreq.get(k) || 0) + 1);
  }
  for (const name of properNounCandidates) {
    if (name.includes(' ') || (properFreq.get(name.toLowerCase()) || 0) > 1) {
      addCharacter(name, 'supporting');
    }
  }

  const normalizedCharacters = Array.from(characterMap.values());
  const trailingTokenOfLongName = new Set(
    normalizedCharacters
      .filter((c) => c.name.includes(' '))
      .map((c) => c.name.split(/\s+/).slice(-1)[0].toLowerCase()),
  );

  const characters = normalizedCharacters
    .filter((c) => c.name.includes(' ') || !trailingTokenOfLongName.has(c.name.toLowerCase()))
    .map((c, idx) => ({
      name: c.name,
      description: idx === 0 ? 'Primary character identified from planning chat.' : 'Character identified from planning chat.',
      role: c.role,
    }))
    .slice(0, 8);

  if (!characters.length) {
    characters.push({ name: 'Protagonist', description: 'The main character of the story.', role: 'protagonist' });
  }
  if (!locations.length) {
    locations.push({ name: 'Primary Setting', description: 'Main setting identified from planning chat.' });
  }

  return { characters, locations, systems, artifacts };
}
