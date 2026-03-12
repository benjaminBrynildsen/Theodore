// ========== Suno Music Generation Service ==========
// Background music generation for scenes via sunoapi.org (third-party Suno API)
// Architecture mirrors tts.ts — server-side generation, file caching, URL serving

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MUSIC_DIR = path.join(process.cwd(), 'uploads', 'music');
const CREDITS_PER_TRACK = 3;
const SUNO_API_BASE = 'https://api.sunoapi.org/api/v1';

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
 * Generate background music for a scene.
 *
 * Checks for API keys in order:
 * 1. SUNO_API_KEY — uses sunoapi.org third-party Suno API
 * 2. MUSIC_API_ENDPOINT — custom/self-hosted music generation
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
  throw new Error('No music generation API configured. Set SUNO_API_KEY (sunoapi.org) or MUSIC_API_ENDPOINT.');
}

/**
 * Call sunoapi.org to generate music.
 * API docs: https://sunoapi.org
 *
 * POST /api/v1/generate
 * - customMode: true (we provide our own style/prompt)
 * - instrumental: true (no vocals for background music)
 * - model: V5
 * - style: genre tags
 * - prompt: scene music prompt from emotion analyzer
 *
 * Returns task_id, then poll /api/v1/query?ids=<task_id> for completion.
 * Each request generates 2 songs — we pick the first.
 */
async function callSunoAPI(req: MusicGenerateRequest, apiKey: string): Promise<MusicGenerateResult> {
  const duration = req.durationHint || 60;

  // Step 1: Create generation job
  console.log(`[Suno] Generating music for scene ${req.sceneId}, duration: ${duration}s`);
  console.log(`[Suno] Prompt: ${req.prompt.slice(0, 200)}`);
  console.log(`[Suno] Genre/Style: ${req.genre || 'cinematic instrumental'}`);

  const createResponse = await fetch(`${SUNO_API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      customMode: true,
      instrumental: true,
      model: 'V5',
      style: req.genre || 'cinematic instrumental',
      title: `Scene ${req.sceneId.slice(-6)}`,
      prompt: req.prompt,
    }),
  });

  if (!createResponse.ok) {
    const err = await createResponse.json().catch(() => ({}));
    console.error('[Suno] API error:', err);
    throw new Error(`Suno API error ${createResponse.status}: ${(err as any).message || (err as any).detail || createResponse.statusText}`);
  }

  const createData = await createResponse.json() as any;
  console.log('[Suno] Create response:', JSON.stringify(createData).slice(0, 500));

  // sunoapi.org returns { code, data: [{ song_id }] } or { task_id }
  const taskId = createData.task_id || createData.data?.[0]?.song_id || createData.id;

  if (!taskId) {
    throw new Error('Suno API did not return a task/song ID');
  }

  console.log(`[Suno] Task ID: ${taskId}, polling for completion...`);

  // Step 2: Poll for completion
  let audioUrl: string | null = null;
  let songTitle: string | null = null;
  let songDuration: number | null = null;
  let pollAttempts = 0;
  const maxPollAttempts = 60; // 5 minutes at 5s intervals

  while (!audioUrl && pollAttempts < maxPollAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    pollAttempts++;

    try {
      const statusResponse = await fetch(`${SUNO_API_BASE}/query?ids=${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (statusResponse.ok) {
        const statusData = await statusResponse.json() as any;
        // Response format: { code, data: [{ song_id, status, audio_url, title, duration }] }
        const songs = statusData.data || (Array.isArray(statusData) ? statusData : [statusData]);
        const song = songs[0];

        if (song?.status === 'complete' || song?.status === 'SUCCESS' || song?.audio_url) {
          audioUrl = song.audio_url || song.song_url;
          songTitle = song.title;
          songDuration = song.duration;
          console.log(`[Suno] Generation complete after ${pollAttempts * 5}s`);
        } else if (song?.status === 'error' || song?.status === 'FAILED') {
          throw new Error(`Suno generation failed: ${song.error_message || song.fail_reason || 'Unknown error'}`);
        } else {
          if (pollAttempts % 6 === 0) {
            console.log(`[Suno] Still generating... (${pollAttempts * 5}s elapsed, status: ${song?.status || 'unknown'})`);
          }
        }
      }
    } catch (err: any) {
      if (err.message.includes('Suno generation failed')) throw err;
      // Network error during poll — continue
      console.warn(`[Suno] Poll error (attempt ${pollAttempts}):`, err.message);
    }
  }

  if (!audioUrl) {
    throw new Error('Suno generation timed out after 5 minutes');
  }

  // Step 3: Download and cache locally
  console.log(`[Suno] Downloading audio from: ${audioUrl.slice(0, 100)}...`);
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) throw new Error('Failed to download generated music');

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  const hash = crypto.createHash('md5').update(req.sceneId + Date.now()).digest('hex').slice(0, 12);
  const filename = `music-${hash}.mp3`;
  const filepath = path.join(MUSIC_DIR, filename);
  fs.writeFileSync(filepath, audioBuffer);

  console.log(`[Suno] Saved to ${filepath} (${(audioBuffer.length / 1024).toFixed(0)}KB)`);

  return {
    audioUrl: `/uploads/music/${filename}`,
    title: songTitle || `Scene ${req.sceneId.slice(-6)} — ${req.genre || 'cinematic'}`,
    durationSeconds: songDuration || duration,
    creditsUsed: CREDITS_PER_TRACK,
    sunoJobId: taskId,
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
