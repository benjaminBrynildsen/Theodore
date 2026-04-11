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

// Canvas: add Theodore watermark onto background image.
// For 'typography' style, also composites the book title as large bold text.
// Returns a base64 data URL.
export function compositeWatermark(
  backgroundUrl: string,
  options?: { style?: string; title?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
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
      const centerBright = avgBrightness(size * 0.1, size * 0.2, size * 0.8, size * 0.6);
      const topBright = avgBrightness(0, 0, size, 70);
      const isLight = centerBright > 140;
      const watermarkColor = topBright > 140 ? '#000000' : '#ffffff';

      // Bold Typography style: title IS the cover — huge, heavy, fills the canvas
      if (options?.style === 'typography' && options?.title) {
        const title = options.title.toUpperCase();

        // Always darken the background so white text pops
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, size, size);
        const textColor = '#FFFFFF';

        // Load Bebas Neue (heavy condensed) via FontFace API for consistent rendering
        const fontFamily = 'BebasNeue-Cover';
        const fontUrl = 'https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2';
        let fontLoaded = false;
        try {
          const face = new FontFace(fontFamily, `url(${fontUrl})`);
          const loaded = await face.load();
          (document.fonts as any).add(loaded);
          fontLoaded = true;
        } catch { /* fall back to Impact */ }

        const fontStack = fontLoaded
          ? `"${fontFamily}", Impact, sans-serif`
          : 'Impact, "Arial Black", sans-serif';

        const maxWidth = size * 0.90;
        const padding = size * 0.05;
        let fontSize = 340;
        let lines: string[] = [];

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        function wrapText(fs: number): string[] {
          ctx.font = `${fs}px ${fontStack}`;
          const words = title.split(' ');
          const result: string[] = [];
          let line = '';
          for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (ctx.measureText(test).width > maxWidth && line) {
              result.push(line);
              line = word;
            } else {
              line = test;
            }
          }
          if (line) result.push(line);
          return result;
        }

        // Start at 340px, shrink until text fills ~85% of canvas
        while (fontSize > 60) {
          lines = wrapText(fontSize);
          const blockHeight = lines.length * fontSize * 0.90;
          if (blockHeight < size * 0.85) break;
          fontSize -= 8;
        }

        const lineHeight = fontSize * 0.90;
        const blockHeight = lines.length * lineHeight;
        const startY = (size - blockHeight) / 2;

        ctx.font = `${fontSize}px ${fontStack}`;
        ctx.fillStyle = textColor;

        // Drop shadow
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], padding, startY + i * lineHeight);
        }

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      // Theodore wordmark — top center, brightness-adaptive
      const wmBright = options?.style === 'typography' ? centerBright : topBright;
      const wmColor = options?.style === 'typography'
        ? (isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)')
        : watermarkColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = '600 32px Georgia, "Palatino Linotype", serif';
      ctx.fillStyle = wmColor;
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
export async function generateCover(project: Project, chapterHints?: string, styleOverride?: string): Promise<string> {
  const style = styleOverride || autoSelectCoverStyle(project.narrativeControls);

  // Include title + hints in the prompt so the server can build a good
  // cover even for guest projects that aren't in the DB.
  const promptParts = [`Book: "${project.title}" (${project.subtype || project.type || 'novel'})`];
  if (chapterHints) promptParts.push(`Story context: ${chapterHints}`);
  const result = await generateImageApi({
    target: 'cover',
    projectId: project.id,
    aspectRatio: '1:1',
    style: style as any,
    prompt: promptParts.join('. '),
  });

  const composited = await compositeWatermark(result.imageUrl, {
    style,
    title: project.title,
  });

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
