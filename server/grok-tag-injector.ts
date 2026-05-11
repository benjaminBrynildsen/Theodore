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
    if (wrap) {
      result += `${wrap[0]}${open}${body}${close}${wrap[1]}`;
    } else {
      result += `${open}${body}${close}`;
    }
    if (inline) {
      // Insert right after the closing quote so the beat plays after the line.
      result += ` ${inline}`;
    }

    lastIndex = end;
  }
  result += prose.slice(lastIndex);
  return result;
}
