// ========== Authorship record ==========
// A private, factual log of how each chapter was made: what the author
// directed, what the AI drafted or changed, what the author accepted,
// rejected or typed themselves. It never touches the manuscript, is never
// shown on public pages, and is only exported when the author chooses.
//
// Pure — portable to the mobile app.

import type { Chapter, Project } from '../types';

export type AuthorshipKind =
  | 'ai-draft'          // chapter written from the outline
  | 'ai-rebuild'        // chapter rewritten from the top
  | 'ai-extend'         // more text added at the end
  | 'ai-edit'           // an AI edit applied (selection rewrite, tracked changes, scene edit)
  | 'author-direction'  // the author's notes, instructions or settings for the AI
  | 'author-review'     // the author accepted/rejected AI suggestions
  | 'author-edit'       // text the author typed or dictated
  | 'author-restore'    // the author undid or restored an earlier version
  // Book-level development (characters, objects, places, maps)
  | 'author-canon-create'  // the author created a character / object / place
  | 'author-canon-edit'    // the author developed an entry by hand (fields changed)
  | 'ai-canon-fill'        // AI filled in an entry's empty fields at the author's request
  | 'author-rename'        // the author renamed someone/something everywhere
  | 'author-canon-cleanup' // the author reviewed and applied a canon clean-up
  | 'ai-plan-threads'      // AI drafted the thread map at the author's request
  | 'ai-plan-arcs'         // AI drafted the character & object map
  | 'author-plan-edit';    // the author changed a map by hand

export interface AuthorshipEvent {
  at: string;
  kind: AuthorshipKind;
  model?: string;
  /** Words written by the AI in this step. */
  words?: number;
  /** Characters the author changed (typed edits, grouped). */
  chars?: number;
  /** Start of a grouped typing session. */
  since?: string;
  note?: string;
  accepted?: number;
  offered?: number;
  /** What a book-level event is about: a character, object, place or map. */
  subject?: string;
  /** Entry kind for canon events: character, artifact, location… */
  entity?: string;
  /** The story-bible entry's id, so a renamed entry stays one history. */
  ref?: string;
  /** Fields the author developed (grouped). */
  fields?: string[];
}

export interface StoryChatDecision {
  at: string;
  summary: string;
  applied: number;
  offered: number;
  labels: string[];
}

export const MAX_EVENTS = 400;
const TYPING_SESSION_MS = 15 * 60 * 1000;

/** Add an event; typed edits within 15 minutes of each other are one session. */
export function appendEvent(log: AuthorshipEvent[] | undefined, ev: AuthorshipEvent, max = MAX_EVENTS): AuthorshipEvent[] {
  const list = [...(log || [])];
  const last = list[list.length - 1];
  const sameSession = last && Date.parse(ev.at) - Date.parse(last.at) <= TYPING_SESSION_MS;
  if (ev.kind === 'author-edit' && last?.kind === 'author-edit' && sameSession) {
    list[list.length - 1] = { ...last, at: ev.at, chars: (last.chars || 0) + (ev.chars || 0), since: last.since || last.at };
  } else if (ev.kind === 'author-canon-edit' && last?.kind === 'author-canon-edit' && (last.ref ? last.ref === ev.ref : last.subject === ev.subject) && sameSession) {
    list[list.length - 1] = { ...last, at: ev.at, fields: [...new Set([...(last.fields || []), ...(ev.fields || [])])], since: last.since || last.at };
  } else if (ev.kind === 'author-plan-edit' && last?.kind === 'author-plan-edit' && last.subject === ev.subject && sameSession) {
    list[list.length - 1] = { ...last, at: ev.at, note: ev.note || last.note, since: last.since || last.at };
  } else {
    list.push(ev.note ? { ...ev, note: ev.note.slice(0, 600) } : ev);
  }
  return list.slice(-max);
}

export function authorshipLog(chapter: Pick<Chapter, 'aiIntentMetadata'>): AuthorshipEvent[] {
  const log = (chapter.aiIntentMetadata as { authorship?: unknown } | undefined)?.authorship;
  return Array.isArray(log) ? (log as AuthorshipEvent[]) : [];
}

/** Characters changed between two texts, roughly (common prefix/suffix trimmed). */
export function changedChars(before: string, after: string): number {
  const a = before || '';
  const b = after || '';
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  return Math.max(endA - start, endB - start);
}

function sentences(text: string): string[] {
  return (text || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]+["”’)]*|[^.!?…]+$/g)?.map((s) => s.trim()).filter((s) => s.length > 3) || [];
}

/**
 * Share of the final text (by sentence) that isn't in the AI's last version:
 * sentences the author wrote or rewrote. Null when there's no AI version.
 */
export function revisedShare(aiText: string | undefined, finalText: string): number | null {
  if (!aiText?.trim() || !finalText.trim()) return null;
  const ai = new Set(sentences(aiText));
  const fin = sentences(finalText);
  if (!fin.length) return null;
  const changed = fin.filter((s) => !ai.has(s)).reduce((n, s) => n + s.length, 0);
  const total = fin.reduce((n, s) => n + s.length, 0);
  return total ? Math.round((changed / total) * 100) : null;
}

interface SnapshotLike { type?: string; prose?: string; timestamp?: string }

export interface ChapterAuthorship {
  number: number;
  title: string;
  words: number;
  aiDrafts: number;
  aiRebuilds: number;
  aiExtends: number;
  aiEdits: number;
  directions: Array<{ at: string; note: string }>;
  suggestionsAccepted: number;
  suggestionsOffered: number;
  typedSessions: number;
  typedChars: number;
  restores: number;
  /** Every pass where the chapter changed after the first draft. */
  revisionRounds: number;
  models: string[];
  /** % of the final text the author wrote or rewrote after the AI's last version. */
  revisedPct: number | null;
  events: AuthorshipEvent[];
}

export interface AuthorshipReport {
  title: string;
  generatedAt: string;
  /** Earliest logged event: detailed tracking starts here. */
  trackingSince: string | null;
  chapters: ChapterAuthorship[];
  totals: {
    words: number;
    aiSteps: number;
    directions: number;
    suggestionsAccepted: number;
    suggestionsOffered: number;
    typedChars: number;
    revisionRounds: number;
  };
  storyChat: { authorMessages: number; decisions: StoryChatDecision[] };
  /** Characters, objects and places, and the maps, as the author developed them. */
  development: {
    entities: Array<{ name: string; entity: string; events: AuthorshipEvent[] }>;
    plans: AuthorshipEvent[];
  };
}

const MODEL_NAMES: Record<string, string> = {
  'claude-opus': 'Claude Opus', 'claude-fable': 'Claude Fable',
  'claude-opus-5-5': 'Claude Opus 5.5', 'claude-fable-5-1': 'Claude Fable 5.1',
};
export const modelName = (m?: string) => (m ? MODEL_NAMES[m] || m : '');

export function chapterAuthorship(chapter: Chapter): ChapterAuthorship {
  const events = authorshipLog(chapter);
  const count = (k: AuthorshipKind) => events.filter((e) => e.kind === k).length;
  const history = ((chapter.aiIntentMetadata as { versionHistory?: SnapshotLike[] } | undefined)?.versionHistory || []);
  const lastAi = [...history].reverse().find((s) => s.type === 'ai-generated');
  const prose = chapter.prose || '';
  const reviews = events.filter((e) => e.kind === 'author-review');
  const typing = events.filter((e) => e.kind === 'author-edit');
  return {
    number: chapter.number,
    title: chapter.title,
    words: prose.trim() ? prose.trim().split(/\s+/).length : 0,
    aiDrafts: count('ai-draft'),
    aiRebuilds: count('ai-rebuild'),
    aiExtends: count('ai-extend'),
    aiEdits: count('ai-edit'),
    directions: events.filter((e) => e.kind === 'author-direction' && e.note).map((e) => ({ at: e.at, note: e.note! })),
    suggestionsAccepted: reviews.reduce((n, e) => n + (e.accepted || 0), 0),
    suggestionsOffered: reviews.reduce((n, e) => n + (e.offered || 0), 0),
    typedSessions: typing.length,
    typedChars: typing.reduce((n, e) => n + (e.chars || 0), 0),
    restores: count('author-restore'),
    revisionRounds: count('ai-rebuild') + count('ai-extend') + count('ai-edit') + typing.length + count('author-restore'),
    models: [...new Set(events.map((e) => modelName(e.model)).filter(Boolean))],
    revisedPct: revisedShare(lastAi?.prose, prose),
    events,
  };
}

export function buildAuthorshipReport(args: { project: Project; chapters: Chapter[]; now?: string }): AuthorshipReport {
  const chapters = [...args.chapters].sort((a, b) => (a.number || 0) - (b.number || 0)).map(chapterAuthorship);
  const storyChat = (args.project as Project & { storyChat?: { messages?: Array<{ role: string }>; decisions?: StoryChatDecision[] } }).storyChat;
  const projectEvents = Array.isArray(args.project.authorship) ? args.project.authorship : [];
  const byEntity = new Map<string, { name: string; entity: string; events: AuthorshipEvent[] }>();
  for (const e of projectEvents) {
    if (!e.kind.includes('canon') && e.kind !== 'author-rename') continue;
    const key = e.ref || `${e.entity || ''}|${e.subject || 'Story bible'}`;
    if (!byEntity.has(key)) byEntity.set(key, { name: e.subject || 'Story bible', entity: e.entity || '', events: [] });
    const group = byEntity.get(key)!;
    group.events.push(e);
    if (e.subject) group.name = e.subject; // latest name (after renames)
  }
  const allEvents = [...chapters.flatMap((c) => c.events), ...projectEvents];
  const decisions = storyChat?.decisions || [];
  const firsts = [...allEvents.map((e) => e.since || e.at), ...decisions.map((d) => d.at)].filter(Boolean).sort();
  return {
    title: args.project.title,
    generatedAt: args.now || new Date().toISOString(),
    trackingSince: firsts[0] || null,
    chapters,
    totals: {
      words: chapters.reduce((n, c) => n + c.words, 0),
      aiSteps: chapters.reduce((n, c) => n + c.aiDrafts + c.aiRebuilds + c.aiExtends + c.aiEdits, 0),
      directions: chapters.reduce((n, c) => n + c.directions.length, 0),
      suggestionsAccepted: chapters.reduce((n, c) => n + c.suggestionsAccepted, 0),
      suggestionsOffered: chapters.reduce((n, c) => n + c.suggestionsOffered, 0),
      typedChars: chapters.reduce((n, c) => n + c.typedChars, 0),
      revisionRounds: chapters.reduce((n, c) => n + c.revisionRounds, 0),
    },
    storyChat: {
      authorMessages: (storyChat?.messages || []).filter((m) => m.role === 'user').length,
      decisions,
    },
    development: {
      entities: [...byEntity.values()],
      plans: projectEvents.filter((e) => e.kind.includes('plan')),
    },
  };
}

// ---------- Export ----------

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const ENTITY_WORD: Record<string, string> = { character: 'character', artifact: 'object', location: 'place', system: 'system', rule: 'rule', event: 'event' };

/** One step of the record, in the author's first person. */
export function describeEvent(e: AuthorshipEvent): string {
  const by = e.model ? ` (${modelName(e.model)})` : '';
  const quote = e.note ? `: “${e.note}”` : '';
  const what = e.entity ? `${ENTITY_WORD[e.entity] || e.entity} ` : '';
  switch (e.kind) {
    case 'ai-draft': return `I had the AI draft this chapter from my outline and settings${by}${e.words ? ` — ${e.words.toLocaleString()} words` : ''}.`;
    case 'ai-rebuild': return `I had the AI rebuild the chapter from my revision notes${by}${e.words ? ` — ${e.words.toLocaleString()} words` : ''}.`;
    case 'ai-extend': return `I had the AI extend the chapter${by}${e.words ? ` by ${e.words.toLocaleString()} words` : ''}.`;
    case 'ai-edit': return `I applied an AI edit${by}${quote || '.'}`;
    case 'author-direction': return `I directed${quote || '.'}`;
    case 'author-review': return `I reviewed ${e.offered ?? 0} suggested change${e.offered === 1 ? '' : 's'} and kept ${e.accepted ?? 0}.`;
    case 'author-edit': return `I revised the text by hand${e.chars ? ` (~${e.chars.toLocaleString()} characters)` : ''}.`;
    case 'author-restore': return `I reverted to an earlier version${quote || '.'}`;
    case 'author-canon-create': return `I created the ${what}${e.subject ? `“${e.subject}”` : 'entry'}.`;
    case 'author-canon-edit': return `I developed ${e.subject ? `“${e.subject}”` : 'an entry'}${e.fields?.length ? ` — ${e.fields.join(', ')}` : ''}.`;
    case 'ai-canon-fill': return `I had the AI fill in empty details for ${e.subject ? `“${e.subject}”` : 'an entry'}${by}.`;
    case 'author-rename': return `I renamed ${e.note || e.subject || 'an entry'} everywhere in the book.`;
    case 'author-canon-cleanup': return `I reviewed the story bible and applied a clean-up${quote || '.'}`;
    case 'ai-plan-threads': return `I had the AI draft the thread map${by}${quote || '.'}`;
    case 'ai-plan-arcs': return `I had the AI draft the character & object map${by}${quote || '.'}`;
    case 'author-plan-edit': return `I revised the ${e.subject || 'plan'} by hand${quote || '.'}`;
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'name', description: 'description', tags: 'tags', notes: 'notes', imageUrl: 'image',
  fullName: 'full name', aliases: 'aliases & nicknames', age: 'age', gender: 'gender', species: 'species', occupation: 'occupation',
  role: 'role', condition: 'condition & limits', appearance: 'appearance', personality: 'personality', background: 'background',
  relationships: 'relationships', arc: 'arc', storyState: 'story state', voiceId: 'narration voice',
  physical: 'physical details', properties: 'properties', history: 'history', storyRelevance: 'story relevance',
  currentState: 'current state', rules: 'rules',
};

/**
 * What an author's edit to a story-bible entry changed, as readable labels
 * ("condition & limits", "appearance"). Nested type data is compared field by field.
 */
export function changedFieldLabels(entry: Record<string, unknown>, updates: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const type = String(entry.type || '');
  for (const [key, value] of Object.entries(updates)) {
    if (key === type && value && typeof value === 'object') {
      const before = (entry[type] || {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (JSON.stringify(v) !== JSON.stringify(before[k])) out.add(FIELD_LABELS[k] || k);
      }
    } else if (JSON.stringify(value) !== JSON.stringify(entry[key])) {
      out.add(FIELD_LABELS[key] || key);
    }
  }
  return [...out];
}

export interface ExportOptions {
  /** Show dates and times on each step (off: the steps in order, no timestamps). */
  dates: boolean;
  /** Include the step-by-step log under each chapter (off: summaries only). */
  steps: boolean;
}

/** A standalone, printable HTML document of the record, in the author's first person. */
export function renderAuthorshipHtml(r: AuthorshipReport, opts: ExportOptions = { dates: true, steps: true }): string {
  const t = r.totals;
  const stamp = (e: { at: string; since?: string }) => (opts.dates ? `<time>${esc(day(e.since || e.at))}${e.since ? ` – ${esc(day(e.at))}` : ''}</time> ` : '');
  const list = (events: AuthorshipEvent[]) => (opts.steps && events.length
    ? `<ol class="log">${events.map((e) => `<li>${stamp(e)}${esc(describeEvent(e))}</li>`).join('')}</ol>` : '');
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

  const chapterHtml = r.chapters.map((c) => `
  <section>
    <h3>Chapter ${c.number}: ${esc(c.title)}</h3>
    <p class="meta">${c.words.toLocaleString()} words${c.revisedPct !== null ? ` · ${c.revisedPct}% of the final text written or rewritten by me after the AI's last version` : ''}</p>
    ${c.events.length ? `<ul class="sum">
      <li>${plural(c.directions.length, 'direction')} from me${c.aiDrafts + c.aiRebuilds ? `; ${plural(c.aiDrafts + c.aiRebuilds, 'AI draft')} from my outline and notes` : ''}</li>
      <li>${plural(c.revisionRounds, 'revision round')}: ${plural(c.aiRebuilds, 'rebuild')}, ${plural(c.aiEdits, 'AI edit')}, ${plural(c.typedSessions, 'session')} of my own rewriting (~${c.typedChars.toLocaleString()} characters)${c.restores ? `, ${plural(c.restores, 'revert')}` : ''}</li>
      ${c.suggestionsOffered ? `<li>I kept ${c.suggestionsAccepted} of ${c.suggestionsOffered} suggested changes</li>` : ''}
    </ul>` : '<p class="meta">Written before detailed tracking began.</p>'}
    ${list(c.events)}
  </section>`).join('');

  const entityHtml = r.development.entities.map((d) => `
  <section>
    <h3>${esc(d.name)}${d.entity ? ` <span class="kind">${esc(ENTITY_WORD[d.entity] || d.entity)}</span>` : ''}</h3>
    ${list(d.events) || `<p class="meta">${plural(d.events.length, 'step')}</p>`}
  </section>`).join('');
  const plansHtml = r.development.plans.length ? list(r.development.plans) || `<p class="meta">${plural(r.development.plans.length, 'planning step')}</p>` : '';
  const decisions = r.storyChat.decisions.map((d) => `<li>${opts.dates ? `<time>${esc(day(d.at))}</time> ` : ''}${esc(d.summary || 'Plan changes')} — I applied ${d.applied} of ${d.offered} proposed changes${opts.steps && d.labels.length ? `: ${esc(d.labels.join('; '))}` : ''}</li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)} — Authorship record</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.55 Georgia, 'Times New Roman', serif; color: #1c1917; background: #fff; max-width: 760px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 32px 0 6px; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; } h3 { font-size: 16px; margin: 20px 0 4px; }
  .meta { color: #57534e; font: 13px/1.5 system-ui, sans-serif; margin: 0 0 8px; }
  .kind { font: 12px system-ui, sans-serif; color: #78716c; font-weight: normal; }
  .sum, .log { font: 13px/1.6 system-ui, sans-serif; padding-left: 20px; }
  .log li { margin: 2px 0; } time { color: #78716c; margin-right: 6px; }
  .totals { font: 14px/1.6 system-ui, sans-serif; background: #f5f5f4; border-radius: 10px; padding: 12px 16px; }
  section { break-inside: avoid-page; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${esc(r.title)}</h1>
  <p class="meta">Authorship record${opts.dates ? ` · generated ${esc(day(r.generatedAt))}${r.trackingSince ? ` · detailed tracking since ${esc(day(r.trackingSince))}` : ''}` : ''}</p>
  <div class="totals">
    ${t.words.toLocaleString()} words across ${plural(r.chapters.length, 'chapter')} ·
    ${plural(t.directions, 'direction')} from me ·
    ${plural(t.revisionRounds, 'revision round')} ·
    I kept ${t.suggestionsAccepted} of ${t.suggestionsOffered} suggested changes ·
    ~${t.typedChars.toLocaleString()} characters I wrote or rewrote by hand ·
    ${plural(r.storyChat.authorMessages, 'story-planning message')} from me ·
    ${plural(r.development.entities.length, 'character, object or place')} I developed
  </div>
  ${r.development.plans.length || decisions ? `<h2>Story planning</h2>${plansHtml}${decisions ? `<ol class="log">${decisions}</ol>` : ''}` : ''}
  ${entityHtml ? `<h2>Characters, objects and places</h2>${entityHtml}` : ''}
  <h2>Chapters</h2>
  ${chapterHtml}
</body></html>`;
}
