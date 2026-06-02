// ========== xAI Grok Audio-Tag Injector ==========
// Reads chapter prose, detects expressive cues attached to dialogue, and
// inserts xAI's inline (`[tag]`) and wrapping (`<tag>...</tag>`) audio tags
// before the text is sent to Grok TTS. Runs server-side on every Grok call —
// source prose in the editor stays clean.
//
// xAI tag spec (as of 2026-05):
//   Inline:   [pause] [long-pause] [hum-tune] [laugh] [chuckle] [giggle] [cry]
//             [tsk] [tongue-click] [lip-smack] [breath] [inhale] [exhale] [sigh]
//   Wrapping: <soft> <whisper> <loud> <build-intensity> <decrease-intensity>
//             <higher-pitch> <lower-pitch> <slow> <fast> <sing-song> <singing>
//             <laugh-speak> <emphasis>
//
// Strategy: for each quoted run of dialogue, scan the attribution clause that
// follows it (and a short window of the action beat that precedes it). Apply
// at most ONE wrapping tag (delivery style) and at most ONE inline tag (action
// like a laugh or sigh) per line. We bias toward under-tagging — over-tagging
// gives the TTS a stiff, performative read.

// Quoted dialogue: smart quotes (“…”) or straight ("…"). Non-greedy.
// Captured groups: opening, body, closing.
const QUOTE_RE = /([“"])([^“”"]+)([”"])/g;

interface CueMatch {
  /** Inline tag to insert immediately after the closing quote, e.g. "[laugh]". */
  inline?: string;
  /** Wrapping tag pair to apply to the body of the quote, e.g. ["<whisper>", "</whisper>"]. */
  wrap?: [string, string];
}

// Order matters — stronger/more specific cues are checked first so they win
// over generic synonyms (e.g. "near-whisper" beats "soft").
const WRAP_CUES: { re: RegExp; tag: string }[] = [
  { re: /\b(whisper(ed|ing|s)?|near[- ]whisper|under (her|his|their|its) breath|hushed|murmur(ed|ing|s)?)\b/i, tag: 'whisper' },
  { re: /\b(shout(ed|ing|s)?|yell(ed|ing|s)?|scream(ed|ing|s)?|bellow(ed|ing|s)?|roar(ed|ing|s)?|barked)\b/i, tag: 'loud' },
  { re: /\bsoft(ly|er)?\b/i, tag: 'soft' },
  { re: /\b(slow(ly|er)?|drawled|drawn out)\b/i, tag: 'slow' },
  { re: /\b(fast|quick(ly|er)?|rapid(ly)?|hurried(ly)?|breathless(ly)?)\b/i, tag: 'fast' },
  { re: /\b(emphasi(s|z)(ed|ing|es)?|stressed|insisted|declared|pronounced)\b/i, tag: 'emphasis' },
  { re: /\b(sang|sing(ing|s)?|hummed)\b/i, tag: 'singing' },
];

// Inline action cues attached to the spoken line. Inserted as `[tag]` after
// the closing quote so the expression plays out as a beat following the line.
const INLINE_CUES: { re: RegExp; tag: string }[] = [
  { re: /\bchuckl(ed|ing|es)?\b/i, tag: 'chuckle' },
  { re: /\bgiggl(ed|ing|es)?\b/i, tag: 'giggle' },
  { re: /\blaugh(ed|ing|s|ter)?\b/i, tag: 'laugh' },
  { re: /\bsigh(ed|ing|s)?\b/i, tag: 'sigh' },
  { re: /\b(sob(bed|bing|s)?|cri(ed|es)|cry(ing)?|weep(ing|ed|s)?|tearful(ly)?)\b/i, tag: 'cry' },
  { re: /\b(exhal(ed|ing|es)?|breathed out)\b/i, tag: 'exhale' },
  { re: /\b(inhal(ed|ing|es)?|breathed in|drew (a |in a )?breath)\b/i, tag: 'inhale' },
  { re: /\b(breath caught|caught (her|his|their|its) breath|sharp breath|gasped|gasping)\b/i, tag: 'breath' },
];

/**
 * Scan ~80 chars on either side of a quote for cues. Returns the best wrapping
 * tag (delivery style) and best inline tag (action) found, if any. The
 * attribution clause AFTER the quote is weighted more heavily because that's
 * where English most often puts speech tags.
 */
function detectCues(before: string, after: string): CueMatch {
  // Trim windows to the immediate vicinity of the quote so we don't pick up
  // cues from an unrelated sentence two paragraphs away.
  const beforeWindow = before.slice(-80);
  const afterWindow = after.slice(0, 120);

  // Stop scanning the "after" window at the next sentence terminator so an
  // attribution clause for the NEXT line doesn't bleed into this one.
  const afterStop = afterWindow.search(/[.!?](?:\s|$)/);
  const afterClause = afterStop >= 0 ? afterWindow.slice(0, afterStop + 1) : afterWindow;

  const haystack = `${beforeWindow} ${afterClause}`;

  let wrap: CueMatch['wrap'];
  for (const cue of WRAP_CUES) {
    if (cue.re.test(haystack)) {
      wrap = [`<${cue.tag}>`, `</${cue.tag}>`];
      break;
    }
  }

  let inline: CueMatch['inline'];
  for (const cue of INLINE_CUES) {
    if (cue.re.test(haystack)) {
      inline = `[${cue.tag}]`;
      break;
    }
  }

  return { wrap, inline };
}

/**
 * Inject xAI pause tags ([pause], [long-pause]) at natural prose
 * boundaries. Pure function. Idempotent-ish — calling twice would
 * double-up tags, so only call once per chapter at the whole-prose level
 * before parseDialogue splits it. See docs/tts-pauses.md for the playbook.
 *
 * Boundary → tag mapping mirrors the newline scheme in addTTSPacing:
 *   paragraph break       → [long-pause]
 *   sentence end          → [pause]
 *   narration → dialogue  → [pause] before the opening quote
 *   dialogue → narration  → [pause] after the closing quote
 *   em-dash mid-sentence  → [pause]
 *   ellipsis              → [long-pause]
 *   semicolon             → [pause]
 *   scene break (*** etc) → [long-pause] before and after
 */
export function injectPauseTags(prose: string): string {
  if (!prose) return prose;
  let r = prose;

  // v4 (2026-06-02): dropped [long-pause] entirely — Grok was reading it
  // as literal text. All long durations are now represented as multiple
  // [pause] tags (3 × [pause] ≈ one prior [long-pause]). Also tripled
  // all counts per Ben's feedback that pauses weren't audible enough.
  // Ellipsis: removed the preserved dot characters — the dots themselves
  // shouldn't be heard.

  // v5 (2026-06-02 — emergency rollback). Symptom: Grok TTS was
  // hallucinating "Chapter 5" audio at the position of `[pause]` clusters
  // (replaying buffered context from the announcement) and mumbling
  // words near dense tag groupings. Cause: 1000+ pause tags per chapter
  // overwhelmed Grok's parser and bloated chunks past the 15K char limit.
  //
  // Strategy: minimize bracket-tag density. One [pause] per location is
  // sufficient — Grok renders each as a real beat (~0.3s). For longer
  // pauses (scene break, chapter intro) we cap at 3× so we never have a
  // dense cluster. Total pause tags per chapter ≈ 150 (vs ~1000+ in v4).

  const PAUSE_1 = '[pause]';
  const PAUSE_3 = '[pause] [pause] [pause]';

  // 0a. Chapter intro — em-dash + ≥4 newlines + capital. Capped at 3.
  r = r.replace(/—\s*\n{4,}\s*(?=["“]?[A-Z])/g, `\n\n${PAUSE_3}\n\n`);

  // 0b. Scene breaks — 3 (was 36).
  r = r.replace(/\n+\s*(?:\*{3,}|-{3,}|_{3,})\s*\n+/g, `\n\n${PAUSE_3}\n\n`);

  // 1. Narration → dialogue: 1.
  r = r.replace(/([.!?])\s+(["“])/g, `$1 ${PAUSE_1} $2`);

  // 2. Dialogue → narration: 1.
  r = r.replace(/(["”][.!?]?)\s+([A-Z][a-z])/g, `$1 ${PAUSE_1} $2`);

  // 3. Paragraph breaks: 1.
  r = r.replace(/\n\n+/g, `\n\n${PAUSE_1}\n\n`);

  // 4. Sentence boundaries inside a paragraph: 1.
  r = r.replace(/([.!?])\s+([A-Z])/g, `$1 ${PAUSE_1} $2`);

  // 5. Em-dash pauses: 1.
  r = r.replace(/\s*—\s*/g, ` — ${PAUSE_1} `);

  // 6. Ellipsis: 1 (dots stripped).
  r = r.replace(/\.{3}/g, ` ${PAUSE_1} `);
  r = r.replace(/…/g, ` ${PAUSE_1} `);

  // 7. Semicolons: 1.
  r = r.replace(/;\s+/g, `; ${PAUSE_1} `);

  return r;
}

/**
 * Inject xAI audio tags into prose. Pure function — safe to call on any text.
 * Returns the original string unchanged when the text contains no quoted
 * dialogue (e.g. voice previews, exposition-only chapters).
 */
export function injectGrokAudioTags(prose: string): string {
  if (!prose || !prose.includes('"') && !/[“”]/.test(prose)) return prose;

  let result = '';
  let lastIndex = 0;
  QUOTE_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = QUOTE_RE.exec(prose)) !== null) {
    const [full, open, body, close] = match;
    const start = match.index;
    const end = start + full.length;

    const before = prose.slice(lastIndex, start);
    const after = prose.slice(end);
    const { wrap, inline } = detectCues(prose.slice(0, start), after);

    result += before;

    // Tags go INSIDE the quote so they survive multi-voice segmentation —
    // parseDialogue splits prose by quote, and anything OUTSIDE the quote
    // marks would end up in adjacent narration segments and be silently
    // stripped before TTS. Inside the quote, the whole tagged body travels
    // with the dialogue to xAI.
    //   wrap   → `"<whisper>body</whisper>"`
    //   inline → `"body [laugh]"`
    //   both   → `"<whisper>body [laugh]</whisper>"`
    let taggedBody = body;
    if (inline) taggedBody = `${taggedBody.trimEnd()} ${inline}`;
    if (wrap) taggedBody = `${wrap[0]}${taggedBody}${wrap[1]}`;
    result += `${open}${taggedBody}${close}`;

    lastIndex = end;
  }
  result += prose.slice(lastIndex);
  return result;
}
