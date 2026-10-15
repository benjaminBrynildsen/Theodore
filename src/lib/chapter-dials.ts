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
  /** Natural speech: dialogue that sounds spoken — drawn-out words, trailing off, interruptions, false starts. */
  natural: boolean;
}

export const WORDS_MIN = 500;
export const WORDS_MAX = 6000;
export const WORDS_STEP = 250;
export const DIALOGUE_MIN = 10;
export const DIALOGUE_MAX = 80;
export const DIALOGUE_STEP = 5;

export const DEFAULT_DIALS: ChapterDials = { words: 2500, dialoguePct: 35, pace: 3, natural: false };

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
    natural: typeof r.natural === 'boolean' ? r.natural : base.natural,
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
- Pace & energy (${PACE_LABELS[dials.pace]}): ${PACE_GUIDANCE[dials.pace]}${dials.natural ? `\n${buildNaturalSpeechBlock()}` : ''}`;
}

/**
 * Natural speech: dialogue written the way people actually talk, which also
 * plays well in narration (a stretched "Andddd" or a cut-off line reads aloud
 * the way it's meant). Used sparingly so it lands as character, not a tic.
 */
export function buildNaturalSpeechBlock(): string {
  return `- Natural speech (on): write dialogue the way people really talk, in each character's own voice.
  • Stretch a word for emphasis or teasing when the moment calls for it: "Andddd I'm ignoring it." "Sooo… that's a no?" "Nooo." Three or four repeated letters at most.
  • Let people trail off ("I just thought maybe…"), restart mid-thought ("I was — no, forget it."), hedge, repeat themselves, and answer a different question than the one asked.
  • Now and then someone gets cut off: end the broken line with an em dash right after the last word ("If you'd just listen—") and start the next speaker's line immediately. Use an em dash for this even if em dashes are otherwise avoided. At most once or twice a chapter, where tension or comedy earns it.
  • Fillers and contractions where they fit the speaker ("I mean," "like," "yeah, no," "gonna"); clipped replies; people talking past each other.
  • Keep it sparing and readable: a couple of these per scene, not every line. Narration stays clean; only the spoken lines loosen up. Never misspell words outside of deliberate stretching, and keep every line easy to follow when read aloud.`;
}

/** Share of words inside quotation marks — a rough check of the dialogue dial. */
export function measureDialoguePct(prose: string): number {
  const text = prose || '';
  const total = text.split(/\s+/).filter(Boolean).length;
  if (!total) return 0;
  const quoted = (text.match(/[“"][^”"]*[”"]/g) || []).join(' ').split(/\s+/).filter(Boolean).length;
  return Math.round((quoted / total) * 100);
}
