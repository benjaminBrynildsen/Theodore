// ========== Story Threads ==========
// The book's thread map: every plot line, mystery, hook and twist with the
// chapter it opens in and the chapter it closes in. Planned before chapter 1
// is written so the whole book has a shape, then fed into each chapter's
// prompt ("open this, hint that, close this, don't resolve that yet").
//
// Three tiers:
//   major   — main plot lines and twists; span most of the book, with hints
//             planted well before the reveal
//   subplot — mid-length lines (roughly 3-8 chapters)
//   hook    — short questions opened and closed within 1-3 chapters; they
//             cluster mid-book to keep momentum
//
// Pure functions (no store / network imports) — portable to the mobile app.

import type { Chapter } from '../types';
import type { AnyCanonEntry } from '../types/canon';

export type ThreadTier = 'major' | 'subplot' | 'hook';
export type ThreadKind = 'plot' | 'mystery' | 'twist' | 'relationship' | 'secret' | 'threat' | 'goal' | 'promise';
export type ThreadBeatType = 'open' | 'hint' | 'advance' | 'reveal' | 'close';

export interface ThreadBeat {
  chapter: number;
  type: ThreadBeatType;
  note: string;
}

export interface StoryThread {
  id: string;
  title: string;
  /** What the thread is about, from the reader's side (what they wonder / want). */
  question: string;
  /** How it pays off. Spoiler for twists. */
  resolution: string;
  tier: ThreadTier;
  kind: ThreadKind;
  opensIn: number;
  closesIn: number;
  beats: ThreadBeat[];
  characters: string[];
}

export interface ThreadPlan {
  version: 1;
  generatedAt: string;
  chapterCount: number;
  threads: StoryThread[];
}

export const TIER_LABELS: Record<ThreadTier, string> = {
  major: 'Major plot lines & twists',
  subplot: 'Subplots',
  hook: 'Hooks',
};

const TIERS: ThreadTier[] = ['major', 'subplot', 'hook'];
const KINDS: ThreadKind[] = ['plot', 'mystery', 'twist', 'relationship', 'secret', 'threat', 'goal', 'promise'];
const BEAT_TYPES: ThreadBeatType[] = ['open', 'hint', 'advance', 'reveal', 'close'];

// Model output is untrusted JSON, read field by field with explicit coercion.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawJson = any;

// ---------- Planning prompt ----------

interface ChapterMemoryLike {
  summary?: string;
  richSummary?: string;
  openedThreads?: Array<{ character: string; thread: string }>;
}

export function buildThreadPlanPrompt(args: {
  title: string;
  genre?: string;
  chapters: Chapter[];
  canon: AnyCanonEntry[];
  structureName?: string;
}): string {
  const chapters = [...args.chapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const n = chapters.length;
  const written = chapters.filter((c) => c.prose?.trim());

  const outline = chapters.map((c) => {
    const meta = (c.aiIntentMetadata || {}) as ChapterMemoryLike;
    const isWritten = !!c.prose?.trim();
    const body = isWritten
      ? `[WRITTEN] ${meta.richSummary || meta.summary || c.premise?.purpose || ''}`
      : `[PLANNED] ${[c.premise?.purpose, c.premise?.changes].filter(Boolean).join(' — ')}`;
    const opened = isWritten && meta.openedThreads?.length
      ? `\n    threads opened on the page: ${meta.openedThreads.map((t) => `${t.character}: ${t.thread}`).join('; ')}`
      : '';
    return `Ch ${c.number}: "${c.title}" ${body}${opened}`;
  }).join('\n');

  const people = args.canon
    .filter((e) => e.type === 'character')
    .slice(0, 25)
    .map((e) => `- ${e.name}${e.description ? `: ${e.description}` : ''}`)
    .join('\n');

  const majorCount = n >= 16 ? '3-4' : n >= 9 ? '2-3' : '1-2';
  const subplotCount = n >= 16 ? '5-8' : n >= 9 ? '4-6' : '2-4';
  const hookCount = n >= 16 ? '8-12' : n >= 9 ? '5-8' : '3-5';

  return `You are Theodore, a story architect. Build the THREAD MAP for "${args.title}"${args.genre ? ` (${args.genre})` : ''}: every plot line, mystery, hook and twist, with the chapter it opens in and the chapter it closes in. This map guides the writing of every chapter.

The book has ${n} chapters.${args.structureName ? ` Structure: ${args.structureName}.` : ''}

CHAPTERS:
${outline}
${people ? `\nCHARACTERS:\n${people}\n` : ''}
DESIGN RULES:
1. Three tiers:
   - "major" (${majorCount}): the central plot lines and the big twist(s)/reveals. They span most of the book. A twist MUST have at least two "hint" beats planted chapters before its "reveal" — fair foreshadowing a careful reader could catch.
   - "subplot" (${subplotCount}): secondary lines spanning roughly 3-8 chapters each, staggered so they don't all start or end together.
   - "hook" (${hookCount}): short questions or cliffhangers opened and closed within 1-3 chapters. Cluster most of them in the MIDDLE of the book (roughly chapters ${Math.max(2, Math.round(n * 0.3))}-${Math.max(3, Math.round(n * 0.7))}) to keep momentum, with a couple early to grab the reader.
2. EVERY thread opens and closes inside the book (1-${n}), and closes after it opens. Nothing is left dangling unless it's a deliberate final-page hook — even then, close it in chapter ${n}.
3. Every chapter should open, advance, hint or close at least one thread. Avoid more than 3 threads closing in the same chapter, except the climax.
4. Bigger threads start early (chapters 1-3) and pay off late; the climax (last ~15% of chapters) closes the major threads.
${written.length ? `5. Chapters marked [WRITTEN] already happened. Threads that appear there must open (or be hinted) in those chapters — don't move events that are already on the page. You may plan future beats freely.\n` : ''}
For each thread give beats: one "open", any "hint"/"advance" beats, one "reveal" for twists/mysteries, and one "close". Beat notes are one short sentence saying what happens on the page.

Return ONLY JSON, no markdown:
{"threads":[{"title":"short name","tier":"major|subplot|hook","kind":"${KINDS.join('|')}","question":"what the reader wonders or wants","resolution":"how it pays off","characters":["Name"],"beats":[{"chapter":1,"type":"open","note":"..."},{"chapter":4,"type":"hint","note":"..."},{"chapter":9,"type":"reveal","note":"..."},{"chapter":10,"type":"close","note":"..."}]}]}`;
}

// ---------- Parsing + validation ----------

function clampChapter(v: unknown, n: number): number | null {
  const x = Math.round(Number(v));
  if (!Number.isFinite(x)) return null;
  return Math.min(Math.max(1, x), n);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'thread';
}

/**
 * Normalize one raw thread: clamp chapters, guarantee one open + one close
 * with close >= open, keep hints before the reveal, sort beats.
 */
export function normalizeThread(raw: RawJson, n: number, index: number): StoryThread | null {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  const tier: ThreadTier = TIERS.includes(raw.tier) ? raw.tier : 'subplot';
  const kind: ThreadKind = KINDS.includes(raw.kind) ? raw.kind : 'plot';

  let beats: ThreadBeat[] = (Array.isArray(raw.beats) ? raw.beats : [])
    .map((b: RawJson) => {
      const chapter = clampChapter(b?.chapter, n);
      const type: ThreadBeatType = BEAT_TYPES.includes(b?.type) ? b.type : 'advance';
      return chapter ? { chapter, type, note: String(b?.note || '').trim() } : null;
    })
    .filter((b: ThreadBeat | null): b is ThreadBeat => !!b);

  // Fall back to explicit opensIn/closesIn if the model gave them.
  const explicitOpen = clampChapter(raw.opensIn, n);
  const explicitClose = clampChapter(raw.closesIn, n);
  let opensIn = explicitOpen ?? Math.min(...beats.filter((b) => b.type === 'open').map((b) => b.chapter), Infinity);
  if (!Number.isFinite(opensIn)) opensIn = beats.length ? Math.min(...beats.map((b) => b.chapter)) : 1;
  let closesIn = explicitClose ?? Math.max(...beats.filter((b) => b.type === 'close').map((b) => b.chapter), -Infinity);
  if (!Number.isFinite(closesIn)) closesIn = beats.length ? Math.max(...beats.map((b) => b.chapter)) : n;
  if (closesIn < opensIn) [opensIn, closesIn] = [closesIn, opensIn];

  // Exactly one open and one close, at the ends of the span.
  beats = beats.filter((b) => b.type !== 'open' && b.type !== 'close' && b.chapter >= opensIn && b.chapter <= closesIn);
  const openNote = (raw.beats || []).find((b: RawJson) => b?.type === 'open')?.note;
  const closeNote = (raw.beats || []).find((b: RawJson) => b?.type === 'close')?.note;
  beats.unshift({ chapter: opensIn, type: 'open', note: String(openNote || raw.question || '').trim() });
  beats.push({ chapter: closesIn, type: 'close', note: String(closeNote || raw.resolution || '').trim() });

  // Hints must come before the reveal; a reveal sits inside the span.
  const reveal = beats.find((b) => b.type === 'reveal');
  if (reveal) beats = beats.filter((b) => b.type !== 'hint' || b.chapter <= reveal.chapter);

  const order: Record<ThreadBeatType, number> = { open: 0, hint: 1, advance: 2, reveal: 3, close: 4 };
  beats.sort((a, b) => a.chapter - b.chapter || order[a.type] - order[b.type]);

  return {
    id: `th-${index}-${slug(title)}`,
    title,
    question: String(raw.question || '').trim(),
    resolution: String(raw.resolution || '').trim(),
    tier,
    kind,
    opensIn,
    closesIn,
    beats,
    characters: Array.isArray(raw.characters) ? raw.characters.map(String).filter(Boolean).slice(0, 6) : [],
  };
}

export function parseThreadPlan(text: string, chapterCount: number, now = new Date().toISOString()): ThreadPlan | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let parsed: RawJson;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const list = Array.isArray(parsed?.threads) ? parsed.threads : Array.isArray(parsed) ? parsed : [];
  const threads = list
    .map((t: RawJson, i: number) => normalizeThread(t, Math.max(1, chapterCount), i))
    .filter((t: StoryThread | null): t is StoryThread => !!t);
  if (!threads.length) return null;
  return { version: 1, generatedAt: now, chapterCount, threads };
}

// ---------- Per-chapter view ----------

export interface ChapterThreadActivity {
  chapter: number;
  opening: StoryThread[];
  closing: StoryThread[];
  hinting: Array<{ thread: StoryThread; note: string }>;
  advancing: Array<{ thread: StoryThread; note: string }>;
  revealing: Array<{ thread: StoryThread; note: string }>;
  /** Open before this chapter and still open after it — keep alive, don't resolve. */
  carrying: StoryThread[];
}

export function threadsForChapter(plan: ThreadPlan | null | undefined, chapter: number): ChapterThreadActivity {
  const act: ChapterThreadActivity = { chapter, opening: [], closing: [], hinting: [], advancing: [], revealing: [], carrying: [] };
  for (const t of plan?.threads || []) {
    if (chapter < t.opensIn || chapter > t.closesIn) continue;
    const here = t.beats.filter((b) => b.chapter === chapter);
    if (t.opensIn === chapter) act.opening.push(t);
    if (t.closesIn === chapter) act.closing.push(t);
    for (const b of here) {
      if (b.type === 'hint') act.hinting.push({ thread: t, note: b.note });
      if (b.type === 'advance') act.advancing.push({ thread: t, note: b.note });
      if (b.type === 'reveal') act.revealing.push({ thread: t, note: b.note });
    }
    if (t.opensIn < chapter && t.closesIn > chapter && !here.some((b) => b.type === 'reveal')) act.carrying.push(t);
  }
  return act;
}

function beatNote(t: StoryThread, chapter: number, type: ThreadBeatType): string {
  return t.beats.find((b) => b.chapter === chapter && b.type === type)?.note || '';
}

/** Prompt section telling the writer what this chapter must do with each thread. */
export function buildThreadGuidanceBlock(plan: ThreadPlan | null | undefined, chapter: number): string {
  if (!plan?.threads?.length) return '';
  const a = threadsForChapter(plan, chapter);
  const lines: string[] = [];
  const tag = (t: StoryThread) => `[${t.tier}${t.kind === 'twist' ? ', twist' : ''}] ${t.title}`;
  for (const t of a.opening) lines.push(`- OPEN ${tag(t)}: ${beatNote(t, chapter, 'open') || t.question}`);
  for (const h of a.hinting) lines.push(`- HINT ${tag(h.thread)}: ${h.note || 'plant a subtle clue'} (subtle — the reader shouldn't see the reveal coming yet)`);
  for (const v of a.advancing) lines.push(`- ADVANCE ${tag(v.thread)}: ${v.note}`);
  for (const r of a.revealing) lines.push(`- REVEAL ${tag(r.thread)}: ${r.note || r.thread.resolution}`);
  for (const t of a.closing) lines.push(`- CLOSE ${tag(t)}: ${beatNote(t, chapter, 'close') || t.resolution}`);
  const carrying = a.carrying.filter((t) => !a.hinting.some((h) => h.thread.id === t.id) && !a.advancing.some((v) => v.thread.id === t.id));
  if (carrying.length) {
    lines.push(`- KEEP OPEN (do not resolve or reveal yet): ${carrying.map((t) => `${t.title} (closes Ch.${t.closesIn})`).join('; ')}`);
  }
  if (!lines.length) return '';
  return `=== THREADS IN THIS CHAPTER (from the book's thread map — follow it) ===\n${lines.join('\n')}`;
}

// ---------- Status + health ----------

export type ThreadStatus = 'planned' | 'open' | 'resolved';

/** Where the thread stands given which chapters have been written. */
export function threadStatus(t: StoryThread, chapters: Chapter[]): ThreadStatus {
  const written = new Set(chapters.filter((c) => c.prose?.trim()).map((c) => c.number));
  if (written.has(t.closesIn)) return 'resolved';
  if (written.has(t.opensIn)) return 'open';
  return 'planned';
}

export interface ThreadWarning {
  level: 'warning' | 'info';
  message: string;
  threadId?: string;
}

export function analyzeThreadPlan(plan: ThreadPlan | null | undefined, chapterCount: number): ThreadWarning[] {
  const warnings: ThreadWarning[] = [];
  if (!plan?.threads?.length) return warnings;
  const n = Math.max(1, chapterCount);

  if (plan.chapterCount !== n) {
    warnings.push({ level: 'warning', message: `The map was built for ${plan.chapterCount} chapters; the book now has ${n}. Rebuild to re-plan.` });
  }
  for (const t of plan.threads) {
    if (t.closesIn > n) warnings.push({ level: 'warning', threadId: t.id, message: `"${t.title}" closes in Ch.${t.closesIn}, after the last chapter.` });
    if (t.tier === 'major' && t.opensIn > Math.max(3, Math.ceil(n * 0.3))) {
      warnings.push({ level: 'info', threadId: t.id, message: `Major thread "${t.title}" starts late (Ch.${t.opensIn}) — consider opening or hinting it earlier.` });
    }
    const reveal = t.beats.find((b) => b.type === 'reveal');
    if ((t.kind === 'twist' || (t.tier === 'major' && reveal)) && t.beats.filter((b) => b.type === 'hint').length < 2) {
      warnings.push({ level: 'warning', threadId: t.id, message: `"${t.title}" reveals without at least two earlier hints — the payoff may feel unearned.` });
    }
  }
  const quiet: number[] = [];
  for (let c = 1; c <= n; c++) {
    const a = threadsForChapter(plan, c);
    const active = a.opening.length + a.closing.length + a.hinting.length + a.advancing.length + a.revealing.length;
    if (!active) quiet.push(c);
    const closes = a.closing.length;
    if (closes > 3 && c < Math.ceil(n * 0.85)) warnings.push({ level: 'info', message: `${closes} threads close in Ch.${c} — consider staggering them.` });
  }
  if (quiet.length) warnings.push({ level: 'info', message: `No thread activity in Ch.${quiet.join(', ')}.` });
  const midStart = Math.round(n * 0.3);
  const midEnd = Math.round(n * 0.7);
  const midHooks = plan.threads.filter((t) => t.tier === 'hook' && t.opensIn >= midStart && t.closesIn <= midEnd);
  if (n >= 6 && midHooks.length < 2) warnings.push({ level: 'info', message: 'Few short hooks in the middle of the book — the midsection may sag.' });
  return warnings;
}

/** Move a thread's open/close chapters, keeping its beats inside the new span. */
export function retimeThread(t: StoryThread, opensIn: number, closesIn: number, chapterCount: number): StoryThread {
  const n = Math.max(1, chapterCount);
  let open = Math.min(Math.max(1, Math.round(opensIn)), n);
  let close = Math.min(Math.max(1, Math.round(closesIn)), n);
  if (close < open) [open, close] = [close, open];
  const beats = t.beats
    .map((b) => (b.type === 'open' ? { ...b, chapter: open } : b.type === 'close' ? { ...b, chapter: close } : b))
    .filter((b) => b.chapter >= open && b.chapter <= close);
  const order: Record<ThreadBeatType, number> = { open: 0, hint: 1, advance: 2, reveal: 3, close: 4 };
  beats.sort((a, b) => a.chapter - b.chapter || order[a.type] - order[b.type]);
  return { ...t, opensIn: open, closesIn: close, beats };
}
