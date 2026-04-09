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
  if (dark && !grim) return 'vintage';
  if (serious && !dark) return 'minimalist';
  if (whimsical) return 'bold';
  return 'illustrated';
}

// Canvas: add Theodore watermark onto background image.
// No title text — title is displayed in the UI everywhere the cover appears.
// Returns a base64 data URL.
export function compositeWatermark(
  backgroundUrl: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 1024;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

      // Brightness detection
      function avgBrightness(x: number, y: number, rw: number, rh: number): number {
        const data = ctx.getImageData(x, y, rw, rh).data;
        let sum = 0, count = 0;
        for (let i = 0; i < data.length; i += 64) {
          sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          count++;
        }
        return count > 0 ? sum / count : 128;
      }
      const topBright = avgBrightness(0, 0, size, 70);
      const watermarkColor = topBright > 140 ? '#000000' : '#ffffff';

      // Theodore wordmark — top center, brightness-adaptive
      ctx.textAlign = 'center';
      ctx.font = '600 32px Georgia, "Palatino Linotype", serif';
      ctx.fillStyle = watermarkColor;
      ctx.shadowColor = topBright > 140 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 1;
      ctx.fillText('Theodore', size / 2, 54);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load cover background'));
    img.src = backgroundUrl;
  });
}

// Full cover generation pipeline: generate art → add watermark → upload → return URL
export async function generateCover(project: Project, chapterHints?: string): Promise<string> {
  const style = autoSelectCoverStyle(project.narrativeControls);

  const result = await generateImageApi({
    target: 'cover',
    projectId: project.id,
    aspectRatio: '1:1',
    style: style as any,
    prompt: chapterHints ? `Story context: ${chapterHints}` : undefined,
  });

  const composited = await compositeWatermark(result.imageUrl);

  const uploadRes = await fetch('/api/upload/cover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ image: composited, projectId: project.id }),
  });
  const uploadData = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(uploadData.error || 'Cover upload failed');

  return uploadData.coverUrl;
}
