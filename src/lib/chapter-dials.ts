// ========== Chapter dials ==========
// The three sliders on the generate screen: how long the chapter is, how much
// of it is dialogue, and how fast and charged it moves. Defaults are ready to
// go; whatever the author picks is remembered on the chapter.
//
// Pure — portable to the mobile app.

export interface ChapterDials {
  words: number;
  /** Share of the chapter's words in spoken lines, 0-100. */
  dialoguePct: number;
  /** 1 = slow and reflective … 5 = fast and intense. */
  pace: number;
}

export const WORDS_MIN = 500;
export const WORDS_MAX = 6000;
export const WORDS_STEP = 250;
export const DIALOGUE_MIN = 10;
export const DIALOGUE_MAX = 80;
export const DIALOGUE_STEP = 5;

export const DEFAULT_DIALS: ChapterDials = { words: 2500, dialoguePct: 35, pace: 3 };

export const PACE_LABELS: Record<number, string> = {
  1: 'Slow & reflective',
  2: 'Measured',
  3: 'Balanced',
  4: 'Brisk',
  5: 'Fast & intense',
};

const PACE_GUIDANCE: Record<number, string> = {
  1: 'Slow and reflective. Let moments breathe: interiority, setting and sensory detail, longer flowing sentences, quiet scenes given room. Low physical action; tension, if any, simmers.',
  2: 'Measured. Unhurried but always moving: room for reflection and texture between events, tension that builds gradually.',
  3: 'Balanced. Mix action, dialogue and reflection the way the scenes need; vary sentence length and keep the story moving.',
  4: 'Brisk. Keep it moving: enter scenes late and leave early, favor action and exchange over reflection, shorter paragraphs, quick transitions, rising tension.',
  5: 'Fast and intense. High energy and momentum: short punchy sentences and paragraphs in the action, urgent stakes, minimal reflection, quick cuts between beats, constant forward pressure.',
};

function clamp(n: unknown, lo: number, hi: number, step: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(v / step) * step));
}

/** Saved dials (or anything else) → valid dials, falling back to the defaults. */
export function normalizeDials(raw: unknown, base: ChapterDials = DEFAULT_DIALS): ChapterDials {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<ChapterDials>;
  return {
    words: clamp(r.words, WORDS_MIN, WORDS_MAX, WORDS_STEP, base.words),
    dialoguePct: clamp(r.dialoguePct, DIALOGUE_MIN, DIALOGUE_MAX, DIALOGUE_STEP, base.dialoguePct),
    pace: clamp(r.pace, 1, 5, 1, base.pace),
  };
}

export function formatWords(words: number): string {
  return words >= 1000 ? `${Number((words / 1000).toFixed(2))}k` : String(words);
}

/** Prompt section: this chapter's dialogue share and pace, which win over the book-wide guidance. */
export function buildDialsBlock(dials: ChapterDials): string {
  const pct = dials.dialoguePct;
  const band = `${Math.max(0, pct - 5)}–${Math.min(100, pct + 5)}%`;
  return `=== THIS CHAPTER'S SETTINGS (chosen by the author — they override the book-wide dialogue and pacing guidance for this chapter) ===
- Dialogue: about ${pct}% of the chapter's words should be spoken lines (${band}). ${pct >= 55
    ? 'This is a dialogue-heavy chapter: carry the scenes through conversation, with narration kept to beats, attribution and what is needed to stage it.'
    : pct <= 20
      ? 'Keep dialogue sparse: tell this chapter mostly through action, narration and interiority, with only the lines that matter.'
      : 'Balance spoken lines with action, description and interiority.'}
- Pace & energy (${PACE_LABELS[dials.pace]}): ${PACE_GUIDANCE[dials.pace]}`;
}

/** Share of words inside quotation marks — a rough check of the dialogue dial. */
export function measureDialoguePct(prose: string): number {
  const text = prose || '';
  const total = text.split(/\s+/).filter(Boolean).length;
  if (!total) return 0;
  const quoted = (text.match(/[“"][^”"]*[”"]/g) || []).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.round((quoted / total) * 100);
}
