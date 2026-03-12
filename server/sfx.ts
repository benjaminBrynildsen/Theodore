// ========== Sound Effects Service — ElevenLabs ==========
// Ambient sound generation for scenes via ElevenLabs Sound Effects API
// POST /v1/text-to-sound-effects/convert

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const SFX_DIR = path.join(process.cwd(), 'uploads', 'sfx');
const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const CREDITS_PER_SFX = 1;

export interface SFXGenerateRequest {
  prompt: string; // e.g. "rain on a tin roof", "busy cafe ambient noise"
  durationSeconds?: number; // 0.1 – 30, omit for AI-decided duration
}

export interface SFXGenerateResult {
  audioUrl: string;
  durationSeconds: number;
  creditsUsed: number;
}

function ensureSFXDir() {
  if (!fs.existsSync(SFX_DIR)) {
    fs.mkdirSync(SFX_DIR, { recursive: true });
  }
}

/**
 * Generate a sound effect from a text prompt.
 */
export async function generateSFX(req: SFXGenerateRequest): Promise<SFXGenerateResult> {
  ensureSFXDir();

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const durationSec = req.durationSeconds ? Math.min(Math.max(req.durationSeconds, 0.1), 30) : undefined;

  console.log(`[SFX] Generating: "${req.prompt.slice(0, 100)}"${durationSec ? `, ${durationSec}s` : ', auto duration'}`);

  const body: Record<string, any> = {
    text: req.prompt,
    output_format: 'mp3_44100_128',
  };

  if (durationSec) {
    body.duration_seconds = durationSec;
  }

  const response = await fetch(`${ELEVENLABS_API}/sound-generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const detail = (err as any).detail?.message || (err as any).detail || (err as any).error || response.statusText;
    throw new Error(`ElevenLabs SFX error ${response.status}: ${detail}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  const hash = crypto.createHash('md5').update(req.prompt + Date.now()).digest('hex').slice(0, 12);
  const filename = `sfx-${hash}.mp3`;
  const filepath = path.join(SFX_DIR, filename);
  fs.writeFileSync(filepath, audioBuffer);

  console.log(`[SFX] Saved to ${filepath} (${(audioBuffer.length / 1024).toFixed(0)}KB)`);

  return {
    audioUrl: `/uploads/sfx/${filename}`,
    durationSeconds: durationSec || 5, // estimate if auto
    creditsUsed: CREDITS_PER_SFX,
  };
}

/**
 * Check if SFX generation is available (same key as TTS/music).
 */
export function isSFXAvailable(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}
