/**
 * Active Character routes — the live-beat pipeline for Active Character Books.
 *
 * Three endpoints:
 *   POST /api/active-character/place-beats    — AI places 2-3 Open Beats in a chapter
 *   POST /api/active-character/transcribe     — xAI Speech (→ OpenAI Whisper fallback)
 *   POST /api/active-character/react          — Grok fast-lane LLM streams reaction prose
 *
 * Everything is stateless per-request. Persistence of Open Beats happens via
 * the existing chapter PATCH endpoint (scenes jsonb). Playthrough rows are not
 * stored yet — MVP keeps history in the mobile client.
 */
import type { Request, Response, Router } from 'express';
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const XAI_CHAT_MODEL = process.env.XAI_REACTION_MODEL || 'grok-2-latest';
// xAI follows the OpenAI Audio API shape. If their transcriptions endpoint is
// unavailable on an account, transcribe() falls through to OpenAI Whisper.
const XAI_AUDIO_TRANSCRIBE_URL = `${XAI_BASE_URL}/audio/transcriptions`;
const XAI_AUDIO_MODEL = process.env.XAI_STT_MODEL || 'grok-speech-1';

const OPENAI_WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const OPENAI_WHISPER_MODEL = 'whisper-1';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB safety cap — a beat is a few seconds of audio
});

function ac(tag: string, ...rest: unknown[]) {
  console.log(`[active-character] ${tag}`, ...rest);
}

// ============================================================================
// STT — xAI Speech, fall back to OpenAI Whisper
// ============================================================================

async function transcribeWithXAI(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY missing');

  const form = new FormData();
  form.append('model', XAI_AUDIO_MODEL);
  form.append('file', new Blob([buffer], { type: mimeType }), 'beat.m4a');

  const resp = await fetch(XAI_AUDIO_TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as any,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`xAI STT ${resp.status}: ${body.slice(0, 400)}`);
  }
  const json = (await resp.json()) as { text?: string };
  return (json?.text || '').trim();
}

async function transcribeWithOpenAI(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');

  const form = new FormData();
  form.append('model', OPENAI_WHISPER_MODEL);
  form.append('file', new Blob([buffer], { type: mimeType }), 'beat.m4a');

  const resp = await fetch(OPENAI_WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form as any,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Whisper ${resp.status}: ${body.slice(0, 400)}`);
  }
  const json = (await resp.json()) as { text?: string };
  return (json?.text || '').trim();
}

export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<{ text: string; provider: 'xai' | 'openai' }> {
  try {
    const text = await transcribeWithXAI(buffer, mimeType);
    return { text, provider: 'xai' };
  } catch (err: any) {
    ac('xAI STT failed, falling back to Whisper:', err?.message || err);
    const text = await transcribeWithOpenAI(buffer, mimeType);
    return { text, provider: 'openai' };
  }
}

// ============================================================================
// Reaction LLM — Grok chat completion, streaming SSE to the client
// ============================================================================

interface ReactRequest {
  cueText: string;
  listenerUtterance: string;
  characterName: string;
  characterArchetype?: string;
  characterRegister?: string;
  recentProse: string; // last ~800 chars of chapter so the reaction keeps voice
  chapterTitle?: string;
  stateMutationRules?: string[];
  maxWords?: number; // cap reaction length; doc suggests 40-80 words per beat
}

function buildReactionSystemPrompt(r: ReactRequest): string {
  const maxWords = r.maxWords ?? 60;
  const rules = r.stateMutationRules?.length
    ? `You may shift these dimensions of the character's state if the utterance motivates it: ${r.stateMutationRules.join(', ')}.`
    : 'Only shift subtle emotional state. Do not change major plot or relationships.';

  return `You are writing the next ${maxWords} words of an audiobook chapter. The listener just spoke the line below AS the active character "${r.characterName}"${r.characterArchetype ? ` (archetype: ${r.characterArchetype})` : ''}. Continue the prose naturally — show how other characters and the world react to what was said. Match the existing voice and tone from the recent prose. Hard rules:
- ${maxWords} words maximum. One tight paragraph.
- Do NOT restate the listener's line verbatim.
- Do NOT break the fourth wall. Do NOT acknowledge the listener by name.
- ${rules}
- If the listener's utterance is silence or nonsense, treat hesitation as characterization and keep the story moving.
${r.characterRegister ? `- Match "${r.characterRegister}" register in any dialogue this character might speak again.` : ''}`;
}

function buildReactionUserPrompt(r: ReactRequest): string {
  return `Chapter${r.chapterTitle ? `: ${r.chapterTitle}` : ''}

Recent narrative:
${r.recentProse.trim()}

Cue (narrator line that handed off to the listener):
"${r.cueText}"

${r.characterName} (voiced by the listener) just said:
"${r.listenerUtterance.trim() || '(silence)'}"

Write the next ${r.maxWords ?? 60} words of prose continuing the scene.`;
}

async function streamGrokReaction(
  r: ReactRequest,
  onToken: (t: string) => void,
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY missing');

  const resp = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      stream: true,
      temperature: 0.7,
      max_tokens: 220, // ~60 words + safety slack
      messages: [
        { role: 'system', content: buildReactionSystemPrompt(r) },
        { role: 'user', content: buildReactionUserPrompt(r) },
      ],
    }),
  });

  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Grok react ${resp.status}: ${body.slice(0, 400)}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        const delta = evt?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta;
          onToken(delta);
        }
      } catch {
        /* keep streaming; malformed line */
      }
    }
  }
  return full;
}

// ============================================================================
// Open Beat placement — runs a short LLM pass over chapter prose and returns
// 2-3 suggested cues that hand off naturally to the listener-voiced character.
// Requires project.subtype === 'active-character' (caller checks).
// ============================================================================

interface PlaceBeatsRequest {
  chapterTitle: string;
  prose: string;
  activeCharacterName: string;
  activeCharacterId: string;
  maxBeats?: number;
}

export async function placeBeatsWithGrok(r: PlaceBeatsRequest): Promise<Array<{
  beatId: string;
  activeCharacterId: string;
  cueText: string;
  maxSpeakMs: number;
  intentHints: string[];
  stateMutationRules: string[];
}>> {
  // Anthropic Claude Haiku handles this structured-extraction task cheaply and
  // reliably. Previously delegated to Grok (xAI) but their chat model names
  // keep moving (grok-2-latest, grok-beta, grok-4) — the resulting 400s
  // silently shipped 0 beats. Using Haiku removes that fragility.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const maxBeats = Math.min(Math.max(r.maxBeats ?? 3, 1), 5);

  const sys = `You are an audiobook director identifying 2-${maxBeats} natural moments where "${r.activeCharacterName}" would speak a line of dialogue. These are "Open Beats" — the listener will voice the character at each of them during playback. Return ONLY a JSON array of objects with this exact shape and no other text:

[
  {
    "cueText": "the narrator line immediately before the character's turn (must appear verbatim in the prose)",
    "intentHints": ["short phrase", "short phrase"],
    "stateMutationRules": ["trust", "knowledge"]
  }
]

Rules:
- cueText must be a string that EXACTLY appears in the chapter prose provided — no paraphrasing. Keep it short: one sentence or clause, ≤ 140 chars.
- Pick moments where ${r.activeCharacterName} is clearly being addressed or given space to speak.
- intentHints: 2-3 short phrases anticipating how the listener might respond ("accept", "refuse", "deflect", etc.).
- stateMutationRules: 1-3 dimensions this beat may shift — pick from: trust, knowledge, allegiance, emotion, location.
- Output MUST be valid JSON. No prose, no code fences, just the array.`;

  const user = `Chapter: ${r.chapterTitle}\n\nProse:\n${r.prose.slice(0, 8000)}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      temperature: 0.4,
      system: sys,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`place-beats ${resp.status}: ${body.slice(0, 400)}`);
  }

  const json = (await resp.json()) as any;
  const raw = json?.content?.[0]?.text ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed: any[] = [];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract the first JSON array in the response
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { parsed = []; }
    }
  }
  if (!Array.isArray(parsed)) parsed = [];

  return parsed
    .filter((b) => typeof b?.cueText === 'string' && b.cueText.trim())
    // Keep only cues that truly appear in the prose — hallucinated cues would
    // fail to fire at playback time, so we'd rather drop them.
    .filter((b) => r.prose.includes(b.cueText.trim()))
    .slice(0, maxBeats)
    .map((b) => ({
      beatId: crypto.randomUUID(),
      activeCharacterId: r.activeCharacterId,
      cueText: String(b.cueText).trim(),
      maxSpeakMs: 8000,
      intentHints: Array.isArray(b.intentHints) ? b.intentHints.map(String).slice(0, 4) : [],
      stateMutationRules: Array.isArray(b.stateMutationRules)
        ? b.stateMutationRules.map(String).slice(0, 3)
        : ['emotion'],
    }));
}

// ============================================================================
// Route registration — called from server/index.ts via attach()
// ============================================================================

type RequireAuthFn = (req: Request, res: Response) => Promise<{ user: { id: string } } | null>;

export function attachActiveCharacterRoutes(app: Router, requireAuth: RequireAuthFn) {
  // ----- Transcribe a beat recording -----
  app.post('/api/active-character/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const file = (req as any).file as { buffer: Buffer; mimetype: string } | undefined;
      if (!file?.buffer) return res.status(400).json({ error: 'audio file required (multipart field "audio")' });

      const result = await transcribeAudio(file.buffer, file.mimetype || 'audio/m4a');
      ac('transcribe ok', { provider: result.provider, chars: result.text.length });
      res.json(result);
    } catch (e: any) {
      ac('transcribe failed', e?.message || e);
      res.status(500).json({ error: e?.message || 'transcribe failed' });
    }
  });

  // ----- Stream reaction prose (SSE) -----
  app.post('/api/active-character/react', express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as ReactRequest;
      if (!body?.cueText || !body?.characterName) {
        return res.status(400).json({ error: 'cueText and characterName required' });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        const full = await streamGrokReaction(body, (token) => {
          res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
        });
        res.write(`data: ${JSON.stringify({ done: true, text: full })}\n\n`);
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ error: err?.message || 'react failed' })}\n\n`);
      } finally {
        res.end();
      }
    } catch (e: any) {
      ac('react outer failed', e?.message || e);
      if (!res.headersSent) res.status(500).json({ error: e?.message || 'react failed' });
    }
  });

  // ----- Place Open Beats in an existing chapter -----
  app.post('/api/active-character/place-beats', express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as PlaceBeatsRequest;
      if (!body?.prose || !body?.activeCharacterName || !body?.activeCharacterId) {
        return res.status(400).json({ error: 'prose, activeCharacterName, activeCharacterId required' });
      }
      const beats = await placeBeatsWithGrok(body);
      res.json({ beats });
    } catch (e: any) {
      ac('place-beats failed', e?.message || e);
      res.status(500).json({ error: e?.message || 'place-beats failed' });
    }
  });
}
