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

export const STORY_CHAT_SYSTEM = `You are Theodore, the author's story editor for the whole book — a sharp, warm collaborator, like a good developmental editor.
RULES:
- Answer in 2-5 sentences of plain prose. No lists, no headings.
- Build on what the book already has: name the specific threads, characters, objects and chapters you'd change, and how.
- Say plainly when an idea creates a problem (a reveal that comes too early, a thread left hanging, a written chapter that would contradict it) and suggest a fix.
- If the direction is unclear, ask one focused question instead of guessing.
- Don't draft the changes yet — end by offering to draft them ("Want me to draft those changes?") once the direction is clear.`;

function conversation(messages: StoryChatMessage[]): string {
  return messages.slice(-12).map((m) => `${m.role === 'user' ? 'AUTHOR' : 'THEODORE'}: ${m.content}`).join('\n\n');
}

export function buildStoryChatPrompt(context: string, messages: StoryChatMessage[]): string {
  return `${context}\n\nCONVERSATION:\n${conversation(messages)}\n\nReply to the author's last message.`;
}

export function buildStoryChangesPrompt(context: string, messages: StoryChatMessage[], plans: { threadPlan?: ThreadPlan | null; arcPlan?: ArcPlan | null }): string {
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

Draft the changes the author and you agreed on in this conversation — only those, nothing extra. Each change is one of:
- {"kind":"thread","op":"update","id":"<existing id>","why":"...","thread":{title, tier: major|subplot|hook|series, kind: plot|mystery|twist|relationship|secret|threat|goal|promise, question, resolution, characters:[...], beats:[{chapter, type: open|hint|advance|reveal|close, note}]}}
- {"kind":"thread","op":"add","why":"...","thread":{...same shape}}
- {"kind":"thread","op":"remove","id":"<existing id>","why":"..."}
- {"kind":"character","op":"update"|"add","id":"<existing id, for update>","why":"...","arc":{name, role: protagonist|antagonist|supporting, shape: positive|negative|flat, want, need, flaw, start, end, limits, introduce:{chapter, note}, beats:[{chapter, type: setup|test|setback|turn|crisis|change, note}]}}
- {"kind":"character","op":"remove","id":"<existing id>","why":"..."}
- {"kind":"object","op":"update"|"add","id":"<existing id, for update>","why":"...","object":{name, description, significance, beats:[{chapter, type: introduce|handoff|use|reveal|payoff|lost, note, holder}]}}
- {"kind":"object","op":"remove","id":"<existing id>","why":"..."}
- {"kind":"chapter","op":"update","chapter":<number>,"why":"...","premise":{"purpose":"...","changes":"...","emotionalBeat":"..."}} — the chapter's outline; include only the fields you change.
For an update, give the item's COMPLETE new version (every beat, not just the changed ones). Keep beats that already happened in WRITTEN chapters unless the author asked to change them. "why" is one short sentence.

Return ONLY JSON, no markdown:
{"summary":"one sentence on what these changes do","changes":[...]}`;
}

// ---------- Parsing ----------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';
}

function extractJson(text: string): RawJson | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
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

/**
 * The model's proposals, checked against the book: unknown ids, chapters out
 * of range and no-op updates are dropped. Returns null if unreadable.
 */
export function parseStoryChanges(text: string, project: Project, chapters: Chapter[]): StoryChangeSet | null {
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.changes)) return null;
  const n = Math.max(1, chapters.length);
  const threads = project.threadPlan?.threads || [];
  const arcs = project.arcPlan?.characters || [];
  const objects = project.arcPlan?.artifacts || [];
  const byNumber = new Map(sortChapters(chapters).map((c) => [c.number, c]));
  const out: StoryChange[] = [];
  const seenTargets = new Set<string>();

  parsed.changes.forEach((c: RawJson, i: number) => {
    const op: StoryChangeOp = ['add', 'update', 'remove'].includes(c?.op) ? c.op : 'update';
    const why = String(c?.why ?? '').trim() || undefined;
    const id = `sc${i}`;
    if (c?.kind === 'thread') {
      const existing = threads.find((t) => t.id === c.id);
      if (op !== 'add' && !existing) return;
      if (existing && seenTargets.has(existing.id)) return;
      if (op === 'remove') {
        seenTargets.add(existing!.id);
        out.push({ id, kind: 'thread', op, label: existing!.title, why, before: describeThread(existing!), targetId: existing!.id, chapters: beatChapters(existing!.beats) });
        return;
      }
      const t = normalizeThread(c.thread, n, threads.length + i);
      if (!t) return;
      if (existing) {
        const next = { ...t, id: existing.id };
        if (describeThread(next) === describeThread(existing)) return;
        seenTargets.add(existing.id);
        out.push({ id, kind: 'thread', op, label: existing.title, why, before: describeThread(existing), after: describeThread(next), thread: next, targetId: existing.id, chapters: changedChapters(existing.beats, next.beats) });
      } else {
        const next = { ...t, id: `th-chat-${Date.now().toString(36)}-${i}-${slug(t.title)}` };
        out.push({ id, kind: 'thread', op: 'add', label: next.title, why, after: describeThread(next), thread: next, chapters: beatChapters(next.beats) });
      }
      return;
    }
    if (c?.kind === 'character') {
      const existing = arcs.find((a) => a.id === c.id);
      if (op !== 'add' && !existing) return;
      if (existing && seenTargets.has(existing.id)) return;
      if (op === 'remove') {
        seenTargets.add(existing!.id);
        out.push({ id, kind: 'character', op, label: existing!.name, why, before: describeArc(existing!), targetId: existing!.id, chapters: beatChapters(existing!.beats) });
        return;
      }
      const a = normalizeCharacterArc(c.arc, n);
      if (!a) return;
      if (existing) {
        const next = { ...a, id: existing.id };
        if (describeArc(next) === describeArc(existing)) return;
        seenTargets.add(existing.id);
        out.push({ id, kind: 'character', op, label: existing.name, why, before: describeArc(existing), after: describeArc(next), arc: next, targetId: existing.id, chapters: changedChapters(existing.beats, next.beats) });
      } else if (!arcs.some((x) => x.id === a.id)) {
        out.push({ id, kind: 'character', op: 'add', label: a.name, why, after: describeArc(a), arc: a, chapters: beatChapters(a.beats) });
      }
      return;
    }
    if (c?.kind === 'object') {
      const existing = objects.find((a) => a.id === c.id);
      if (op !== 'add' && !existing) return;
      if (existing && seenTargets.has(existing.id)) return;
      if (op === 'remove') {
        seenTargets.add(existing!.id);
        out.push({ id, kind: 'object', op, label: existing!.name, why, before: describeArtifact(existing!), targetId: existing!.id, chapters: beatChapters(existing!.beats) });
        return;
      }
      const a = normalizeArtifactJourney(c.object, n);
      if (!a) return;
      if (existing) {
        const next = { ...a, id: existing.id };
        if (describeArtifact(next) === describeArtifact(existing)) return;
        seenTargets.add(existing.id);
        out.push({ id, kind: 'object', op, label: existing.name, why, before: describeArtifact(existing), after: describeArtifact(next), artifact: next, targetId: existing.id, chapters: changedChapters(existing.beats, next.beats) });
      } else if (!objects.some((x) => x.id === a.id)) {
        out.push({ id, kind: 'object', op: 'add', label: a.name, why, after: describeArtifact(a), artifact: a, chapters: beatChapters(a.beats) });
      }
      return;
    }
    if (c?.kind === 'chapter') {
      const num = Math.round(Number(c?.chapter));
      const ch = byNumber.get(num);
      if (!ch || seenTargets.has(`ch-${num}`)) return;
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

  return { summary: String(parsed.summary ?? '').trim(), changes: out, basis: storyBasis(project, chapters) };
}

// ---------- Applying ----------

export interface AppliedStoryChanges {
  threadPlan?: ThreadPlan;
  arcPlan?: ArcPlan;
  premiseUpdates: Array<{ chapterId: string; premise: PremiseCard }>;
  /** Written chapters whose plan changed — their prose may need a rebuild. */
  writtenChaptersAffected: number[];
}

export function applyStoryChanges(project: Project, chapters: Chapter[], changes: StoryChange[], accepted: Set<string>, now = new Date().toISOString()): AppliedStoryChanges {
  const take = changes.filter((c) => accepted.has(c.id));
  const out: AppliedStoryChanges = { premiseUpdates: [], writtenChaptersAffected: [] };
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
  return out;
}
