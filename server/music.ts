// ========== Music Generation Service — ElevenLabs Music ==========
// Background music generation for scenes via ElevenLabs Music API
// POST /v1/music with force_instrumental: true

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MUSIC_DIR = path.join(process.cwd(), 'uploads', 'music');
const CREDITS_PER_TRACK = 3;
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';

export interface MusicGenerateRequest {
  sceneId: string;
  prompt: string;
  genre?: string;
  durationHint?: number; // target seconds (3-300)
}

export interface MusicGenerateResult {
  audioUrl: string;
  title: string;
  durationSeconds: number;
  creditsUsed: number;
}

function ensureMusicDir() {
  if (!fs.existsSync(MUSIC_DIR)) {
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
  }
}

/**
 * Generate background music for a scene via ElevenLabs Music API.
 * Falls back to MUSIC_API_ENDPOINT if ELEVENLABS_API_KEY is not set.
 */
export async function generateSceneMusic(req: MusicGenerateRequest): Promise<MusicGenerateResult> {
  ensureMusicDir();

  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (apiKey) {
    return await callElevenLabsMusic(req, apiKey);
  }

  // Fallback: Check for a custom music generation endpoint
  const customEndpoint = process.env.MUSIC_API_ENDPOINT;
  if (customEndpoint) {
    return await callCustomMusicAPI(req, customEndpoint);
  }

  throw new Error('No music generation API configured. Set ELEVENLABS_API_KEY or MUSIC_API_ENDPOINT.');
}

/**
 * Call ElevenLabs Music API to generate instrumental background music.
 *
 * POST https://api.elevenlabs.io/v1/music
 * - prompt: description of desired music
 * - force_instrumental: true (no vocals)
 * - music_length_ms: duration in milliseconds (3000-600000)
 * - model_id: music_v1
 * - output_format: mp3_44100_128
 */
async function callElevenLabsMusic(req: MusicGenerateRequest, apiKey: string): Promise<MusicGenerateResult> {
  const durationSec = Math.min(Math.max(req.durationHint || 60, 3), 300);
  const durationMs = durationSec * 1000;

  // Build a rich prompt combining user prompt with genre
  const fullPrompt = req.genre
    ? `${req.genre} style. ${req.prompt}`
    : req.prompt;

  console.log(`[Music] Generating for scene ${req.sceneId}, duration: ${durationSec}s`);
  console.log(`[Music] Prompt: ${fullPrompt.slice(0, 200)}`);

  const response = await fetch(`${ELEVENLABS_API}/music`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      force_instrumental: true,
      music_length_ms: durationMs,
      model_id: 'music_v1',
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = (err as any).detail?.message || (err as any).detail || (err as any).error || response.statusText;
    console.error('[Music] ElevenLabs API error:', detail);
    throw new Error(`ElevenLabs Music error ${response.status}: ${detail}`);
  }

  // Response is the audio file directly
  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const hash = crypto.createHash('md5').update(req.sceneId + Date.now()).digest('hex').slice(0, 12);
  const filename = `music-${hash}.mp3`;
  const filepath = path.join(MUSIC_DIR, filename);
  fs.writeFileSync(filepath, audioBuffer);

  console.log(`[Music] Saved to ${filepath} (${(audioBuffer.length / 1024).toFixed(0)}KB)`);

  return {
    audioUrl: `/uploads/music/${filename}`,
    title: `Scene ${req.sceneId.slice(-6)} — ${req.genre || 'cinematic'}`,
    durationSeconds: durationSec,
    creditsUsed: CREDITS_PER_TRACK,
  };
}

/**
 * Call a custom/self-hosted music generation endpoint.
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
  return !!(process.env.ELEVENLABS_API_KEY || process.env.MUSIC_API_ENDPOINT);
}
