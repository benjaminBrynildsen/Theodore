// Joins an Extend continuation onto the existing draft.
//
// Extend generations can start with an unwanted chapter heading or a rehash
// of the last lines, and the previous draft can end mid-sentence (cut off at
// maxTokens). Cases at the seam:
//   - The continuation finishes the cut-off word or sentence ("…came in, sh" +
//     "aggy hair, …"): keep the fragment and join directly, so nothing is lost.
//   - The continuation starts a fresh sentence: trim the dangling fragment
//     back to the last complete sentence, then join as a new paragraph.
//   - The continuation repeats the draft's last paragraph: drop the repeat.

const COMMON_SHORT = new Set([
  'a', 'i', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'oh', 'on', 'or',
  'so', 'to', 'up', 'us', 'we', 'all', 'and', 'any', 'are', 'but', 'can', 'did', 'for', 'got', 'had', 'has', 'her', 'him',
  'his', 'how', 'its', 'let', 'not', 'now', 'off', 'old', 'one', 'our', 'out', 'own', 'saw', 'say', 'see', 'she', 'the',
  'too', 'two', 'was', 'way', 'who', 'why', 'yes', 'yet', 'you', 'car', 'day', 'man', 'new', 'red',
]);

export interface MergedExtension {
  cleanedBase: string;
  cleanedExtension: string;
  /** What goes between them: '' (mid-word), ' ' (mid-sentence) or a paragraph break. */
  joiner: string;
}

export function cleanExtendMerge(baseProse: string, rawExtension: string): MergedExtension {
  const base = baseProse || '';
  let ext = rawExtension.replace(/^\uFEFF/, '');
  const extStartsWithSpace = /^[ \t]/.test(ext);
  ext = ext.replace(/^\s+/, '');

  // Strip leading markdown/plain chapter headings, possibly stacked with blank lines.
  const headingRe = /^(?:#{1,6}\s*)?(?:chapter|ch\.?)\s*\d+[^\n]*\n+/i;
  const titleOnlyRe = /^(?:#{1,6}\s+[^\n]+)\n+/;
  let changed = true;
  while (changed) {
    changed = false;
    if (headingRe.test(ext)) { ext = ext.replace(headingRe, ''); changed = true; }
    if (titleOnlyRe.test(ext)) { ext = ext.replace(titleOnlyRe, ''); changed = true; }
    ext = ext.replace(/^\s+/, '');
  }

  let cleanedBase = base.replace(/\s+$/, '');
  const baseEndsInSpace = /[ \t]$/.test(base);
  const lastTerminator = Math.max(
    cleanedBase.lastIndexOf('.'),
    cleanedBase.lastIndexOf('!'),
    cleanedBase.lastIndexOf('?'),
    cleanedBase.lastIndexOf('"'),
    cleanedBase.lastIndexOf('”'),
  );
  const fragment = lastTerminator > 0 && lastTerminator < cleanedBase.length - 1
    ? cleanedBase.slice(lastTerminator + 1).trim()
    : '';
  const dangling = !!fragment && !/[.!?"”]/.test(fragment);

  if (dangling) {
    // A continuation that starts lowercase (or with punctuation) is finishing the cut-off sentence.
    const continues = /^[a-z,;:)’'—–-]/.test(ext);
    if (continues) {
      // A short last word that isn't a common word ("sh" + "aggy") was cut mid-word.
      const lastWord = cleanedBase.match(/[A-Za-z]+$/)?.[0] || '';
      const midWord = !!lastWord && lastWord.length <= 3 && !COMMON_SHORT.has(lastWord.toLowerCase())
        && !baseEndsInSpace && !extStartsWithSpace && /^[a-z]/.test(ext);
      return { cleanedBase, cleanedExtension: ext.trim(), joiner: midWord || /^[,;:)’'—–-]/.test(ext) ? '' : ' ' };
    }
    // The continuation restated the unfinished sentence (as instructed): replace the
    // fragment with it, in the same paragraph unless the fragment began one.
    const between = cleanedBase.slice(lastTerminator + 1, cleanedBase.length - fragment.length);
    const startsParagraph = /\n/.test(between);
    const restated = ext.toLowerCase().startsWith(fragment.slice(0, Math.min(16, fragment.length)).toLowerCase());
    cleanedBase = cleanedBase.slice(0, lastTerminator + 1).replace(/\s+$/, '');
    if (restated) return { cleanedBase, cleanedExtension: ext.trim(), joiner: startsParagraph ? '\n\n' : ' ' };
  }

  // If the extension's first paragraph appears near the end of the base, drop it as a repeat.
  const firstPara = ext.split(/\n{2,}/)[0]?.trim() || '';
  if (firstPara.length >= 20) {
    const needle = firstPara.slice(0, Math.min(120, firstPara.length)).toLowerCase();
    if (cleanedBase.slice(-4000).toLowerCase().includes(needle)) {
      ext = ext.split(/\n{2,}/).slice(1).join('\n\n').trimStart();
    }
  }

  return { cleanedBase, cleanedExtension: ext.trim(), joiner: cleanedBase.endsWith('\n') ? '\n' : '\n\n' };
}
