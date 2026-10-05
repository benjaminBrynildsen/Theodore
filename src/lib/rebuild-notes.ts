// ========== Rebuild notes ==========
// When the author rebuilds a chapter with notes, the notes are the brief:
// they are numbered, placed after the current draft (closest to where the
// model starts writing) and stated to outrank the draft and the outline.
// Afterwards each note is checked against the new chapter, so the author
// sees which were carried out and can redo the rest.
//
// Pure — portable to the mobile app.

export interface NoteCheck {
  note: string;
  status: 'done' | 'partly' | 'missing';
  /** Where or how it shows up in the chapter (or why not). */
  detail?: string;
}

export interface RebuildCheck {
  checkedAt: string;
  results: NoteCheck[];
}

/**
 * The author's notes as separate items: one per line or bullet; a single
 * block of prose is split into sentences, with tiny fragments folded into
 * the sentence before them.
 */
export function splitNotes(text: string, max = 20): string[] {
  const raw = (text || '').trim();
  if (!raw) return [];
  const lines = raw.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const pieces = lines.length > 1
    ? lines
    : (raw.match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) || [raw]).map((s) => s.trim()).filter(Boolean);
  // Separate lines are separate notes; in a block of prose, a tiny fragment
  // ("Yes.") belongs to the sentence before it.
  const out: string[] = [];
  for (const p of pieces) {
    if (lines.length === 1 && out.length && p.split(/\s+/).length < 3) out[out.length - 1] = `${out[out.length - 1]} ${p}`;
    else out.push(p);
  }
  return out.slice(0, max);
}

/** Prompt section placed after the current draft: the notes this rebuild must carry out. */
export function buildRevisionBlock(notes: string[], hasDraft: boolean): string {
  if (!notes.length) return '';
  return `=== REVISION NOTES FROM THE AUTHOR — this rebuild exists to carry these out ===
${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Carry out every note above, visibly, on the page. The notes outrank ${hasDraft ? 'the current draft, ' : ''}the chapter outline and the general guidance earlier in this prompt. If a note means adding a scene, cutting one, moving events, changing what a character does or says, or rewriting a stretch from scratch, do it — don't soften it into a token gesture.${hasDraft ? ' Keep from the draft only what the notes leave alone.' : ''} Stay consistent with established facts, character limits and the story plan unless a note explicitly changes them.`;
}

export function buildNotesCheckPrompt(notes: string[], prose: string): string {
  return `An author rebuilt a chapter with these revision notes. For each note, judge whether the new chapter carries it out.

NOTES:
${notes.map((n, i) => `${i + 1}. ${n}`).join('\n')}

NEW CHAPTER:
${prose}

For each note: "done" if it is clearly carried out, "partly" if only in part or as a token gesture, "missing" if not. "detail" is a short phrase: where it shows up, or what is missing.

Return ONLY JSON, no markdown:
{"results":[{"n":1,"status":"done|partly|missing","detail":"..."}]}`;
}

export function parseNotesCheck(text: string, notes: string[], now = new Date().toISOString()): RebuildCheck | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untrusted model JSON, coerced field by field
  let parsed: any;
  try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(parsed?.results)) return null;
  const byNumber = new Map<number, NoteCheck>();
  for (const r of parsed.results) {
    const n = Math.round(Number(r?.n));
    if (!Number.isFinite(n) || n < 1 || n > notes.length || byNumber.has(n)) continue;
    const status = ['done', 'partly', 'missing'].includes(r?.status) ? r.status : 'missing';
    const detail = String(r?.detail ?? '').trim();
    byNumber.set(n, { note: notes[n - 1], status, ...(detail ? { detail } : {}) });
  }
  if (!byNumber.size) return null;
  const results = notes.map((note, i) => byNumber.get(i + 1) || { note, status: 'missing' as const, detail: 'not checked' });
  return { checkedAt: now, results };
}

/** Notes still to do (missing or only partly carried out). */
export function outstandingNotes(check: RebuildCheck | null | undefined): string[] {
  return (check?.results || []).filter((r) => r.status !== 'done').map((r) => r.note);
}
