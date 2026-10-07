// ========== Story Memory ==========
// Character / artifact state and established-fact memory across chapters.
//
// The post-generation `extract-continuity` pass stores, per chapter, what
// changed for each character and artifact plus the small concrete facts the
// prose established. This module folds those per-chapter records into "the
// world as of chapter N" and renders them as prompt sections, and owns canon
// selection + card rendering so every generation path sees the same picture.
//
// Pure functions only (no store / network imports) so the same logic can be
// ported to the mobile app, the way dialogue-targets.ts was.

import type { Chapter } from '../types';
import type { AnyCanonEntry, CharacterEntry, ArtifactEntry } from '../types/canon';
import { junkNameReason } from './canon-cleanup';
import { applyFactBook, meetingKey, timelineMatch, type BookFact } from './fact-book';

// ---------- Types ----------

export interface CharacterStateRecord {
  name: string;
  canonId?: string;
  location?: string;
  with?: string;
  mood?: string;
  learned?: string[];
  physical?: string;
  status?: string; // alive | dead | missing | captured | ...
  arc?: string;    // where the character is in their arc right now
  /** How they stand with others now: "Ezra: distrustful; Theo: protective". */
  relationships?: string;
  /** Other names and nicknames used for them on the page ("Wesley", "Store"). */
  called?: string[];
  /** What a condition stops them doing right now ("can't speak more than a few words"); "none" once it ends. */
  capacity?: string;
}

export interface ArtifactStateRecord {
  name: string;
  canonId?: string;
  holder?: string;
  location?: string;
  condition?: string;
}

export interface StoryFact {
  subject: string;
  canonId?: string;
  fact: string;
  chapter: number;
  /** Added or corrected by the author in Facts & Secrets. */
  byAuthor?: boolean;
}

/** When the chapter ends in story time. */
export interface StoryClockRecord {
  day?: string;     // "Day 3", "Tuesday, March 4", "the night of the festival"
  time?: string;    // "late evening"
  elapsed?: string; // how much time this chapter covered / skipped
  season?: string;  // "late autumn"
  weather?: string; // "heavy rain" at the chapter's end
}

/** Time-bound details: ages, deadlines, healing, and key dated events. */
export interface TimelineRecord {
  kind: 'age' | 'deadline' | 'healing' | 'date';
  /** Who or what it's about: a name (age, healing) or the deadline / event itself. */
  subject: string;
  canonId?: string;
  /** Age, injury, or what's due. */
  detail?: string;
  /** Story time: when it's due, when it happened, how long healing takes. */
  when?: string;
  /** deadline: open | met | missed. healing: healing | healed. */
  status?: string;
  chapter: number;
}

/** Two characters who have met, how they know each other, and what they call each other. */
export interface MeetingRecord {
  a: string;
  b: string;
  aId?: string;
  bId?: string;
  /** This chapter is the first time they meet. */
  first?: boolean;
  how?: string;
  /** What a calls b, and b calls a. */
  aCalls?: string;
  bCalls?: string;
  chapter: number;
}

/** A secret or key fact and who does / doesn't know it. */
export interface KnowledgeRecord {
  secret: string;
  knownBy: string[];
  hiddenFrom: string[];
  chapter: number; // chapter that last changed who knows it
}

export interface ContinuityIssue {
  id: string;
  severity: 'high' | 'medium' | 'low';
  quote: string;
  problem: string;
  fix: string;
  dismissed?: boolean;
}

export interface StaleNotice {
  fromChapter: number;
  changes: string[];
  at: string;
}

/** Fields the extract-continuity pass stores on chapter.aiIntentMetadata. */
export interface ChapterMemoryMeta {
  summary?: string;
  richSummary?: string;
  characterState?: CharacterStateRecord[];
  artifactState?: ArtifactStateRecord[];
  facts?: StoryFact[];
  storyClock?: StoryClockRecord;
  knowledge?: KnowledgeRecord[];
  timeline?: TimelineRecord[];
  meetings?: MeetingRecord[];
  continuityIssues?: ContinuityIssue[];
  continuitySourceHash?: string;
  continuitySourceSig?: number[];
  continuitySourceLength?: number;
  continuityExtractedAt?: string;
  /** Extraction format version; below CONTINUITY_VERSION means the chapter lacks newer memory (clock, knowledge). */
  continuityVersion?: number;
  continuityStale?: StaleNotice;
}

export interface FoldedCharacterState extends CharacterStateRecord {
  key: string;
  lastSeenChapter: number;
}

export interface FoldedArtifactState extends ArtifactStateRecord {
  key: string;
  lastSeenChapter: number;
}

export interface StoryStateAt {
  asOfChapter: number | null; // last chapter folded in
  characters: Map<string, FoldedCharacterState>;
  artifacts: Map<string, FoldedArtifactState>;
  facts: StoryFact[];
  /** Story time at the end of the latest chapter that recorded it. */
  clock?: StoryClockRecord & { chapter: number };
  /** Every tracked secret with who knows it, as of the last folded chapter. */
  knowledge: KnowledgeRecord[];
  /** The author's world facts (Facts & Secrets); true throughout the book. */
  worldFacts?: BookFact[];
  /** Ages, deadlines, healing and dated events, latest word on each. */
  timeline: TimelineRecord[];
  /** Every pair of characters who have met, with when they first met. */
  meetings: MeetingState[];
  /** Every chapter before this point was read with meeting tracking, so an unlisted pair has never met. */
  meetingsComplete: boolean;
}

export interface MeetingState extends MeetingRecord {
  key: string;
  firstChapter: number;
}

// ---------- Small helpers ----------

export function memoryMeta(chapter: Chapter): ChapterMemoryMeta {
  return (chapter.aiIntentMetadata || {}) as ChapterMemoryMeta;
}

function norm(s: string | undefined | null): string {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Remove production tags ([Speaker], [direction], {sfx:...}) so prose compares/reads cleanly. */
export function stripProductionTags(prose: string): string {
  return (prose || '')
    .replace(/\{sfx:[^}\n]{0,120}\}\s?/gi, '')
    .replace(/\[([^\]\n]{1,80})\]\s*(?=["“'])/g, '')
    .replace(/\[(?:[a-z][a-z ]{0,30})\]\s?/g, '') // lowercase direction tags like [sighs]
    .replace(/[ \t]+/g, ' ');
}

/** Stable hash of the story content of a chapter (tags + whitespace ignored). */
export function proseContentHash(prose: string): string {
  const text = stripProductionTags(prose).replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Compact MinHash signature of a chapter's word 3-shingles. Lets us tell a
 * real rewrite (re-extract memory) from a typo fix or attribution polish
 * (skip — extraction costs the author credits).
 */
export function proseSignature(prose: string, size = 48): number[] {
  const words = norm(stripProductionTags(prose)).split(' ').filter(Boolean);
  const sig = new Array<number>(size).fill(0xffffffff);
  for (let i = 0; i + 2 < words.length; i++) {
    const sh = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    let base = 2166136261;
    for (let j = 0; j < sh.length; j++) base = Math.imul(base ^ sh.charCodeAt(j), 16777619);
    for (let k = 0; k < size; k++) {
      const h = (Math.imul(base ^ (k * 0x9e3779b1), 2246822519) >>> 0) ^ (k * 374761393);
      const v = h >>> 0;
      if (v < sig[k]) sig[k] = v;
    }
  }
  return sig;
}

export function signatureSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}

/** Current extraction format: 2 adds the story clock and who-knows-what; 3 adds the timeline and who's met whom. */
export const CONTINUITY_VERSION = 3;

/** Written chapter whose memory predates the current extraction format. */
export function memoryOutdated(chapter: Chapter): boolean {
  return !!chapter.prose?.trim() && (memoryMeta(chapter).continuityVersion || 1) < CONTINUITY_VERSION;
}

/** Whether prose moved far enough from what memory was extracted from to re-extract. */
export function needsReextraction(meta: ChapterMemoryMeta, prose: string): boolean {
  if (!meta.continuitySourceHash) return true;
  if (meta.continuitySourceHash === proseContentHash(prose)) return false;
  const len = stripProductionTags(prose).trim().length;
  const prevLen = meta.continuitySourceLength || 0;
  if (Math.abs(len - prevLen) >= Math.max(400, prevLen * 0.04)) return true;
  return signatureSimilarity(meta.continuitySourceSig, proseSignature(prose)) < 0.85;
}

/**
 * Text sent to the extractor. Short chapters go whole; very long ones keep the
 * opening and the full ending — the ending state is the most important handoff.
 */
export function proseForExtraction(prose: string, maxChars = 60000): string {
  const text = stripProductionTags(prose).trim();
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars / 3);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[... middle of chapter omitted ...]\n\n${text.slice(-tail)}`;
}

// ---------- Placeholder detection ----------
// Older builds seeded every canon entry with generic defaults. They are not
// facts about the story and must never reach a prompt labelled "canon".

const PLACEHOLDER_STRINGS = new Set([
  'guarded but curious',
  'tends to be precise with words. uses metaphors from their background.',
  'self-critical but quietly hopeful. often argues with themselves.',
  'beginning of story',
  'a defining early experience',
  'shaped their core worldview',
  'using this system carries tradeoffs.',
  'usage has practical or narrative constraints.',
  'auto-detected from chapter prose.',
  'foundational rule inferred from planning context.',
  'initial event that launches the story arc.',
  'operational',
]);

const DEFAULT_TRAITS = ['determined', 'guarded', 'observant'];

export function isPlaceholderText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return true;
  if (/^\[AI will/i.test(v)) return true;
  if (/ begins the story\.\.\.$/.test(v)) return true;
  if (/ follows consistent operational principles\.$/.test(v)) return true;
  if (/ was established$/.test(v)) return true;
  if (/ has a distinct visual signature tied to the story world\.$/.test(v)) return true;
  return PLACEHOLDER_STRINGS.has(v.toLowerCase());
}

/** A character profile still carrying the old generic default personality. */
export function hasDefaultPersonality(c: CharacterEntry): boolean {
  const traits = (c.character?.personality?.traits || []).map((t) => t.toLowerCase());
  return traits.length === DEFAULT_TRAITS.length && DEFAULT_TRAITS.every((t) => traits.includes(t));
}

function real(value: unknown): string {
  if (typeof value !== 'string') return '';
  return isPlaceholderText(value) ? '' : value.trim();
}

function realList(values: unknown, isDefaultPersonality = false): string[] {
  if (!Array.isArray(values) || isDefaultPersonality) return [];
  return values.filter((v): v is string => typeof v === 'string' && !isPlaceholderText(v)).map((v) => v.trim());
}

// ---------- Name → canon resolution ----------

/** The type-specific data object of a canon entry (entry.character, entry.artifact, ...). */
function typeData(entry: AnyCanonEntry): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any -- schema varies by type
  return ((entry as unknown as Record<string, unknown>)[entry.type] || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function namesFor(entry: AnyCanonEntry): string[] {
  const names = [entry.name];
  const data = typeData(entry);
  if (data.fullName) names.push(data.fullName);
  for (const a of data.aliases || []) if (typeof a === 'string') names.push(a);
  return names.filter(Boolean);
}

/**
 * Resolve a free-text name ("Maya", "the brass key") to a canon entry.
 * Exact name/full name/alias first, then a unique first-token match for characters.
 */
export function resolveCanonEntry(
  name: string,
  entries: AnyCanonEntry[],
  types?: AnyCanonEntry['type'][],
): AnyCanonEntry | undefined {
  const target = norm(name).replace(/^(the|a|an) /, '');
  if (!target) return undefined;
  const pool = types ? entries.filter((e) => types.includes(e.type)) : entries;
  for (const e of pool) {
    if (namesFor(e).some((n) => norm(n).replace(/^(the|a|an) /, '') === target)) return e;
  }
  const first = target.split(' ')[0];
  if (first.length < 3) return undefined;
  const byToken = pool.filter((e) =>
    e.type === 'character' && namesFor(e).some((n) => norm(n).split(' ').includes(first)),
  );
  return byToken.length === 1 ? byToken[0] : undefined;
}

function entityKey(name: string, canonId?: string): string {
  return canonId ? `id:${canonId}` : `name:${norm(name)}`;
}

// ---------- Parsing the extractor's memory sections ----------

function section(text: string, header: string, nextHeaders: string[]): string {
  const re = new RegExp(`${header}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextHeaders.join('|')}):|$)`, 'i');
  return text.match(re)?.[1] || '';
}

function bulletLines(block: string): string[] {
  return block
    .split('\n')
    .map((l) => l.match(/^\s*[-•*]\s*(.+)$/)?.[1]?.trim())
    .filter((l): l is string => !!l && !/^\(?none\)?\.?$/i.test(l));
}

function pipeFields(line: string): { head: string; fields: Record<string, string> } {
  const [head, ...rest] = line.split('|').map((p) => p.trim());
  const fields: Record<string, string> = {};
  for (const part of rest) {
    const m = part.match(/^([a-z_ ]+):\s*(.*)$/i);
    if (m && m[2].trim() && !/^(n\/a|none|unknown|-|unchanged)$/i.test(m[2].trim())) {
      fields[m[1].trim().toLowerCase()] = m[2].trim();
    }
  }
  return { head, fields };
}

export const MEMORY_HEADERS = ['CHARACTER_STATE', 'ARTIFACT_STATE', 'FACTS', 'CONTRADICTIONS', 'STORY_CLOCK', 'KNOWLEDGE', 'TIMELINE', 'MEETINGS', 'NEW_CANON'];
const ALL_HEADERS = ['SHORT_SUMMARY', 'RICH_SUMMARY', 'OPEN_THREADS', 'RESOLVED_THREAD_IDS', ...MEMORY_HEADERS];

export interface ParsedMemory {
  characterState: CharacterStateRecord[];
  artifactState: ArtifactStateRecord[];
  facts: StoryFact[];
  continuityIssues: ContinuityIssue[];
  storyClock?: StoryClockRecord;
  knowledge: KnowledgeRecord[];
  timeline: TimelineRecord[];
  meetings: MeetingRecord[];
}

function nameList(v: string | undefined): string[] {
  if (!v || /^(no ?one|nobody|none)$/i.test(v.trim())) return [];
  return v.split(/[;,]|\band\b/).map((x) => x.trim()).filter(Boolean).slice(0, 12);
}

export function parseMemorySections(text: string, chapterNumber: number, canon: AnyCanonEntry[]): ParsedMemory {
  const others = (h: string) => ALL_HEADERS.filter((x) => x !== h);

  const characterState: CharacterStateRecord[] = [];
  for (const line of bulletLines(section(text, 'CHARACTER_STATE', others('CHARACTER_STATE')))) {
    const { head, fields } = pipeFields(line);
    if (!head) continue;
    const entry = resolveCanonEntry(head, canon, ['character']);
    const learned = fields.learned ? fields.learned.split(/;\s*/).map((s) => s.trim()).filter(Boolean) : undefined;
    characterState.push({
      name: entry?.name || head,
      canonId: entry?.id,
      location: fields.location,
      with: fields.with,
      mood: fields.mood,
      learned,
      physical: fields.physical,
      status: fields.status,
      arc: fields.arc,
      relationships: fields.relationships,
      capacity: fields.capacity,
      called: fields.called ? fields.called.split(/[;,]/).map((x) => x.replace(/\(.*?\)/g, '').trim().replace(/^["“']|["”']$/g, '').trim()).filter(Boolean).slice(0, 6) : undefined,
    });
  }

  const artifactState: ArtifactStateRecord[] = [];
  for (const line of bulletLines(section(text, 'ARTIFACT_STATE', others('ARTIFACT_STATE')))) {
    const { head, fields } = pipeFields(line);
    if (!head) continue;
    const entry = resolveCanonEntry(head, canon, ['artifact']);
    artifactState.push({
      name: entry?.name || head,
      canonId: entry?.id,
      holder: fields.holder,
      location: fields.location,
      condition: fields.condition,
    });
  }

  const facts: StoryFact[] = [];
  for (const line of bulletLines(section(text, 'FACTS', others('FACTS')))) {
    const m = line.match(/^([^:]{1,60}):\s*(.+)$/);
    if (!m) continue;
    const entry = resolveCanonEntry(m[1], canon);
    facts.push({ subject: entry?.name || m[1].trim(), canonId: entry?.id, fact: m[2].trim(), chapter: chapterNumber });
  }

  const continuityIssues: ContinuityIssue[] = [];
  for (const line of bulletLines(section(text, 'CONTRADICTIONS', others('CONTRADICTIONS')))) {
    const [sev, quote, problem, fix] = line.split('|').map((p) => p.trim());
    if (!problem) continue;
    const severity = /high/i.test(sev) ? 'high' : /low/i.test(sev) ? 'low' : 'medium';
    continuityIssues.push({
      id: `c${chapterNumber}-${continuityIssues.length}-${norm(problem).slice(0, 24).replace(/ /g, '-')}`,
      severity,
      quote: (quote || '').replace(/^["“]|["”]$/g, ''),
      problem,
      fix: fix || '',
    });
  }

  let storyClock: StoryClockRecord | undefined;
  const clockText = section(text, 'STORY_CLOCK', others('STORY_CLOCK')).trim();
  if (clockText) {
    const line = clockText.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).find(Boolean) || '';
    const { fields } = pipeFields(`clock | ${line}`);
    const clock: StoryClockRecord = { day: fields.day, time: fields.time, elapsed: fields.elapsed };
    if (fields.season) clock.season = fields.season;
    if (fields.weather) clock.weather = fields.weather;
    if (clock.day || clock.time || clock.elapsed) storyClock = clock;
  }

  const knowledge: KnowledgeRecord[] = [];
  for (const line of bulletLines(section(text, 'KNOWLEDGE', others('KNOWLEDGE')))) {
    const { head, fields } = pipeFields(line);
    if (!head || head.length < 4) continue;
    const knownBy = nameList(fields['known by']);
    const hiddenFrom = nameList(fields['hidden from'] || fields['not known by']);
    if (!knownBy.length && !hiddenFrom.length) continue;
    knowledge.push({ secret: head, knownBy, hiddenFrom, chapter: chapterNumber });
  }

  const timeline: TimelineRecord[] = [];
  for (const line of bulletLines(section(text, 'TIMELINE', others('TIMELINE')))) {
    const parts = line.split('|').map((p) => p.trim());
    const kind = parts[0]?.toLowerCase().replace(/s$/, '');
    if (kind !== 'age' && kind !== 'deadline' && kind !== 'healing' && kind !== 'date') continue;
    const subject = parts[1];
    if (!subject) continue;
    const { fields } = pipeFields(['x', ...parts.slice(2)].join(' | '));
    const bare = parts.slice(2).find((p) => !/^[a-z_ ]+:/i.test(p));
    const entry = kind === 'age' || kind === 'healing' ? resolveCanonEntry(subject, canon, ['character']) : null;
    const rec: TimelineRecord = {
      kind,
      subject: entry?.name || subject,
      canonId: entry?.id,
      detail: fields.age || fields.injury || fields.detail || fields.what || bare,
      when: fields.due || fields.when || fields.since || fields.expect || fields.heals,
      status: fields.status?.toLowerCase(),
      chapter: chapterNumber,
    };
    if (kind === 'healing' && fields.expect && fields.since) rec.when = `since ${fields.since}; heals in ${fields.expect}`;
    if (!rec.detail && !rec.when) continue;
    timeline.push(rec);
  }

  const meetings: MeetingRecord[] = [];
  for (const line of bulletLines(section(text, 'MEETINGS', others('MEETINGS')))) {
    const parts = line.split('|').map((p) => p.trim());
    const pair = parts[0]?.split(/\s*(?:\+|&|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    if (!pair || pair.length !== 2 || norm(pair[0]) === norm(pair[1])) continue;
    const [ea, eb] = pair.map((n) => resolveCanonEntry(n, canon, ['character']));
    const rec: MeetingRecord = { a: ea?.name || pair[0], b: eb?.name || pair[1], aId: ea?.id, bId: eb?.id, chapter: chapterNumber };
    for (const p of parts.slice(1)) {
      const calls = p.match(/^(.+?)\s+calls\s+(.+?):\s*(.+)$/i);
      if (calls) {
        const value = calls[3].trim().replace(/^["“']|["”']$/g, '');
        if (/^(n\/a|none|nothing|-)$/i.test(value)) continue;
        if (norm(calls[1]) === norm(pair[0]) || norm(calls[1]) === norm(rec.a)) rec.aCalls = value;
        else if (norm(calls[1]) === norm(pair[1]) || norm(calls[1]) === norm(rec.b)) rec.bCalls = value;
        continue;
      }
      const m = p.match(/^(first|how):\s*(.+)$/i);
      if (!m) continue;
      if (/^first$/i.test(m[1])) rec.first = /^(yes|true|y)\b/i.test(m[2].trim());
      else rec.how = m[2].trim();
    }
    meetings.push(rec);
  }

  return { characterState, artifactState, facts, continuityIssues, storyClock, knowledge, timeline, meetings };
}

/** Latest word wins per item; fields a later chapter leaves out carry over. */
export function mergeTimeline(prior: TimelineRecord[], next: TimelineRecord[]): TimelineRecord[] {
  const out = prior.map((t) => ({ ...t }));
  for (const t of next) {
    const i = out.findIndex((o) => timelineMatch(o, t));
    if (i < 0) out.push({ ...t });
    else out[i] = { ...out[i], ...Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== '')) } as TimelineRecord;
  }
  return out;
}


export interface NewCanonCandidate {
  type: 'character' | 'location' | 'artifact';
  name: string;
  description: string;
}

/**
 * New named characters, places and objects the extractor found in a chapter.
 * Names must pass the strict junk check and must not already be in canon
 * (by name, full name, alias or a unique first name).
 */
export function parseNewCanon(text: string, canon: AnyCanonEntry[]): NewCanonCandidate[] {
  const others = ALL_HEADERS.filter((x) => x !== 'NEW_CANON');
  const out: NewCanonCandidate[] = [];
  for (const line of bulletLines(section(text, 'NEW_CANON', others))) {
    const [rawType, rawName, ...rest] = line.split('|').map((p) => p.trim());
    const t = (rawType || '').toLowerCase();
    const type = /char|person/.test(t) ? 'character' : /loc|place/.test(t) ? 'location' : /obj|artifact|item/.test(t) ? 'artifact' : null;
    const name = (rawName || '').replace(/^["“']|["”']$/g, '').trim();
    if (!type || !name || junkNameReason(name)) continue;
    if (resolveCanonEntry(name, canon)) continue;
    if (out.some((o) => norm(o.name) === norm(name))) continue;
    out.push({ type, name, description: rest.join(' | ').trim() });
    if (out.length >= 8) break;
  }
  return out;
}

/** Merge a chapter's knowledge records into the running list: same secret → union who knows it. */
export function mergeKnowledge(prior: KnowledgeRecord[], next: KnowledgeRecord[]): KnowledgeRecord[] {
  const out = prior.map((k) => ({ ...k, knownBy: [...k.knownBy], hiddenFrom: [...k.hiddenFrom] }));
  for (const k of next) {
    const match = out.find((o) => tokenOverlap(o.secret, k.secret) >= 0.6);
    if (!match) {
      out.push({ ...k, knownBy: [...k.knownBy], hiddenFrom: [...k.hiddenFrom] });
      continue;
    }
    const known = new Map(match.knownBy.map((n) => [norm(n), n]));
    for (const n of k.knownBy) if (!known.has(norm(n))) known.set(norm(n), n);
    match.knownBy = [...known.values()];
    // Whoever knows it now is no longer kept in the dark.
    const hidden = new Map([...match.hiddenFrom, ...k.hiddenFrom].map((n) => [norm(n), n]));
    for (const key of known.keys()) hidden.delete(key);
    match.hiddenFrom = [...hidden.values()];
    match.secret = k.secret;
    match.chapter = k.chapter;
  }
  return out;
}

// ---------- Folding: the world as of a chapter ----------

/**
 * Fold per-chapter memory for every chapter strictly before `beforeChapterId`
 * (or all chapters when omitted). Later chapters win per field; learned items
 * and facts accumulate. Chapters without extracted memory are skipped.
 */
export function foldStoryState(allChapters: Chapter[], beforeChapterId?: string): StoryStateAt {
  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const idx = beforeChapterId ? sorted.findIndex((c) => c.id === beforeChapterId) : -1;
  const prior = idx >= 0 ? sorted.slice(0, idx) : sorted;

  const characters = new Map<string, FoldedCharacterState>();
  const artifacts = new Map<string, FoldedArtifactState>();
  const facts: StoryFact[] = [];
  const factKeys = new Set<string>();
  let asOfChapter: number | null = null;
  let clock: StoryStateAt['clock'];
  let knowledge: KnowledgeRecord[] = [];
  let timeline: TimelineRecord[] = [];
  const meetings = new Map<string, MeetingState>();
  let meetingsComplete = true;

  for (const ch of prior) {
    const meta = memoryMeta(ch);
    const n = ch.number || 0;
    if (meta.characterState || meta.artifactState || meta.facts) asOfChapter = n;
    if (meta.storyClock) clock = { ...meta.storyClock, chapter: n };
    if (meta.knowledge?.length) knowledge = mergeKnowledge(knowledge, meta.knowledge);
    if (meta.timeline?.length) timeline = mergeTimeline(timeline, meta.timeline);
    if (ch.prose?.trim() && (meta.continuityVersion || 1) < 3) meetingsComplete = false;
    for (const m of meta.meetings || []) {
      const key = meetingKey(m.a, m.b);
      const prev = meetings.get(key);
      // Keep a/b in the order first recorded so "calls" stays attached to the right person.
      const flipped = !!prev && norm(prev.a) !== norm(m.a);
      const aCalls = flipped ? m.bCalls : m.aCalls;
      const bCalls = flipped ? m.aCalls : m.bCalls;
      meetings.set(key, {
        ...(prev || m),
        key,
        how: m.how || prev?.how,
        aCalls: aCalls || prev?.aCalls,
        bCalls: bCalls || prev?.bCalls,
        chapter: n,
        firstChapter: prev ? Math.min(prev.firstChapter, n) : n,
      });
    }

    for (const s of meta.characterState || []) {
      const key = entityKey(s.name, s.canonId);
      const prev = characters.get(key);
      const learned = [...(prev?.learned || []), ...(s.learned || [])];
      const seen = new Set<string>();
      const dedupedLearned = learned.filter((l) => {
        const k = norm(l);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      characters.set(key, {
        ...prev,
        key,
        name: s.name || prev?.name || '',
        canonId: s.canonId || prev?.canonId,
        location: s.location || prev?.location,
        with: s.with || prev?.with,
        mood: s.mood || prev?.mood,
        physical: s.physical || prev?.physical,
        status: s.status || prev?.status,
        arc: s.arc || prev?.arc,
        relationships: s.relationships || prev?.relationships,
        // Latest word wins, including "none" when a condition has ended.
        capacity: s.capacity || prev?.capacity,
        learned: dedupedLearned.slice(-10),
        lastSeenChapter: n,
      });
    }

    for (const a of meta.artifactState || []) {
      const key = entityKey(a.name, a.canonId);
      const prev = artifacts.get(key);
      artifacts.set(key, {
        key,
        name: a.name || prev?.name || '',
        canonId: a.canonId || prev?.canonId,
        holder: a.holder || prev?.holder,
        location: a.location || prev?.location,
        condition: a.condition || prev?.condition,
        lastSeenChapter: n,
      });
    }

    for (const f of meta.facts || []) {
      const k = `${norm(f.subject)}::${norm(f.fact)}`;
      if (factKeys.has(k)) continue;
      factKeys.add(k);
      facts.push({ ...f, chapter: f.chapter || n });
    }
  }

  return { asOfChapter, characters, artifacts, facts, clock, knowledge, timeline, meetings: [...meetings.values()], meetingsComplete };
}

// ---------- Canon selection ----------

export interface CanonSelection {
  primaryChars: CharacterEntry[];
  secondaryChars: CharacterEntry[];
  locations: AnyCanonEntry[];
  artifacts: AnyCanonEntry[];
  others: AnyCanonEntry[];
  relevantNames: Set<string>; // normalized names of everything selected
}

/**
 * Pick the canon relevant to a chapter:
 *  - primary characters: in the premise, or already on the page in this chapter
 *  - secondary: on the page in the previous two chapters, or related to a primary
 *  - locations / artifacts / world elements: mentioned in the premise, referenced
 *    in this or the previous chapter, or held/occupied by a primary character
 * Falls back to protagonists/antagonists (never "everything") when nothing matches.
 */
export function selectRelevantCanon(
  entries: AnyCanonEntry[],
  chapter: Chapter,
  allChapters: Chapter[],
  state?: StoryStateAt,
): CanonSelection {
  const characters = entries.filter((e) => e.type === 'character') as CharacterEntry[];
  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const idx = sorted.findIndex((c) => c.id === chapter.id);
  const recent = idx > 0 ? sorted.slice(Math.max(0, idx - 2), idx) : [];

  const premiseNames = (chapter.premise?.characters || []).filter(Boolean);
  const primaryIds = new Set<string>();
  for (const n of premiseNames) {
    const hit = resolveCanonEntry(n, characters, ['character']);
    if (hit) primaryIds.add(hit.id);
  }
  const currentRefs = new Set(chapter.referencedCanonIds || []);
  for (const c of characters) if (currentRefs.has(c.id)) primaryIds.add(c.id);

  const recentRefs = new Set(recent.flatMap((c) => c.referencedCanonIds || []));
  const prevRefs = new Set((recent[recent.length - 1]?.referencedCanonIds) || []);
  for (const s of state?.characters.values() || []) {
    if (s.canonId && s.lastSeenChapter >= (recent[0]?.number ?? Infinity)) recentRefs.add(s.canonId);
  }

  let primaryChars = characters.filter((c) => primaryIds.has(c.id));
  if (primaryChars.length === 0) {
    primaryChars = characters.filter((c) => ['protagonist', 'antagonist'].includes(c.character?.role));
  }
  const pIds = new Set(primaryChars.map((c) => c.id));
  const secondaryChars = characters.filter((c) =>
    !pIds.has(c.id) && (
      recentRefs.has(c.id) ||
      (c.character?.relationships || []).some((r) => pIds.has(r.characterId)) ||
      primaryChars.some((p) => (p.character?.relationships || []).some((r) => r.characterId === c.id))
    ),
  );

  const premiseText = norm([
    chapter.premise?.purpose,
    chapter.premise?.changes,
    chapter.premise?.emotionalBeat,
    ...(chapter.premise?.constraints || []),
    ...(chapter.premise?.setupPayoff || []).flatMap((sp) => [sp.setup, sp.payoff]),
    ...(chapter.scenes || []).map((s) => s.summary),
  ].filter(Boolean).join(' '));
  const mentioned = (e: AnyCanonEntry) => namesFor(e).some((n) => {
    const k = norm(n);
    return k.length >= 3 && premiseText.includes(k);
  });
  const primaryNames = primaryChars.flatMap(namesFor).map(norm);
  const heldByPrimary = (value: string | undefined) => {
    const v = norm(value);
    return !!v && primaryNames.some((n) => n && v.includes(n));
  };

  const locations = entries.filter((e) => e.type === 'location' && (
    mentioned(e) || currentRefs.has(e.id) || prevRefs.has(e.id) ||
    primaryChars.some((c) => {
      const loc = norm(c.character?.storyState?.currentLocation);
      return !!loc && loc.includes(norm(e.name));
    }) ||
    [...(state?.characters.values() || [])].some((s) => s.canonId && pIds.has(s.canonId) && norm(s.location).includes(norm(e.name)))
  ));

  const artifacts = entries.filter((e) => {
    if (e.type !== 'artifact') return false;
    if (mentioned(e) || currentRefs.has(e.id) || prevRefs.has(e.id)) return true;
    const a = (e as ArtifactEntry).artifact;
    if (heldByPrimary(a?.history?.currentOwner)) return true;
    const folded = state?.artifacts.get(entityKey(e.name, e.id));
    return heldByPrimary(folded?.holder);
  });

  const others = entries.filter((e) =>
    !['character', 'location', 'artifact'].includes(e.type) &&
    !isPlaceholderText(e.description) &&
    (mentioned(e) || currentRefs.has(e.id) || prevRefs.has(e.id) ||
      (e.tags || []).some((t) => primaryNames.includes(norm(t))) ||
      (e.type === 'rule' && typeData(e).ruleType === 'immutable')),
  );

  const relevantNames = new Set(
    [...primaryChars, ...secondaryChars, ...locations, ...artifacts, ...others].flatMap(namesFor).map(norm).filter(Boolean),
  );
  return { primaryChars, secondaryChars, locations, artifacts, others, relevantNames };
}

// ---------- Canon cards ----------

function list(label: string, values: string[]): string | null {
  return values.length ? `${label}: ${values.join(', ')}` : null;
}

function field(label: string, value: unknown): string | null {
  const v = real(value);
  return v ? `${label}: ${v}` : null;
}

export interface CardOptions {
  chapterNumber?: number;
  totalChapters?: number;
  relevantNames?: Set<string>;
  state?: StoryStateAt;
}

export function renderCharacterCard(c: CharacterEntry, opts: CardOptions = {}): string {
  const ch = c.character || ({} as CharacterEntry['character']);
  const def = hasDefaultPersonality(c);
  const p = ch.personality || ({} as CharacterEntry['character']['personality']);
  const lines: (string | null)[] = [`### ${c.name}`];
  if (real(c.description)) lines.push(c.description.trim());
  if (ch.fullName && ch.fullName !== c.name) lines.push(`Full name: ${ch.fullName}`);
  lines.push(list('Also called', realList(ch.aliases)));
  lines.push(field('Pronouns', ch.pronouns));
  lines.push(def && ch.age === 'Early 30s' ? null : field('Age', ch.age));
  lines.push(field('Role', ch.role));
  lines.push(field('Occupation', ch.occupation));
  lines.push(field('Condition & limits', ch.condition));
  lines.push(field('Appearance', ch.appearance?.physical));
  lines.push(field('Distinguishing features', ch.appearance?.distinguishingFeatures));
  lines.push(field('Style', ch.appearance?.style));
  lines.push(list('Traits', realList(p.traits, def)));
  lines.push(list('Flaws', realList(p.flaws, def)));
  lines.push(list('Quirks', realList(p.quirks)));
  lines.push(field('Speech pattern', p.speechPattern));
  lines.push(field('Inner voice', p.innerVoice));

  const want = real(ch.arc?.wantVsNeed?.want);
  const need = real(ch.arc?.wantVsNeed?.need);
  if (want || need) lines.push(`Wants: ${want || '?'} / Needs: ${need || '?'}`);

  const secrets = realList(ch.background?.secrets);
  if (secrets.length) lines.push(`Secrets (hidden from other characters until revealed on the page): ${secrets.join('; ')}`);
  const knows = realList(ch.storyState?.knowledgeState);
  if (knows.length) lines.push(`Knows: ${knows.join('; ')}`);

  // Arc position: planned start/end + where the prose has actually taken them.
  const folded = opts.state?.characters.get(entityKey(c.name, c.id));
  const start = real(ch.arc?.startingState);
  const end = real(ch.arc?.endingState);
  const arcNow = folded?.arc || real(ch.arc?.currentState);
  if (start || end || arcNow) {
    const progress = opts.chapterNumber && opts.totalChapters
      ? ` (this is Ch.${opts.chapterNumber} of ${opts.totalChapters} — move them a step, don't jump to the end)`
      : '';
    lines.push(`Arc: ${[start && `starts: ${start}`, arcNow && `now: ${arcNow}`, end && `ends: ${end}`].filter(Boolean).join(' → ')}${progress}`);
  }

  // Static profile state only when the ledger hasn't recorded anything newer.
  if (!folded) {
    lines.push(field('Current location', ch.storyState?.currentLocation));
    lines.push(field('Emotional state', ch.storyState?.emotionalState));
  }
  if (ch.storyState && ch.storyState.alive === false) lines.push('⚠ STATUS: DEAD');

  const names = opts.relevantNames;
  const rels = (ch.relationships || []).filter((r) => !names || names.has(norm(r.characterName)));
  if (rels.length) {
    lines.push('Relationships:');
    for (const r of rels) lines.push(`  - ${r.characterName}: ${[r.type, real(r.currentState) || real(r.dynamic)].filter(Boolean).join(' — ')}`);
  }
  return lines.filter(Boolean).join('\n');
}

export function renderLightCharacter(c: CharacterEntry): string {
  const bits = [real(c.character?.pronouns), real(c.character?.role)].filter(Boolean).join(', ');
  const desc = real(c.description) || real(c.character?.appearance?.physical);
  const limit = real(c.character?.condition);
  return `- ${c.name}${bits ? ` (${bits})` : ''}${desc ? `: ${desc}` : ''}${limit ? ` | LIMITS: ${limit}` : ''}`;
}

export function renderWorldCard(e: AnyCanonEntry, state?: StoryStateAt): string {
  const lines: (string | null)[] = [`### ${e.name} (${e.type})`];
  if (real(e.description)) lines.push(e.description.trim());
  const d = typeData(e);
  switch (e.type) {
    case 'location':
      lines.push(field('Type', d.locationType));
      lines.push(field('Atmosphere', d.currentState?.atmosphere));
      lines.push(field('Condition', d.currentState?.condition));
      {
        const sd = d.currentState?.sensoryDetails || {};
        const sensory = [sd.sights, sd.sounds, sd.smells, sd.textures].map(real).filter(Boolean);
        if (sensory.length) lines.push(`Sensory: ${sensory.join('; ')}`);
      }
      lines.push(field('Access', d.storyRelevance?.accessRules));
      break;
    case 'artifact': {
      const folded = state?.artifacts.get(entityKey(e.name, e.id));
      lines.push(field('Kind', d.artifactType === 'object' ? '' : d.artifactType));
      lines.push(field('Looks like', d.physical?.appearance));
      lines.push(field('Marks', d.physical?.distinguishingMarks));
      lines.push(field('Material', d.physical?.material));
      lines.push(list('Can', realList(d.properties?.abilities)));
      lines.push(list('Cannot / limits', realList(d.properties?.limitations)));
      lines.push(field('Significance', d.storyRelevance?.significance));
      lines.push(field('Held by', folded?.holder || d.history?.currentOwner));
      lines.push(field('Where', folded?.location || d.history?.currentLocation));
      lines.push(field('Condition', folded?.condition || d.physical?.condition));
      break;
    }
    case 'system':
      lines.push(list('Principles', realList(d.rules?.corePrinciples)));
      lines.push(list('Limits', realList(d.rules?.limitations)));
      lines.push(field('Cost', d.rules?.costs));
      break;
    case 'rule':
      lines.push(field('Rule', d.statement));
      lines.push(field('If broken', d.consequences));
      lines.push(list('Exceptions', realList(d.exceptions)));
      lines.push(list('Known by', realList(d.knownBy)));
      if (d.hasBeenBroken) lines.push(field('Already broken by', d.brokenBy) || 'Already broken');
      break;
    case 'event':
      lines.push(field('When', d.date));
      lines.push(field('What happened', d.summary));
      lines.push(list('Consequences', realList(d.consequences)));
      lines.push(list('Known by', realList(d.storyConnection?.knownByCharacters)));
      break;
    case 'media':
      lines.push(field('Kind', d.mediaType));
      lines.push(field('By', d.creator));
      lines.push(field('Why it matters', d.significance));
      break;
  }
  return lines.filter(Boolean).join('\n');
}

// ---------- Prompt sections ----------

function isRelevant(name: string, canonId: string | undefined, sel: CanonSelection, ids: Set<string>): boolean {
  return (!!canonId && ids.has(canonId)) || sel.relevantNames.has(norm(name));
}

/**
 * CURRENT STATE + ESTABLISHED FACTS for the chapter being written, folded from
 * every earlier chapter. Empty string when no memory has been extracted yet.
 */
export function buildStoryMemoryBlock(
  allChapters: Chapter[],
  chapter: Chapter,
  sel: CanonSelection,
  state: StoryStateAt = foldStoryState(allChapters, chapter.id),
  opts: { maxFacts?: number; canonNames?: Set<string> } = {},
): string {
  // Every relevant fact counts; the cap only guards against a runaway list.
  const maxFacts = opts.maxFacts ?? 400;
  const ids = new Set([...sel.primaryChars, ...sel.secondaryChars, ...sel.locations, ...sel.artifacts, ...sel.others].map((e) => e.id));
  const sections: string[] = [];

  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const idx = sorted.findIndex((c) => c.id === chapter.id);
  const previousNumber = idx > 0 ? sorted[idx - 1].number : null;

  const charLines: string[] = [];
  for (const s of state.characters.values()) {
    const recentlyOnPage = previousNumber != null && s.lastSeenChapter === previousNumber;
    if (!isRelevant(s.name, s.canonId, sel, ids) && !recentlyOnPage) continue;
    const parts = [
      s.status && !/^alive$/i.test(s.status) ? `STATUS: ${s.status.toUpperCase()}` : null,
      s.location && `at ${s.location}`,
      s.with && `with ${s.with}`,
      s.mood && `mood: ${s.mood}`,
      s.physical && `physical: ${s.physical}`,
      s.capacity && !NO_LIMIT.test(s.capacity) && `can't: ${s.capacity}`,
      s.learned?.length ? `knows: ${s.learned.slice(-5).join('; ')}` : null,
      s.relationships && `relationships: ${s.relationships}`,
    ].filter(Boolean);
    if (parts.length) charLines.push(`- ${s.name} (last on page Ch.${s.lastSeenChapter}): ${parts.join(' | ')}`);
  }
  const artifactLines: string[] = [];
  for (const a of state.artifacts.values()) {
    if (!isRelevant(a.name, a.canonId, sel, ids) && !isRelevant(a.holder || '', undefined, sel, ids)) continue;
    const parts = [a.holder && `held by ${a.holder}`, a.location && `at ${a.location}`, a.condition && `condition: ${a.condition}`].filter(Boolean);
    if (parts.length) artifactLines.push(`- ${a.name} (as of Ch.${a.lastSeenChapter}): ${parts.join(' | ')}`);
  }
  if (charLines.length || artifactLines.length) {
    sections.push(
      `=== CURRENT STATE (as of the end of Ch.${state.asOfChapter}) — start from here; if something changes, show it happening ===\n` +
      [...charLines, ...(artifactLines.length ? ['Objects:', ...artifactLines] : [])].join('\n'),
    );
  }

  if (state.clock) {
    const c = state.clock;
    const when = [c.day, c.time].filter(Boolean).join(', ');
    sections.push(
      `=== STORY CLOCK ===\n` +
      `Ch.${c.chapter} ended${when ? `: ${when}` : ''}${c.elapsed ? ` (that chapter covered ${c.elapsed})` : ''}.\n` +
      (c.season || c.weather ? `${[c.season && `Season: ${c.season}`, c.weather && `weather at the end: ${c.weather}`].filter(Boolean).join('; ')}. Keep the season unless enough time passes to change it.\n` : '') +
      'Time only moves forward from here. When time passes between scenes, say how much; keep travel, healing and deadlines realistic.',
    );
  }

  if (state.worldFacts?.length) {
    sections.push(
      `=== WORLD FACTS (true throughout this book — never contradict) ===\n` +
      state.worldFacts.map((f) => `- ${f.subject && !/^world$/i.test(f.subject) ? `${f.subject}: ` : ''}${f.fact}`).join('\n'),
    );
  }

  const timeline = buildTimelineLines(state, (name, id) => isRelevant(name, id, sel, ids));
  if (timeline.length) {
    sections.push(
      `=== TIMELINE — keep ages, deadlines and healing consistent with the story clock ===\n${timeline.join('\n')}\n` +
      'Ages change only when enough story time passes. Deadlines count down from the story clock; a missed one has consequences. Injuries heal at a realistic pace unless shown otherwise.',
    );
  }

  const inChapter = (name: string, id?: string) => isRelevant(name, id, sel, ids);
  const pairs = state.meetings.filter((m) => inChapter(m.a, m.aId) || inChapter(m.b, m.bId));
  if (pairs.length || (state.meetingsComplete && state.meetings.length)) {
    sections.push(
      `=== WHO HAS MET WHOM ===\n${pairs.slice(-80).map(meetingLine).join('\n') || '(none of this chapter\'s characters have met anyone on the page yet)'}\n` +
      (state.meetingsComplete
        ? 'Characters in this chapter who are not paired above have NEVER met on the page. Unless their profiles or relationships say they already know each other, a meeting between them now is a first meeting: they don\'t know each other\'s face or name unless told. Pairs above never meet "for the first time" again.'
        : 'Pairs above have already met: never write them meeting for the first time again, and keep what they call each other.'),
    );
  }

  if (state.knowledge.length) {
    const lines = state.knowledge.slice(-200).map((k) =>
      `- ${k.secret} | known by: ${k.knownBy.join(', ') || 'no one yet'}${k.hiddenFrom.length ? ` | NOT known by: ${k.hiddenFrom.join(', ')}` : ''}`,
    );
    sections.push(
      `=== WHO KNOWS WHAT — characters act and speak only from what they know ===\n${lines.join('\n')}\n` +
      'A character who does not know something must not refer to it or act on it. If someone learns it in this chapter, show the moment they learn it.',
    );
  }

  // Facts about who and what is in this chapter, the author's own, and general
  // facts not about any one canon entry ("the town", "the war") all go in.
  const general = (f: StoryFact) => !!opts.canonNames && !f.canonId && !opts.canonNames.has(norm(f.subject));
  const relevantFacts = state.facts.filter((f) => f.byAuthor || general(f) || isRelevant(f.subject, f.canonId, sel, ids));
  const factPool = relevantFacts.length ? relevantFacts : state.facts;
  const facts = factPool.slice(-maxFacts);
  if (facts.length) {
    sections.push(
      `=== ESTABLISHED FACTS (already on the page — never contradict; reuse these exact details) ===\n` +
      facts.map((f) => `- ${f.subject}: ${f.fact}${f.chapter ? ` [Ch.${f.chapter}]` : ''}`).join('\n'),
    );
  }

  return sections.join('\n\n');
}

/** Everything the extractor needs to check a chapter against what came before it. */
export function buildPriorMemoryForCheck(state: StoryStateAt, maxFacts = 400): string {
  const lines: string[] = [];
  for (const s of state.characters.values()) {
    const parts = [s.status, s.location && `at ${s.location}`, s.physical && `physical: ${s.physical}`, s.capacity && !NO_LIMIT.test(s.capacity) && `can't: ${s.capacity}`, s.learned?.length ? `knows: ${s.learned.join('; ')}` : null].filter(Boolean);
    if (parts.length) lines.push(`- ${s.name}: ${parts.join(' | ')}`);
  }
  for (const a of state.artifacts.values()) {
    const parts = [a.holder && `held by ${a.holder}`, a.location && `at ${a.location}`, a.condition].filter(Boolean);
    if (parts.length) lines.push(`- ${a.name}: ${parts.join(' | ')}`);
  }
  for (const f of state.worldFacts || []) lines.push(`- WORLD: ${f.subject && !/^world$/i.test(f.subject) ? `${f.subject}: ` : ''}${f.fact}`);
  for (const f of state.facts.slice(-maxFacts)) lines.push(`- ${f.subject}: ${f.fact}${f.chapter ? ` [Ch.${f.chapter}]` : ''}`);
  if (state.clock) {
    const c = state.clock;
    lines.push(`- STORY CLOCK: Ch.${c.chapter} ended ${[c.day, c.time].filter(Boolean).join(', ') || '(unknown)'}`);
  }
  for (const t of buildTimelineLines(state)) lines.push(`- TIMELINE: ${t.replace(/^- /, '')}`);
  for (const m of state.meetings.slice(-150)) lines.push(`- MET: ${meetingLine(m).replace(/^- /, '')}`);
  for (const k of state.knowledge.slice(-200)) {
    lines.push(`- SECRET: ${k.secret} | known by: ${k.knownBy.join(', ') || 'no one'}${k.hiddenFrom.length ? ` | NOT known by: ${k.hiddenFrom.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}

/** "- Mara & Jonah — met Ch.1 (siblings); Mara calls Jonah "Jo"" */
export function meetingLine(m: MeetingState): string {
  const calls = [m.aCalls && `${m.a} calls ${m.b} "${m.aCalls}"`, m.bCalls && `${m.b} calls ${m.a} "${m.bCalls}"`].filter(Boolean).join('; ');
  return `- ${m.a} & ${m.b} — met${m.firstChapter ? ` Ch.${m.firstChapter}` : ' before the story'}${m.how ? ` (${m.how})` : ''}${calls ? `; ${calls}` : ''}`;
}

/** Ages, open deadlines, ongoing healing and key dates as prompt lines; `keep` limits ages and healing to who's in the chapter. */
export function buildTimelineLines(state: StoryStateAt, keep?: (name: string, id?: string) => boolean): string[] {
  const out: string[] = [];
  for (const t of state.timeline) {
    if (t.kind === 'age') {
      if (keep && !keep(t.subject, t.canonId)) continue;
      out.push(`- ${t.subject} is ${t.detail || '?'}${/\d/.test(t.detail || '') && !/old|year/i.test(t.detail || '') ? ' years old' : ''}${t.when ? ` (${t.when})` : ''} [as of Ch.${t.chapter}]`);
    } else if (t.kind === 'deadline') {
      const status = t.status && t.status !== 'open' ? ` — ${t.status.toUpperCase()}` : '';
      if (status && keep) continue; // settled deadlines only matter to the checker
      out.push(`- DEADLINE: ${t.subject}${t.detail && t.detail !== t.subject ? ` (${t.detail})` : ''}${t.when ? ` — due ${t.when}` : ''}${status} [set Ch.${t.chapter}]`);
    } else if (t.kind === 'healing') {
      if (/healed|recovered|none/i.test(t.status || '') && keep) continue;
      if (keep && !keep(t.subject, t.canonId)) continue;
      out.push(`- ${t.subject}: ${t.detail || 'injury'}${t.when ? ` — ${t.when}` : ''}${t.status ? ` (${t.status})` : ''} [Ch.${t.chapter}]`);
    } else {
      out.push(`- ${t.subject}${t.detail ? `: ${t.detail}` : ''}${t.when ? ` — ${t.when}` : ''}`);
    }
  }
  return out.slice(-120);
}

// ---------- Condition & limits ----------

const NO_LIMIT = /^(none|no longer|n\/a|recovered|fully|normal|unlimited)\b/i;

/**
 * What a character can't do right now: the page's latest word on it (which
 * can lift it — "none now"), else the condition set in canon. Null if none.
 */
export function currentLimit(entry: CharacterEntry | undefined, folded: FoldedCharacterState | undefined): string | null {
  const fromPage = folded?.capacity?.trim();
  if (fromPage) return NO_LIMIT.test(fromPage) ? null : fromPage;
  const fromCanon = real(entry?.character?.condition);
  return fromCanon || null;
}

/**
 * Hard limits for the characters in play — always included, even when full
 * canon cards are off, because writing past them breaks the story (a patient
 * who can barely speak holding a long conversation).
 */
export function buildLimitsBlock(sel: CanonSelection, state: StoryStateAt): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const c of [...sel.primaryChars, ...sel.secondaryChars]) {
    const folded = state.characters.get(entityKey(c.name, c.id));
    const limit = currentLimit(c, folded);
    seen.add(norm(c.name));
    if (limit) lines.push(`- ${c.name}: ${limit}`);
  }
  for (const s of state.characters.values()) {
    if (seen.has(norm(s.name)) || !sel.relevantNames.has(norm(s.name))) continue;
    const limit = currentLimit(undefined, s);
    if (limit) lines.push(`- ${s.name}: ${limit}`);
  }
  if (!lines.length) return '';
  return `=== WHAT CHARACTERS CAN AND CAN'T DO (hard limits — never write past them) ===
${lines.join('\n')}
Keep every line, action and thought within these limits: someone who can barely speak gets a word or a gesture, not a conversation; someone bedridden doesn't cross the room. Let the scene work around the limit (others fill the silence, read their face, speak for them). If a limit changes in this chapter, show it happening and why.`;
}

// ---------- Canon + memory prompt block ----------

export function buildCanonContext(entries: AnyCanonEntry[], chapter: Chapter, allChapters: Chapter[], state?: StoryStateAt): string {
  if (entries.length === 0) return '';
  const sel = selectRelevantCanon(entries, chapter, allChapters, state);
  const sorted = [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const chapterNumber = sorted.findIndex((c) => c.id === chapter.id) + 1 || undefined;
  const cardOpts = { chapterNumber, totalChapters: sorted.length || undefined, relevantNames: sel.relevantNames, state };

  const sections: string[] = ['=== CANON (established facts — do not contradict) ==='];

  if (sel.primaryChars.length > 0) {
    sections.push('\n## Characters');
    for (const c of sel.primaryChars) sections.push(renderCharacterCard(c, cardOpts));
  }
  if (sel.secondaryChars.length > 0) {
    sections.push('\n## Also In The Story (recently on the page or connected — keep consistent if they appear)');
    for (const c of sel.secondaryChars) sections.push(renderLightCharacter(c));
  }
  if (sel.locations.length > 0) {
    sections.push('\n## Locations');
    for (const l of sel.locations) sections.push(renderWorldCard(l, state));
  }
  if (sel.artifacts.length > 0) {
    sections.push('\n## Objects & Artifacts');
    for (const a of sel.artifacts) sections.push(renderWorldCard(a, state));
  }
  if (sel.others.length > 0) {
    sections.push('\n## World Rules & Elements');
    for (const e of sel.others) sections.push(renderWorldCard(e, state));
  }

  return sections.length > 1 ? sections.join('\n') : '';
}

/** Canon cards (when enabled) + CURRENT STATE / ESTABLISHED FACTS memory for a chapter. */
export function buildCanonAndMemory(
  entries: AnyCanonEntry[],
  chapter: Chapter,
  allChapters: Chapter[],
  includeCanon: boolean,
  /** The project's Facts & Secrets book. */
  factBook?: unknown,
): string {
  const state = applyFactBook(foldStoryState(allChapters, chapter.id), factBook, chapter.number || Infinity);
  const parts: string[] = [];
  if (includeCanon && entries.length > 0) {
    const canon = buildCanonContext(entries, chapter, allChapters, state);
    if (canon) parts.push(canon);
  }
  const sel = selectRelevantCanon(entries, chapter, allChapters, state);
  const limits = buildLimitsBlock(sel, state);
  if (limits) parts.push(limits);
  const canonNames = new Set(entries.flatMap((e) => [e.name, ...(e.type === 'character' ? (e as CharacterEntry).character?.aliases || [] : [])]).map(norm));
  const memory = buildStoryMemoryBlock(allChapters, chapter, sel, state, { canonNames });
  if (memory) parts.push(memory);
  return parts.join('\n\n');
}

// ---------- Staleness ----------

export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(norm(a).split(' ').filter((t) => t.length > 2));
  const tb = new Set(norm(b).split(' ').filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

/**
 * Meaningful memory changes between two extractions of the same chapter:
 * facts that no longer hold, and changed object holders / character status.
 * Ignores rewording noise so re-extraction doesn't flag everything downstream.
 */
export function diffChapterMemory(prev: ChapterMemoryMeta, next: ChapterMemoryMeta): { changes: string[]; subjects: string[] } {
  const changes: string[] = [];
  const subjects = new Set<string>();

  for (const f of prev.facts || []) {
    const stillThere = (next.facts || []).some((n) => norm(n.subject) === norm(f.subject) && tokenOverlap(n.fact, f.fact) >= 0.6);
    if (!stillThere) {
      changes.push(`No longer true: ${f.subject}: ${f.fact}`);
      subjects.add(f.subject);
    }
  }
  const nextArtifacts = new Map((next.artifactState || []).map((a) => [norm(a.name), a]));
  for (const a of prev.artifactState || []) {
    const n = nextArtifacts.get(norm(a.name));
    if (n && a.holder && n.holder && tokenOverlap(a.holder, n.holder) < 0.5) {
      changes.push(`${a.name} now held by ${n.holder} (was ${a.holder})`);
      subjects.add(a.name);
    }
  }
  const nextChars = new Map((next.characterState || []).map((c) => [norm(c.name), c]));
  for (const c of prev.characterState || []) {
    const n = nextChars.get(norm(c.name));
    if (n && c.status && n.status && norm(c.status) !== norm(n.status)) {
      changes.push(`${c.name} is now ${n.status} (was ${c.status})`);
      subjects.add(c.name);
    }
  }
  return { changes, subjects: [...subjects] };
}

/** Does this chapter's prose mention any of the given subjects? */
export function proseMentionsAny(prose: string, subjects: string[]): boolean {
  const text = norm(prose);
  return subjects.some((s) => {
    const k = norm(s).replace(/^(the|a|an) /, '');
    const first = k.split(' ')[0];
    return (k.length >= 3 && text.includes(k)) || (first.length >= 4 && text.includes(first));
  });
}

// ---------- Lookups for UI ----------

export function characterStateFor(state: StoryStateAt, entry: AnyCanonEntry): FoldedCharacterState | undefined {
  return state.characters.get(entityKey(entry.name, entry.id))
    ?? [...state.characters.values()].find((s) => !s.canonId && namesFor(entry).some((n) => norm(n) === norm(s.name)));
}

export function artifactStateFor(state: StoryStateAt, entry: AnyCanonEntry): FoldedArtifactState | undefined {
  return state.artifacts.get(entityKey(entry.name, entry.id))
    ?? [...state.artifacts.values()].find((s) => !s.canonId && namesFor(entry).some((n) => norm(n) === norm(s.name)));
}

/** Secrets this character knows, and ones kept from them. */
export function knowledgeFor(state: StoryStateAt, entry: AnyCanonEntry): { knows: KnowledgeRecord[]; doesNotKnow: KnowledgeRecord[] } {
  const names = [entry.name, ...((entry as CharacterEntry).character?.aliases || [])].map(norm).filter(Boolean);
  const first = norm(entry.name).split(' ')[0];
  const isMe = (n: string) => {
    const x = norm(n);
    return names.includes(x) || (!!first && first.length > 2 && x === first);
  };
  return {
    knows: state.knowledge.filter((k) => k.knownBy.some(isMe)),
    doesNotKnow: state.knowledge.filter((k) => k.hiddenFrom.some(isMe) && !k.knownBy.some(isMe)),
  };
}

export interface CharacterTimelineEntry {
  chapter: number;
  arc?: string;
  mood?: string;
  relationships?: string;
  learned?: string[];
}

/** How a character developed, chapter by chapter, from the extracted memory. */
export function characterTimeline(allChapters: Chapter[], entry: AnyCanonEntry): CharacterTimelineEntry[] {
  const out: CharacterTimelineEntry[] = [];
  for (const ch of [...allChapters].sort((a, b) => (a.number || 0) - (b.number || 0))) {
    const s = (memoryMeta(ch).characterState || []).find((c) =>
      (c.canonId && c.canonId === entry.id) || resolveCanonEntry(c.name, [entry]) === entry);
    if (!s || !(s.arc || s.mood || s.relationships || s.learned?.length)) continue;
    out.push({ chapter: ch.number || 0, arc: s.arc, mood: s.mood, relationships: s.relationships, learned: s.learned });
  }
  return out;
}

export function factsFor(state: StoryStateAt, entry: AnyCanonEntry): StoryFact[] {
  const names = new Set(namesFor(entry).map(norm));
  return state.facts.filter((f) => f.canonId === entry.id || names.has(norm(f.subject)));
}
