// ========== Continuity Context Builder ==========
// Single source of truth for cross-chapter continuity context.
// Used by every generation entry point: chapter gen, extend, scene gen,
// inline edit, and edit chat.
//
// Tiering strategy (closer = more detail):
//   • Tier 1 — immediately previous chapter: full prose (or last ~12K chars).
//   • Tier 2 — chapters 2-3 back: rich summary + last ~3K chars of prose.
//   • Tier 3 — chapter 4 back: rich summary only.
//   • Tier 4 — chapters 5+ back: tight 1-liner.
// Earlier tiers are rendered first so prompt caching can re-use them across
// consecutive chapter generations within a session.

import type { Chapter, Project } from '../types';

export interface ContinuityContext {
  earlyStoryArc: string;     // Tier 4 — 1-liner per chapter, ordered oldest first
  midStoryArc: string;       // Tier 3 — rich summary only
  recentChapters: string;    // Tier 2 — rich summary + prose tail
  previousChapter: string;   // Tier 1 — full prose (or last 12K chars)
  recentDialogue: string;
  openThreads: string;
}

export interface NarrativeThread {
  id: string;
  character: string;
  thread: string;
  introducedInChapter: number;
}

interface ChapterMetaWithContinuity {
  summary?: string;       // 1-sentence tight summary (existing field, ≤30 words)
  richSummary?: string;   // 3-5 sentence causality digest (new field, ≤100 words)
  openedThreads?: NarrativeThread[];
  resolvedThreadIds?: string[];
}

interface BuildOpts {
  maxRecentDialogueChapters?: number;
  previousProseCap?: number;       // chars of prev-chapter prose tail (default 12000)
  recentProseTailCap?: number;     // chars of tier-2 prose tail (default 3000)
  recentDialogueCharCap?: number;  // chars of dialogue log (default 4000)
}

/**
 * Builds the unified continuity context block for any generation call.
 * @param currentChapterId - the chapter being generated/edited; excluded from "previous" context
 */
export function buildContinuityContext(
  _project: Project,
  allChapters: Chapter[],
  currentChapterId: string,
  opts: BuildOpts | number = {},
): ContinuityContext {
  // Back-compat: callers used to pass `maxRecentDialogueChapters` as a number.
  const o: BuildOpts = typeof opts === 'number' ? { maxRecentDialogueChapters: opts } : opts;
  const maxRecentDialogueChapters = o.maxRecentDialogueChapters ?? 3;
  const previousProseCap = o.previousProseCap ?? 12000;
  const recentProseTailCap = o.recentProseTailCap ?? 3000;
  const recentDialogueCharCap = o.recentDialogueCharCap ?? 4000;

  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const currentIdx = sorted.findIndex((c) => c.id === currentChapterId);
  const priorChapters = currentIdx >= 0 ? sorted.slice(0, currentIdx) : sorted;

  const n = priorChapters.length;
  const previousIdx = n - 1;                 // tier 1
  const tier2Range: [number, number] = [Math.max(0, n - 3), Math.max(0, n - 1)]; // chapters 2-3 back
  const tier3Idx = n - 4;                    // chapter 4 back
  const tier4End = Math.max(0, n - 4);       // chapters 5+ back are [0, tier4End)

  const tier4 = priorChapters.slice(0, tier4End);
  const tier3 = tier3Idx >= 0 ? [priorChapters[tier3Idx]] : [];
  const tier2 = priorChapters.slice(tier2Range[0], tier2Range[1]);
  const tier1 = previousIdx >= 0 ? priorChapters[previousIdx] : null;

  // ---------- Tier 4 (oldest, tight) ----------
  const earlyStoryArc = tier4
    .map((c) => {
      const meta = (c.aiIntentMetadata || {}) as ChapterMetaWithContinuity;
      const oneLine = meta.summary
        || (meta.richSummary ? meta.richSummary.split(/(?<=\.)\s+/)[0] : null)
        || (c.premise?.purpose ? `[no summary] ${c.premise.purpose}` : null);
      return oneLine ? `Ch.${c.number}: ${oneLine}` : null;
    })
    .filter(Boolean)
    .join('\n');

  // ---------- Tier 3 (rich summary, no prose) ----------
  const midStoryArc = tier3
    .map((c) => {
      const meta = (c.aiIntentMetadata || {}) as ChapterMetaWithContinuity;
      const rich = meta.richSummary || meta.summary || c.premise?.purpose || '';
      return rich ? `Ch.${c.number} — "${c.title}": ${rich}` : null;
    })
    .filter(Boolean)
    .join('\n\n');

  // ---------- Tier 2 (rich summary + prose tail) ----------
  const recentChapters = tier2
    .map((c) => {
      const meta = (c.aiIntentMetadata || {}) as ChapterMetaWithContinuity;
      const rich = meta.richSummary || meta.summary || c.premise?.purpose || '';
      const prose = (c.prose || '').trim();
      const tail = prose.length > recentProseTailCap
        ? '...' + prose.slice(-recentProseTailCap)
        : prose;
      const blocks = [`### Ch.${c.number}: "${c.title}"`];
      if (rich) blocks.push(`Summary: ${rich}`);
      if (tail) blocks.push(`Ending:\n${tail}`);
      return blocks.join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  // ---------- Tier 1 (immediately previous, full prose) ----------
  let previousChapter = '';
  if (tier1) {
    const meta = (tier1.aiIntentMetadata || {}) as ChapterMetaWithContinuity;
    const prose = (tier1.prose || '').trim();
    const summary = meta.richSummary || meta.summary || '';
    if (prose || summary) {
      const body = prose.length > previousProseCap
        ? '...' + prose.slice(-previousProseCap)
        : prose;
      const blocks = [`### Ch.${tier1.number}: "${tier1.title}"`];
      if (summary) blocks.push(`Summary: ${summary}`);
      if (body) blocks.push('', body);
      previousChapter = blocks.join('\n');
    }
  }

  // ---------- Recent dialogue log ----------
  const recentDialogueChapters = priorChapters.slice(-maxRecentDialogueChapters);
  const dialogueLines: string[] = [];
  for (const ch of recentDialogueChapters) {
    if (!ch.prose) continue;
    const lines = extractDialogueWithAttribution(ch.prose, ch.number || 0);
    dialogueLines.push(...lines);
  }
  let recentDialogue = '';
  let charCount = 0;
  for (let i = dialogueLines.length - 1; i >= 0; i--) {
    if (charCount + dialogueLines[i].length > recentDialogueCharCap) break;
    recentDialogue = dialogueLines[i] + (recentDialogue ? '\n' + recentDialogue : '');
    charCount += dialogueLines[i].length;
  }

  // ---------- Open narrative threads ----------
  const openThreadMap = new Map<string, NarrativeThread>();
  for (const ch of priorChapters) {
    const meta = (ch.aiIntentMetadata || {}) as ChapterMetaWithContinuity;
    if (meta.openedThreads) {
      for (const t of meta.openedThreads) openThreadMap.set(t.id, t);
    }
    if (meta.resolvedThreadIds) {
      for (const id of meta.resolvedThreadIds) openThreadMap.delete(id);
    }
  }
  const openThreads = Array.from(openThreadMap.values())
    .map((t) => `- [Ch.${t.introducedInChapter}] ${t.character}: ${t.thread}`)
    .join('\n');

  return { earlyStoryArc, midStoryArc, recentChapters, previousChapter, recentDialogue, openThreads };
}

/**
 * Format the continuity context as a prompt-ready block.
 * Section order is stable + cache-friendly: oldest/most-stable first, freshest
 * (previous chapter prose) last so the model's attention lands on it.
 */
export function formatContinuityBlock(ctx: ContinuityContext): string {
  const sections: string[] = [];
  if (ctx.earlyStoryArc) {
    sections.push(`=== EARLIER CHAPTERS (high-level arc) ===\n${ctx.earlyStoryArc}`);
  }
  if (ctx.midStoryArc) {
    sections.push(`=== MID-DISTANCE CHAPTERS (causality) ===\n${ctx.midStoryArc}`);
  }
  if (ctx.openThreads) {
    sections.push(`=== OPEN NARRATIVE THREADS (must respect / can resolve) ===\n${ctx.openThreads}`);
  }
  if (ctx.recentDialogue) {
    sections.push(`=== RECENT DIALOGUE LOG ===\n${ctx.recentDialogue}`);
  }
  if (ctx.recentChapters) {
    sections.push(`=== RECENT CHAPTERS (summary + ending) ===\n${ctx.recentChapters}`);
  }
  if (ctx.previousChapter) {
    sections.push(`=== IMMEDIATELY PREVIOUS CHAPTER (full) ===\n${ctx.previousChapter}`);
  }
  return sections.join('\n\n');
}

// ---------- Helpers ----------

/**
 * Extract dialogue lines from prose with best-effort speaker attribution.
 * Looks at the sentence containing or adjacent to the quote for "X said" / "said X" patterns.
 */
function extractDialogueWithAttribution(prose: string, chapterNumber: number): string[] {
  const results: string[] = [];
  const quoteRegex = /["“]([^"”“]{4,400})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(prose)) !== null) {
    const quote = m[1].trim();
    if (!quote) continue;
    const start = Math.max(0, m.index - 100);
    const end = Math.min(prose.length, m.index + m[0].length + 100);
    const window = prose.slice(start, end);
    const speaker = guessSpeaker(window);
    const label = speaker ? `${speaker.toUpperCase()}` : 'UNKNOWN';
    results.push(`[Ch.${chapterNumber}] ${label}: "${quote}"`);
  }
  return results;
}

function guessSpeaker(window: string): string | null {
  const verbs = '(said|asked|replied|whispered|shouted|muttered|answered|called|added|continued|murmured)';
  const re1 = new RegExp(`\\b([A-Z][a-zA-Z]{1,20})\\s+${verbs}\\b`);
  const re2 = new RegExp(`\\b${verbs}\\s+([A-Z][a-zA-Z]{1,20})\\b`);
  const m1 = window.match(re1);
  if (m1) return m1[1];
  const m2 = window.match(re2);
  if (m2) return m2[2];
  return null;
}
