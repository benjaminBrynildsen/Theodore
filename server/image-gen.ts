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
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured. Add it to your .env file.');

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
    throw new Error(`Gemini API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
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
    creditsUsed: 5, // Image gen costs ~5 credits
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

export function buildBookCoverPrompt(project: {
  title: string;
  type: string;
  subtype?: string;
  genreEmphasis?: string[];
  toneMood?: { lightDark?: number; hopefulGrim?: number };
}): string {
  const parts: string[] = [];
  parts.push(`Book cover design for "${project.title}"`);
  if (project.subtype) parts.push(`${project.subtype} ${project.type}`);
  else parts.push(project.type);
  if (project.genreEmphasis?.length) parts.push(`genres: ${project.genreEmphasis.join(', ')}`);
  
  // Tone-based atmosphere
  if (project.toneMood) {
    if (project.toneMood.lightDark !== undefined) {
      parts.push(project.toneMood.lightDark > 60 ? 'dark, moody atmosphere' : 'bright, inviting atmosphere');
    }
    if (project.toneMood.hopefulGrim !== undefined) {
      parts.push(project.toneMood.hopefulGrim > 60 ? 'grim, foreboding' : 'hopeful, uplifting');
    }
  }
  
  parts.push('professional book cover, typography-ready negative space, compelling composition, high quality');
  return parts.join(', ');
}
