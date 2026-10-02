// Detects dialogue the reader can't attribute: lines with no speech tag and no
// named speaker in the paragraph. Drives the post-generation clarity pass.
// Pure — portable to the mobile app.

const SPEECH_VERB = /\b(said|says|asked|asks|replied|replies|answered|told|called|added|whispered|murmured|muttered|snapped|shouted|yelled|repeated|continued|admitted|agreed|offered|insisted|warned|explained|began)\b/i;
const QUOTED = /["“][^"”]*["”]?/g;

export interface AttributionReport {
  dialogueParagraphs: number;
  /** Dialogue paragraphs with no speech verb and no character named outside the quotes. */
  unattributed: number;
  /** Longest run of consecutive unattributed dialogue paragraphs. */
  longestRun: number;
}

function nameMatcher(names: string[]): RegExp | null {
  const words = Array.from(new Set(names.flatMap((n) => [n, n.split(/\s+/)[0]]).map((w) => w.trim()).filter((w) => w.length >= 2)));
  if (!words.length) return null;
  const esc = words.sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?<![\\p{L}])(?:${esc.join('|')})(?![\\p{L}])`, 'u');
}

export function analyzeAttribution(text: string, characterNames: string[] = []): AttributionReport {
  const names = nameMatcher(characterNames);
  const paragraphs = text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
  let dialogueParagraphs = 0;
  let unattributed = 0;
  let run = 0;
  let longestRun = 0;
  for (const p of paragraphs) {
    if (!/["“]/.test(p)) { run = 0; continue; }
    dialogueParagraphs++;
    const narration = p.replace(QUOTED, ' ');
    const attributed = SPEECH_VERB.test(narration) || (names ? names.test(narration) : false);
    if (attributed) { run = 0; continue; }
    unattributed++;
    run++;
    longestRun = Math.max(longestRun, run);
  }
  return { dialogueParagraphs, unattributed, longestRun };
}

/**
 * Standard practice allows at most two untagged lines in a row, in a two-person
 * exchange. Run the clarity pass when a chapter goes past that, or leaves
 * several lines unattributed overall.
 */
export function needsDialogueClarityPass(text: string, characterNames: string[] = []): boolean {
  const r = analyzeAttribution(text, characterNames);
  return r.longestRun >= 3 || r.unattributed >= 4;
}
