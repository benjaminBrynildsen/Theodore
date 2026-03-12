/**
 * Generates a default book cover as a data URL using canvas.
 * Bold black text on a clean white background.
 */
export function generateBookCover(title: string): string {
  const size = 600;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Clean white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Prepare text
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const words = title.trim().split(/\s+/);
  const lines: string[] = [];

  // Break into lines of ~2-3 words for visual impact
  if (words.length <= 2) {
    lines.push(...words);
  } else if (words.length <= 4) {
    const mid = Math.ceil(words.length / 2);
    lines.push(words.slice(0, mid).join(' '));
    lines.push(words.slice(mid).join(' '));
  } else {
    const third = Math.ceil(words.length / 3);
    lines.push(words.slice(0, third).join(' '));
    lines.push(words.slice(third, third * 2).join(' '));
    lines.push(words.slice(third * 2).join(' '));
  }

  // Find the best font size to fill the canvas
  const maxWidth = size * 0.85;
  const maxHeight = size * 0.7;
  let fontSize = 120;

  while (fontSize > 24) {
    ctx.font = `900 ${fontSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
    const lineHeight = fontSize * 1.15;
    const totalHeight = lines.length * lineHeight;
    const widthFits = lines.every(line => ctx.measureText(line).width <= maxWidth);
    if (widthFits && totalHeight <= maxHeight) break;
    fontSize -= 2;
  }

  ctx.font = `900 ${fontSize}px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif`;
  const lineHeight = fontSize * 1.15;
  const totalHeight = lines.length * lineHeight;
  const startY = (size - totalHeight) / 2 + lineHeight / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    ctx.fillText(lines[i].toUpperCase(), size / 2, y);
  }

  return canvas.toDataURL('image/png');
}
