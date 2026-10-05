// ========== Tracked edits ==========
// Whole-chapter edits come back as suggestions on numbered paragraphs, the
// way an editor marks up a manuscript: rewrite this paragraph, add one after
// that, cut this one. The author accepts or rejects each; paragraphs nobody
// touched are never sent back, so an edit can't lose or quietly reword them.
//
// Pure — portable to the mobile app.

export type EditOpKind = 'replace' | 'insert_after' | 'delete';

export interface EditSuggestion {
  id: string;
  op: EditOpKind;
  /** 1-based paragraph number; insert_after may use 0 for "at the very start". */
  p: number;
  /** The paragraph as it is now ('' for an insertion). */
  before: string;
  /** The new text ('' for a cut). May be several paragraphs. */
  after: string;
  why?: string;
}

export interface TrackedEditResult {
  summary: string;
  suggestions: EditSuggestion[];
}

/** Paragraphs as the editor numbers them: blank-line separated, trimmed, non-empty. */
export function splitParagraphs(prose: string): string[] {
  return (prose || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

export function numberedProse(paragraphs: string[]): string {
  return paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n');
}

export const TRACKED_EDIT_FORMAT = `Mark up the chapter like an editor: change only the paragraphs that need it and leave every other paragraph out of your reply. Paragraphs are numbered [P1], [P2], ….
- "replace": rewrite paragraph p. Give the whole new paragraph, keeping its untouched sentences word for word. It can become several paragraphs (separate them with a blank line).
- "insert_after": add new paragraph(s) after paragraph p (p = 0 puts them before the first paragraph).
- "delete": cut paragraph p.
- "why": a few words on what the change does.
Never renumber, never include a paragraph you didn't change, and never put the [P#] labels in your text.

Return ONLY JSON, no markdown:
{"summary":"one sentence on what you changed","changes":[{"op":"replace","p":3,"text":"...","why":"..."},{"op":"insert_after","p":5,"text":"...","why":"..."},{"op":"delete","p":7,"why":"..."}]}`;

/** Models sometimes put raw line breaks inside JSON strings; escape them so JSON.parse accepts it. */
function escapeNewlinesInStrings(json: string): string {
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
    } else if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

const OP_ORDER: Record<EditOpKind, number> = { replace: 0, delete: 0, insert_after: 1 };

function cleanText(v: unknown): string {
  return String(v ?? '')
    .replace(/^\s*\[P\d+\]\s*/gm, '') // stray labels
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Read the model's markup into suggestions against `paragraphs`. Drops
 * anything that doesn't fit: unknown paragraphs, a second rewrite of the same
 * paragraph, a "replace" that changes nothing. Returns null if unreadable.
 */
export function parseTrackedEdits(text: string, paragraphs: string[]): TrackedEditResult | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted model JSON, coerced field by field
  let parsed: any;
  try { parsed = JSON.parse(escapeNewlinesInStrings(raw.slice(start, end + 1))); } catch { return null; }
  if (!Array.isArray(parsed?.changes)) return null;

  const n = paragraphs.length;
  const rewritten = new Set<number>();
  const out: EditSuggestion[] = [];
  parsed.changes.forEach((c: Record<string, unknown>, i: number) => {
    const op = c?.op as EditOpKind;
    const p = Math.round(Number(c?.p));
    if (!['replace', 'insert_after', 'delete'].includes(op) || !Number.isFinite(p)) return;
    if (op === 'insert_after' ? p < 0 || p > n : p < 1 || p > n) return;
    const after = op === 'delete' ? '' : cleanText(c?.text);
    if (op !== 'delete' && !after) return;
    const before = op === 'insert_after' ? '' : paragraphs[p - 1];
    if (op !== 'insert_after') {
      if (rewritten.has(p)) return;
      if (op === 'replace' && after === before) return;
      rewritten.add(p);
    }
    const why = String(c?.why ?? '').trim();
    out.push({ id: `s${i}`, op, p, before, after, ...(why ? { why } : {}) });
  });
  out.sort((a, b) => a.p - b.p || OP_ORDER[a.op] - OP_ORDER[b.op]);
  return { summary: String(parsed.summary ?? '').trim(), suggestions: out };
}

/** The chapter with the accepted suggestions applied; everything else exactly as it was. */
export function applySuggestions(paragraphs: string[], suggestions: EditSuggestion[], accepted: Set<string>): string {
  const take = suggestions.filter((s) => accepted.has(s.id));
  const out: string[] = [];
  const insertsAfter = (p: number) => take.filter((s) => s.op === 'insert_after' && s.p === p).forEach((s) => out.push(s.after));
  insertsAfter(0);
  paragraphs.forEach((para, i) => {
    const p = i + 1;
    const change = take.find((s) => s.p === p && s.op !== 'insert_after');
    if (!change) out.push(para);
    else if (change.op === 'replace') out.push(change.after);
    insertsAfter(p);
  });
  return out.join('\n\n');
}

/** Where the first accepted change lands in the new prose, for highlighting. */
export function firstChangeRange(paragraphs: string[], suggestions: EditSuggestion[], accepted: Set<string>): [number, number] | null {
  const first = suggestions.find((s) => accepted.has(s.id) && s.op !== 'delete');
  if (!first) return null;
  const prose = applySuggestions(paragraphs, suggestions, accepted);
  const at = prose.indexOf(first.after);
  return at >= 0 ? [at, at + first.after.length] : null;
}
