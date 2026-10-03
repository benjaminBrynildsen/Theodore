// Splitting a chapter's prose into scenes for narration. Every paragraph must
// land in exactly one scene, in order — audio is generated from scene prose,
// so anything dropped here is silently missing from the audiobook.
//
// Pure — portable to the mobile app.

import { isSceneBreakLine } from './clean-prose';

/** Chapter prose cut at its scene-break lines (***, #, …). Breaks themselves are dropped. */
export function splitAtSceneBreaks(prose: string): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (const line of prose.split('\n')) {
    if (isSceneBreakLine(line)) {
      if (current.join('\n').trim()) segments.push(current.join('\n').trim());
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.join('\n').trim()) segments.push(current.join('\n').trim());
  return segments;
}

/**
 * Turn the model's paragraph → scene numbers into a safe assignment: unknown
 * or missing numbers follow the previous paragraph, numbers never go back
 * (paragraphs stay in order), and the result always has one entry per
 * paragraph, each a valid index into `sceneCount` scenes (0-based).
 */
export function sanitizeAssignments(raw: unknown[], paragraphCount: number, sceneCount: number): number[] {
  const out: number[] = [];
  let last = 0;
  for (let i = 0; i < paragraphCount; i++) {
    const n = Math.round(Number(raw[i]));
    let idx = Number.isFinite(n) && n >= 1 && n <= sceneCount ? n - 1 : last;
    if (idx < last) idx = last;
    out.push(idx);
    last = idx;
  }
  return out;
}

/** Paragraphs grouped by assignment; empty scenes stay empty strings. */
export function groupParagraphs(paragraphs: string[], assignments: number[], sceneCount: number): string[] {
  const groups: string[][] = Array.from({ length: sceneCount }, () => []);
  paragraphs.forEach((p, i) => groups[Math.min(sceneCount - 1, Math.max(0, assignments[i] ?? 0))].push(p));
  return groups.map((g) => g.join('\n\n'));
}

/** Even split by paragraphs (last resort). */
export function evenSplit(paragraphs: string[], sceneCount: number): string[] {
  const per = Math.ceil(paragraphs.length / Math.max(1, sceneCount));
  return Array.from({ length: sceneCount }, (_, i) => paragraphs.slice(i * per, (i + 1) * per).join('\n\n'));
}

/** True when the scenes together hold all of the chapter's text (ignoring whitespace and break lines). */
export function coversProse(prose: string, sceneProse: string[]): boolean {
  const squash = (t: string) => t.split('\n').filter((l) => !isSceneBreakLine(l)).join('').replace(/\s+/g, '');
  return squash(sceneProse.join('\n')) === squash(prose);
}

/**
 * Last line of defence before scenes are saved: if the scenes don't hold the
 * whole chapter (a boundary sentence didn't match, the model rewrote text),
 * re-split at the chapter's scene breaks, or evenly by paragraph.
 */
export function ensureSceneCoverage<T extends { prose: string; order: number }>(prose: string, scenes: T[]): T[] {
  if (!scenes.length || coversProse(prose, scenes.map((s) => s.prose || ''))) return scenes;
  const ordered = [...scenes].sort((a, b) => a.order - b.order);
  const segments = splitAtSceneBreaks(prose);
  const paragraphs = prose.split(/\n\n+/).filter((p) => p.trim() && !isSceneBreakLine(p.trim()));
  const parts = segments.length === ordered.length ? segments : evenSplit(paragraphs, ordered.length);
  return ordered.map((s, i) => ({ ...s, prose: parts[i] || '' }));
}
