// ========== Suno Music Generation Service ==========
// Background music generation for scenes via Suno API
// Architecture mirrors tts.ts — server-side generation, file caching, URL serving

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MUSIC_DIR = path.join(process.cwd(), 'uploads', 'music');
const CREDITS_PER_TRACK = 3;

export interface MusicGenerateRequest {
  sceneId: string;
  prompt: string;
  genre?: string;
  durationHint?: number; // target seconds
}

export interface MusicGenerateResult {
  audioUrl: string;
  title: string;
  durationSeconds: number;
  creditsUsed: number;
  sunoJobId?: string;
}

function ensureMusicDir() {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }
}

/**
 * Generate background music for a scene via Suno API.
 *
 * Currently Suno's API access is limited. This implementation:
 * 1. Checks for SUNO_API_KEY in environment
 * 2. If available, calls Suno's create endpoint
 * 3. If not available, returns a placeholder response so the UI pipeline works
 *
 * When Suno opens their API more broadly, only the `callSunoAPI` function
 * needs to be updated.
 */
export async function generateSceneMusic(req: MusicGenerateRequest): Promise<MusicGenerateResult> {
  ensureMusicDir();

  const apiKey = process.env.SUNO_API_KEY;

  if (apiKey) {
    return await callSunoAPI(req, apiKey);
  }

  // Fallback: Check for a custom music generation endpoint (self-hosted or alternative)
  const customEndpoint = process.env.MUSIC_API_ENDPOINT;
  if (customEndpoint) {
    return await callCustomMusicAPI(req, customEndpoint);
  }

  // No API configured — return error
  throw new Error('No music generation API configured. Set SUNO_API_KEY or MUSIC_API_ENDPOINT.');
}

/**
 * Call Suno's API to generate music.
 * Based on Suno API v3.5 structure.
 */
async function callSunoAPI(req: MusicGenerateRequest, apiKey: string): Promise<MusicGenerateResult> {
  const duration = req.durationHint || 60;

  // Step 1: Create generation job
  console.log(`[Suno] Generating music for scene ${req.sceneId}, duration: ${duration}s`);
  console.log(`[Suno] Prompt: ${req.prompt.slice(0, 200)}`);

  const createResponse = await fetch('https://studio-api.suno.ai/api/external/generate/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      topic: req.prompt,
      tags: req.genre || 'cinematic instrumental',
      make_instrumental: true,
      // Suno generates ~2-4 minute clips by default
    }),
  });

  if (!createResponse.ok) {
    const err = await createResponse.json().catch(() => ({}));
    throw new Error(`Suno API error ${createResponse.status}: ${(err as any).detail || createResponse.statusText}`);
  }

  const createData = await createResponse.json() as any;
  const clipId = createData.clips?.[0]?.id || createData.id;

  if (!clipId) {
    throw new Error('Suno API did not return a clip ID');
  }

  // Step 2: Poll for completion
  let audioUrl: string | null = null;
  let pollAttempts = 0;
  const maxPollAttempts = 60; // 5 minutes at 5s intervals

  while (!audioUrl && pollAttempts < maxPollAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    pollAttempts++;

    const statusResponse = await fetch(`https://studio-api.suno.ai/api/external/clips/?ids=${clipId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (statusResponse.ok) {
      const statusData = await statusResponse.json() as any;
      const clip = Array.isArray(statusData) ? statusData[0] : statusData;

      if (clip?.status === 'complete' && clip?.audio_url) {
        audioUrl = clip.audio_url;
        console.log(`[Suno] Generation complete after ${pollAttempts * 5}s`);
      } else if (clip?.status === 'error') {
        throw new Error(`Suno generation failed: ${clip.error_message || 'Unknown error'}`);
      }
    }
  }

  if (!audioUrl) {
    throw new Error('Suno generation timed out');
  }

  // Step 3: Download and cache locally
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error('Failed to download generated music');

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  const hash = crypto.createHash('md5').update(req.sceneId + Date.now()).digest('hex').slice(0, 12);
  const filename = `music-${hash}.mp3`;
  const filepath = path.join(MUSIC_DIR, filename);
  fs.writeFileSync(filepath, audioBuffer);

  return {
    audioUrl: `/uploads/music/${filename}`,
    title: `Scene ${req.sceneId.slice(-6)} — ${req.genre || 'cinematic'}`,
    durationSeconds: duration,
    creditsUsed: CREDITS_PER_TRACK,
    sunoJobId: clipId,
  };
}

/**
 * Call a custom/self-hosted music generation endpoint.
 * Expected API contract:
 *   POST { prompt, genre, duration }
 *   Response: { audio_url, duration }
 */
async function callCustomMusicAPI(req: MusicGenerateRequest, endpoint: string): Promise<MusicGenerateResult> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      genre: req.genre || 'cinematic',
      duration: req.durationHint || 60,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Music API error: ${(err as any).error || response.statusText}`);
  }

  const data = await response.json() as any;

  // Download and cache
  if (data.audio_url) {
    const audioResponse = await fetch(data.audio_url);
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const hash = crypto.createHash('md5').update(req.sceneId + Date.now()).digest('hex').slice(0, 12);
    const filename = `music-${hash}.mp3`;
    const filepath = path.join(MUSIC_DIR, filename);
    fs.writeFileSync(filepath, audioBuffer);

    return {
      audioUrl: `/uploads/music/${filename}`,
      title: `Scene Music`,
      durationSeconds: data.duration || req.durationHint || 60,
      creditsUsed: CREDITS_PER_TRACK,
    };
  }

  throw new Error('Music API did not return audio');
}

/**
 * Check if music generation is available.
 */
export function isMusicAvailable(): boolean {
  return !!(process.env.SUNO_API_KEY || process.env.MUSIC_API_ENDPOINT);
}
