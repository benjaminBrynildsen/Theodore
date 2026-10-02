// Strip internal production tags from reader/export output.
// Keeps source prose untouched in editor/studio.

export function stripDialogueSpeakerTags(text: string): string {
  if (!text) return text;
  return text
    // Tags before a quote: [Narrator] "...", [Coach Dorsey] "..."
    .replace(/\[([^\]\n]{1,80})\]\s*(?=["“'])/g, '')
    // Tags opening a paragraph of narration: [Wes Garrity] Wes checked...
    // (no colon inside, so author flags like [NEW: ...] are kept)
    .replace(/^([ \t]*)\[[A-Z][^\]\n:]{0,60}\][ \t]+/gm, '$1');
}

/** A paragraph that is only a scene-break mark ("***", "* * *", "#", "---", "· · ·"). */
export function isSceneBreakLine(line: string): boolean {
  return /^[ \t]*(?:[-*_~=#•·◆◇—–][ \t]*){3,}$|^[ \t]*(?:#|[◆◇§]|—|–)[ \t]*$/.test(line);
}

// A line that is nothing but a scene-break mark the model wrote on its own
// ("---", "***", "* * *", "###", "~~~", "—", "· · ·", "◆"). Markdown-trained
// models emit these even when told to use blank lines.
const SCENE_BREAK_LINE = /^[ \t]*(?:[-*_~=#•·◆◇—–][ \t]*){3,}$|^[ \t]*(?:#|[◆◇§]|—|–)[ \t]*$/gm;

/**
 * Normalize stray scene-break lines to the author's chosen style.
 * 'blank' removes them (the blank line between paragraphs is the break);
 * any other style replaces them with that marker. Only whole lines made
 * purely of break symbols are touched.
 */
export function normalizeSceneBreaks(text: string, style: string = 'blank'): string {
  if (!text) return text;
  const marker = style === 'blank' ? '' : style;
  if (!SCENE_BREAK_LINE.test(text)) return text;
  SCENE_BREAK_LINE.lastIndex = 0;
  let out = text.replace(SCENE_BREAK_LINE, marker);
  if (!marker) out = out.replace(/\n{3,}/g, '\n\n');
  return out.replace(/^\s+/, '').replace(/\s+$/, '') + (text.endsWith('\n') ? '\n' : '');
}
