// Server-side cover watermarking. Ported from src/lib/cover-gen-ai.ts
// `compositeWatermark`, rendered with @napi-rs/canvas so the "Theodore"
// wordmark (and, for typography-style covers, the big title) is baked
// into the stored image on disk. That way mobile + web + any future
// client all consume the same finished cover — no per-client overlay.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'generated');
const FONT_DIR = path.join(process.cwd(), 'server', 'assets', 'fonts');

let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  try {
    const regular = path.join(FONT_DIR, 'CoverSerif.ttf');
    const bold = path.join(FONT_DIR, 'CoverSerif-Bold.ttf');
    if (fs.existsSync(regular)) GlobalFonts.registerFromPath(regular, 'CoverSerif');
    if (fs.existsSync(bold)) GlobalFonts.registerFromPath(bold, 'CoverSerifBold');
  } catch (err) {
    console.warn('[watermark] font registration failed:', err);
  }
  fontsRegistered = true;
}

export async function applyCoverWatermark(params: {
  sourcePath: string;         // absolute filesystem path to the generated cover
  style?: string;             // cover style id (e.g. 'typography', 'illustrated')
  title?: string;             // book title, used when style === 'typography'
}): Promise<{ filename: string; imageUrl: string; absolutePath: string }> {
  ensureFonts();
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const img = await loadImage(params.sourcePath);
  const size = 1024;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const scale = Math.max(size / img.width, size / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);

  const avgBrightness = (x: number, y: number, rw: number, rh: number): number => {
    const data = ctx.getImageData(x, y, rw, rh).data;
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i += 64) {
      sum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      count++;
    }
    return count > 0 ? sum / count : 128;
  };
  const centerBright = avgBrightness(Math.floor(size * 0.1), Math.floor(size * 0.2), Math.floor(size * 0.8), Math.floor(size * 0.6));
  const topBright = avgBrightness(0, 0, size, 70);
  const isLight = centerBright > 140;
  const watermarkColor = topBright > 140 ? '#000000' : '#ffffff';

  const serifStack = '"CoverSerif", Georgia, "Palatino Linotype", serif';
  const serifBoldStack = '"CoverSerifBold", "CoverSerif", Georgia, serif';

  if (params.style === 'typography' && params.title) {
    const title = params.title.toUpperCase();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, size, size);
    const textColor = '#FFFFFF';

    const maxWidth = size * 0.90;
    const padding = size * 0.05;
    let fontSize = 340;
    let lines: string[] = [];
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const wrapText = (fs2: number): string[] => {
      ctx.font = `700 ${fs2}px ${serifBoldStack}`;
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
    };

    while (fontSize > 60) {
      lines = wrapText(fontSize);
      const blockHeight = lines.length * fontSize * 0.90;
      if (blockHeight < size * 0.85) break;
      fontSize -= 8;
    }

    const lineHeight = fontSize * 0.90;
    const blockHeight = lines.length * lineHeight;
    const startY = (size - blockHeight) / 2;

    ctx.font = `700 ${fontSize}px ${serifBoldStack}`;
    ctx.fillStyle = textColor;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 6;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], padding, startY + i * lineHeight);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  const wmColor = params.style === 'typography'
    ? (isLight ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.3)')
    : watermarkColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 32px ${serifStack}`;
  ctx.fillStyle = wmColor;
  ctx.shadowColor = topBright > 140 ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.fillText('Theodore', size / 2, 54);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const filename = `${crypto.randomUUID()}.webp`;
  const absolutePath = path.join(UPLOADS_DIR, filename);
  const buffer = await canvas.encode('webp', 92);
  fs.writeFileSync(absolutePath, buffer);

  return {
    filename,
    imageUrl: `/uploads/generated/${filename}`,
    absolutePath,
  };
}
