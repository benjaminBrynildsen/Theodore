// ========== Canon Cleanup ==========
// Canon now comes from planning (creation, the arc map) and from the AI's
// read of each chapter — not from scanning prose for capitalized words. This
// module keeps it clean:
//
//   junkNameReason()  — strict check a new entity name must pass
//   heuristicCleanup() — obvious fixes found without AI ("We'll", "Three",
//                        "Then Elena" → Elena, "Iris" → Iris Kowalski)
//   buildCleanupPrompt() / parseCleanupResponse() — AI review of the whole
//                        list against the book (wrong type, duplicates, junk)
//
// Everything returns PROPOSALS; the author approves them before anything is
// deleted or merged. Pure functions — portable to the mobile app.

import type { AnyCanonEntry, CanonType, CharacterEntry } from '../types/canon';
import { isLikelyEntityNoise, normalizeEntityKey, sanitizeEntityName } from './entity-normalization';

export type CleanableType = 'character' | 'location' | 'artifact' | 'system' | 'media';
export const CLEANABLE_TYPES: CleanableType[] = ['character', 'location', 'artifact', 'system', 'media'];

export type CleanupProposal =
  | { kind: 'delete'; id: string; name: string; reason: string }
  | { kind: 'merge'; id: string; name: string; intoId: string; intoName: string; reason: string }
  | { kind: 'retype'; id: string; name: string; fromType: CanonType; toType: CleanableType; reason: string };

const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
  'thirty', 'forty', 'fifty', 'hundred', 'thousand', 'million', 'dozen',
  'second', 'third', 'fourth', 'fifth',
]);

/** Words that start a sentence, never a name: "Then Elena", "And Marcus", "Okay". */
const LEADING_CONNECTIVES = new Set([
  'then', 'and', 'but', 'so', 'or', 'when', 'while', 'after', 'before', 'if', 'as', 'until', 'because', 'since',
  'maybe', 'perhaps', 'yes', 'yeah', 'no', 'nope', 'okay', 'ok', 'oh', 'ah', 'well', 'hey', 'hi', 'hello', 'thanks',
  'just', 'only', 'even', 'still', 'now', 'meanwhile', 'suddenly', 'finally', 'later', 'once', 'also', 'again',
  'please', 'sorry', 'wait', 'look', 'listen', 'come', 'go', 'let', 'tell', 'ask', 'thank', 'did', 'does', 'do',
  'is', 'are', 'was', 'were', 'what', 'where', 'why', 'how', 'who', 'which', 'with', 'without', 'for', 'from', 'to',
  'like', 'not', 'every', 'each', 'all', 'some', 'dear', 'poor', 'little', 'big', 'old', 'young',
]);

const CONTRACTION = /\b[a-z]+['’](?:ll|re|ve|d|m|t|s)\b|n['’]t\b/i;

function tokens(name: string): string[] {
  return sanitizeEntityName(name).split(/\s+/).filter(Boolean);
}

/**
 * Why a name can't be a canon entry, or null when it looks like a real name.
 * Contractions and pronouns ("We'll"), numbers ("Three"), sentence starters
 * ("Then Elena"), lowercase words and run-on phrases all fail.
 */
export function junkNameReason(raw: string): string | null {
  const name = sanitizeEntityName(raw);
  if (!name || name.length < 2) return 'empty';
  if (CONTRACTION.test(name) && !/^[A-Z][a-z]*['’]s\s+[A-Z]/.test(name) && !/['’]s$/.test(name)) return 'a contraction, not a name';
  const t = tokens(name);
  if (t.length > 5) return 'too long to be a name';
  if (/^\d+$/.test(name.replace(/\s+/g, '')) || t.every((w) => NUMBER_WORDS.has(w.toLowerCase()) || /^\d+$/.test(w))) return 'a number';
  if (!/[A-Z]/.test(name[0]) && !/^\d/.test(name)) return 'not capitalized';
  if (t.length > 1 && LEADING_CONNECTIVES.has(t[0].toLowerCase())) return `starts with "${t[0]}"`;
  if (t.length === 1 && LEADING_CONNECTIVES.has(t[0].toLowerCase())) return 'a common word';
  if (isLikelyEntityNoise(name)) return 'a common word';
  return null;
}

function key(name: string): string {
  return normalizeEntityKey(name);
}

function aliasesOf(e: AnyCanonEntry): string[] {
  return e.type === 'character' ? ((e as CharacterEntry).character?.aliases || []) : [];
}

/** Obvious fixes that need no AI. */
export function heuristicCleanup(entries: AnyCanonEntry[]): CleanupProposal[] {
  const pool = entries.filter((e) => CLEANABLE_TYPES.includes(e.type as CleanableType));
  const out: CleanupProposal[] = [];
  const handled = new Set<string>();
  const byKey = new Map<string, AnyCanonEntry>();
  for (const e of pool) {
    const k = key(e.name);
    if (k && !byKey.has(`${e.type}:${k}`)) byKey.set(`${e.type}:${k}`, e);
  }

  for (const e of pool) {
    const reason = junkNameReason(e.name);
    if (!reason) continue;
    handled.add(e.id);
    // "Then Elena" → merge into "Elena" when it exists; otherwise delete.
    const t = tokens(e.name);
    if (t.length > 1 && LEADING_CONNECTIVES.has(t[0].toLowerCase())) {
      const rest = t.slice(1).join(' ');
      const target = pool.find((x) => x.id !== e.id && x.type === e.type && !junkNameReason(x.name)
        && (key(x.name) === key(rest) || key(x.name).split(' ')[0] === key(rest)));
      if (target) {
        out.push({ kind: 'merge', id: e.id, name: e.name, intoId: target.id, intoName: target.name, reason: `${reason} — it's ${target.name}` });
        continue;
      }
    }
    out.push({ kind: 'delete', id: e.id, name: e.name, reason: `Not a name (${reason})` });
  }

  // Exact duplicates of the same type: keep the one with more detail.
  const seen = new Map<string, AnyCanonEntry>();
  for (const e of pool) {
    if (handled.has(e.id)) continue;
    const k = `${e.type}:${key(e.name)}`;
    const prev = seen.get(k);
    if (!prev) { seen.set(k, e); continue; }
    const keep = (prev.description?.length || 0) >= (e.description?.length || 0) ? prev : e;
    const drop = keep === prev ? e : prev;
    handled.add(drop.id);
    seen.set(k, keep);
    out.push({ kind: 'merge', id: drop.id, name: drop.name, intoId: keep.id, intoName: keep.name, reason: 'Duplicate entry' });
  }

  // A lone first name that matches exactly one full-name character: "Iris" → "Iris Kowalski".
  const chars = pool.filter((e) => e.type === 'character' && !handled.has(e.id));
  for (const e of chars) {
    const t = tokens(e.name);
    if (t.length !== 1) continue;
    const first = t[0].toLowerCase();
    const matches = chars.filter((x) => x.id !== e.id && tokens(x.name).length > 1
      && (tokens(x.name)[0].toLowerCase() === first || aliasesOf(x).some((a) => a.toLowerCase() === first)));
    if (matches.length === 1) {
      handled.add(e.id);
      out.push({ kind: 'merge', id: e.id, name: e.name, intoId: matches[0].id, intoName: matches[0].name, reason: `Same person as ${matches[0].name}` });
    }
  }
  return out;
}

// ---------- AI review ----------

export function buildCleanupPrompt(args: {
  title: string;
  entries: AnyCanonEntry[];
  outline: Array<{ number: number; title: string; summary?: string }>;
}): string {
  const list = args.entries
    .filter((e) => CLEANABLE_TYPES.includes(e.type as CleanableType))
    .map((e, i) => {
      const al = aliasesOf(e);
      const desc = (e.description || '').replace(/\s+/g, ' ').slice(0, 140);
      const auto = e.tags?.includes('auto-detected') ? ' [auto-scanned]' : '';
      return `${i + 1}. [${e.type}] ${e.name}${al.length ? ` (aka ${al.join(', ')})` : ''}${auto}${desc ? ` — ${desc}` : ''}`;
    })
    .join('\n');
  const outline = args.outline
    .map((c) => `Ch ${c.number}: ${c.title}${c.summary ? ` — ${c.summary.slice(0, 160)}` : ''}`)
    .join('\n');

  return `You are Theodore, cleaning up the story bible for "${args.title}". Many entries marked [auto-scanned] were pulled from the prose by a word scanner and include junk.

BOOK OUTLINE:
${outline}

ENTRIES:
${list}

For each entry that needs fixing, give ONE action:
- "delete": not a real story entity — a contraction or common word ("We'll", "Three"), a sentence fragment, a phrase that merges two things ("Lego Millennium Falcon David"), a real-world group mentioned in passing, or a one-off with no role in the story.
- "merge": the same person/place/thing as another entry (a first name, nickname or misspelling of a fuller entry, or "Then Elena" for "Elena"). Give "into" = the number of the entry to keep (the fullest name).
- "move": the right entity but the wrong type — e.g. a street or house filed as a character is a "location"; a named object is an "artifact"; an organization or magic system is a "system"; a song/book/film is "media". Give "type".
Leave correct entries out. Be careful with real characters: if in doubt, keep.

Return ONLY JSON:
{"actions":[{"n":3,"action":"delete","reason":"short reason"},{"n":5,"action":"merge","into":1,"reason":"..."},{"n":9,"action":"move","type":"location","reason":"..."}]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawJson = any;

export function parseCleanupResponse(text: string, entries: AnyCanonEntry[]): CleanupProposal[] {
  const list = entries.filter((e) => CLEANABLE_TYPES.includes(e.type as CleanableType));
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: RawJson;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  const out: CleanupProposal[] = [];
  const used = new Set<string>();
  for (const a of Array.isArray(parsed?.actions) ? parsed.actions : []) {
    const e = list[Number(a?.n) - 1];
    if (!e || used.has(e.id)) continue;
    const reason = String(a?.reason || '').trim();
    if (a?.action === 'delete') {
      out.push({ kind: 'delete', id: e.id, name: e.name, reason: reason || 'Not a story entity' });
    } else if (a?.action === 'merge') {
      const into = list[Number(a?.into) - 1];
      if (!into || into.id === e.id) continue;
      out.push({ kind: 'merge', id: e.id, name: e.name, intoId: into.id, intoName: into.name, reason: reason || `Same as ${into.name}` });
    } else if (a?.action === 'move' && CLEANABLE_TYPES.includes(a?.type) && a.type !== e.type) {
      out.push({ kind: 'retype', id: e.id, name: e.name, fromType: e.type, toType: a.type, reason: reason || `Belongs under ${a.type}` });
    } else continue;
    used.add(e.id);
  }
  return out;
}

/**
 * Combine heuristic and AI proposals: one proposal per entry (heuristics win),
 * no merges into an entry that is itself being removed, no chains.
 */
export function combineProposals(heuristic: CleanupProposal[], ai: CleanupProposal[]): CleanupProposal[] {
  const byId = new Map<string, CleanupProposal>();
  for (const p of [...heuristic, ...ai]) if (!byId.has(p.id)) byId.set(p.id, p);
  const removed = new Set([...byId.values()].filter((p) => p.kind !== 'retype').map((p) => p.id));
  const out: CleanupProposal[] = [];
  for (const p of byId.values()) {
    if (p.kind === 'merge' && removed.has(p.intoId)) {
      // Follow one hop: merging into something that merges elsewhere.
      const next = byId.get(p.intoId);
      if (next?.kind === 'merge' && next.intoId !== p.id && !removed.has(next.intoId)) {
        out.push({ ...p, intoId: next.intoId, intoName: next.intoName });
      } else {
        out.push({ kind: 'delete', id: p.id, name: p.name, reason: p.reason });
      }
      continue;
    }
    out.push(p);
  }
  const order = { delete: 0, merge: 1, retype: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name));
}

/** Map of removed entry id → id that replaces it in chapter references (null = drop the reference). */
export function referenceRemap(proposals: CleanupProposal[], retypedIds: Record<string, string> = {}): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const p of proposals) {
    if (p.kind === 'delete') map.set(p.id, null);
    else if (p.kind === 'merge') map.set(p.id, p.intoId);
    else if (retypedIds[p.id]) map.set(p.id, retypedIds[p.id]);
  }
  return map;
}

export function remapReferences(ids: string[] | undefined, remap: Map<string, string | null>): string[] {
  const out: string[] = [];
  for (const id of ids || []) {
    const next = remap.has(id) ? remap.get(id) : id;
    if (next && !out.includes(next)) out.push(next);
  }
  return out;
}
