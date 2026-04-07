// ========== Continuity Context Builder ==========
// Single source of truth for cross-chapter continuity context.
// Used by every generation entry point: chapter gen, extend, scene gen,
// inline edit, and edit chat.

import type { Chapter, Project } from '../types';

export interface ContinuityContext {
  storySoFar: string;            // Rolling 1-line summary of all earlier chapters
  recentDialogue: string;        // Quoted dialogue from last 2-3 chapters with attribution
  openThreads: string;           // Unresolved promises/commitments from earlier chapters
  previousChapterEnding: string; // Last ~6000 chars of immediately previous chapter
}

export interface NarrativeThread {
  id: string;
  character: string;
  thread: string;
  introducedInChapter: number;
}

interface ChapterMetaWithContinuity {
  summary?: string;
  openedThreads?: NarrativeThread[];
  resolvedThreadIds?: string[];
}

/**
 * Builds the unified continuity context block for any generation call.
 * @param currentChapterId - the chapter being generated/edited; excluded from "previous" context
 * @param maxRecentDialogueChapters - how many prior chapters to scan for dialogue (default 3)
 */
export function buildContinuityContext(
  _project: Project,
  allChapters: Chapter[],
  currentChapterId: string,
  maxRecentDialogueChapters = 3,
): ContinuityContext {
  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const currentIdx = sorted.findIndex((c) => c.id === currentChapterId);
  const priorChapters = currentIdx >= 0 ? sorted.slice(0, currentIdx) : sorted;

  // ---------- Story so far (rolling summaries) ----------
  const storySoFar = priorChapters
    .map((c) => {
      const meta = (c.aiIntentMetadata || {}) as ChapterMetaWithContinuity;
      const summary = meta.summary || (c.premise?.purpose ? `[no summary] ${c.premise.purpose}` : null);
      return summary ? `Ch.${c.number}: ${summary}` : null;
    })
    .filter(Boolean)
    .join('\n');

  // ---------- Recent dialogue log ----------
  const recentChapters = priorChapters.slice(-maxRecentDialogueChapters);
  const dialogueLines: string[] = [];
  for (const ch of recentChapters) {
    if (!ch.prose) continue;
    const lines = extractDialogueWithAttribution(ch.prose, ch.number || 0);
    dialogueLines.push(...lines);
  }
  // Cap at ~1500 chars to control token budget
  let recentDialogue = '';
  let charCount = 0;
  for (let i = dialogueLines.length - 1; i >= 0; i--) {
    if (charCount + dialogueLines[i].length > 1500) break;
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

  // ---------- Previous chapter ending (expanded to ~6000 chars) ----------
  const prev = priorChapters[priorChapters.length - 1];
  let previousChapterEnding = '';
  if (prev?.prose) {
    const prose = prev.prose.trim();
    previousChapterEnding = prose.length > 6000 ? '...' + prose.slice(-6000) : prose;
  }

  return { storySoFar, recentDialogue, openThreads, previousChapterEnding };
}

/**
 * Format the continuity context as a prompt-ready block.
 * Returns empty string if nothing to inject.
 */
export function formatContinuityBlock(ctx: ContinuityContext): string {
  const sections: string[] = [];
  if (ctx.storySoFar) {
    sections.push(`=== STORY SO FAR ===\n${ctx.storySoFar}`);
  }
  if (ctx.openThreads) {
    sections.push(`=== OPEN NARRATIVE THREADS (must respect / can resolve) ===\n${ctx.openThreads}`);
  }
  if (ctx.recentDialogue) {
    sections.push(`=== RECENT DIALOGUE LOG ===\n${ctx.recentDialogue}`);
  }
  if (ctx.previousChapterEnding) {
    sections.push(`=== PREVIOUS CHAPTER ENDING ===\n${ctx.previousChapterEnding}`);
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
  // Match curly and straight quotes (negated class excludes all quote variants
  // so opening curly inside the span doesn't pair with the wrong closer)
  const quoteRegex = /["“]([^"”“]{4,400})["”]/g;
  let m: RegExpExecArray | null;
  while ((m = quoteRegex.exec(prose)) !== null) {
    const quote = m[1].trim();
    if (!quote) continue;
    // Look at ~200 chars around the quote for an attribution
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
  // Patterns: "said NAME", "NAME said", "NAME asked", "NAME replied", "NAME whispered", etc.
  const verbs = '(said|asked|replied|whispered|shouted|muttered|answered|called|added|continued|murmured)';
  const re1 = new RegExp(`\\b([A-Z][a-zA-Z]{1,20})\\s+${verbs}\\b`);
  const re2 = new RegExp(`\\b${verbs}\\s+([A-Z][a-zA-Z]{1,20})\\b`);
  const m1 = window.match(re1);
  if (m1) return m1[1];
  const m2 = window.match(re2);
  if (m2) return m2[2];
  return null;
}
