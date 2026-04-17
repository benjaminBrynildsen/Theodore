import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'creators');
fs.mkdirSync(OUT_DIR, { recursive: true });

const CREATORS = [
  { slug: 'malva', url: 'https://www.youtube.com/@malvaAI' },
  { slug: 'manu', url: 'https://www.youtube.com/@manuarora' },
  { slug: 'tommy', url: 'https://www.youtube.com/@designertom' },
  { slug: 'tom', url: 'https://www.youtube.com/@theaigrowthlabwithtom' },
  { slug: 'thomas', url: 'https://www.youtube.com/@thomaslundstrm' },
  { slug: 'dan', url: 'https://www.youtube.com/@Dankieft' },
  { slug: 'dom', url: 'https://www.youtube.com/@TechTutorZones' },
  { slug: 'alamin', url: 'https://www.youtube.com/@iam_chonchol' },
  { slug: 'tim', url: 'https://www.youtube.com/@TimHarrisAI' },
  { slug: 'artturi', url: 'https://www.youtube.com/@artturiexplores' },
  { slug: 'bitnext', url: 'https://www.youtube.com/@TheBitNext' },
  { slug: 'ken', url: 'https://www.youtube.com/@KenFornari' },
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchAvatar(channelUrl) {
  const html = await fetch(channelUrl, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en' } }).then(r => r.text());
  // Try og:image first, then the higher-res channel avatar pattern
  let m = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)
      || html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/);
  if (!m) return null;
  return m[1].replace(/&amp;/g, '&');
}

for (const { slug, url } of CREATORS) {
  const outPath = path.join(OUT_DIR, `${slug}.jpg`);
  if (fs.existsSync(outPath)) {
    console.log(`[skip] ${slug} — already exists`);
    continue;
  }
  try {
    const imgUrl = await fetchAvatar(url);
    if (!imgUrl) { console.log(`[miss] ${slug} — no og:image`); continue; }
    const res = await fetch(imgUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) { console.log(`[err] ${slug} — ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(outPath, buf);
    console.log(`[ok]   ${slug} — ${buf.length} bytes from ${imgUrl.slice(0, 80)}...`);
  } catch (e) {
    console.log(`[err]  ${slug} — ${e.message}`);
  }
}
