// GENERATED from Theodore web src/lib/fact-book.ts by scripts/build-mobile-port.mjs.
// Do not edit here — change the web source and regenerate, so both apps
// keep writing and reading the same chapter memory.

// ========== Facts & Secrets ==========
// The author's layer over the facts and secrets the chapter reader pulls out of
// each chapter (story-memory.ts). Page memory stays on the chapters, so a
// re-read keeps it current; this book only records what the author changed:
// facts they added, corrected or deleted, world facts, and secrets they set.
// Every fact counts — nothing ages out of the list.
//
// Pure functions only, ported to the mobile app with story-memory.ts.

import type { KnowledgeRecord, StoryFact, StoryStateAt } from './story-memory';

export interface BookFact {
  id: string;
  /** story: about a person, object or place. world: true of the story's world. */
  kind: 'story' | 'world';
  subject: string;
  fact: string;
  /** Chapter the fact comes from, when it corrects one from the page. */
  chapter?: number;
  /** Key of the page fact this replaces. */
  replaces?: string;
  at: string;
}

export interface BookSecret {
  id: string;
  secret: string;
  knownBy: string[];
  hiddenFrom: string[];
  /** Chapter of the page record this replaces; later chapters' changes win again. */
  chapter?: number;
  /** Wording of the page record this replaces, to find it again. */
  replaces?: string;
  /** The author removed this secret. */
  deleted?: boolean;
  at: string;
}

export interface FactBook {
  facts: BookFact[];
  secrets: BookSecret[];
  /** Keys of page facts the author deleted or replaced. */
  hidden: string[];
  /** Keys of page facts the author has seen (the rest show as New). */
  seen: string[];
}

export const EMPTY_FACT_BOOK: FactBook = { facts: [], secrets: [], hidden: [], seen: [] };

function norm(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function factKey(subject: string, fact: string): string {
  return `${norm(subject)}::${norm(fact)}`;
}

export function asFactBook(value: unknown): FactBook {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<FactBook>;
  return {
    facts: Array.isArray(v.facts) ? v.facts.filter((f) => f && f.subject && f.fact) : [],
    secrets: Array.isArray(v.secrets) ? v.secrets.filter((s) => s && s.secret) : [],
    hidden: Array.isArray(v.hidden) ? v.hidden : [],
    seen: Array.isArray(v.seen) ? v.seen : [],
  };
}

const newId = () => `fb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

// ---------- Applying the book to folded memory ----------

// Same measure as story-memory's tokenOverlap (kept local so the modules don't import each other).
function overlap(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter((t) => t.length > 2));
  const tb = new Set(norm(b).split(' ').filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

/** A secret matches a page record when the wording mostly overlaps. */
function sameSecret(a: string, b: string): boolean {
  return norm(a) === norm(b) || overlap(a, b) >= 0.6;
}

/**
 * Memory as of `chapterNumber` with the author's changes applied: deleted and
 * corrected page facts removed, the author's facts and secrets added. A page
 * record from a chapter after the one an author edit replaced wins again, so a
 * character learning the secret later still shows.
 */
export function applyFactBook(state: StoryStateAt, bookValue: unknown, chapterNumber = Infinity): StoryStateAt {
  const book = asFactBook(bookValue);
  if (!book.facts.length && !book.secrets.length && !book.hidden.length) return { ...state, worldFacts: state.worldFacts || [] };
  const hidden = new Set(book.hidden);
  const applies = (chapter?: number) => !chapter || chapter < chapterNumber;

  const facts: StoryFact[] = state.facts.filter((f) => !hidden.has(factKey(f.subject, f.fact)));
  const keys = new Set(facts.map((f) => factKey(f.subject, f.fact)));
  for (const f of book.facts) {
    if (f.kind !== 'story' || !applies(f.chapter)) continue;
    const k = factKey(f.subject, f.fact);
    if (keys.has(k)) continue;
    keys.add(k);
    facts.push({ subject: f.subject, fact: f.fact, chapter: f.chapter || 0, byAuthor: true });
  }

  let knowledge: KnowledgeRecord[] = state.knowledge.map((k) => ({ ...k }));
  for (const s of book.secrets) {
    if (!applies(s.chapter)) continue;
    const target = s.replaces || s.secret;
    const match = knowledge.find((k) => sameSecret(k.secret, target) || sameSecret(k.secret, s.secret));
    // A later chapter changed this secret after the author's edit: the page wins.
    if (match && s.chapter && match.chapter > s.chapter) continue;
    if (match) knowledge = knowledge.filter((k) => k !== match);
    if (!s.deleted) knowledge.push({ secret: s.secret, knownBy: [...s.knownBy], hiddenFrom: [...s.hiddenFrom], chapter: s.chapter || 0 });
  }

  return {
    ...state,
    facts,
    knowledge,
    worldFacts: book.facts.filter((f) => f.kind === 'world'),
  };
}

// ---------- View for the tab ----------

export interface FactRow {
  /** Page key, or the author fact's id. */
  key: string;
  subject: string;
  fact: string;
  chapter?: number;
  source: 'page' | 'author';
  kind: 'story' | 'world';
  isNew: boolean;
}

/** Every fact in the book, page and author, grouped by subject in story order. */
export function factRows(state: StoryStateAt, bookValue: unknown): FactRow[] {
  const book = asFactBook(bookValue);
  const hidden = new Set(book.hidden);
  const seen = new Set(book.seen);
  const rows: FactRow[] = [];
  for (const f of state.facts) {
    const key = factKey(f.subject, f.fact);
    if (hidden.has(key)) continue;
    rows.push({ key, subject: f.subject, fact: f.fact, chapter: f.chapter, source: 'page', kind: 'story', isNew: !seen.has(key) });
  }
  for (const f of book.facts) {
    rows.push({ key: f.id, subject: f.subject, fact: f.fact, chapter: f.chapter, source: 'author', kind: f.kind, isNew: false });
  }
  return rows;
}

export function groupBySubject(rows: FactRow[]): Array<{ subject: string; rows: FactRow[] }> {
  const groups = new Map<string, { subject: string; rows: FactRow[] }>();
  for (const r of rows) {
    const k = norm(r.subject);
    const g = groups.get(k) || { subject: r.subject, rows: [] };
    g.rows.push(r);
    groups.set(k, g);
  }
  // Story order; facts with no chapter (added by the author) come after the page's.
  const order = (r: FactRow) => r.chapter || Infinity;
  for (const g of groups.values()) g.rows.sort((a, b) => order(a) - order(b));
  return [...groups.values()].sort((a, b) => order(a.rows[0]) - order(b.rows[0]) || a.subject.localeCompare(b.subject));
}

// ---------- Edits ----------

export function addFact(bookValue: unknown, input: { kind: 'story' | 'world'; subject: string; fact: string }): FactBook {
  const book = asFactBook(bookValue);
  const subject = input.subject.trim() || (input.kind === 'world' ? 'World' : '');
  const fact = input.fact.trim();
  if (!subject || !fact) return book;
  return { ...book, facts: [...book.facts, { id: newId(), kind: input.kind, subject, fact, at: new Date().toISOString() }] };
}

/** Change a fact. A page fact is replaced by the author's version; an author fact is edited in place. */
export function editFact(bookValue: unknown, row: FactRow, subject: string, fact: string): FactBook {
  const book = asFactBook(bookValue);
  subject = subject.trim();
  fact = fact.trim();
  if (!subject || !fact) return book;
  if (row.source === 'author') {
    return { ...book, facts: book.facts.map((f) => (f.id === row.key ? { ...f, subject, fact, at: new Date().toISOString() } : f)) };
  }
  return {
    ...book,
    hidden: [...new Set([...book.hidden, row.key])],
    facts: [...book.facts, { id: newId(), kind: 'story', subject, fact, chapter: row.chapter, replaces: row.key, at: new Date().toISOString() }],
  };
}

export function deleteFact(bookValue: unknown, row: FactRow): FactBook {
  const book = asFactBook(bookValue);
  if (row.source === 'author') {
    const f = book.facts.find((x) => x.id === row.key);
    // Deleting a correction leaves the page fact it replaced deleted too.
    return { ...book, facts: book.facts.filter((x) => x.id !== row.key), hidden: f?.replaces ? [...new Set([...book.hidden, f.replaces])] : book.hidden };
  }
  return { ...book, hidden: [...new Set([...book.hidden, row.key])] };
}

export function markSeen(bookValue: unknown, keys: string[]): FactBook {
  const book = asFactBook(bookValue);
  return { ...book, seen: [...new Set([...book.seen, ...keys])].slice(-5000) };
}

export function setSecret(
  bookValue: unknown,
  original: KnowledgeRecord | null,
  next: { secret: string; knownBy: string[]; hiddenFrom: string[] } | null,
): FactBook {
  const book = asFactBook(bookValue);
  const at = new Date().toISOString();
  const target = original?.secret;
  // Drop any earlier author version of the same secret; this one supersedes it.
  const rest = target ? book.secrets.filter((s) => !sameSecret(s.secret, target)) : book.secrets;
  const prior = target ? book.secrets.find((s) => sameSecret(s.secret, target)) : undefined;
  const replaces = prior?.replaces || target;
  const chapter = prior?.chapter || original?.chapter || undefined;
  if (!next) {
    if (!original) return book;
    return { ...book, secrets: [...rest, { id: newId(), secret: original.secret, knownBy: [], hiddenFrom: [], chapter, replaces, deleted: true, at }] };
  }
  const secret = next.secret.trim();
  if (!secret) return book;
  const clean = (names: string[]) => [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  return {
    ...book,
    secrets: [...rest, { id: prior?.id || newId(), secret, knownBy: clean(next.knownBy), hiddenFrom: clean(next.hiddenFrom), chapter, replaces, at }],
  };
}
