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

// Canvas: composite title + Theodore watermark onto background image.
// Returns a base64 data URL.
const STYLE_FONTS: Record<string, { font: string; uppercase: boolean }> = {
  minimalist: { font: '900 Inter, system-ui, sans-serif', uppercase: true },
  illustrated: { font: '800 "Palatino Linotype", "Book Antiqua", Palatino, serif', uppercase: false },
  dark: { font: '900 "Arial Black", "Arial Bold", Impact, sans-serif', uppercase: true },
  vintage: { font: '700 "Palatino Linotype", "Book Antiqua", Georgia, serif', uppercase: false },
  bold: { font: '900 Inter, system-ui, sans-serif', uppercase: true },
};

export function compositeTitle(
  backgroundUrl: string,
  title: string,
  coverStyle: string,
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
      const bottomBright = avgBrightness(0, size - 200, size, 200);
      const titleColor = bottomBright > 140 ? '#000000' : '#ffffff';
      const watermarkColor = topBright > 140 ? '#000000' : '#ffffff';
      const gradDark = bottomBright > 140;

      // Bottom gradient
      const grad = ctx.createLinearGradient(0, size * 0.65, 0, size);
      const gc = gradDark ? '255,255,255' : '0,0,0';
      grad.addColorStop(0, `rgba(${gc},0)`);
      grad.addColorStop(0.5, `rgba(${gc},0.2)`);
      grad.addColorStop(1, `rgba(${gc},0.5)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      // Theodore wordmark — top center
      ctx.textAlign = 'center';
      ctx.font = '600 26px Georgia, "Palatino Linotype", serif';
      ctx.fillStyle = watermarkColor;
      ctx.shadowColor = topBright > 140 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fillText('Theodore', size / 2, 50);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      // Title
      const fontConfig = STYLE_FONTS[coverStyle] || STYLE_FONTS.illustrated;
      const displayTitle = fontConfig.uppercase ? title.toUpperCase() : title;
      const fontWeight = fontConfig.font.match(/^\d+/)?.[0] || '800';
      const fontFamily = fontConfig.font.replace(/^\d+\s*/, '');
      const pad = 40;
      const maxWidth = size - pad * 2;
      const wordList = displayTitle.split(/\s+/);

      let baseFontSize = 90;
      let lines: string[] = [];
      for (; baseFontSize >= 32; baseFontSize -= 3) {
        ctx.font = `${fontWeight} ${baseFontSize}px ${fontFamily}`;
        lines = [];
        let cur = '';
        for (const word of wordList) {
          const test = cur ? `${cur} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = word; }
          else cur = test;
        }
        if (cur) lines.push(cur);
        if (lines.length <= 3) break;
      }

      const lineHeight = baseFontSize * 1.12;
      const totalHeight = lines.length * lineHeight;
      const startY = size - 50 - totalHeight + baseFontSize;

      ctx.fillStyle = titleColor;
      ctx.shadowColor = bottomBright > 140 ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;

      for (let i = 0; i < lines.length; i++) {
        let lfs = baseFontSize;
        ctx.font = `${fontWeight} ${lfs}px ${fontFamily}`;
        const nw = ctx.measureText(lines[i]).width;
        if (nw > 0) lfs = Math.min(baseFontSize * 1.6, lfs * (maxWidth / nw));
        ctx.font = `${fontWeight} ${Math.round(lfs)}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(lines[i], size / 2, startY + i * lineHeight);
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load cover background'));
    img.src = backgroundUrl;
  });
}

// Full cover generation pipeline: generate art → composite title → upload → return URL
export async function generateCover(project: Project, chapterHints?: string): Promise<string> {
  const style = autoSelectCoverStyle(project.narrativeControls);

  const result = await generateImageApi({
    target: 'cover',
    projectId: project.id,
    aspectRatio: '1:1',
    style: style as any,
    prompt: chapterHints ? `Story context: ${chapterHints}` : undefined,
  });

  const composited = await compositeTitle(result.imageUrl, project.title, style);

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
