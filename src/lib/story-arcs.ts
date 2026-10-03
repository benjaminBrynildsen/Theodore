// ========== Character Arcs & Artifact Journeys ==========
// The book's arc map, the companion to the thread map. Planned before the
// chapters are written, then fed into each chapter's prompt.
//
//   Character arcs — for each main character: what they want, what they
//   actually need, the flaw (or false belief) in the way, and the chapters
//   where that belief is set up, tested, breaks and finally changes. Keeps a
//   character from changing too fast, resetting between chapters, or never
//   changing at all.
//
//   Artifact journeys — for each important object: where it first appears,
//   who holds it as the story goes, when its true meaning is revealed and
//   where it pays off. Keeps objects from appearing out of nowhere when
//   they're needed, or being set up and forgotten.
//
// Pure functions (no store / network imports) — portable to the mobile app.

import type { Chapter } from '../types';
import type { AnyCanonEntry, CharacterEntry } from '../types/canon';
import type { ThreadPlan } from './story-threads';

export type ArcRole = 'protagonist' | 'antagonist' | 'supporting';
/** positive = grows out of the flaw; negative = falls further into it; flat = holds firm and changes the world around them. */
export type ArcShape = 'positive' | 'negative' | 'flat';
export type ArcBeatType = 'setup' | 'test' | 'setback' | 'turn' | 'crisis' | 'change';
export type ArtifactBeatType = 'introduce' | 'handoff' | 'use' | 'reveal' | 'payoff' | 'lost';

export interface ArcBeat {
  chapter: number;
  type: ArcBeatType;
  note: string;
}

export interface CharacterArc {
  id: string;
  name: string;
  role: ArcRole;
  shape: ArcShape;
  want: string;
  need: string;
  /** The flaw or false belief standing between them and what they need. */
  flaw: string;
  startState: string;
  endState: string;
  beats: ArcBeat[];
  /** Chapter where the reader properly meets them (usually their first; later after a cold open). */
  introducedIn: number;
  /** What the introduction should establish about them, from the plan. */
  introduction?: string;
}

export interface ArtifactBeat {
  chapter: number;
  type: ArtifactBeatType;
  note: string;
  /** Who holds it after this beat, when the beat changes or establishes that. */
  holder?: string;
}

export interface ArtifactJourney {
  id: string;
  name: string;
  /** What it is, physically — the details that make it recognizable. */
  description: string;
  /** What it really means or does. Spoiler when revealed late. */
  significance: string;
  introducedIn: number;
  /** Chapter of the payoff (or last beat when there's no payoff). */
  payoffIn: number;
  beats: ArtifactBeat[];
}

export interface ArcPlan {
  version: 1;
  generatedAt: string;
  chapterCount: number;
  characters: CharacterArc[];
  artifacts: ArtifactJourney[];
}

export const ARC_BEAT_LABEL: Record<ArcBeatType, string> = {
  setup: 'setup', test: 'tested', setback: 'setback', turn: 'turn', crisis: 'crisis', change: 'changes',
};
export const ARTIFACT_BEAT_LABEL: Record<ArtifactBeatType, string> = {
  introduce: 'appears', handoff: 'changes hands', use: 'used', reveal: 'reveal', payoff: 'pays off', lost: 'lost',
};

const ROLES: ArcRole[] = ['protagonist', 'antagonist', 'supporting'];
const SHAPES: ArcShape[] = ['positive', 'negative', 'flat'];
const ARC_BEATS: ArcBeatType[] = ['setup', 'test', 'setback', 'turn', 'crisis', 'change'];
const ARTIFACT_BEATS: ArtifactBeatType[] = ['introduce', 'handoff', 'use', 'reveal', 'payoff', 'lost'];

// Model output is untrusted JSON, read field by field with explicit coercion.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawJson = any;

// ---------- Planning prompt ----------

interface ChapterMemoryLike {
  summary?: string;
  richSummary?: string;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function characterLine(e: CharacterEntry): string {
  const c = e.character;
  const parts = [
    c?.role && c.role !== 'mentioned' ? c.role : '',
    e.description,
    c?.arc?.wantVsNeed?.want ? `wants: ${c.arc.wantVsNeed.want}` : '',
    c?.arc?.wantVsNeed?.need ? `needs: ${c.arc.wantVsNeed.need}` : '',
    c?.personality?.flaws?.length ? `flaws: ${c.personality.flaws.slice(0, 3).join(', ')}` : '',
    c?.arc?.startingState ? `starts: ${c.arc.startingState}` : '',
    c?.arc?.endingState ? `ends: ${c.arc.endingState}` : '',
  ].map(str).filter(Boolean);
  return `- ${e.name}${parts.length ? `: ${parts.join(' | ')}` : ''}`;
}

export function buildArcPlanPrompt(args: {
  title: string;
  genre?: string;
  chapters: Chapter[];
  canon: AnyCanonEntry[];
  threadPlan?: ThreadPlan | null;
}): string {
  const chapters = [...args.chapters].sort((a, b) => (a.number || 0) - (b.number || 0));
  const n = chapters.length;
  const written = chapters.filter((c) => c.prose?.trim());

  const outline = chapters.map((c) => {
    const meta = (c.aiIntentMetadata || {}) as ChapterMemoryLike;
    const body = c.prose?.trim()
      ? `[WRITTEN] ${meta.richSummary || meta.summary || c.premise?.purpose || ''}`
      : `[PLANNED] ${[c.premise?.purpose, c.premise?.changes, c.premise?.emotionalBeat].filter(Boolean).join(' — ')}`;
    const who = c.premise?.characters?.length ? ` (with ${c.premise.characters.join(', ')})` : '';
    return `Ch ${c.number}: "${c.title}"${who} ${body}`;
  }).join('\n');

  const rank = (e: AnyCanonEntry) => {
    const role = (e as CharacterEntry).character?.role;
    return role === 'protagonist' ? 0 : role === 'antagonist' ? 1 : role === 'supporting' ? 2 : 3;
  };
  const people = args.canon
    .filter((e): e is CharacterEntry => e.type === 'character')
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 20)
    .map(characterLine)
    .join('\n');
  const objects = args.canon
    .filter((e) => e.type === 'artifact')
    .slice(0, 20)
    .map((e) => `- ${e.name}${e.description ? `: ${e.description}` : ''}`)
    .join('\n');
  const threads = (args.threadPlan?.threads || [])
    .filter((t) => t.tier !== 'hook')
    .map((t) => {
      const reveal = t.beats.find((b) => b.type === 'reveal');
      return `- [${t.tier}] ${t.title}: Ch.${t.opensIn}${t.continues ? '→next book' : `–${t.closesIn}`}${reveal ? `, reveal Ch.${reveal.chapter}` : ''}${t.characters.length ? ` (${t.characters.join(', ')})` : ''}`;
    })
    .join('\n');

  const castCount = n >= 16 ? '3-5' : n >= 9 ? '2-4' : '2-3';
  const objectCount = n >= 16 ? '3-6' : n >= 9 ? '2-5' : '1-3';

  return `You are Theodore, a story architect. Build the ARC MAP for "${args.title}"${args.genre ? ` (${args.genre})` : ''}: how the main characters change across the book, and the journey of each important object. This map guides the writing of every chapter.

The book has ${n} chapters.

CHAPTERS:
${outline}
${people ? `\nCHARACTERS (canon):\n${people}\n` : ''}${objects ? `\nOBJECTS (canon):\n${objects}\n` : ''}${threads ? `\nTHREAD MAP (arcs must line up with these — a character's turn usually lands on a reveal or a hard choice):\n${threads}\n` : ''}
DESIGN RULES:
1. CHARACTER ARCS (${castCount}): the protagonist, the antagonist if there is one, and the supporting characters whose change matters. For each:
   - want (outer goal), need (what they actually need), flaw (the false belief or weakness in the way), start state, end state.
   - shape: "positive" (grows out of the flaw), "negative" (falls further into it), or "flat" (holds firm and changes others).
   - beats, in order: one "setup" early (the flaw on display), "test" beats where the flaw costs them, at least one "setback", a "turn" near the middle (a crack in the false belief), a "crisis" late (the lowest point, the hardest choice), and one "change" at or near the climax (they act from the need, not the flaw). Flat arcs: "setup", "test" beats and a final "change" that notes how they changed others.
   - Change is gradual. Space the beats out; no character changes in a single chapter.
   - introduce: the chapter where the reader properly MEETS them — usually the first chapter they're in. For the protagonist that is normally Ch 1; if Ch 1 is a cold open or flash-forward ("24 hours earlier" follows), it can be Ch 2. Its note says what the introduction should establish (who they are, what they do, what's missing in their life).
2. ARTIFACT JOURNEYS (${objectCount}): objects that matter to the plot — a key, a letter, a weapon, a device, an heirloom. Use the canon objects first; add any the outline clearly needs. For each:
   - description: the concrete physical details that make it recognizable.
   - significance: what it really means or does.
   - beats, in order: one "introduce" (it appears on the page, early enough to be remembered — never conveniently right when it's needed), any "handoff" (changes hands; give the new holder), "use", a "reveal" if its true meaning comes out later, and one "payoff" where it matters most. "lost" if it is destroyed or gone.
   - Every object that is introduced pays off. Plant it at least two chapters before its payoff.
${written.length ? `3. Chapters marked [WRITTEN] already happened. Keep beats that are already on the page in those chapters; plan future beats freely.\n` : ''}
Beat notes are one short sentence saying what happens on the page.

Return ONLY JSON, no markdown:
{"characters":[{"name":"Name","role":"protagonist|antagonist|supporting","shape":"positive|negative|flat","want":"...","need":"...","flaw":"...","start":"...","end":"...","introduce":{"chapter":1,"note":"..."},"beats":[{"chapter":1,"type":"setup","note":"..."},{"chapter":4,"type":"test","note":"..."}]}],"artifacts":[{"name":"Object","description":"...","significance":"...","beats":[{"chapter":2,"type":"introduce","note":"...","holder":"Name"},{"chapter":9,"type":"payoff","note":"..."}]}]}`;
}

// ---------- Parsing + validation ----------

function clampChapter(v: unknown, n: number): number | null {
  const x = Math.round(Number(v));
  if (!Number.isFinite(x)) return null;
  return Math.min(Math.max(1, x), n);
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';
}

const ARC_ORDER: Record<ArcBeatType, number> = { setup: 0, test: 1, setback: 2, turn: 3, crisis: 4, change: 5 };
const ARTIFACT_ORDER: Record<ArtifactBeatType, number> = { introduce: 0, handoff: 1, use: 2, reveal: 3, payoff: 4, lost: 5 };

export function normalizeCharacterArc(raw: RawJson, n: number): CharacterArc | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name);
  if (!name) return null;
  let beats: ArcBeat[] = (Array.isArray(raw.beats) ? raw.beats : [])
    .map((b: RawJson) => {
      const chapter = clampChapter(b?.chapter, n);
      const type: ArcBeatType = ARC_BEATS.includes(b?.type) ? b.type : 'test';
      return chapter ? { chapter, type, note: str(b?.note) } : null;
    })
    .filter((b: ArcBeat | null): b is ArcBeat => !!b);
  if (!beats.length) return null;
  beats.sort((a, b) => a.chapter - b.chapter || ARC_ORDER[a.type] - ARC_ORDER[b.type]);

  // One setup (the earliest beat) and at most one change (the latest change).
  const firstSetup = beats.findIndex((b) => b.type === 'setup');
  beats = beats.filter((b, i) => b.type !== 'setup' || i === firstSetup);
  const changes = beats.filter((b) => b.type === 'change');
  if (changes.length > 1) {
    const keep = changes[changes.length - 1];
    beats = beats.filter((b) => b.type !== 'change' || b === keep);
  }
  // Nothing can follow the change except more tests of the new self — keep
  // the change last so the arc reads in order.
  const change = beats.find((b) => b.type === 'change');
  if (change) beats = beats.filter((b) => b === change || b.chapter <= change.chapter);

  return {
    id: `ca-${slug(name)}`,
    name,
    role: ROLES.includes(raw.role) ? raw.role : 'supporting',
    shape: SHAPES.includes(raw.shape) ? raw.shape : 'positive',
    want: str(raw.want),
    need: str(raw.need),
    flaw: str(raw.flaw),
    startState: str(raw.start ?? raw.startState),
    endState: str(raw.end ?? raw.endState),
    beats,
    // No later than their first beat; a cold open can push it past Ch.1.
    introducedIn: Math.min(clampChapter(raw.introduce?.chapter ?? raw.introducedIn, n) ?? beats[0].chapter, beats[0].chapter),
    ...(str(raw.introduce?.note) ? { introduction: str(raw.introduce?.note) } : {}),
  };
}

export function normalizeArtifactJourney(raw: RawJson, n: number): ArtifactJourney | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name);
  if (!name) return null;
  let beats: ArtifactBeat[] = (Array.isArray(raw.beats) ? raw.beats : [])
    .map((b: RawJson) => {
      const chapter = clampChapter(b?.chapter, n);
      const type: ArtifactBeatType = ARTIFACT_BEATS.includes(b?.type) ? b.type : 'use';
      const holder = str(b?.holder);
      return chapter ? { chapter, type, note: str(b?.note), ...(holder ? { holder } : {}) } : null;
    })
    .filter((b: ArtifactBeat | null): b is ArtifactBeat => !!b);
  if (!beats.length) return null;
  beats.sort((a, b) => a.chapter - b.chapter || ARTIFACT_ORDER[a.type] - ARTIFACT_ORDER[b.type]);

  // Exactly one introduce, and it comes first.
  beats = beats.filter((b, i) => b.type !== 'introduce' || i === 0);
  if (beats[0].type !== 'introduce') {
    beats[0] = { ...beats[0], type: 'introduce' };
  }
  const introducedIn = beats[0].chapter;
  const payoff = beats.filter((b) => b.type === 'payoff').pop();

  return {
    id: `ar-${slug(name)}`,
    name,
    description: str(raw.description),
    significance: str(raw.significance),
    introducedIn,
    payoffIn: payoff?.chapter ?? beats[beats.length - 1].chapter,
    beats,
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

export function parseArcPlan(text: string, chapterCount: number, now = new Date().toISOString()): ArcPlan | null {
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
  const n = Math.max(1, chapterCount);
  const characters = dedupeById<CharacterArc>((Array.isArray(parsed?.characters) ? parsed.characters : [])
    .map((c: RawJson) => normalizeCharacterArc(c, n))
    .filter((c: CharacterArc | null): c is CharacterArc => !!c));
  const artifacts = dedupeById<ArtifactJourney>((Array.isArray(parsed?.artifacts) ? parsed.artifacts : [])
    .map((a: RawJson) => normalizeArtifactJourney(a, n))
    .filter((a: ArtifactJourney | null): a is ArtifactJourney => !!a));
  if (!characters.length && !artifacts.length) return null;
  return { version: 1, generatedAt: now, chapterCount: n, characters, artifacts };
}

// ---------- Where things stand at a chapter ----------

/** The latest beat at or before a chapter: where the character is in their arc. */
export function arcStageAt(arc: CharacterArc, chapter: number): ArcBeat | null {
  let stage: ArcBeat | null = null;
  for (const b of arc.beats) if (b.chapter <= chapter) stage = b;
  return stage;
}

/** Who holds an object going into a chapter (from the latest beat before it that names a holder). */
export function artifactHolderBefore(a: ArtifactJourney, chapter: number): string | undefined {
  let holder: string | undefined;
  for (const b of a.beats) if (b.chapter < chapter && b.holder) holder = b.holder;
  return holder;
}

export interface ChapterArcActivity {
  chapter: number;
  arcBeats: Array<{ arc: CharacterArc; beat: ArcBeat }>;
  /** Arcs under way (set up, not yet changed) with no beat here — where they stand. */
  arcsInProgress: Array<{ arc: CharacterArc; stage: ArcBeat }>;
  artifactBeats: Array<{ artifact: ArtifactJourney; beat: ArtifactBeat }>;
  /** Introduced earlier, still in play, no beat here. */
  artifactsInPlay: Array<{ artifact: ArtifactJourney; holder?: string }>;
  /** Not on the page yet — don't bring them in early. */
  artifactsNotYet: ArtifactJourney[];
}

export function arcsForChapter(plan: ArcPlan | null | undefined, chapter: number): ChapterArcActivity {
  const act: ChapterArcActivity = { chapter, arcBeats: [], arcsInProgress: [], artifactBeats: [], artifactsInPlay: [], artifactsNotYet: [] };
  for (const arc of plan?.characters || []) {
    const here = arc.beats.filter((b) => b.chapter === chapter);
    for (const beat of here) act.arcBeats.push({ arc, beat });
    if (here.length) continue;
    const stage = arcStageAt(arc, chapter);
    const changed = arc.beats.some((b) => b.type === 'change' && b.chapter < chapter);
    if (stage && !changed) act.arcsInProgress.push({ arc, stage });
  }
  for (const artifact of plan?.artifacts || []) {
    const here = artifact.beats.filter((b) => b.chapter === chapter);
    for (const beat of here) act.artifactBeats.push({ artifact, beat });
    if (here.length) continue;
    if (chapter < artifact.introducedIn) {
      act.artifactsNotYet.push(artifact);
      continue;
    }
    const gone = artifact.beats.some((b) => b.type === 'lost' && b.chapter < chapter);
    if (!gone && chapter < artifact.payoffIn) act.artifactsInPlay.push({ artifact, holder: artifactHolderBefore(artifact, chapter) });
  }
  return act;
}

const ARC_INSTRUCTION: Record<ArcBeatType, string> = {
  setup: 'show the flaw in action — let the reader see who they are before they change',
  test: 'the flaw costs them something; they still choose from it',
  setback: 'they fall back on the old belief and pay for it',
  turn: 'a crack in the old belief — they glimpse what they need, but have not changed yet',
  crisis: 'the lowest point: the old belief and the need collide in a hard choice',
  change: 'they act from the need, not the flaw — the change is shown in a choice, not announced',
};

/** Prompt section: arc beats and object beats this chapter must hit, plus where everything stands. */
export function buildArcGuidanceBlock(plan: ArcPlan | null | undefined, chapter: number): string {
  if (!plan || (!plan.characters?.length && !plan.artifacts?.length)) return '';
  const a = arcsForChapter(plan, chapter);
  const lines: string[] = [];

  for (const { arc, beat } of a.arcBeats) {
    lines.push(`- ${arc.name} — ${beat.type.toUpperCase()}: ${beat.note ? `${beat.note} — ` : ''}${ARC_INSTRUCTION[beat.type]}`);
  }
  for (const { arc, stage } of a.arcsInProgress) {
    const need = arc.need ? `; still lacks: ${arc.need}` : '';
    lines.push(`- ${arc.name} — where they stand: last ${ARC_BEAT_LABEL[stage.type]} in Ch.${stage.chapter} (${stage.note || '—'})${need}. Act consistently with this; don't skip ahead in their change.`);
  }
  const charSection = lines.length
    ? `=== CHARACTER ARCS (from the book's arc map — follow it; where the written chapters differ, the page wins) ===\n${lines.join('\n')}`
    : '';

  const obj: string[] = [];
  for (const { artifact, beat } of a.artifactBeats) {
    const who = beat.holder ? ` [afterwards held by ${beat.holder}]` : '';
    const plant = beat.type === 'introduce' && artifact.payoffIn > chapter
      ? ` Describe it concretely${artifact.description ? ` (${artifact.description})` : ''} so the reader remembers it — it matters in Ch.${artifact.payoffIn}.`
      : '';
    obj.push(`- ${artifact.name} — ${ARTIFACT_BEAT_LABEL[beat.type].toUpperCase()}: ${beat.note}${who}${plant}`);
  }
  for (const { artifact, holder } of a.artifactsInPlay) {
    obj.push(`- ${artifact.name} — in play${holder ? `, held by ${holder}` : ''}; keep it consistent and don't use it up before Ch.${artifact.payoffIn}.`);
  }
  if (a.artifactsNotYet.length) {
    obj.push(`- NOT YET ON THE PAGE (do not mention): ${a.artifactsNotYet.map((x) => `${x.name} (appears Ch.${x.introducedIn})`).join('; ')}`);
  }
  const objSection = obj.length ? `=== OBJECTS (from the book's arc map; if CURRENT STATE says otherwise, the page wins) ===\n${obj.join('\n')}` : '';

  return [charSection, objSection].filter(Boolean).join('\n\n');
}

// ---------- Health ----------

export interface ArcWarning {
  level: 'warning' | 'info';
  message: string;
  id?: string;
}

export function analyzeArcPlan(plan: ArcPlan | null | undefined, chapterCount: number): ArcWarning[] {
  const warnings: ArcWarning[] = [];
  if (!plan) return warnings;
  const n = Math.max(1, chapterCount);
  if (plan.chapterCount !== n) {
    warnings.push({ level: 'warning', message: `The map was built for ${plan.chapterCount} chapters; the book now has ${n}. Rebuild to re-plan.` });
  }
  if (!plan.characters.some((c) => c.role === 'protagonist')) {
    warnings.push({ level: 'info', message: 'No protagonist arc — the main character may not change across the book.' });
  }
  for (const c of plan.characters) {
    const change = c.beats.find((b) => b.type === 'change');
    if (!change) {
      warnings.push({ level: c.role === 'protagonist' ? 'warning' : 'info', id: c.id, message: `${c.name} never reaches a change beat — their arc doesn't land.` });
    }
    if (c.shape !== 'flat' && !c.beats.some((b) => b.type === 'turn' || b.type === 'crisis')) {
      warnings.push({ level: 'info', id: c.id, message: `${c.name} changes without a turn or crisis first — the change may feel sudden.` });
    }
    const setup = c.beats.find((b) => b.type === 'setup');
    if (change && setup && change.chapter - setup.chapter < Math.min(3, n - 1)) {
      warnings.push({ level: 'warning', id: c.id, message: `${c.name} goes from setup (Ch.${setup.chapter}) to change (Ch.${change.chapter}) too quickly.` });
    }
  }
  for (const a of plan.artifacts) {
    const payoff = a.beats.find((b) => b.type === 'payoff');
    const lost = a.beats.some((b) => b.type === 'lost');
    if (!payoff && !lost) {
      warnings.push({ level: 'warning', id: a.id, message: `${a.name} is introduced in Ch.${a.introducedIn} but never pays off.` });
    } else if (payoff && payoff.chapter - a.introducedIn < 2 && n >= 6) {
      warnings.push({ level: 'info', id: a.id, message: `${a.name} appears in Ch.${a.introducedIn} and pays off in Ch.${payoff.chapter} — plant it earlier so it doesn't feel convenient.` });
    }
  }
  return warnings;
}
