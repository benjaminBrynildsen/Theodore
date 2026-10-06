// ========== Story chat ==========
// A book-level editing conversation. The author talks through a direction
// ("Danny should be the one who betrays Wes"); Theodore answers with a
// concrete take, then drafts the changes as a list of proposals against the
// thread map, the character & object map and the chapter outlines. Nothing
// changes until the author accepts proposals, like tracked changes.
//
// Pure — portable to the mobile app.

import type { Chapter, PremiseCard, Project } from '../types';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import {
  normalizeThread, type StoryThread, type ThreadPlan,
} from './story-threads';
import {
  normalizeArtifactJourney, normalizeCharacterArc, type ArcPlan, type ArtifactJourney, type CharacterArc,
} from './story-arcs';

export interface StoryChatMessage {
  role: 'user' | 'assistant';
  content: string;
  at: string;
}

export type StoryChangeKind = 'thread' | 'character' | 'object' | 'chapter';
export type StoryChangeOp = 'add' | 'update' | 'remove';

export interface StoryChange {
  id: string;
  kind: StoryChangeKind;
  op: StoryChangeOp;
  /** Written chapters whose part in this plan is reinterpreted (their prose stays as it is). */
  reinterprets?: number[];
  /** What it is: thread title, character or object name, or "Ch 7: Title". */
  label: string;
  why?: string;
  before?: string;
  after?: string;
  /** Chapters whose plan this change touches. */
  chapters: number[];
  thread?: StoryThread;
  arc?: CharacterArc;
  artifact?: ArtifactJourney;
  targetId?: string;
  chapterNumber?: number;
  premise?: Partial<Pick<PremiseCard, 'purpose' | 'changes' | 'emotionalBeat'>>;
}

export interface StoryChangeSet {
  summary: string;
  changes: StoryChange[];
  /** Fingerprint of the plans the proposals were drafted against. */
  basis: string;
  /** The reply was cut off; `changes` holds the ones that arrived complete. */
  truncated: boolean;
  /** Proposals set aside because they would change written chapters. */
  setAside: string[];
}

export interface StoryChatOptions {
  /** Written chapters are canon: the plan may give them new meaning, never new events. */
  canonLocked: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted model JSON, coerced field by field
type RawJson = any;

const sortChapters = (chapters: Chapter[]) => [...chapters].sort((a, b) => (a.number || 0) - (b.number || 0));

function chapterLine(c: Chapter): string {
  const meta = (c.aiIntentMetadata || {}) as { summary?: string; richSummary?: string };
  const written = !!c.prose?.trim();
  const body = written
    ? meta.richSummary || meta.summary || c.premise?.purpose || ''
    : [c.premise?.purpose, c.premise?.changes && `changes: ${c.premise.changes}`, c.premise?.emotionalBeat && `beat: ${c.premise.emotionalBeat}`].filter(Boolean).join(' | ');
  return `Ch ${c.number} "${c.title}" [${written ? 'WRITTEN' : 'PLANNED'}]: ${body || '(no outline)'}`;
}

// ---------- Describing plans (for prompts and before/after) ----------

export function describeThread(t: StoryThread): string {
  const beats = t.beats.map((b) => `Ch${b.chapter} ${b.type}${b.note ? `: ${b.note}` : ''}`).join('; ');
  return `${t.title} (${t.tier}${t.kind !== 'plot' ? `, ${t.kind}` : ''}) — ${t.question}${t.resolution ? ` → ${t.resolution}` : ''}${t.characters.length ? ` [${t.characters.join(', ')}]` : ''}. ${beats}`;
}

export function describeArc(a: CharacterArc): string {
  const beats = a.beats.map((b) => `Ch${b.chapter} ${b.type}${b.note ? `: ${b.note}` : ''}`).join('; ');
  const fields = [
    a.want && `wants ${a.want}`, a.need && `needs ${a.need}`, a.flaw && `flaw: ${a.flaw}`,
    a.startState && `starts: ${a.startState}`, a.endState && `ends: ${a.endState}`, a.limits && `limits: ${a.limits}`,
  ].filter(Boolean).join('; ');
  return `${a.name} (${a.role}, ${a.shape} arc) — ${fields}. Introduced Ch${a.introducedIn}. ${beats}`;
}

export function describeArtifact(a: ArtifactJourney): string {
  const beats = a.beats.map((b) => `Ch${b.chapter} ${b.type}${b.note ? `: ${b.note}` : ''}${b.holder ? ` (held by ${b.holder})` : ''}`).join('; ');
  return `${a.name} — ${a.description}${a.significance ? `; means: ${a.significance}` : ''}. ${beats}`;
}

function describePremise(p: Partial<PremiseCard> | undefined): string {
  return [p?.purpose, p?.changes && `Changes: ${p.changes}`, p?.emotionalBeat && `Beat: ${p.emotionalBeat}`].filter(Boolean).join(' · ') || '(no outline)';
}

/** Everything the chat knows about the book, compact, with ids to refer back to. */
export function buildStoryContext(args: { project: Project; chapters: Chapter[]; canon: AnyCanonEntry[] }): string {
  const { project, canon } = args;
  const chapters = sortChapters(args.chapters);
  const parts: string[] = [`BOOK: "${project.title}"${project.narrativeControls?.genreEmphasis?.length ? ` (${project.narrativeControls.genreEmphasis.join(', ')})` : ''} — ${chapters.length} chapters.`];
  if (project.synopsis?.logline) parts.push(`LOGLINE: ${project.synopsis.logline}`);
  parts.push(`CHAPTERS:\n${chapters.map(chapterLine).join('\n')}`);

  const threads = project.threadPlan?.threads || [];
  if (threads.length) parts.push(`THREAD MAP:\n${threads.map((t) => `- [${t.id}] ${describeThread(t)}`).join('\n')}`);
  const arcs = project.arcPlan?.characters || [];
  if (arcs.length) parts.push(`CHARACTER ARCS:\n${arcs.map((a) => `- [${a.id}] ${describeArc(a)}`).join('\n')}`);
  const objects = project.arcPlan?.artifacts || [];
  if (objects.length) parts.push(`OBJECT JOURNEYS:\n${objects.map((a) => `- [${a.id}] ${describeArtifact(a)}`).join('\n')}`);
  const cast = project.arcPlan?.cast || [];
  if (cast.length) parts.push(`SUPPORTING CAST:\n${cast.map((m) => `- ${m.name}: ${m.who}${m.limits ? ` | limits: ${m.limits}` : ''}`).join('\n')}`);

  const people = canon
    .filter((e): e is CharacterEntry => e.type === 'character' && e.character?.role !== 'mentioned')
    .slice(0, 25)
    .map((e) => `- ${e.name} (${e.character?.role || 'character'})${e.description ? `: ${e.description.slice(0, 140)}` : ''}${e.character?.condition ? ` | limits: ${e.character.condition}` : ''}`);
  if (people.length) parts.push(`CHARACTERS:\n${people.join('\n')}`);
  return parts.join('\n\n');
}

/** Changes whenever the thread map, the arc map or any chapter outline changes. */
export function storyBasis(project: Project, chapters: Chapter[]): string {
  const src = [
    project.threadPlan?.generatedAt || '', JSON.stringify(project.threadPlan?.threads || []).length,
    project.arcPlan?.generatedAt || '', JSON.stringify(project.arcPlan || {}).length,
    ...sortChapters(chapters).map((c) => `${c.number}|${c.premise?.purpose || ''}|${c.premise?.changes || ''}|${c.premise?.emotionalBeat || ''}`),
  ].join('\n');
  let h = 5381;
  for (const ch of src) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

// ---------- Prompts ----------

const CANON_RULE = `WRITTEN CHAPTERS ARE CANON. Never change what happens in a chapter marked [WRITTEN]. A new direction works the way a plot twist does: it gives moments already on the page a new meaning. Point to the written details that can be re-read in the new light (what was planted, misdirected or left ambiguous), and land the new meaning in chapters not written yet. The twist must be fair: consistent with every written scene, so a reader who rereads finds it was there all along.`;

export function buildStoryChatSystem(opts: StoryChatOptions): string {
  return `You are Theodore, the author's story editor for the whole book — a sharp, warm collaborator, like a good developmental editor.
RULES:
- Answer in 2-5 sentences of plain prose. No lists, no headings.
- Build on what the book already has: name the specific threads, characters, objects and chapters you'd change, and how.
- Say plainly when an idea creates a problem (a reveal that comes too early, a thread left hanging, a written chapter that contradicts it) and suggest a fix.
- If the direction is unclear, ask one focused question instead of guessing.
- Don't draft the changes yet — end by offering to draft them ("Want me to draft those changes?") once the direction is clear.
${opts.canonLocked ? `- ${CANON_RULE} If the direction can only work by changing a written chapter, say so and offer the closest version that doesn't.` : '- Written chapters can be changed if the direction needs it; say which ones would need rebuilding.'}`;
}

/** Default (canon locked) system prompt. */
export const STORY_CHAT_SYSTEM = buildStoryChatSystem({ canonLocked: true });

function conversation(messages: StoryChatMessage[]): string {
  return messages.slice(-12).map((m) => `${m.role === 'user' ? 'AUTHOR' : 'THEODORE'}: ${m.content}`).join('\n\n');
}

export function buildStoryChatPrompt(context: string, messages: StoryChatMessage[]): string {
  return `${context}\n\nCONVERSATION:\n${conversation(messages)}\n\nReply to the author's last message.`;
}

export function buildStoryChangesPrompt(
  context: string,
  messages: StoryChatMessage[],
  plans: { threadPlan?: ThreadPlan | null; arcPlan?: ArcPlan | null },
  opts: StoryChatOptions & { alreadyDrafted?: string[] } = { canonLocked: true },
): string {
  const currentJson = JSON.stringify({
    threads: (plans.threadPlan?.threads || []).map((t) => ({ id: t.id, title: t.title, tier: t.tier, kind: t.kind, question: t.question, resolution: t.resolution, characters: t.characters, beats: t.beats })),
    characters: (plans.arcPlan?.characters || []).map((a) => ({ id: a.id, name: a.name, role: a.role, shape: a.shape, want: a.want, need: a.need, flaw: a.flaw, start: a.startState, end: a.endState, limits: a.limits || '', introduce: { chapter: a.introducedIn, note: a.introduction || '' }, beats: a.beats })),
    objects: (plans.arcPlan?.artifacts || []).map((a) => ({ id: a.id, name: a.name, description: a.description, significance: a.significance, beats: a.beats })),
  });
  return `${context}

CURRENT PLANS AS JSON (ids to refer to):
${currentJson}

CONVERSATION:
${conversation(messages)}

Draft the changes the author and you agreed on in this conversation — only those, nothing extra.${opts.alreadyDrafted?.length ? ` These were already drafted; do NOT repeat them, draft only what is left: ${opts.alreadyDrafted.join('; ')}.` : ''}
${opts.canonLocked ? `\n${CANON_RULE}\nSo: never change the outline of a [WRITTEN] chapter, and never remove or move a beat that sits in a [WRITTEN] chapter. You MAY re-describe a written-chapter beat (new type or note) to give it its new meaning, or add a "hint" beat in a written chapter that points to something already on the page. New events go in chapters not written yet.\n` : ''}
Each change is one of:
- {"kind":"thread","op":"add","why":"...","thread":{title, tier: major|subplot|hook|series, kind: plot|mystery|twist|relationship|secret|threat|goal|promise, question, resolution, characters:[...], beats:[{chapter, type: open|hint|advance|reveal|close, note}]}}
- {"kind":"thread","op":"update","id":"<existing id>","why":"...","patch":{...}}
- {"kind":"thread","op":"remove","id":"<existing id>","why":"..."}
- {"kind":"character","op":"add","why":"...","arc":{name, role: protagonist|antagonist|supporting, shape: positive|negative|flat, want, need, flaw, start, end, limits, introduce:{chapter, note}, beats:[{chapter, type: setup|test|setback|turn|crisis|change, note}]}}
- {"kind":"character","op":"update","id":"<existing id>","why":"...","patch":{...}}
- {"kind":"character","op":"remove","id":"<existing id>","why":"..."}
- {"kind":"object","op":"add","why":"...","object":{name, description, significance, beats:[{chapter, type: introduce|handoff|use|reveal|payoff|lost, note, holder}]}}
- {"kind":"object","op":"update","id":"<existing id>","why":"...","patch":{...}}
- {"kind":"object","op":"remove","id":"<existing id>","why":"..."}
- {"kind":"chapter","op":"update","chapter":<number>,"why":"...","premise":{"purpose":"...","changes":"...","emotionalBeat":"..."}} — a chapter's outline; include only the fields you change.
A "patch" holds ONLY what changes — keep it short:
- any top-level field to replace (title, tier, kind, question, resolution, characters, role, shape, want, need, flaw, start, end, limits, introduce, description, significance)
- "addBeats":[{chapter, type, note}] — new beats
- "editBeats":[{chapter, type, newType?, note}] — re-describe the existing beat at that chapter/type
- "removeBeats":[{chapter, type}]
"why" is one short sentence.

Return ONLY JSON, no markdown:
{"summary":"one sentence on what these changes do","changes":[...]}`;
}

// ---------- Parsing ----------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
}

/** Common model JSON slips: raw line breaks inside strings, trailing commas. */
export function repairJson(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === '\n') { out += '\\n'; continue; }
      else if (ch === '\r') continue;
      else if (ch === '\t') { out += '\\t'; continue; }
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function tryParse(json: string): RawJson | null {
  try { return JSON.parse(json); } catch { /* fall through */ }
  try { return JSON.parse(repairJson(json)); } catch { return null; }
}

/**
 * Read a (possibly still streaming or cut-off) reply: the summary and every
 * change object that arrived complete. `complete` is false when the changes
 * list never closed — the reply was cut off.
 */
export function readChangeStream(text: string): { summary: string; items: RawJson[]; complete: boolean } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  const raw = fenced?.[1] ?? text;
  const summary = (raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] || '').replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
  const key = raw.search(/"changes"\s*:\s*\[/);
  if (key < 0) return raw.trim() ? { summary, items: [], complete: /"changes"\s*:\s*\[\s*\]/.test(raw) } : null;
  let i = raw.indexOf('[', key) + 1;
  const items: RawJson[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const obj = tryParse(raw.slice(start, i + 1));
        if (obj) items.push(obj);
        start = -1;
      }
    } else if (ch === ']' && depth === 0) {
      return { summary, items, complete: true };
    }
  }
  return { summary, items, complete: false };
}

/** How many complete changes have arrived so far (for progress while streaming). */
export function countStreamedChanges(text: string): number {
  return readChangeStream(text)?.items.length ?? 0;
}

const beatChapters = (beats: Array<{ chapter: number }> | undefined) => (beats || []).map((b) => b.chapter);

/** Chapters where two beat lists differ. */
function changedChapters(before: Array<{ chapter: number; type: string; note: string }> = [], after: Array<{ chapter: number; type: string; note: string }> = []): number[] {
  const key = (b: { chapter: number; type: string; note: string }) => `${b.chapter}|${b.type}|${b.note}`;
  const a = new Set(before.map(key));
  const b = new Set(after.map(key));
  const out = new Set<number>();
  for (const x of before) if (!b.has(key(x))) out.add(x.chapter);
  for (const x of after) if (!a.has(key(x))) out.add(x.chapter);
  return [...out].sort((m, n) => m - n);
}

// Existing plan items in the shape the model writes, so a patch can be merged in.
function rawThread(t: StoryThread): RawJson {
  return { title: t.title, tier: t.tier, kind: t.kind, question: t.question, resolution: t.resolution, characters: t.characters, beats: t.beats.map((b) => ({ ...b })) };
}
function rawArc(a: CharacterArc): RawJson {
  return { name: a.name, role: a.role, shape: a.shape, want: a.want, need: a.need, flaw: a.flaw, start: a.startState, end: a.endState, limits: a.limits || '', introduce: { chapter: a.introducedIn, note: a.introduction || '' }, beats: a.beats.map((b) => ({ ...b })) };
}
function rawArtifact(a: ArtifactJourney): RawJson {
  return { name: a.name, description: a.description, significance: a.significance, beats: a.beats.map((b) => ({ ...b })) };
}

const PATCH_FIELDS = ['title', 'tier', 'kind', 'question', 'resolution', 'characters', 'name', 'role', 'shape', 'want', 'need', 'flaw', 'start', 'end', 'limits', 'introduce', 'description', 'significance'];

type RawBeat = { chapter: number; type: string; note?: string; holder?: string };

/** Existing item + patch (or a full replacement) → raw item for the normalizer. */
export function mergePatch(existing: RawJson, change: RawJson, fullKey: 'thread' | 'arc' | 'object'): RawJson {
  const full = change?.[fullKey];
  if (full && typeof full === 'object' && !change.patch) return full;
  const patch = change?.patch && typeof change.patch === 'object' ? change.patch : (full || {});
  const out: RawJson = { ...existing };
  for (const k of PATCH_FIELDS) if (k in patch && patch[k] !== undefined && patch[k] !== null) out[k] = patch[k];
  let beats: RawBeat[] = Array.isArray(patch.beats) ? patch.beats.map((b: RawBeat) => ({ ...b })) : (existing.beats || []).map((b: RawBeat) => ({ ...b }));
  const same = (b: RawBeat, r: RawBeat) => Number(b.chapter) === Number(r?.chapter) && (!r?.type || b.type === r.type);
  for (const r of Array.isArray(patch.removeBeats) ? patch.removeBeats : []) beats = beats.filter((b) => !same(b, r));
  for (const e of Array.isArray(patch.editBeats) ? patch.editBeats : []) {
    const hit = beats.find((b) => same(b, e));
    if (!hit) continue;
    if (e.newType) hit.type = String(e.newType);
    if (typeof e.note === 'string') hit.note = e.note;
    if (typeof e.holder === 'string') hit.holder = e.holder;
  }
  for (const b of Array.isArray(patch.addBeats) ? patch.addBeats : []) if (b && b.chapter) beats.push({ ...b });
  out.beats = beats;
  return out;
}

/**
 * Canon lock: every beat that sat in a written chapter is kept in that
 * chapter (a re-description of it is fine; removing or moving it is not).
 */
function keepWrittenBeats(before: RawBeat[], after: RawBeat[], written: Set<number>): RawBeat[] {
  const out = [...after];
  for (const c of written) {
    const was = before.filter((b) => Number(b.chapter) === c);
    const now = out.filter((b) => Number(b.chapter) === c);
    if (now.length >= was.length) continue; // kept, or re-described in place
    const types = new Set(now.map((b) => b.type));
    for (const b of was) {
      if (out.filter((x) => Number(x.chapter) === c).length >= was.length) break;
      if (!types.has(b.type)) out.push({ ...b });
    }
  }
  return out;
}

/** Written chapters where the plan's reading of them changed. */
function reinterpreted(before: RawBeat[] = [], after: RawBeat[] = [], written: Set<number>): number[] {
  return changedChapters(before as never, after as never).filter((c) => written.has(c));
}

/**
 * The model's proposals, checked against the book: unknown ids, chapters out
 * of range and no-op updates are dropped; with the canon lock, written
 * chapters keep their events (outline edits are set aside, their beats are
 * kept). Works on a cut-off reply, keeping the changes that arrived whole.
 */
export function parseStoryChanges(text: string, project: Project, chapters: Chapter[], opts: StoryChatOptions = { canonLocked: true }): StoryChangeSet | null {
  const read = readChangeStream(text);
  if (!read) return null;
  if (!read.items.length && !read.complete) return null;
  const n = Math.max(1, chapters.length);
  const threads = project.threadPlan?.threads || [];
  const arcs = project.arcPlan?.characters || [];
  const objects = project.arcPlan?.artifacts || [];
  const byNumber = new Map(sortChapters(chapters).map((c) => [c.number, c]));
  const written = new Set(chapters.filter((c) => c.prose?.trim()).map((c) => c.number));
  const lock = opts.canonLocked ? written : new Set<number>();
  const out: StoryChange[] = [];
  const setAside: string[] = [];
  const seenTargets = new Set<string>();

  read.items.forEach((c: RawJson, i: number) => {
    const op: StoryChangeOp = ['add', 'update', 'remove'].includes(c?.op) ? c.op : 'update';
    const why = String(c?.why ?? '').trim() || undefined;
    const id = `sc${i}`;

    if (c?.kind === 'thread' || c?.kind === 'character' || c?.kind === 'object') {
      const kind = c.kind as 'thread' | 'character' | 'object';
      const pool: Array<StoryThread | CharacterArc | ArtifactJourney> = kind === 'thread' ? threads : kind === 'character' ? arcs : objects;
      const existing = pool.find((x) => x.id === c.id);
      if (op !== 'add' && !existing) return;
      if (existing && seenTargets.has(existing.id)) return;
      const name = (x: StoryThread | CharacterArc | ArtifactJourney) => ('title' in x ? x.title : x.name);
      const describe = (x: StoryThread | CharacterArc | ArtifactJourney) =>
        kind === 'thread' ? describeThread(x as StoryThread) : kind === 'character' ? describeArc(x as CharacterArc) : describeArtifact(x as ArtifactJourney);
      const toRaw = (x: StoryThread | CharacterArc | ArtifactJourney) =>
        kind === 'thread' ? rawThread(x as StoryThread) : kind === 'character' ? rawArc(x as CharacterArc) : rawArtifact(x as ArtifactJourney);
      const normalize = (r: RawJson, index: number) =>
        kind === 'thread' ? normalizeThread(r, n, index) : kind === 'character' ? normalizeCharacterArc(r, n) : normalizeArtifactJourney(r, n);
      const field = kind === 'thread' ? 'thread' : kind === 'character' ? 'arc' : 'artifact';

      if (op === 'remove') {
        const inWritten = existing!.beats.filter((b) => lock.has(b.chapter)).map((b) => b.chapter);
        if (inWritten.length && kind !== 'thread') {
          setAside.push(`Removing ${name(existing!)} (already on the page in Ch ${[...new Set(inWritten)].join(', ')})`);
          return;
        }
        seenTargets.add(existing!.id);
        out.push({ id, kind, op, label: name(existing!), why, before: describe(existing!), targetId: existing!.id, chapters: beatChapters(existing!.beats), ...(inWritten.length ? { reinterprets: [...new Set(inWritten)] } : {}) });
        return;
      }

      const fullKey = kind === 'thread' ? 'thread' : kind === 'character' ? 'arc' : 'object';
      let rawNext = existing ? mergePatch(toRaw(existing), c, fullKey) : c[fullKey];
      if (!rawNext) return;
      if (existing && lock.size) rawNext = { ...rawNext, beats: keepWrittenBeats(toRaw(existing).beats, rawNext.beats || [], lock) };
      const normalized = normalize(rawNext, threads.length + i);
      if (!normalized) return;
      if (existing) {
        const next = { ...normalized, id: existing.id };
        if (describe(next) === describe(existing)) return;
        seenTargets.add(existing.id);
        const again = reinterpreted(existing.beats as RawBeat[], next.beats as RawBeat[], lock);
        out.push({
          id, kind, op: 'update', label: name(existing), why, before: describe(existing), after: describe(next),
          [field]: next, targetId: existing.id, chapters: changedChapters(existing.beats as never, next.beats as never),
          ...(again.length ? { reinterprets: again } : {}),
        });
      } else {
        const next = kind === 'thread'
          ? { ...normalized, id: `th-chat-${Date.now().toString(36)}-${i}-${slug(name(normalized))}` }
          : normalized;
        if (kind !== 'thread' && pool.some((x) => x.id === next.id)) return;
        const again = next.beats.map((b) => b.chapter).filter((ch) => lock.has(ch));
        out.push({ id, kind, op: 'add', label: name(next), why, after: describe(next), [field]: next, chapters: beatChapters(next.beats), ...(again.length ? { reinterprets: [...new Set(again)] } : {}) });
      }
      return;
    }

    if (c?.kind === 'chapter') {
      const num = Math.round(Number(c?.chapter));
      const ch = byNumber.get(num);
      if (!ch || seenTargets.has(`ch-${num}`)) return;
      if (lock.has(num)) {
        setAside.push(`Outline change to Ch ${num} (already written)`);
        return;
      }
      const premise: StoryChange['premise'] = {};
      for (const k of ['purpose', 'changes', 'emotionalBeat'] as const) {
        const v = String(c?.premise?.[k] ?? '').trim();
        if (v && v !== (ch.premise?.[k] || '')) premise[k] = v;
      }
      if (!Object.keys(premise).length) return;
      seenTargets.add(`ch-${num}`);
      out.push({
        id, kind: 'chapter', op: 'update', label: `Ch ${num}: ${ch.title}`, why,
        before: describePremise(ch.premise), after: describePremise({ ...ch.premise, ...premise }),
        chapterNumber: num, premise, chapters: [num],
      });
    }
  });

  return { summary: read.summary, changes: out, basis: storyBasis(project, chapters), truncated: !read.complete, setAside };
}

// ---------- Applying ----------

export interface AppliedStoryChanges {
  threadPlan?: ThreadPlan;
  arcPlan?: ArcPlan;
  premiseUpdates: Array<{ chapterId: string; premise: PremiseCard }>;
  /** Written chapters whose plan changed — their prose may need a rebuild (when not canon-locked). */
  writtenChaptersAffected: number[];
  /** Written chapters the new plan reads in a new light (prose unchanged). */
  reinterpretedChapters: number[];
}

export function applyStoryChanges(project: Project, chapters: Chapter[], changes: StoryChange[], accepted: Set<string>, now = new Date().toISOString()): AppliedStoryChanges {
  const take = changes.filter((c) => accepted.has(c.id));
  const out: AppliedStoryChanges = { premiseUpdates: [], writtenChaptersAffected: [], reinterpretedChapters: [] };
  const n = Math.max(1, chapters.length);

  const threadChanges = take.filter((c) => c.kind === 'thread');
  if (threadChanges.length) {
    let threads = [...(project.threadPlan?.threads || [])];
    for (const c of threadChanges) {
      if (c.op === 'remove') threads = threads.filter((t) => t.id !== c.targetId);
      else if (c.op === 'update' && c.thread) threads = threads.map((t) => (t.id === c.targetId ? c.thread! : t));
      else if (c.op === 'add' && c.thread) threads.push(c.thread);
    }
    out.threadPlan = { version: 1, chapterCount: project.threadPlan?.chapterCount || n, ...project.threadPlan, threads, generatedAt: now };
  }

  const arcChanges = take.filter((c) => c.kind === 'character' || c.kind === 'object');
  if (arcChanges.length) {
    let characters = [...(project.arcPlan?.characters || [])];
    let artifacts = [...(project.arcPlan?.artifacts || [])];
    for (const c of arcChanges) {
      if (c.kind === 'character') {
        if (c.op === 'remove') characters = characters.filter((a) => a.id !== c.targetId);
        else if (c.op === 'update' && c.arc) characters = characters.map((a) => (a.id === c.targetId ? c.arc! : a));
        else if (c.op === 'add' && c.arc) characters.push(c.arc);
      } else {
        if (c.op === 'remove') artifacts = artifacts.filter((a) => a.id !== c.targetId);
        else if (c.op === 'update' && c.artifact) artifacts = artifacts.map((a) => (a.id === c.targetId ? c.artifact! : a));
        else if (c.op === 'add' && c.artifact) artifacts.push(c.artifact);
      }
    }
    out.arcPlan = { version: 1, chapterCount: project.arcPlan?.chapterCount || n, ...project.arcPlan, characters, artifacts, generatedAt: now };
  }

  for (const c of take.filter((x) => x.kind === 'chapter' && x.premise)) {
    const ch = chapters.find((x) => x.number === c.chapterNumber);
    if (!ch) continue;
    const empty: PremiseCard = { purpose: '', changes: '', characters: [], emotionalBeat: '', setupPayoff: [], constraints: [] };
    const base: PremiseCard = ch.premise ? { ...empty, ...(ch.premise as Partial<PremiseCard>) } : empty;
    out.premiseUpdates.push({ chapterId: ch.id, premise: { ...base, ...c.premise } });
  }

  const written = new Set(chapters.filter((c) => c.prose?.trim()).map((c) => c.number));
  out.writtenChaptersAffected = [...new Set(take.flatMap((c) => c.chapters))].filter((num) => written.has(num)).sort((a, b) => a - b);
  out.reinterpretedChapters = [...new Set(take.flatMap((c) => c.reinterprets || []))].sort((a, b) => a - b);
  return out;
}
