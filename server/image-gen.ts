// ========== Image Generation Service — Gemini Nano Banana 2 ==========
// Uses gemini-3.1-flash-image-preview for high-quality, fast image generation

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ImageGenRequest {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  style?: 'photorealistic' | 'illustration' | 'watercolor' | 'oil-painting' | 'sketch' | 'concept-art' | 'anime';
  userId: string;
  projectId?: string;
}

export interface ImageGenResult {
  imageUrl: string; // relative path to saved image
  prompt: string;
  model: string;
  creditsUsed: number;
}

// Ensure the uploads directory exists
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'generated');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// ========== Style Prompt Enhancers ==========

const STYLE_PREFIXES: Record<string, string> = {
  'photorealistic': 'Photorealistic, high detail, natural lighting, ',
  'illustration': 'Digital illustration, clean lines, vibrant colors, ',
  'watercolor': 'Watercolor painting style, soft edges, flowing colors, ',
  'oil-painting': 'Oil painting style, rich textures, bold brushstrokes, ',
  'sketch': 'Pencil sketch, detailed linework, cross-hatching, ',
  'concept-art': 'Concept art, cinematic composition, dramatic lighting, ',
  'anime': 'Anime/manga style, expressive features, clean cel-shading, ',
};

function buildImagePrompt(req: ImageGenRequest): string {
  const stylePrefix = req.style ? (STYLE_PREFIXES[req.style] || '') : '';
  return `${stylePrefix}${req.prompt}`;
}

// ========== Gemini Image Generation ==========

export async function generateImage(req: ImageGenRequest): Promise<ImageGenResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  // Fall back to OpenAI if Gemini key isn't configured
  if (!apiKey) {
    if (process.env.OPENAI_API_KEY) return generateImageOpenAI(req);
    throw new Error('No image generation API key configured (GEMINI_API_KEY or OPENAI_API_KEY).');
  }

  ensureUploadsDir();

  const fullPrompt = buildImagePrompt(req);
  const model = 'gemini-3.1-flash-image-preview';

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: fullPrompt }],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: req.aspectRatio || '1:1',
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const geminiMsg = (err as any).error?.message || response.statusText;
    // Runtime fallback: if Gemini rate-limits (429) or errors, try OpenAI
    if (process.env.OPENAI_API_KEY) {
      console.warn(`[ImageGen] Gemini failed (${response.status}), falling back to OpenAI: ${geminiMsg}`);
      return generateImageOpenAI(req);
    }
    throw new Error(`Gemini API error ${response.status}: ${geminiMsg}`);
  }

  const data = await response.json() as any;

  // Find the image part in the response
  let imageData: string | null = null;
  let mimeType = 'image/png';

  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        imageData = part.inlineData.data; // base64
        mimeType = part.inlineData.mimeType || 'image/png';
        break;
      }
    }
    if (imageData) break;
  }

  if (!imageData) {
    throw new Error('No image generated. The model may have refused the prompt.');
  }

  // Save to disk
  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? '.jpg' : '.png';
  const filename = `${crypto.randomUUID()}${ext}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, Buffer.from(imageData, 'base64'));

  // Return relative URL
  const imageUrl = `/uploads/generated/${filename}`;

  return {
    imageUrl,
    prompt: fullPrompt,
    model,
    creditsUsed: 25, // Image gen: 25 credits
  };
}

// ========== OpenAI Image Generation ==========
// Used for the children's book beta image generation flow. Gated to publisher
// tier on the endpoint side. Uses gpt-image-1 (the current OpenAI image model)
// because we already have OPENAI_API_KEY configured for TTS + chat.

export async function generateImageOpenAI(req: ImageGenRequest): Promise<ImageGenResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured.');

  ensureUploadsDir();

  const fullPrompt = buildImagePrompt(req);
  const model = 'gpt-image-1';

  // Map aspect ratio to OpenAI's supported sizes. gpt-image-1 supports
  // 1024x1024 (square), 1024x1536 (portrait), 1536x1024 (landscape).
  const ar = req.aspectRatio || '1:1';
  let size: string;
  if (ar === '16:9' || ar === '4:3') size = '1536x1024';
  else if (ar === '9:16' || ar === '3:4') size = '1024x1536';
  else size = '1024x1024';

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: fullPrompt,
      n: 1,
      size,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({} as any));
    throw new Error(
      `OpenAI image API error ${response.status}: ${(err as any).error?.message || response.statusText}`,
    );
  }

  const data = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const item = data.data?.[0];
  if (!item) throw new Error('OpenAI returned no image.');

  let imageBytes: Buffer | null = null;
  if (item.b64_json) {
    imageBytes = Buffer.from(item.b64_json, 'base64');
  } else if (item.url) {
    // gpt-image-1 may return a URL instead of base64; download it
    const fetched = await fetch(item.url);
    if (!fetched.ok) throw new Error(`Failed to download generated image: ${fetched.status}`);
    imageBytes = Buffer.from(await fetched.arrayBuffer());
  }
  if (!imageBytes) throw new Error('No image data in OpenAI response.');

  const filename = `${crypto.randomUUID()}.png`;
  const filepath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filepath, imageBytes);

  return {
    imageUrl: `/uploads/generated/${filename}`,
    prompt: fullPrompt,
    model,
    creditsUsed: 25,
  };
}

// ========== Canon-Aware Prompt Builders ==========

export function buildCharacterPortraitPrompt(character: {
  name: string;
  description?: string;
  appearance?: { physical?: string; distinguishingFeatures?: string; style?: string };
  age?: string;
  gender?: string;
  occupation?: string;
}): string {
  const parts: string[] = [];
  parts.push(`Portrait of ${character.name}`);
  if (character.age) parts.push(`${character.age} years old`);
  if (character.gender) parts.push(character.gender);
  if (character.occupation) parts.push(character.occupation);
  if (character.appearance?.physical) parts.push(character.appearance.physical);
  if (character.appearance?.distinguishingFeatures) parts.push(character.appearance.distinguishingFeatures);
  if (character.appearance?.style) parts.push(`wearing ${character.appearance.style}`);
  if (character.description) parts.push(character.description);
  parts.push('character portrait, detailed face, expressive eyes, book cover quality');
  return parts.join(', ');
}

export function buildLocationIllustrationPrompt(location: {
  name: string;
  description?: string;
  locationType?: string;
  atmosphere?: string;
  sensoryDetails?: { sights?: string; sounds?: string };
  climate?: string;
  terrain?: string;
}): string {
  const parts: string[] = [];
  parts.push(location.name);
  if (location.locationType) parts.push(location.locationType);
  if (location.description) parts.push(location.description);
  if (location.atmosphere) parts.push(`atmosphere: ${location.atmosphere}`);
  if (location.sensoryDetails?.sights) parts.push(location.sensoryDetails.sights);
  if (location.climate) parts.push(`${location.climate} climate`);
  if (location.terrain) parts.push(location.terrain);
  parts.push('wide establishing shot, cinematic lighting, book illustration quality');
  return parts.join(', ');
}

export function buildSceneIllustrationPrompt(scene: {
  title: string;
  summary: string;
  characters?: string[];
  location?: string;
  emotionalBeat?: string;
}): string {
  const parts: string[] = [];
  parts.push(scene.summary);
  if (scene.characters?.length) parts.push(`featuring ${scene.characters.join(' and ')}`);
  if (scene.location) parts.push(`set in ${scene.location}`);
  if (scene.emotionalBeat) parts.push(`mood: ${scene.emotionalBeat}`);
  parts.push('narrative scene, cinematic composition, dramatic lighting, book illustration');
  return parts.join(', ');
}

// Cover styles that map to prompt modifiers. Each style produces a visually
// distinct cover — not just mood variations of the same illustrated scene.
export const COVER_STYLES: Record<string, string> = {
  // ── Scene-based styles ──
  illustrated: 'richly illustrated scene, digital painting, vibrant saturated colors, detailed environment, cinematic depth of field, concept art quality',
  dark: 'dark moody atmosphere, dramatic chiaroscuro lighting, deep blacks, single source of light cutting through shadow, mysterious and intense, noir aesthetic',
  photorealistic: 'photorealistic cinematic scene, dramatic movie-poster lighting, shallow depth of field, hyper-detailed textures, could be a film still, realistic proportions and materials',

  // ── Graphic/design-forward styles ──
  iconic: 'single iconic symbolic object or element centered on a solid or simple gradient background, stark and bold, the symbol represents the story metaphorically, minimal detail around it, clean edges, commercial book cover design like a bestseller thriller',
  silhouette: 'dramatic silhouette of a figure or key object against a vivid colorful sky or gradient, high contrast, the silhouette is solid black, the background is rich with color — sunset oranges, twilight purples, or stormy blues, cinematic and striking',
  abstract: 'abstract art inspired by the story — use recognizable elements (a door, a hand, a skyline, a wave) but render them in a stylized, painterly, semi-abstract way with bold color fields and textured brushstrokes, the viewer should be able to guess the genre or mood from the imagery, modern literary fiction cover aesthetic, NOT fully random patterns',
  typography: 'a single bold solid color background with subtle texture or gentle gradient, like a deep navy, rich burgundy, forest green, charcoal, or burnt orange wall, SIMPLE and CLEAN with minimal visual noise, NO illustrations NO objects NO figures NO scenes NO patterns, just a moody colored surface that lets overlaid white text pop, think book jacket back-cover simplicity',
  lineart: 'minimalist black line art on clean white background, one single simple object or symbol drawn with thin elegant lines, lots of white space, sparse and refined, like a modern literary fiction cover or indie press design, NOT busy NOT detailed NOT intricate, just one quiet meaningful element centered with breathing room',
};

export function buildBookCoverPrompt(project: {
  title: string;
  type: string;
  subtype?: string;
  genreEmphasis?: string[];
  toneMood?: { lightDark?: number; hopefulGrim?: number };
  coverStyle?: string;
  chapterHints?: string;
}): string {
  const parts: string[] = [];

  // Context about the book (NOT as visible text — just to guide the imagery)
  parts.push(`Book cover BACKGROUND ART for a ${project.subtype || project.type} titled "${project.title}"`);
  if (project.genreEmphasis?.length) parts.push(`genre: ${project.genreEmphasis.join(', ')}`);
  if (project.chapterHints) parts.push(`story context: ${project.chapterHints}`);

  // Tone-based atmosphere
  if (project.toneMood) {
    if (project.toneMood.lightDark !== undefined) {
      parts.push(project.toneMood.lightDark > 60 ? 'dark, moody atmosphere' : 'bright, inviting atmosphere');
    }
    if (project.toneMood.hopefulGrim !== undefined) {
      parts.push(project.toneMood.hopefulGrim > 60 ? 'grim, foreboding' : 'hopeful, uplifting');
    }
  }

  // Style
  const stylePrompt = COVER_STYLES[project.coverStyle || 'illustrated'] || COVER_STYLES.illustrated;
  parts.push(stylePrompt);

  // Critical instructions to prevent mockups, frames, text of any kind
  parts.push('FULL BLEED artwork that fills the entire canvas edge to edge, NO borders NO frames NO mockup NO book shape NO 3D rendering of a physical book, the artwork IS the cover not a picture OF a cover, ABSOLUTELY NO TEXT of any kind anywhere in the image — no titles, no letters, no words, no signs with writing, no readable text on objects, no typography, no watermarks, no labels, purely visual scene artwork with zero text elements, square 1:1 aspect ratio');

  return parts.join(', ');
}

export function buildChildrensPagePrompt(page: {
  title: string;
  prose: string;
  illustrationNotes?: string;
  illustrationStyle?: string;
  ageRange?: string;
  bookTitle?: string;
  styleGuide?: string;
  characterVisuals?: { name: string; description: string }[];
}): string {
  const parts: string[] = [];

  // 1. Style guide anchor — ensures every image shares the same art direction
  if (page.styleGuide) {
    parts.push(`Art style: ${page.styleGuide}`);
  }

  // 2. Character visual descriptions — ensures consistent character appearance across pages
  if (page.characterVisuals?.length) {
    const charDescs = page.characterVisuals
      .map(cv => `${cv.name}: ${cv.description}`)
      .join('; ');
    parts.push(`Characters (draw exactly as described): ${charDescs}`);
  }

  // 3. Scene content — illustration notes or prose
  if (page.illustrationNotes) {
    parts.push(page.illustrationNotes);
  } else if (page.prose) {
    parts.push(page.prose.slice(0, 300));
  } else {
    parts.push(page.title);
  }
  if (page.bookTitle) parts.push(`from the children's book "${page.bookTitle}"`);

  // 4. Style based on illustration preference
  const styleMap: Record<string, string> = {
    watercolor: 'soft watercolor illustration style, gentle colors, painterly textures',
    cartoon: 'bright cartoon illustration, bold outlines, playful exaggerated features',
    realistic: 'detailed realistic illustration, rich colors, lifelike rendering',
    collage: 'mixed media collage style, textured paper elements, layered composition',
    pencil: 'gentle pencil illustration, soft shading, hand-drawn feel',
    digital: 'clean digital illustration, vibrant colors, modern children\'s book style',
  };
  parts.push(styleMap[page.illustrationStyle || 'watercolor'] || styleMap.watercolor);

  // 5. Age-appropriate styling
  const ageStyle: Record<string, string> = {
    '0-2': 'very simple shapes, high contrast, bold primary colors, minimal detail',
    '3-5': 'charming, whimsical, expressive characters, bright and inviting',
    '6-8': 'detailed scene, dynamic composition, engaging and adventurous',
    '9-12': 'rich detailed illustration, slightly more mature style, atmospheric',
  };
  parts.push(ageStyle[page.ageRange || '3-5'] || ageStyle['3-5']);

  // 6. Consistency anchors
  parts.push("children's book illustration, full page spread, no text in image, consistent art style throughout");
  return parts.join(', ');
}
