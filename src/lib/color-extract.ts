// Extract dominant color from an image for dynamic UI theming.
// Uses Canvas pixel sampling — fast, no dependencies.

const cache = new Map<string, string>();

/**
 * Extracts the dominant dark color from an image URL.
 * Returns a CSS color string like 'rgb(45, 32, 28)'.
 * Results are cached by URL.
 */
export function extractDominantColor(imageUrl: string): Promise<string> {
  const cached = cache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Small canvas for speed — we only need color data, not detail
        const size = 50;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Bucket colors into a reduced palette (divide by 32 → 8 buckets per channel)
        const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
        for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue; // skip transparent

          // Skip near-black (boring) and pure white (uninformative)
          const luminance = r * 0.299 + g * 0.587 + b * 0.114;
          if (luminance > 245 || luminance < 10) continue;

          const key = `${Math.floor(r / 32)}-${Math.floor(g / 32)}-${Math.floor(b / 32)}`;
          const existing = buckets.get(key);
          if (existing) {
            existing.r += r;
            existing.g += g;
            existing.b += b;
            existing.count++;
          } else {
            buckets.set(key, { r, g, b, count: 1 });
          }
        }

        // Find the most common bucket
        let best = { r: 40, g: 40, b: 45, count: 0 }; // fallback dark gray
        for (const bucket of buckets.values()) {
          if (bucket.count > best.count) best = bucket;
        }

        // Average the bucket colors. Slight darken (0.7) so it works as a
        // background without washing out, but preserves the actual hue —
        // warm covers stay warm, cool covers stay cool, light covers stay light-ish.
        const avgR = Math.round((best.r / best.count) * 0.7);
        const avgG = Math.round((best.g / best.count) * 0.7);
        const avgB = Math.round((best.b / best.count) * 0.7);
        const toHex = (n: number) => n.toString(16).padStart(2, '0');

        const color = `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
        cache.set(imageUrl, color);
        resolve(color);
      } catch {
        resolve('#18181e'); // fallback
      }
    };
    img.onerror = () => resolve('#18181e');
    img.src = imageUrl;
  });
}
