// ========== Rename everywhere ==========
// Renaming a canon entry updates every place the story uses the name: prose,
// scenes, chapter titles and premises, extracted memory, the thread and arc
// maps, and other canon entries. Pure functions — the store-aware runner
// lives in rename-runner.ts.
//
// Matching is whole-word and case-sensitive (with an ALL-CAPS variant), so
// "Iris" never touches "Irish", and possessives ("Iris's") follow naturally.
// Partial names are renamed too — "Iris Kowalski" → "June Novak" also turns
// "Iris" into "June" and "Kowalski" into "Novak" — but only when no other
// entry shares that part, so renaming one Garrity never renames the family.

import type { AnyCanonEntry, CharacterEntry } from '../types/canon';

export interface RenamePair {
  from: string;
  to: string;
}

function words(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

function namesOf(e: AnyCanonEntry): string[] {
  const c = e.type === 'character' ? (e as CharacterEntry).character : undefined;
  return [e.name, c?.fullName || '', ...(c?.aliases || [])].filter(Boolean);
}

/**
 * Pairs to replace for a rename. The full name always; for characters, the
 * first and last name separately when they changed and no other entry in
 * the project uses that word in its name.
 */
export function buildRenamePairs(
  oldName: string,
  newName: string,
  type: AnyCanonEntry['type'],
  otherEntries: AnyCanonEntry[] = [],
): RenamePair[] {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || from === to) return [];
  const pairs: RenamePair[] = [{ from, to }];
  if (type !== 'character') return pairs;

  const a = words(from);
  const b = words(to);
  if (a.length < 2 || b.length < 1) return pairs;
  const shared = new Set(otherEntries.flatMap((e) => namesOf(e).flatMap(words)).map((w) => w.toLowerCase()));
  const add = (x: string | undefined, y: string | undefined) => {
    if (!x || !y || x === y || x.length < 2) return;
    if (shared.has(x.toLowerCase())) return;
    if (!pairs.some((p) => p.from === x)) pairs.push({ from: x, to: y });
  };
  add(a[0], b[0]); // first name
  if (b.length >= 2) add(a[a.length - 1], b[b.length - 1]); // surname
  return pairs;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** One combined matcher, longest names first, so "Iris Kowalski" wins over "Iris" and replacements never chain. */
function matcher(pairs: RenamePair[]): { re: RegExp; map: Map<string, string> } | null {
  const map = new Map<string, string>();
  for (const p of pairs) {
    map.set(p.from, p.to);
    const upFrom = p.from.toUpperCase();
    if (upFrom !== p.from) map.set(upFrom, p.to.toUpperCase());
  }
  const keys = [...map.keys()].sort((x, y) => y.length - x.length);
  if (!keys.length) return null;
  return {
    re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${keys.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu'),
    map,
  };
}

export function replaceNames(text: string, pairs: RenamePair[]): string {
  if (!text) return text;
  const m = matcher(pairs);
  if (!m) return text;
  return text.replace(m.re, (hit) => m.map.get(hit) ?? hit);
}

export function countMentions(text: string, pairs: RenamePair[]): number {
  if (!text) return 0;
  const m = matcher(pairs);
  if (!m) return 0;
  return (text.match(m.re) || []).length;
}

/**
 * Replace names in every string inside a JSON-like value. Keys in `skipKeys`
 * are left untouched (e.g. versionHistory — past drafts stay as they were).
 */
export function renameDeep<T>(value: T, pairs: RenamePair[], skipKeys: Set<string> = new Set()): T {
  if (typeof value === 'string') return replaceNames(value, pairs) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => renameDeep(v, pairs, skipKeys)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = skipKeys.has(k) ? v : renameDeep(v, pairs, skipKeys);
    }
    return out as T;
  }
  return value;
}
