import type { AnyCanonEntry } from '../types/canon';
import {
  getGenericRoleToken,
  getLeadingRoleToken,
  isAliasProneRoleToken,
  isGenericRoleCharacterName,
  isLikelyCharacterNoise,
  isLikelyEntityNoise,
  normalizeCharacterKey,
  normalizeEntityKey,
  sanitizeEntityName,
} from './entity-normalization';

export interface MetadataScanResult {
  scannedAt: string;
  existingMentions: Array<{
    canonId: string;
    name: string;
    type: AnyCanonEntry['type'];
    count: number;
  }>;
  newEntities: {
    characters: string[];
    locations: string[];
    systems: string[];
    artifacts: string[];
    media: string[];
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCandidate(raw: string): string {
  return sanitizeEntityName(raw)
    .replace(/\s+/g, ' ')
    .trim();
}

function hasContext(text: string, name: string, contextPattern: string): boolean {
  const pattern = new RegExp(contextPattern.replaceAll('{NAME}', escapeRegExp(name)), 'i');
  return pattern.test(text);
}

export function scanMetadataOccurrences(prose: string, canonEntries: AnyCanonEntry[]): MetadataScanResult {
  const text = prose || '';
  // Collect character keys including aliases so known variants aren't re-detected
  const characterKeys: string[] = [];
  for (const entry of canonEntries) {
    if (entry.type !== 'character') continue;
    const key = normalizeCharacterKey(entry.name) || normalizeEntityKey(entry.name);
    if (key) characterKeys.push(key);
    // Also add individual name tokens (first name, last name) as known
    const tokens = normalizeEntityKey(entry.name).split(/\s+/);
    for (const t of tokens) { if (t) characterKeys.push(t); }
    // Add explicit aliases from character profile
    const aliases = (entry as any).character?.aliases as string[] | undefined;
    if (aliases) {
      for (const alias of aliases) {
        const ak = normalizeCharacterKey(alias) || normalizeEntityKey(alias);
        if (ak) characterKeys.push(ak);
      }
    }
  }

  const existingByType = {
    character: new Set(characterKeys),
    location: new Set(
      canonEntries
        .filter((entry) => entry.type === 'location')
        .map((entry) => normalizeEntityKey(entry.name))
        .filter(Boolean),
    ),
    system: new Set(
      canonEntries
        .filter((entry) => entry.type === 'system')
        .map((entry) => normalizeEntityKey(entry.name))
        .filter(Boolean),
    ),
    artifact: new Set(
      canonEntries
        .filter((entry) => entry.type === 'artifact')
        .map((entry) => normalizeEntityKey(entry.name))
        .filter(Boolean),
    ),
  };

  const lowerCanonNames = new Set(
    canonEntries
      .map((entry) => normalizeEntityKey(entry.name))
      .filter(Boolean),
  );

  const existingMentions = canonEntries.map((entry) => {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.name)}\\b`, 'gi');
    const count = (text.match(pattern) || []).length;
    return { canonId: entry.id, name: entry.name, type: entry.type, count };
  }).filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const STOP = new Set([
    'The', 'A', 'An', 'And', 'But', 'Or', 'So', 'If', 'Then', 'When', 'While', 'Because', 'After', 'Before', 'Chapter',
    'He', 'She', 'They', 'Them', 'We', 'You', 'It', 'I', 'Me', 'Us',
    'His', 'Her', 'My', 'Your', 'Our', 'Their', 'Its',
    'This', 'That', 'These', 'Those', 'There', 'Here', 'Where', 'What', 'Which', 'Who', 'How', 'Why',
    'Not', 'No', 'Yes', 'Only', 'Just', 'Even', 'Still', 'Also', 'Too', 'Very', 'Much', 'More',
    'Good', 'Bad', 'Great', 'Plus', 'Right', 'Well', 'Sure', 'Like', 'Way',
    'Now', 'Soon', 'Later', 'Once', 'Again', 'Never', 'Always', 'Already', 'Perhaps', 'Maybe',
    'Some', 'Any', 'All', 'Every', 'Each', 'Both', 'Few', 'Many', 'Most',
    'First', 'Last', 'Next', 'New', 'Old', 'Other', 'Another',
    'Up', 'Down', 'Out', 'In', 'Off', 'On', 'Back', 'Away',
    'Something', 'Nothing', 'Everything', 'Someone', 'Everyone', 'Nobody',
    'Said', 'Asked', 'Told', 'Thought', 'Knew', 'Felt', 'Looked', 'Seemed',
    'Could', 'Would', 'Should', 'Might', 'Must', 'Shall', 'Will',
    'Been', 'Being', 'Had', 'Has', 'Have', 'Did', 'Does', 'Was', 'Were', 'Got',
    'Made', 'Came', 'Went', 'Took', 'Gave', 'Saw', 'Heard',
    'Enough', 'Almost', 'Though', 'Although', 'However', 'Yet',
    'With', 'From', 'Into', 'About', 'Between', 'Through', 'Above', 'Below', 'Over', 'Under',
    'Time', 'Day', 'Night', 'Morning', 'Evening', 'Afternoon',
    'Man', 'Woman', 'Boy', 'Girl', 'People', 'Person', 'Thing', 'Things',
    'Hand', 'Head', 'Face', 'Eye', 'Eyes', 'Voice', 'Door', 'Room',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
  ]);

  const matches = [
    ...Array.from(text.matchAll(/\b[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,3}\b/g)).map((m) => m[0]),
    ...Array.from(text.matchAll(/\b[A-Z][A-Za-z'-]+\s+of\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2}\b/g)).map((m) => m[0]),
  ].map((m) => normalizeCandidate(m));

  const counts = new Map<string, number>();
  for (const name of matches) {
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  // Build lowercase STOP set for case-insensitive matching
  const STOP_LOWER = new Set(Array.from(STOP).map(w => w.toLowerCase()));

  const candidates = Array.from(counts.entries())
    .filter(([name, count]) => {
      if (!name) return false;
      if (isLikelyEntityNoise(name)) return false;
      // Check every word in the candidate against STOP (case-insensitive)
      const parts = name.split(/\s+/);
      if (parts.every((p) => STOP_LOWER.has(p.toLowerCase()))) return false;
      // Single-word candidates: reject common English words aggressively.
      if (parts.length === 1) {
        const lower = name.toLowerCase();
        if (STOP_LOWER.has(lower)) return false;
        // Check if this word appears lowercased ANYWHERE in the prose — if so, it's not a proper noun.
        // A real name like "Jack" never appears as "jack", but "Inside" will appear as "inside".
        // Use a simple indexOf for reliability (regex \b can miss near punctuation).
        if (text.includes(` ${lower} `) || text.includes(` ${lower},`) || text.includes(` ${lower}.`) ||
            text.includes(` ${lower};`) || text.includes(` ${lower}!`) || text.includes(` ${lower}?`) ||
            text.includes(` ${lower}\n`) || text.includes(` ${lower}'`) || text.includes(` ${lower}—`) ||
            text.includes(`\n${lower} `) || text.includes(`"${lower}`) || text.includes(`${lower}"`) ||
            text.startsWith(`${lower} `)) return false;
        // Also reject single words shorter than 4 chars that aren't already known canon
        // (very short words are almost never entity names when detected alone)
        if (lower.length < 4) return false;
      }
      if (lowerCanonNames.has(normalizeEntityKey(name))) return false;
      return count > 1 || name.includes(' ');
    })
    .map(([name]) => name)
    .slice(0, 40);

  const locationHints = [
    'City', 'Town', 'Village', 'Forest', 'Garden', 'Library', 'Castle', 'Hall', 'Street',
    'River', 'Mountain', 'Kingdom', 'Realm', 'World', 'Planet', 'Station', 'District', 'Valley',
    'Island', 'Province', 'Country', 'Harbor', 'Bay', 'Temple', 'Diner', 'Bar', 'Restaurant',
    'Cafe', 'Hotel', 'Motel', 'Inn', 'Church', 'School', 'Park', 'Bridge', 'Tower', 'Square',
    'Alley', 'Avenue', 'Boulevard', 'Highway', 'Road', 'Lane', 'Court', 'Plaza', 'Market',
    'Warehouse', 'Factory', 'Hospital', 'Prison', 'Mansion', 'Cabin', 'Cottage', 'Apartment',
  ];
  const artifactHints = [
    'Codex', 'Amulet', 'Sword', 'Key', 'Crown', 'Orb', 'Tome', 'Relic', 'Artifact', 'Device',
    'Engine', 'Ring', 'Blade', 'Shield', 'Staff', 'Wand', 'Pendant', 'Gem', 'Crystal', 'Scroll',
    'Map', 'Compass', 'Lantern', 'Dagger', 'Bow', 'Hammer', 'Axe', 'Spear', 'Armor', 'Cloak',
    'Mask', 'Mirror', 'Chalice', 'Potion', 'Elixir', 'Talisman', 'Token', 'Seal', 'Badge',
    'Letter', 'Diary', 'Journal', 'Photograph', 'Gun', 'Pistol', 'Rifle', 'Knife', 'Coin',
  ];
  const objectHints = [
    // Materials, brands, physical objects that aren't fantastical artifacts
    'Formica', 'Naugahyde', 'Vinyl', 'Leather', 'Chrome', 'Neon', 'Jukebox',
    'Cadillac', 'Chevrolet', 'Mustang', 'Corvette', 'Buick', 'Pontiac',
    'Zippo', 'Polaroid', 'Walkman', 'Rolex', 'Remington', 'Colt', 'Winchester',
    'Bourbon', 'Scotch', 'Whiskey', 'Marlboro', 'Camel', 'Lucky Strike',
  ];
  const mediaHints = [
    'Song', 'Album', 'Track', 'Record', 'Film', 'Movie', 'Show', 'Series', 'Episode',
    'Novel', 'Magazine', 'Newspaper', 'Poem', 'Painting', 'Photograph',
  ];
  const systemHints = ['System', 'Protocol', 'Order', 'Law', 'Magic', 'Code', 'Doctrine', 'Network', 'Council'];

  const locationMap = new Map<string, string>();
  const characterMap = new Map<string, string>();
  const systemMap = new Map<string, string>();
  const artifactMap = new Map<string, string>();
  const mediaMap = new Map<string, string>();

  const upsert = (map: Map<string, string>, key: string, name: string) => {
    if (!key) return;
    const existing = map.get(key);
    if (!existing || name.length > existing.length) {
      map.set(key, name);
    }
  };

  for (const name of candidates) {
    if (isLikelyEntityNoise(name)) continue;
    const nearPreposition = hasContext(
      text,
      name,
      '\\b(?:in|at|to|from|into|inside|under|beneath|near|across|throughout|within)\\s+(?:the\\s+)?{NAME}\\b',
    );
    const artifactContext = hasContext(
      text,
      name,
      '\\b(?:artifact|relic|object|item|device|weapon|sword|amulet|key|codex)\\s+(?:called|named|known\\s+as)?\\s*(?:the\\s+)?{NAME}\\b',
    );
    const systemContext = hasContext(
      text,
      name,
      '\\b(?:system|protocol|order|law|magic|code|doctrine|network)\\s+(?:called|named|known\\s+as)?\\s*(?:the\\s+)?{NAME}\\b',
    );
    const mediaContext = hasContext(
      text,
      name,
      '\\b(?:song|album|movie|film|book|novel|show|series|painting|poem|track|record|sang|played|watched|read|listened)\\s+(?:called|named|titled|by)?\\s*(?:the\\s+)?["\u201C]?{NAME}["\u201D]?\\b',
    );
    const objectContext = hasContext(
      text,
      name,
      '\\b(?:made\\s+of|covered\\s+in|wrapped\\s+in|built\\s+with|lined\\s+with|topped\\s+with|brand|model|type\\s+of)\\s+{NAME}\\b',
    );

    const looksLikeArtifact = artifactContext || artifactHints.some((h) => name.endsWith(h));
    const looksLikeObject = objectContext || objectHints.some((h) => name === h || name.endsWith(h));
    const looksLikeMedia = mediaContext || mediaHints.some((h) => name.endsWith(h));
    const looksLikeSystem = systemContext || systemHints.some((h) => name.endsWith(h));
    const looksLikeLocation = nearPreposition || locationHints.some((h) => name.endsWith(h) || name === h) || /\bof\b/.test(name);

    if (looksLikeMedia) {
      const key = normalizeEntityKey(name);
      upsert(mediaMap, key, name);
      continue;
    }
    if (looksLikeArtifact || looksLikeObject) {
      const key = normalizeEntityKey(name);
      if (!existingByType.artifact.has(key)) upsert(artifactMap, key, name);
      continue;
    }
    if (looksLikeSystem) {
      const key = normalizeEntityKey(name);
      if (!existingByType.system.has(key)) upsert(systemMap, key, name);
      continue;
    }
    if (looksLikeLocation) {
      const key = normalizeEntityKey(name);
      if (!existingByType.location.has(key)) upsert(locationMap, key, name);
      continue;
    }
    if (isLikelyCharacterNoise(name)) continue;
    const key = normalizeCharacterKey(name) || normalizeEntityKey(name);
    if (!existingByType.character.has(key)) upsert(characterMap, key, name);
  }

  const roleSpecificNames = new Set(
    Array.from(characterMap.values())
      .map((name) => getLeadingRoleToken(name))
      .filter((role): role is string => !!role),
  );
  const hasNamedCharacter = Array.from(characterMap.values())
    .some((entry) => !isGenericRoleCharacterName(entry) && entry.includes(' '));

  const filteredCharacters = Array.from(characterMap.values()).filter((name) => {
    if (!isGenericRoleCharacterName(name)) return true;
    const role = getGenericRoleToken(name);
    if (!role) return true;
    if (roleSpecificNames.has(role)) return false;
    if (hasNamedCharacter && isAliasProneRoleToken(role)) return false;
    return true;
  });

  // Deduplicate: remove short names that are a token-subset of a longer name in the same category.
  // e.g. "Jack" is absorbed by "Jack Monroe"; "Silver Lake" absorbs "Silver".
  // Also merges aliases (first-name-only references) into the longest known form.
  function dedupeSubsetNames(names: string[]): string[] {
    const sorted = [...names].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
    const result: string[] = [];
    const absorbedKeys = new Set<string>();

    for (const name of sorted) {
      const key = normalizeEntityKey(name);
      if (absorbedKeys.has(key)) continue;
      result.push(name);
      // Mark all single-token subsets of this multi-token name as absorbed
      const tokens = key.split(/\s+/);
      if (tokens.length > 1) {
        for (const token of tokens) {
          absorbedKeys.add(token);
        }
        // Also absorb any shorter contiguous subsequences
        for (let len = 1; len < tokens.length; len++) {
          for (let start = 0; start <= tokens.length - len; start++) {
            absorbedKeys.add(tokens.slice(start, start + len).join(' '));
          }
        }
      }
    }

    // Second pass: also absorb names whose *character key* matches a token of any kept name.
    // This catches "John" being absorbed by "John Smith" even when normalizeCharacterKey differs.
    const keptKeys = result.map(n => normalizeEntityKey(n));
    return result.filter(name => {
      const key = normalizeEntityKey(name);
      const tokens = key.split(/\s+/);
      if (tokens.length > 1) return true; // multi-word names survive
      // Single-word: check if any multi-word kept name contains this token
      for (const kk of keptKeys) {
        if (kk === key) continue;
        if (kk.split(/\s+/).includes(tokens[0])) return false;
      }
      return true;
    });
  }

  return {
    scannedAt: new Date().toISOString(),
    existingMentions,
    newEntities: {
      characters: dedupeSubsetNames(filteredCharacters).slice(0, 10),
      locations: dedupeSubsetNames(Array.from(locationMap.values())).slice(0, 10),
      systems: dedupeSubsetNames(Array.from(systemMap.values())).slice(0, 10),
      artifacts: dedupeSubsetNames(Array.from(artifactMap.values())).slice(0, 10),
      media: dedupeSubsetNames(Array.from(mediaMap.values())).slice(0, 10),
    },
  };
}
