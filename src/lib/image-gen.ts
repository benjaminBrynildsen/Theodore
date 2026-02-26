// ========== Image Generation Client ==========

export interface ImageGenOptions {
  prompt?: string;
  target?: 'character' | 'location' | 'scene' | 'cover';
  targetId?: string;
  projectId?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  style?: 'photorealistic' | 'illustration' | 'watercolor' | 'oil-painting' | 'sketch' | 'concept-art' | 'anime';
}

export interface ImageGenResult {
  imageUrl: string;
  prompt: string;
  creditsUsed: number;
  creditsRemaining: number;
}

export async function generateImageApi(options: ImageGenOptions): Promise<ImageGenResult> {
  const response = await fetch('/api/generate/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    if (err.error === 'INSUFFICIENT_CREDITS') {
      throw new Error('Not enough credits for image generation.');
    }
    throw new Error(err.error || `Image generation failed (${response.status})`);
  }

  return response.json();
}

export const IMAGE_STYLES = [
  { value: 'concept-art', label: 'Concept Art' },
  { value: 'photorealistic', label: 'Photorealistic' },
  { value: 'illustration', label: 'Illustration' },
  { value: 'watercolor', label: 'Watercolor' },
  { value: 'oil-painting', label: 'Oil Painting' },
  { value: 'sketch', label: 'Sketch' },
  { value: 'anime', label: 'Anime' },
] as const;

export const ASPECT_RATIOS = [
  { value: '1:1', label: 'Square' },
  { value: '16:9', label: 'Wide' },
  { value: '9:16', label: 'Tall' },
  { value: '4:3', label: 'Standard' },
  { value: '3:4', label: 'Portrait' },
] as const;
