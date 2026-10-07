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
  | 'author-restore';   // the author undid or restored an earlier version

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
  if (ev.kind === 'author-edit' && last?.kind === 'author-edit'
    && Date.parse(ev.at) - Date.parse(last.at) <= TYPING_SESSION_MS) {
    list[list.length - 1] = { ...last, at: ev.at, chars: (last.chars || 0) + (ev.chars || 0), since: last.since || last.at };
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
  };
  storyChat: { authorMessages: number; decisions: StoryChatDecision[] };
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
    models: [...new Set(events.map((e) => modelName(e.model)).filter(Boolean))],
    revisedPct: revisedShare(lastAi?.prose, prose),
    events,
  };
}

export function buildAuthorshipReport(args: { project: Project; chapters: Chapter[]; now?: string }): AuthorshipReport {
  const chapters = [...args.chapters].sort((a, b) => (a.number || 0) - (b.number || 0)).map(chapterAuthorship);
  const storyChat = (args.project as Project & { storyChat?: { messages?: Array<{ role: string }>; decisions?: StoryChatDecision[] } }).storyChat;
  const allEvents = chapters.flatMap((c) => c.events);
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
    },
    storyChat: {
      authorMessages: (storyChat?.messages || []).filter((m) => m.role === 'user').length,
      decisions,
    },
  };
}

// ---------- Export ----------

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const EVENT_LABEL: Record<AuthorshipKind, string> = {
  'ai-draft': 'AI drafted the chapter',
  'ai-rebuild': 'AI rebuilt the chapter',
  'ai-extend': 'AI extended the chapter',
  'ai-edit': 'AI edit applied',
  'author-direction': 'Author direction',
  'author-review': 'Author reviewed suggestions',
  'author-edit': 'Author edited the text',
  'author-restore': 'Author restored an earlier version',
};

export function describeEvent(e: AuthorshipEvent): string {
  const bits: string[] = [EVENT_LABEL[e.kind]];
  if (e.model) bits.push(`(${modelName(e.model)})`);
  if (e.words) bits.push(`— ${e.words.toLocaleString()} words`);
  if (e.kind === 'author-review') bits.push(`— kept ${e.accepted ?? 0} of ${e.offered ?? 0}`);
  if (e.kind === 'author-edit' && e.chars) bits.push(`— ~${e.chars.toLocaleString()} characters`);
  return bits.join(' ') + (e.note ? `: “${e.note}”` : '');
}

/** A standalone, printable HTML document of the record. */
export function renderAuthorshipHtml(r: AuthorshipReport): string {
  const t = r.totals;
  const chapterHtml = r.chapters.map((c) => `
  <section>
    <h2>Chapter ${c.number}: ${esc(c.title)}</h2>
    <p class="meta">${c.words.toLocaleString()} words${c.models.length ? ` · AI: ${esc(c.models.join(', '))}` : ''}${c.revisedPct !== null ? ` · ${c.revisedPct}% of the final text written or rewritten by the author after the AI's last version` : ''}</p>
    <ul class="sum">
      <li>${c.aiDrafts} AI draft${c.aiDrafts === 1 ? '' : 's'}, ${c.aiRebuilds} rebuild${c.aiRebuilds === 1 ? '' : 's'}, ${c.aiExtends} extension${c.aiExtends === 1 ? '' : 's'}, ${c.aiEdits} AI edit${c.aiEdits === 1 ? '' : 's'}</li>
      <li>${c.directions.length} author direction${c.directions.length === 1 ? '' : 's'}; kept ${c.suggestionsAccepted} of ${c.suggestionsOffered} AI suggestions</li>
      <li>${c.typedSessions} author editing session${c.typedSessions === 1 ? '' : 's'} (~${c.typedChars.toLocaleString()} characters typed or changed)${c.restores ? `; ${c.restores} restore${c.restores === 1 ? '' : 's'}` : ''}</li>
    </ul>
    ${c.events.length ? `<ol class="log">${c.events.map((e) => `<li><time>${esc(day(e.since || e.at))}${e.since ? ` – ${esc(day(e.at))}` : ''}</time> ${esc(describeEvent(e))}</li>`).join('')}</ol>` : '<p class="meta">No detailed log for this chapter (written before tracking began).</p>'}
  </section>`).join('');
  const decisions = r.storyChat.decisions.map((d) => `<li><time>${esc(day(d.at))}</time> ${esc(d.summary || 'Plan changes')} — applied ${d.applied} of ${d.offered}${d.labels.length ? `: ${esc(d.labels.join('; '))}` : ''}</li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.title)} — Authorship record</title>
<style>
  :root { color-scheme: light; }
  body { font: 15px/1.55 Georgia, 'Times New Roman', serif; color: #1c1917; background: #fff; max-width: 760px; margin: 0 auto; padding: 32px 16px; }
  h1 { font-size: 26px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 28px 0 4px; }
  .meta { color: #57534e; font: 13px/1.5 system-ui, sans-serif; margin: 0 0 8px; }
  .sum, .log { font: 13px/1.6 system-ui, sans-serif; padding-left: 20px; }
  .log li { margin: 2px 0; } time { color: #78716c; margin-right: 6px; }
  .totals { font: 14px/1.6 system-ui, sans-serif; background: #f5f5f4; border-radius: 10px; padding: 12px 16px; }
  section { break-inside: avoid-page; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>${esc(r.title)}</h1>
  <p class="meta">Authorship record · generated ${esc(day(r.generatedAt))}${r.trackingSince ? ` · detailed tracking since ${esc(day(r.trackingSince))}` : ''}</p>
  <div class="totals">
    ${t.words.toLocaleString()} words across ${r.chapters.length} chapters ·
    ${t.directions} author directions · ${t.aiSteps} AI drafting/editing steps ·
    kept ${t.suggestionsAccepted} of ${t.suggestionsOffered} AI suggestions ·
    ~${t.typedChars.toLocaleString()} characters typed or changed by the author ·
    ${r.storyChat.authorMessages} story-planning messages by the author
  </div>
  ${decisions ? `<h2>Story planning decisions</h2><ol class="log">${decisions}</ol>` : ''}
  ${chapterHtml}
</body></html>`;
}
