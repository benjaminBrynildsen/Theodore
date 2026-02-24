import type { AnyCanonEntry } from '../types/canon';

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
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCandidate(raw: string): string {
  return raw
    .replace(/^[\s"'`([{]+|[\s"'`)\]}.,!?;:]+$/g, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasContext(text: string, name: string, contextPattern: string): boolean {
  const pattern = new RegExp(contextPattern.replaceAll('{NAME}', escapeRegExp(name)), 'i');
  return pattern.test(text);
}

export function scanMetadataOccurrences(prose: string, canonEntries: AnyCanonEntry[]): MetadataScanResult {
  const text = prose || '';
  const lowerCanonNames = new Set(canonEntries.map((e) => e.name.trim().toLowerCase()));

  const existingMentions = canonEntries.map((entry) => {
    const pattern = new RegExp(`\\b${escapeRegExp(entry.name)}\\b`, 'gi');
    const count = (text.match(pattern) || []).length;
    return { canonId: entry.id, name: entry.name, type: entry.type, count };
  }).filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);

  const STOP = new Set([
    'The', 'A', 'An', 'And', 'But', 'If', 'Then', 'When', 'While', 'Because', 'After', 'Before', 'Chapter',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    'I',
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

  const candidates = Array.from(counts.entries())
    .filter(([name, count]) => {
      if (!name) return false;
      if (STOP.has(name)) return false;
      const parts = name.split(/\s+/);
      if (parts.every((p) => STOP.has(p))) return false;
      if (lowerCanonNames.has(name.toLowerCase())) return false;
      return count > 1 || name.includes(' ');
    })
    .map(([name]) => name)
    .slice(0, 40);

  const locationHints = [
    'City', 'Town', 'Village', 'Forest', 'Garden', 'Library', 'Castle', 'Hall', 'Street',
    'River', 'Mountain', 'Kingdom', 'Realm', 'World', 'Planet', 'Station', 'District', 'Valley',
    'Island', 'Province', 'Country', 'Harbor', 'Bay', 'Temple',
  ];
  const artifactHints = ['Codex', 'Amulet', 'Sword', 'Key', 'Crown', 'Orb', 'Tome', 'Relic', 'Artifact', 'Device', 'Book', 'Engine'];
  const systemHints = ['System', 'Protocol', 'Order', 'Law', 'Magic', 'Code', 'Doctrine', 'Network', 'Council'];

  const locationSet = new Set<string>();
  const characterSet = new Set<string>();
  const systemSet = new Set<string>();
  const artifactSet = new Set<string>();

  for (const name of candidates) {
    const nearPreposition = hasContext(
      text,
      name,
      '\\b(?:in|at|to|from|into|inside|under|beneath|near|across|throughout|within)\\s+(?:the\\s+)?{NAME}\\b',
    );
    const artifactContext = hasContext(
      text,
      name,
      '\\b(?:artifact|relic|object|item|device|book|weapon|sword|amulet|key|codex)\\s+(?:called|named|known\\s+as)?\\s*(?:the\\s+)?{NAME}\\b',
    );
    const systemContext = hasContext(
      text,
      name,
      '\\b(?:system|protocol|order|law|magic|code|doctrine|network)\\s+(?:called|named|known\\s+as)?\\s*(?:the\\s+)?{NAME}\\b',
    );

    const looksLikeArtifact = artifactContext || artifactHints.some((h) => name.endsWith(h));
    const looksLikeSystem = systemContext || systemHints.some((h) => name.endsWith(h));
    const looksLikeLocation = nearPreposition || locationHints.some((h) => name.endsWith(h)) || /\bof\b/.test(name);

    if (looksLikeArtifact) {
      artifactSet.add(name);
      continue;
    }
    if (looksLikeSystem) {
      systemSet.add(name);
      continue;
    }
    if (looksLikeLocation) {
      locationSet.add(name);
      continue;
    }
    characterSet.add(name);
  }

  return {
    scannedAt: new Date().toISOString(),
    existingMentions,
    newEntities: {
      characters: Array.from(characterSet).slice(0, 10),
      locations: Array.from(locationSet).slice(0, 10),
      systems: Array.from(systemSet).slice(0, 10),
      artifacts: Array.from(artifactSet).slice(0, 10),
    },
  };
}
