// ========== Renumbering chapters ==========
// Inserting a chapter (a prequel at the start, or one in the middle) or
// dragging chapters into a new order changes chapter numbers. Several things
// remember chapters by number: each chapter's extracted memory, the thread
// map, the character & object map, and Facts & Secrets. These functions move
// every one of those references with its chapter, so a beat planned for the
// old chapter 3 stays with that chapter when it becomes chapter 4.
//
// Pure functions only.

import type { Chapter } from '../types';
import type { ThreadPlan } from './story-threads';
import type { ArcPlan } from './story-arcs';
import type { FactBook } from './fact-book';

/** Old chapter number → new chapter number. Numbers it doesn't know stay put. */
export type ChapterMap = (n: number) => number;

/** Inserting a chapter at `position` pushes that chapter and everything after it back one. */
export function insertionMap(position: number): ChapterMap {
  return (n) => (n >= position ? n + 1 : n);
}

/** A reorder: each chapter's old number to its place in `orderedIds` (1-based). */
export function reorderMap(chapters: Pick<Chapter, 'id' | 'number'>[], orderedIds: string[]): ChapterMap {
  const byOld = new Map<number, number>();
  for (const c of chapters) {
    const i = orderedIds.indexOf(c.id);
    if (i >= 0) byOld.set(c.number, i + 1);
  }
  return (n) => byOld.get(n) ?? n;
}

const num = (v: unknown, f: ChapterMap) => (typeof v === 'number' && v > 0 ? f(v) : v);

function mapList<T extends Record<string, unknown>>(list: unknown, f: ChapterMap, keys: string[]): T[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const next = { ...(item as Record<string, unknown>) };
    for (const k of keys) if (k in next) next[k] = num(next[k], f);
    return next as T;
  });
}

/** A chapter's stored memory with every chapter number moved. */
export function remapChapterMeta(meta: Record<string, unknown> | null | undefined, f: ChapterMap): Record<string, unknown> | null | undefined {
  if (!meta) return meta;
  const out: Record<string, unknown> = { ...meta };
  const lists: Array<[string, string[]]> = [
    ['facts', ['chapter']],
    ['knowledge', ['chapter']],
    ['timeline', ['chapter']],
    ['meetings', ['chapter']],
    ['openedThreads', ['introducedInChapter']],
  ];
  for (const [key, fields] of lists) {
    const mapped = mapList(meta[key], f, fields);
    if (mapped) out[key] = mapped;
  }
  const stale = meta.continuityStale as Record<string, unknown> | undefined;
  if (stale && typeof stale === 'object') out.continuityStale = { ...stale, fromChapter: num(stale.fromChapter, f) };
  return out;
}

export function remapThreadPlan(plan: ThreadPlan | null | undefined, f: ChapterMap, chapterCount: number): ThreadPlan | null | undefined {
  if (!plan?.threads) return plan;
  return {
    ...plan,
    chapterCount,
    threads: plan.threads.map((t) => {
      const beats = (t.beats || []).map((b) => ({ ...b, chapter: f(b.chapter) })).sort((a, b) => a.chapter - b.chapter);
      return { ...t, opensIn: f(t.opensIn), closesIn: f(t.closesIn), beats };
    }),
  };
}

export function remapArcPlan(plan: ArcPlan | null | undefined, f: ChapterMap, chapterCount: number): ArcPlan | null | undefined {
  if (!plan) return plan;
  return {
    ...plan,
    chapterCount,
    characters: (plan.characters || []).map((c) => ({
      ...c,
      introducedIn: f(c.introducedIn),
      beats: (c.beats || []).map((b) => ({ ...b, chapter: f(b.chapter) })).sort((a, b) => a.chapter - b.chapter),
    })),
    artifacts: (plan.artifacts || []).map((a) => ({
      ...a,
      introducedIn: f(a.introducedIn),
      payoffIn: f(a.payoffIn),
      beats: (a.beats || []).map((b) => ({ ...b, chapter: f(b.chapter) })).sort((x, y) => x.chapter - y.chapter),
    })),
  };
}

export function remapFactBook(book: FactBook | null | undefined, f: ChapterMap): FactBook | null | undefined {
  if (!book) return book;
  return {
    ...book,
    facts: mapList(book.facts, f, ['chapter']) || [],
    secrets: mapList(book.secrets, f, ['chapter']) || [],
    timeline: mapList(book.timeline, f, ['chapter']) || [],
    meetings: mapList(book.meetings, f, ['chapter', 'firstChapter']) || [],
  } as unknown as FactBook;
}

/** "Chapter 3" becomes "Chapter 4"; a real title stays as it is. */
export function renumberTitle(title: string, oldNumber: number, newNumber: number): string {
  const m = title.match(/^(Chapter|Page|Part)\s+(\d+)$/i);
  return m && Number(m[2]) === oldNumber ? `${m[1]} ${newNumber}` : title;
}

export interface RenumberPlan {
  chapters: Array<{ id: string; updates: Partial<Chapter> }>;
  project: { threadPlan?: ThreadPlan | null; arcPlan?: ArcPlan | null; factBook?: FactBook | null };
}

/**
 * Every update needed to apply `f` to a book: changed chapter numbers, titles
 * and memory, and the project's maps. `chapterCount` is the count afterwards.
 */
export function planRenumber(
  chapters: Chapter[],
  project: { threadPlan?: unknown; arcPlan?: unknown; factBook?: unknown },
  f: ChapterMap,
  chapterCount: number,
): RenumberPlan {
  const out: RenumberPlan = { chapters: [], project: {} };
  for (const c of chapters) {
    const next = f(c.number);
    const updates: Partial<Chapter> = {};
    if (next !== c.number) {
      updates.number = next;
      updates.timelinePosition = next;
      const title = renumberTitle(c.title || '', c.number, next);
      if (title !== c.title) updates.title = title;
    }
    const meta = c.aiIntentMetadata as unknown as Record<string, unknown> | undefined;
    const mapped = remapChapterMeta(meta, f);
    if (mapped && JSON.stringify(mapped) !== JSON.stringify(meta)) updates.aiIntentMetadata = mapped as unknown as Chapter['aiIntentMetadata'];
    if (Object.keys(updates).length) out.chapters.push({ id: c.id, updates });
  }
  if (project.threadPlan) out.project.threadPlan = remapThreadPlan(project.threadPlan as ThreadPlan, f, chapterCount);
  if (project.arcPlan) out.project.arcPlan = remapArcPlan(project.arcPlan as ArcPlan, f, chapterCount);
  if (project.factBook) out.project.factBook = remapFactBook(project.factBook as FactBook, f);
  return out;
}
