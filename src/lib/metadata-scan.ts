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
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  const matches = Array.from(text.matchAll(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g)).map((m) => m[0].trim());
  const counts = new Map<string, number>();
  for (const name of matches) {
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  const candidates = Array.from(counts.entries())
    .filter(([name, count]) => {
      if (!name) return false;
      if (STOP.has(name)) return false;
      if (lowerCanonNames.has(name.toLowerCase())) return false;
      return count > 1 || name.includes(' ');
    })
    .map(([name]) => name)
    .slice(0, 24);

  const locationHints = ['City', 'Town', 'Village', 'Forest', 'Garden', 'Library', 'Castle', 'Hall', 'Street', 'River', 'Mountain'];
  const locationSet = new Set<string>();
  const characterSet = new Set<string>();

  for (const name of candidates) {
    const nearPreposition = new RegExp(`\\b(?:in|at|to|from|into|inside|under|beneath|near|across)\\s+(?:the\\s+)?${escapeRegExp(name)}\\b`, 'i').test(text);
    const looksLikeLocation = nearPreposition || locationHints.some((h) => name.endsWith(h));
    if (looksLikeLocation) locationSet.add(name);
    else characterSet.add(name);
  }

  return {
    scannedAt: new Date().toISOString(),
    existingMentions,
    newEntities: {
      characters: Array.from(characterSet).slice(0, 10),
      locations: Array.from(locationSet).slice(0, 10),
    },
  };
}

