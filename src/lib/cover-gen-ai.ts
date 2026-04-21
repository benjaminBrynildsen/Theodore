// AI cover generation — shared logic used by both the manual BookCoverSection
// button and the automatic cover generation after project creation.

import { generateImageApi } from './image-gen';
import type { Project } from '../types';

// Auto-select cover style based on the project's narrative tone controls.
// Maps toneMood sliders (0-100 each) to the style that best matches the vibe.
export function autoSelectCoverStyle(nc: Project['narrativeControls']): string {
  const tm = nc?.toneMood;
  if (!tm) return 'illustrated';

  const dark = (tm.lightDark ?? 50) > 60;
  const grim = (tm.hopefulGrim ?? 50) > 60;
  const serious = (tm.whimsicalSerious ?? 50) > 70;
  const whimsical = (tm.whimsicalSerious ?? 50) < 35;

  if (dark && grim) return 'dark';
  if (dark && !grim) return 'silhouette';
  if (serious && !dark) return 'iconic';
  if (whimsical) return 'illustrated';
  return 'illustrated';
}

// Full cover generation pipeline: server generates art + bakes in the
// Theodore wordmark, then returns the final URL. No client-side composite.
export async function generateCover(project: Project, chapterHints?: string, styleOverride?: string): Promise<string> {
  const style = styleOverride || autoSelectCoverStyle(project.narrativeControls);

  const promptParts = [`Book: "${project.title}" (${project.subtype || project.type || 'novel'})`];
  if (chapterHints) promptParts.push(`Story context: ${chapterHints}`);
  const result = await generateImageApi({
    target: 'cover',
    projectId: project.id,
    aspectRatio: '1:1',
    style: style as any,
    prompt: promptParts.join('. '),
  });

  return result.imageUrl;
}
