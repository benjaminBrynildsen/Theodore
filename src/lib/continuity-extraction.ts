// ========== Continuity Extraction ==========
// The post-generation "extract-continuity" call: prompt, response parsing, and
// turning a response into the chapter-metadata patch that story-memory.ts and
// continuity-context.ts read back. Pure (no store / network imports) so the
// web app and the mobile app run the exact same logic and write the exact same
// aiIntentMetadata keys — a chapter extracted on one device is memory on both.
//
// Caller responsibilities (see post-generation-pipeline.ts for the web wiring):
//   1. prompt = buildContinuityExtractionPrompt(...)
//   2. text   = AI call with EXTRACTION_REQUEST settings
//   3. result = applyContinuityExtraction(text, ...)
//   4. merge result.metaPatch into the chapter's aiIntentMetadata and save
//   5. save each staleNoticeUpdates(...) patch onto the later chapters

import type { Chapter } from '../types';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import { applyFactBook } from './fact-book';
import {
  CONTINUITY_VERSION,
  characterStateFor,
  currentLimit,
  buildPriorMemoryForCheck,
  diffChapterMemory,
  foldStoryState,
  memoryMeta,
  parseMemorySections,
  parseNewCanon,
  proseContentHash,
  proseForExtraction,
  proseMentionsAny,
  proseSignature,
  stripProductionTags,
  tokenOverlap,
  type ChapterMemoryMeta,
  type NewCanonCandidate,
  type StaleNotice,
} from './story-memory';

export const EXTRACTION_REQUEST = {
  action: 'extract-continuity',
  maxTokens: 3500,
  temperature: 0.2,
} as const;

export interface NarrativeThreadRecord {
  id: string;
  character: string;
  thread: string;
  introducedInChapter: number;
}

interface ThreadMeta {
  openedThreads?: NarrativeThreadRecord[];
  resolvedThreadIds?: string[];
}

function sortChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => (a.number || 0) - (b.number || 0));
}

/** Threads opened before this chapter and not yet resolved. */
export function openThreadsBefore(allChapters: Chapter[], chapter: Chapter): NarrativeThreadRecord[] {
  const open = new Map<string, NarrativeThreadRecord>();
  for (const c of sortChapters(allChapters)) {
    if ((c.number || 0) >= (chapter.number || 0)) break;
    const meta = (c.aiIntentMetadata || {}) as ThreadMeta;
    for (const t of meta.openedThreads || []) open.set(t.id, t);
    for (const id of meta.resolvedThreadIds || []) open.delete(id);
  }
  return [...open.values()];
}

export function buildContinuityExtractionPrompt(args: {
  projectTitle: string;
  chapter: Chapter;
  allChapters: Chapter[];
  canon: AnyCanonEntry[];
  /** The project's Facts & Secrets book. */
  factBook?: unknown;
}): string {
  const { projectTitle, chapter, allChapters, canon } = args;
  const openThreadsList = openThreadsBefore(allChapters, chapter)
    .map((t) => `- [${t.id}] ${t.character}: ${t.thread}`)
    .join('\n');
  const priorState = applyFactBook(foldStoryState(allChapters, chapter.id), args.factBook, chapter.number || Infinity);
  const priorMemory = buildPriorMemoryForCheck(priorState);
  // Conditions set in canon count as established even before the page shows them.
  const canonLimits = canon
    .filter((e): e is CharacterEntry => e.type === 'character')
    .map((e) => {
      const limit = currentLimit(e, characterStateFor(priorState, e));
      return limit ? `- ${e.name}: can't: ${limit}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const knownNames = canon
    .filter((e) => e.type === 'character' || e.type === 'artifact' || e.type === 'location')
    .map((e) => `${e.name} (${e.type})`)
    .slice(0, 80)
    .join(', ');

  return `You are Theodore, a story continuity analyst working on "${projectTitle}".

Read the WHOLE chapter below and produce the sections that follow. Be concrete and specific — these notes are the only memory later chapters will have.

1) SHORT_SUMMARY — one sentence (≤30 words), plot-focused. This is the tight memory used when generating much-later chapters.
2) RICH_SUMMARY — 3-5 sentences (≤100 words) covering, in order:
   • What physically and emotionally HAPPENS.
   • WHY (motivations, causality — not just events).
   • What CHANGES for the protagonist or central relationships (knowledge gained, beliefs shifted, alliances formed/broken).
   • What STATE the chapter ends in (location, time of day, who is with whom, what is unresolved).
3) OPEN_THREADS — any new unresolved promises, commitments, plans, secrets, or emotional threads a character introduces. Format: "CHARACTER: thread description". Only genuine open threads.
4) RESOLVED_THREAD_IDS — given the existing open threads below, which ids did THIS chapter resolve? Only include ids from the existing list.
5) CHARACTER_STATE — for each character who appears or changes, their state at the END of this chapter. One line each, pipe-separated, omit unknown fields:
   - NAME | location: ... | with: ... | mood: ... | learned: new thing they now know; another | physical: injuries/visible changes | status: alive/dead/missing/captured | arc: where they are in their personal arc now | relationships: Name: how they stand with them now; Name: ... | called: other names or nicknames used for them in this chapter (e.g. Wesley; Store), omit if only their usual name | capacity: only when an illness, injury, disability, age or state of mind limits them — concretely what they can't do right now (e.g. can't speak beyond a word or two; can't walk unaided; doesn't recognize people), or "none now" if an earlier limit has ended
6) ARTIFACT_STATE — important objects that appear, change hands, move, or change condition:
   - OBJECT | holder: ... | location: ... | condition: ...
7) FACTS — small concrete details this chapter ESTABLISHES that later chapters must keep consistent (appearance, ages, names of pets/places, vehicles, scars, habits, dates, relationships, how something works). Only details actually on the page, not guesses. Max 15.
   - SUBJECT: fact
8) CONTRADICTIONS — places where THIS chapter conflicts with the established memory below (wrong eye colour, an object in the wrong hands, a character knowing something they couldn't, a dead character acting, a character doing what their condition doesn't allow — e.g. long conversations from someone who can barely speak). Only real conflicts, not new developments shown happening on the page.
   - high|medium|low | "short exact quote from this chapter" | what conflicts | suggested fix
   Also flag time running backwards or impossibly fast against the STORY CLOCK, and a character using a SECRET they are listed as not knowing.
9) STORY_CLOCK — when this chapter ENDS in story time, one line: day (e.g. "Day 3", "Tuesday", "the night of the festival" — continue the numbering from the memory below), time of day, and how much time the chapter covered.
   day: ... | time: ... | elapsed: ...
10) KNOWLEDGE — secrets, hidden identities, plans, lies and key discoveries in play, with who knows them at the END of this chapter. Include ones from the memory below whose holders changed here (someone learned or was told). Max 10.
   - SECRET | known by: Name; Name | hidden from: Name; Name
11) NEW_CANON — named characters, places and objects that appear in THIS chapter, matter to the story (likely to come back), and are NOT in the known names below. Use the full proper name exactly as the prose gives it. Never list common words, sentence fragments, real-world brands or groups mentioned in passing, or a nickname of someone already known. Max 6.
   - character|location|artifact | Full Name | one-line description

Use these exact names when they refer to the same person, place, or object: ${knownNames || '(none yet)'}

ESTABLISHED MEMORY FROM EARLIER CHAPTERS:
${priorMemory || '(none yet)'}
${canonLimits ? `\nCHARACTER LIMITS (from their profiles):\n${canonLimits}\n` : ''}

EXISTING OPEN THREADS:
${openThreadsList || '(none)'}

CHAPTER ${chapter.number}: ${chapter.title}
${proseForExtraction(chapter.prose || '')}

Respond ONLY in this exact format:
SHORT_SUMMARY: <one sentence>
RICH_SUMMARY:
<3-5 sentences>
OPEN_THREADS:
- CHARACTER: thread one
RESOLVED_THREAD_IDS:
- id1
CHARACTER_STATE:
- NAME | location: ... | mood: ...
ARTIFACT_STATE:
- OBJECT | holder: ...
FACTS:
- SUBJECT: fact
CONTRADICTIONS:
- medium | "quote" | problem | fix
STORY_CLOCK:
day: ... | time: ... | elapsed: ...
KNOWLEDGE:
- SECRET | known by: ... | hidden from: ...
NEW_CANON:
- character | Full Name | description

If a list has nothing, leave it empty (just the header).`;
}

export function parseContinuityResponse(text: string, chapterNumber: number): {
  summary: string;
  richSummary: string;
  openedThreads: NarrativeThreadRecord[];
  resolvedThreadIds: string[];
} | null {
  if (!text) return null;
  // SHORT_SUMMARY (new) — fall back to legacy "SUMMARY:" header so old responses keep parsing.
  const shortMatch = text.match(/SHORT_SUMMARY:\s*(.+?)(?:\n|$)/i)
    || text.match(/^SUMMARY:\s*(.+?)(?:\n|$)/im);
  const summary = shortMatch ? shortMatch[1].trim() : '';
  if (!summary) return null;

  // RICH_SUMMARY: everything between RICH_SUMMARY: and the next ALL_CAPS header
  const richMatch = text.match(/RICH_SUMMARY:\s*([\s\S]*?)(?=\n\s*(?:OPEN_THREADS|RESOLVED_THREAD_IDS):|$)/i);
  const richSummary = richMatch ? richMatch[1].trim() : '';

  const openSection = text.split(/OPEN_THREADS:/i)[1]?.split(/RESOLVED_THREAD_IDS:/i)[0] || '';
  const openedThreads: NarrativeThreadRecord[] = [];
  for (const line of openSection.split('\n')) {
    const m = line.match(/^\s*[-•]\s*([^:]+):\s*(.+)$/);
    if (m) {
      const character = m[1].trim();
      const thread = m[2].trim();
      if (character && thread && thread.length > 3) {
        openedThreads.push({
          id: `t${chapterNumber}-${openedThreads.length}-${Math.random().toString(36).slice(2, 7)}`,
          character,
          thread,
          introducedInChapter: chapterNumber,
        });
      }
    }
  }

  const resolvedSection = (text.split(/RESOLVED_THREAD_IDS:/i)[1] || '')
    .split(/\n\s*(?:CHARACTER_STATE|ARTIFACT_STATE|FACTS|CONTRADICTIONS):/i)[0];
  const resolvedThreadIds: string[] = [];
  for (const line of resolvedSection.split('\n')) {
    const m = line.match(/^\s*[-•]\s*(\S+)/);
    if (m) resolvedThreadIds.push(m[1].trim());
  }

  return { summary, richSummary, openedThreads, resolvedThreadIds };
}

export interface AppliedExtraction {
  /** Merge into the chapter's aiIntentMetadata (a key set to undefined means delete it). */
  metaPatch: Record<string, unknown>;
  /** New canon entries to create (validated, not already in canon). */
  newCanon: NewCanonCandidate[];
  /** Meaningful memory changes vs the previous extraction, for flagging later chapters. */
  memoryChanges: { changes: string[]; subjects: string[] } | null;
  counts: Record<string, number>;
}

/**
 * Turn an extraction response into the metadata patch for the chapter.
 * @param sourceProse the prose that was sent to the extractor
 * @param latest      the chapter as it is now (to keep thread ids + dismissals stable)
 */
export function applyContinuityExtraction(
  text: string,
  sourceProse: string,
  latest: Chapter,
  canon: AnyCanonEntry[],
  now: string = new Date().toISOString(),
): AppliedExtraction | null {
  const chapterNumber = latest.number || 0;
  const parsed = parseContinuityResponse(text, chapterNumber);
  if (!parsed) return null;
  const memory = parseMemorySections(text, chapterNumber, canon);
  const previousMeta = memoryMeta(latest);
  const hadMemory = !!(previousMeta.characterState || previousMeta.facts || previousMeta.artifactState);

  // Keep thread ids stable across re-extraction so later chapters' resolved ids still match.
  const previousThreads = ((latest.aiIntentMetadata || {}) as ThreadMeta).openedThreads;
  const usedIds = new Set<string>();
  const openedThreads = parsed.openedThreads.map((t) => {
    const match = (previousThreads || []).find((p) =>
      !usedIds.has(p.id) &&
      p.character.trim().toLowerCase() === t.character.trim().toLowerCase() &&
      tokenOverlap(p.thread, t.thread) >= 0.5,
    );
    if (!match) return t;
    usedIds.add(match.id);
    return { ...t, id: match.id };
  });

  // Keep the author's dismissals when the same issue is found again.
  const dismissed = new Set((previousMeta.continuityIssues || []).filter((i) => i.dismissed).map((i) => i.id));
  const continuityIssues = memory.continuityIssues.map((i) => (dismissed.has(i.id) ? { ...i, dismissed: true } : i));

  const metaPatch: Record<string, unknown> & ChapterMemoryMeta = {
    summary: parsed.summary,
    richSummary: parsed.richSummary,
    openedThreads,
    resolvedThreadIds: parsed.resolvedThreadIds,
    characterState: memory.characterState,
    artifactState: memory.artifactState,
    facts: memory.facts,
    storyClock: memory.storyClock,
    knowledge: memory.knowledge,
    continuityIssues,
    continuitySourceHash: proseContentHash(sourceProse),
    continuitySourceSig: proseSignature(sourceProse),
    continuitySourceLength: stripProductionTags(sourceProse).trim().length,
    continuityExtractedAt: now,
    continuityVersion: CONTINUITY_VERSION,
    continuityStale: undefined,
  };

  let memoryChanges: AppliedExtraction['memoryChanges'] = null;
  if (hadMemory) {
    const diff = diffChapterMemory(previousMeta, memory);
    if (diff.changes.length) memoryChanges = diff;
  }

  return {
    metaPatch,
    newCanon: parseNewCanon(text, canon),
    memoryChanges,
    counts: {
      threads: openedThreads.length,
      resolved: parsed.resolvedThreadIds.length,
      characters: memory.characterState.length,
      artifacts: memory.artifactState.length,
      facts: memory.facts.length,
      secrets: memory.knowledge.length,
      contradictions: continuityIssues.length,
    },
  };
}

/**
 * Later written chapters that mention something whose memory changed get a
 * "Chapter N changed something this chapter relies on" notice.
 */
export function staleNoticeUpdates(
  source: Chapter,
  allChapters: Chapter[],
  memoryChanges: { changes: string[]; subjects: string[] },
  now: string = new Date().toISOString(),
): Array<{ chapterId: string; continuityStale: StaleNotice }> {
  const n = source.number || 0;
  const updates: Array<{ chapterId: string; continuityStale: StaleNotice }> = [];
  for (const c of sortChapters(allChapters)) {
    if ((c.number || 0) <= n || !c.prose?.trim()) continue;
    if (!proseMentionsAny(c.prose, memoryChanges.subjects)) continue;
    const prev = memoryMeta(c).continuityStale;
    const changes = prev && prev.fromChapter <= n
      ? Array.from(new Set([...prev.changes, ...memoryChanges.changes])).slice(-8)
      : memoryChanges.changes.slice(0, 8);
    updates.push({
      chapterId: c.id,
      continuityStale: { fromChapter: Math.min(prev?.fromChapter ?? Infinity, n), changes, at: now },
    });
  }
  return updates;
}

/** Issues list with one issue marked dismissed by the author. */
export function withIssueDismissed(chapter: Chapter, issueId: string): ChapterMemoryMeta['continuityIssues'] {
  return (memoryMeta(chapter).continuityIssues || []).map((i) => (i.id === issueId ? { ...i, dismissed: true } : i));
}
