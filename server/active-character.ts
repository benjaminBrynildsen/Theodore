/**
 * Active Character routes — the live-beat pipeline for Active Character Books.
 *
 * Five endpoints:

 *   POST /api/active-character/generate-outline   — Claude Haiku plans a 3-5 scene outline
 *                                                   (intent + beatIntent each) to act as a
 *                                                   structured-improv skeleton at runtime.
 *   POST /api/active-character/place-beats        — AI places 2-3 Open Beats in a chapter
 *   POST /api/active-character/transcribe         — xAI Speech (→ OpenAI Whisper fallback)
 *   POST /api/active-character/react              — Grok streams reaction prose (text only)
 *   POST /api/active-character/react-speak        — Grok reaction PLUS pipelined Grok TTS,
 *                                                   streaming audio chunks as each sentence
 *                                                   completes so the client can start playback
 *                                                   in ~2s instead of waiting 10-15s for
 *                                                   full-text → full-TTS round-trips.
 *   POST /api/active-character/continue-chapter   — After a beat, generate the next prose
 *                                                   segment dynamically (steered by the
 *                                                   listener's utterance) and stream it as
 *                                                   text + audio chunks.
 *
 * Everything is stateless per-request. Persistence of Open Beats happens via
 * the existing chapter PATCH endpoint (scenes jsonb). Playthrough rows are not
 * stored yet — MVP keeps history in the mobile client.
 */
import type { Request, Response, Router } from 'express';
import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { callGrokTTS } from './tts';

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
// Multi-provider LLM with fallback chain
// ----------------------------------------------------------------------------
// Tries Anthropic (Haiku), then OpenAI (gpt-4o-mini), then xAI (grok-2-latest).
// Falls forward on any failure — billing errors, rate limits, network blips.
// All four Active Character generation paths (outline, place-beats, scene,
// coach) route through here so a single provider hiccup doesn't kill the
// feature.
// ============================================================================

interface LLMRequest {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  /** Provider preference order. Defaults to anthropic → openai → xai. */
  preferredProvider?: 'anthropic' | 'openai' | 'xai';
}

async function callAnthropicLLM(req: LLMRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`anthropic ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = (await resp.json()) as any;
  const text = json?.content?.[0]?.text;
  if (!text) throw new Error('anthropic returned empty content');
  return String(text).trim();
}

async function callOpenAILLM(req: LLMRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`openai ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = (await resp.json()) as any;
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('openai returned empty content');
  return String(text).trim();
}

async function callXAILLM(req: LLMRequest): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error('XAI_API_KEY missing');
  const resp = await fetch(`${XAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: XAI_CHAT_MODEL,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`xai ${resp.status}: ${body.slice(0, 300)}`);
  }
  const json = (await resp.json()) as any;
  const text = json?.choices?.[0]?.message?.content;
  if (!text) throw new Error('xai returned empty content');
  return String(text).trim();
}

/** Streaming variant — Anthropic Haiku via SSE. Used by /play/scene-stream
 *  so the client gets text deltas (and we can pipe to TTS sentence-by-sentence)
 *  instead of waiting for the whole scene to finish before playback starts.
 *  Falls back to non-streaming providers via callLLM only if Anthropic fails;
 *  in that case the entire prose arrives at once and is sentence-chunked
 *  before TTS, so the client experience is "first audio in ~10-15s" instead
 *  of streaming's ~3-5s. */
async function streamAnthropicLLM(
  req: LLMRequest,
  onDelta: (delta: string) => void,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const controller = new AbortController();
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      stream: true,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    }),
    signal: controller.signal,
  });
  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => '');
    throw new Error(`anthropic-stream ${resp.status}: ${body.slice(0, 300)}`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  // Per-chunk idle timeout. If 60s pass with zero bytes from Anthropic,
  // abort the connection and surface an error so the caller can fall back
  // to non-streaming via callLLM. Without this, a stalled upstream would
  // hang the whole /play/scene-stream request indefinitely.
  const IDLE_MS = 60_000;
  while (true) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const idle = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        try { controller.abort(); } catch {}
        reject(new Error(`anthropic-stream idle ${IDLE_MS / 1000}s — aborted`));
      }, IDLE_MS);
    });
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([reader.read(), idle]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    if (result.done) break;
    buf += decoder.decode(result.value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          const delta = String(evt.delta.text);
          full += delta;
          onDelta(delta);
        }
      } catch {
        /* malformed line — keep going */
      }
    }
  }
  return full;
}

/** Try LLM providers in fallback order until one succeeds. Logs each
 *  failure so we can see which provider tripped. Throws only if all fail. */
async function callLLM(req: LLMRequest): Promise<string> {
  const order = (() => {
    const head = req.preferredProvider || 'anthropic';
    const all = ['anthropic', 'openai', 'xai'] as const;
    return [head, ...all.filter((p) => p !== head)] as Array<'anthropic' | 'openai' | 'xai'>;
  })();

  let lastErr: Error | null = null;
  for (const provider of order) {
    try {
      const text =
        provider === 'anthropic' ? await callAnthropicLLM(req) :
        provider === 'openai' ? await callOpenAILLM(req) :
        await callXAILLM(req);
      if (provider !== order[0]) ac(`fell back to ${provider} after ${order.slice(0, order.indexOf(provider)).join(', ')} failed`);
      return text;
    } catch (e: any) {
      lastErr = e;
      ac(`${provider} failed`, e?.message || e);
    }
  }
  throw new Error(`All LLM providers failed. Last error: ${lastErr?.message || 'unknown'}`);
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
// Chapter outline — structured-improv skeleton for active-character chapters.
//
// The listener IS the character. To give them real agency without letting a
// single improvised line derail the whole chapter, we plan a lightweight
// outline upfront: 3-5 scenes, each with a one-sentence `intent` (what MUST
// happen) and a one-sentence `beatIntent` (what moment the character speaks
// at). The outline is cheap, JSON-only, and is consulted at runtime so every
// scene's continuation honors the planned spine while still flexing to what
// the listener actually said.
// ============================================================================

interface OutlineRequest {
  chapterTitle?: string;
  chapterPremise: string;
  characterName: string;
  characterArchetype?: string;
  characterRegister?: string;
  priorChapterSummaries?: string[]; // continuity with earlier chapters
  targetScenes?: number;            // default 4, clamped 3-5
}

export async function generateActiveCharacterOutline(r: OutlineRequest): Promise<OutlineScene[]> {
  const sceneCount = Math.min(Math.max(r.targetScenes ?? 5, 4), 6);

  const sys = `You are an audiobook director planning an Active Character chapter. The listener voices "${r.characterName}"${r.characterArchetype ? ` (${r.characterArchetype})` : ''} in real time — they speak as ${r.characterName} at the end of each scene, and that line is canon.

Plan exactly ${sceneCount} scenes for this chapter. Return ONLY a JSON array of objects — no prose, no code fences:

[
  {
    "intent": "one sentence — what MUST happen in this scene, plot-wise. This is the guardrail.",
    "beatIntent": "one sentence — the moment at scene-end where ${r.characterName} is given space to speak (e.g., 'another character asks the question', 'the antagonist waits for an answer', 'the silence after a revelation')."
  }
]

Rules:
- Exactly ${sceneCount} objects in the array.
- intent is tight: action + consequence. Not tone words.
- beatIntent describes the narrative setup for the character's line, NOT a scripted line.
- The final scene should bring the chapter to resolution — its beatIntent should be a moment of closure, not a cliffhanger.
- Output MUST be valid JSON. No commentary.`;

  const priorSummary = (r.priorChapterSummaries || []).slice(-3).map((s, i) => `Previous chapter ${i + 1}: ${s}`).join('\n');
  const user = `${priorSummary ? priorSummary + '\n\n' : ''}Chapter${r.chapterTitle ? `: ${r.chapterTitle}` : ''}
Premise: ${r.chapterPremise}
${r.characterRegister ? `\n${r.characterName}'s register: ${r.characterRegister}` : ''}

Plan ${sceneCount} scenes for this chapter.`;

  const raw = await callLLM({
    system: sys,
    user,
    maxTokens: 900,
    temperature: 0.5,
  });
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  let parsed: any[] = [];
  try { parsed = JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) { try { parsed = JSON.parse(match[0]); } catch { parsed = []; } }
  }
  if (!Array.isArray(parsed)) parsed = [];

  return parsed
    .filter((s) => typeof s?.intent === 'string' && typeof s?.beatIntent === 'string')
    .slice(0, sceneCount)
    .map((s, i) => ({
      index: i,
      intent: String(s.intent).trim(),
      beatIntent: String(s.beatIntent).trim(),
    }));
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
  // Routes through callLLM so a single provider outage doesn't kill beats.
  // Default order: Anthropic Haiku → OpenAI gpt-4o-mini → xAI grok-2.
  const maxBeats = Math.min(Math.max(r.maxBeats ?? 3, 1), 5);

  const sys = `You are an audiobook director placing 2-${maxBeats} "Open Beats" in a chapter. At each beat, the listener voices "${r.activeCharacterName}" speaking a line of dialogue. The cueText is the dialogue-tag line that hands off to the character — the audiobook will play right up to the end of that tag and then pause for the listener's voice.

Return ONLY a JSON array of objects with this exact shape and no other text:

[
  {
    "cueText": "the dialogue tag line — ending with 'said,' / 'asked,' / 'replied,' etc. (must appear verbatim in the prose)",
    "intentHints": ["short phrase", "short phrase"],
    "stateMutationRules": ["trust", "knowledge"]
  }
]

Rules:
- cueText MUST be a dialogue attribution that introduces ${r.activeCharacterName} about to speak. Patterns to prefer (all verbatim from prose):
  · "${r.activeCharacterName} said," / "said ${r.activeCharacterName}," / "${r.activeCharacterName} replied," / "${r.activeCharacterName} asked,"
  · "He/She turned and said," / "After a pause, he/she answered," — but only if the surrounding prose makes clear the speaker is ${r.activeCharacterName}.
- cueText MUST appear EXACTLY in the chapter prose provided — no paraphrasing, no invention. If the prose has no dialogue tag for ${r.activeCharacterName}, return fewer beats (or an empty array) rather than faking one.
- Keep cueText short: one sentence or clause, ≤ 140 chars. It should end right before ${r.activeCharacterName}'s spoken line (often ending with a comma or colon).
- Skip moments that aren't dialogue. If ${r.activeCharacterName} is only being described or addressed without speaking, DO NOT place a beat there.
- intentHints: 2-3 short phrases anticipating how the listener might respond ("accept", "refuse", "deflect", "ask back", etc.).
- stateMutationRules: 1-3 dimensions this beat may shift — pick from: trust, knowledge, allegiance, emotion, location.
- Output MUST be valid JSON. No prose, no code fences, just the array.`;

  const user = `Chapter: ${r.chapterTitle}\n\nProse:\n${r.prose.slice(0, 8000)}`;

  const raw = await callLLM({ system: sys, user, maxTokens: 900, temperature: 0.4 });
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
// Pipelined text+TTS streaming — sentence buffering with parallel Grok TTS
// ============================================================================

interface AudioChunkOut {
  index: number;
  audio: string; // base64 MP3
}

interface StreamHandlers {
  onTextDelta: (delta: string) => void;
  onAudioChunk: (chunk: AudioChunkOut) => void;
}

// Greedy sentence splitter — matches ". ", "! ", "? " or line breaks. Tuned
// to produce 20-120-char chunks so each Grok TTS call stays <1s round-trip.
function extractSentences(buf: string): { sentences: string[]; remainder: string } {
  const out: string[] = [];
  let remainder = buf;
  const re = /([^.!?\n]+[.!?]+["')\]]*)(\s+|$)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(buf)) !== null) {
    const sent = match[1].trim();
    if (sent.length >= 8) out.push(sent);
    lastIdx = re.lastIndex;
  }
  if (lastIdx > 0) remainder = buf.slice(lastIdx);
  return { sentences: out, remainder };
}

// Kick off Grok TTS for a sentence, preserving order. Chunks are emitted to
// the client as their TTS completes, but we serialize the EMIT so the audio
// plays in narrative order even if shorter sentences finish synthesis first.
function makeOrderedEmitter(onAudioChunk: (c: AudioChunkOut) => void) {
  const buffer: Map<number, string> = new Map();
  let nextToEmit = 0;
  return {
    add(index: number, audioBase64: string) {
      buffer.set(index, audioBase64);
      while (buffer.has(nextToEmit)) {
        const audio = buffer.get(nextToEmit)!;
        buffer.delete(nextToEmit);
        onAudioChunk({ index: nextToEmit, audio });
        nextToEmit++;
      }
    },
    get pending() {
      return buffer.size;
    },
  };
}

async function ttsSentence(sentence: string, voiceId: string): Promise<string> {
  const buf = await callGrokTTS(sentence, voiceId);
  return buf.toString('base64');
}

async function streamGrokReactionWithAudio(
  r: ReactRequest,
  voiceId: string,
  handlers: StreamHandlers,
): Promise<string> {
  let textBuf = '';
  let chunkIndex = 0;
  const inflight: Promise<void>[] = [];
  const emitter = makeOrderedEmitter(handlers.onAudioChunk);

  const enqueueTTS = (sentence: string) => {
    const myIndex = chunkIndex++;
    const p = ttsSentence(sentence, voiceId)
      .then((audio) => emitter.add(myIndex, audio))
      .catch((err) => {
        console.warn('[react-speak] tts chunk failed:', err?.message || err);
        // Emit a silent marker so the client knows to skip this slot rather
        // than wait forever for an out-of-order chunk that will never land.
        emitter.add(myIndex, '');
      });
    inflight.push(p);
  };

  const full = await streamGrokReaction(r, (delta) => {
    handlers.onTextDelta(delta);
    textBuf += delta;
    const { sentences, remainder } = extractSentences(textBuf);
    for (const s of sentences) enqueueTTS(s);
    textBuf = remainder;
  });

  // TTS any trailing fragment that didn't hit a sentence terminator
  const tail = textBuf.trim();
  if (tail.length >= 8) enqueueTTS(tail);

  await Promise.all(inflight);
  return full;
}

// ============================================================================
// Continue-chapter — dynamically generate post-beat prose steered by listener
// ============================================================================

export interface ContinueChapterRequest {
  priorProse: string;           // everything the listener has already heard
  listenerUtterance: string;    // what the user just said in-character (may be empty — silence is canon)
  reactionText?: string;        // optional — only when we pre-generated an NPC reply
  characterName: string;
  characterArchetype?: string;
  characterRegister?: string;
  chapterTitle?: string;
  chapterPremise?: string;      // original premise so the story still lands
  targetWords?: number;         // how much continuation to produce (default 300)
  // Structured-improv fields. When present, continuation is shaped by the
  // chapter's planned outline so the user can steer within guardrails rather
  // than derail the whole story.
  outline?: OutlineScene[];
  sceneIndex?: number;          // 0-based index of the scene we're writing now
}

export interface OutlineScene {
  index: number;           // 0-based order
  intent: string;           // what must happen in this scene (one sentence)
  beatIntent: string;       // what moment the character speaks at (one sentence)
}

function buildContinueSystemPrompt(r: ContinueChapterRequest): string {
  const target = r.targetWords ?? 300;
  const spokeSilence = !r.listenerUtterance?.trim();
  const scene = r.outline?.find((s) => s.index === (r.sceneIndex ?? -1));
  const nextScene = r.outline?.find((s) => s.index === (r.sceneIndex ?? -1) + 1);
  const isFinal = !!r.outline && r.sceneIndex === r.outline.length - 1;

  const silenceLine = spokeSilence
    ? `- The listener did NOT speak — they chose silence. Silence IS canon. Let the pause land: narrate other characters reacting to ${r.characterName}'s silence (waiting, pressing, interpreting it as hesitation, defiance, grief, whatever fits). Do NOT put words in their mouth; the silence stays unspoken.`
    : `- Treat the listener's spoken line as canon dialogue from ${r.characterName}. Other characters should react to it naturally (dialogue, action, internal shift). Do NOT restate the listener's line verbatim — assume the listener heard themselves; narrate from AFTER the line.`;

  const sceneLine = scene
    ? `\nThis scene (scene ${scene.index + 1}) MUST fulfill this intent:\n  "${scene.intent}"\n\nIt should end at this beat moment (so the listener speaks next):\n  "${scene.beatIntent}"\n\nGuardrails: the listener's line may change *how* the character gets to this intent (tone, micro-choices, resistance, compliance) but MUST NOT erase the outlined events. If what they said would skip or contradict the intent, let other characters push back, consequences redirect, or reality interrupt — the story still lands where it's supposed to land.`
    : '';

  const endingLine = isFinal
    ? `\nThis is the FINAL scene. After the outlined intent lands, bring the chapter to a satisfying close — no cliffhanger beat needed. Do NOT end on a line the character would speak.`
    : nextScene
      ? `\nEnd the scene on a narrator line that HANDS OFF to ${r.characterName} again — a moment where the character is addressed, asked a question, pressed for a decision, or silence is being read for an answer. Do NOT write their reply.`
      : `\nPace the continuation so it lands on a natural moment where ${r.characterName} would speak again.`;

  return `You are writing scene ${(r.sceneIndex ?? 0) + 1}${r.outline ? ` of ${r.outline.length}` : ''} of an audiobook chapter. The listener is voicing "${r.characterName}"${r.characterArchetype ? ` (${r.characterArchetype})` : ''} in real time.

Hard rules:
- ~${target} words. Maintain the third-person narrative voice and register from the prior prose.
- Do NOT break the fourth wall or acknowledge the listener.
${silenceLine}${sceneLine}${endingLine}
${r.characterRegister ? `- When ${r.characterName} speaks or thinks later in this passage, match the register: "${r.characterRegister}".` : ''}`;
}

function buildContinueUserPrompt(r: ContinueChapterRequest): string {
  const utter = r.listenerUtterance?.trim();
  const spokenBlock = utter
    ? `${r.characterName} (voiced by the listener) just said aloud:\n"${utter}"`
    : `${r.characterName} (voiced by the listener) stayed silent — no reply.`;
  const reactionLine = r.reactionText?.trim()
    ? `\nImmediate reaction that just played (narrate what happens after it):\n"${r.reactionText.trim()}"\n`
    : '';
  return `Chapter${r.chapterTitle ? `: ${r.chapterTitle}` : ''}
${r.chapterPremise ? `\nOriginal premise: ${r.chapterPremise}` : ''}

Prose so far (already heard by the listener):
${r.priorProse.trim().slice(-3500)}

${spokenBlock}
${reactionLine}
Now write the next ~${r.targetWords ?? 300} words, continuing naturally from the moment right after.`;
}

async function streamGrokContinuation(
  r: ContinueChapterRequest,
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
      temperature: 0.75,
      max_tokens: Math.max(400, Math.ceil((r.targetWords ?? 300) * 1.8)),
      messages: [
        { role: 'system', content: buildContinueSystemPrompt(r) },
        { role: 'user', content: buildContinueUserPrompt(r) },
      ],
    }),
  });

  if (!resp.ok || !resp.body) {
    const body = await resp.text().catch(() => '');
    throw new Error(`continue-chapter ${resp.status}: ${body.slice(0, 400)}`);
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
      } catch { /* keep streaming */ }
    }
  }
  return full;
}

async function streamContinueChapterWithAudio(
  r: ContinueChapterRequest,
  voiceId: string,
  handlers: StreamHandlers,
): Promise<string> {
  let textBuf = '';
  let chunkIndex = 0;
  const inflight: Promise<void>[] = [];
  const emitter = makeOrderedEmitter(handlers.onAudioChunk);

  const enqueueTTS = (sentence: string) => {
    const myIndex = chunkIndex++;
    const p = ttsSentence(sentence, voiceId)
      .then((audio) => emitter.add(myIndex, audio))
      .catch((err) => {
        console.warn('[continue-chapter] tts chunk failed:', err?.message || err);
        emitter.add(myIndex, '');
      });
    inflight.push(p);
  };

  const full = await streamGrokContinuation(r, (delta) => {
    handlers.onTextDelta(delta);
    textBuf += delta;
    const { sentences, remainder } = extractSentences(textBuf);
    for (const s of sentences) enqueueTTS(s);
    textBuf = remainder;
  });

  const tail = textBuf.trim();
  if (tail.length >= 8) enqueueTTS(tail);
  await Promise.all(inflight);
  return full;
}

// ============================================================================
// Scene-by-scene Active Character player
// ----------------------------------------------------------------------------
// New flow (replaces the in-prose Open Beat triggers for v1.1+):
//   1. Ara delivers a calm pre-roll: "This is an active-character experience.
//      You are X. Enjoy."
//   2. Leo narrates ONE scene of prose.
//   3. Ara frames the moment in 1-2 sentences: "[setup]. What do you say?"
//      She does NOT script the line — the user invents it.
//   4. User speaks → transcribed.
//   5. The next scene is generated conditioned on the user's line. Its TTS
//      OPENS with a brief recap that re-stages the last beat and weaves the
//      user's spoken words in as the active character's dialogue, then
//      continues into new prose. Listener hears it as one continuous flow.
//   6. Repeat until the final scene, which closes the chapter without a
//      coach prompt.
//
// All endpoints are stateless. The mobile client holds session state
// (outline, prior scenes, user lines) and passes it back per call.
// ============================================================================

const PLAYER_AUDIO_DIR = path.join(process.cwd(), 'uploads', 'audio');
function ensurePlayerAudioDir() {
  if (!fs.existsSync(PLAYER_AUDIO_DIR)) fs.mkdirSync(PLAYER_AUDIO_DIR, { recursive: true });
}

/** Render text to MP3 with a single Grok TTS call and persist to /uploads/audio.
 *  Cached by content hash (voice+text), so deterministic strings (e.g. the
 *  intro pre-roll for a given character) skip the TTS roundtrip entirely
 *  on subsequent calls. Returns relative URL + char-based duration estimate
 *  (Grok 24kHz/128kbps averages ~14 chars/sec at default pace). Long scene
 *  prose (~3-4k chars) fits inside Grok's 14,500-char per-request cap. */
async function renderActiveCharacterTTS(text: string, voiceId: string, _keyHint?: string): Promise<{
  audioUrl: string;
  durationEstimate: number;
  cached: boolean;
}> {
  ensurePlayerAudioDir();
  const contentHash = crypto.createHash('md5').update(`${voiceId}:${text}`).digest('hex').slice(0, 16);
  const filename = `acp-${contentHash}.mp3`;
  const filepath = path.join(PLAYER_AUDIO_DIR, filename);
  const durationEstimate = Math.max(1, Math.ceil(text.length / 14) + 0.5);

  if (fs.existsSync(filepath)) {
    return { audioUrl: `/uploads/audio/${filename}`, durationEstimate, cached: true };
  }
  const buf = await callGrokTTS(text, voiceId);
  fs.writeFileSync(filepath, buf);
  return { audioUrl: `/uploads/audio/${filename}`, durationEstimate, cached: false };
}

interface PlayerSceneRequest {
  chapterTitle: string;
  chapterNumber?: number;
  outline: Array<{ intent: string; beatIntent: string }>;
  sceneIndex: number;
  priorScenesProse: string[];
  lastUserLine?: string;
  characterName: string;
  characterArchetype?: string;
  characterRegister?: string;
  projectTitle?: string;
}

/** Generate one scene of prose for the player. The shape is intentionally
 *  different from chapter generation: short scenes (~400-600 words), explicit
 *  hand-off moment at the end, optional bridge passage at the start. */
async function generateActiveCharacterScene(r: PlayerSceneRequest): Promise<string> {
  if (!r.outline[r.sceneIndex]) throw new Error(`No outline entry for sceneIndex ${r.sceneIndex}`);
  const { system, user } = buildScenePrompts(r);
  const prose = await callLLM({ system, user, maxTokens: 1400, temperature: 0.75 });
  if (!prose) throw new Error('generate-scene returned empty prose');
  return prose;
}

/** Build the same system + user prompts generateActiveCharacterScene uses,
 *  factored out so the streaming variant can reuse them. */
function buildScenePrompts(r: PlayerSceneRequest): { system: string; user: string } {
  const isFirst = r.sceneIndex === 0;
  const isLast = r.sceneIndex === r.outline.length - 1;
  const sceneSpec = r.outline[r.sceneIndex];

  const introNote = isFirst
    ? `Open with a single line spoken aloud: "Chapter${r.chapterNumber ? ` ${r.chapterNumber}` : ''}${r.chapterTitle ? `: ${r.chapterTitle}` : ''}." Then a soft transition into the scene.`
    : '';

  const bridgeNote = !isFirst && r.lastUserLine?.trim()
    ? `BRIDGE PASSAGE — open with 1-2 sentences that re-stage the last beat: a short physical/emotional anchor (someone breathes, the room shifts, a glance), then quote ${r.characterName}'s line as dialogue exactly. The line they spoke was: ${r.lastUserLine.trim()}. After the dialogue tag, continue into the new scene's events. The bridge should make the listener feel that what they said is now woven into the story. Do NOT label it "bridge" or refer to scenes/numbers in-prose.`
    : '';

  const handoffNote = isLast
    ? `This is the final scene. Bring the chapter to a resolution. Do NOT end on an open beat — close it cleanly. ${r.characterName} can speak inside this scene as part of resolution.`
    : `End the scene at a moment where ${r.characterName} would naturally speak (someone asks them a question, the antagonist waits, a silence after a revelation). Do NOT write ${r.characterName}'s line — leave that hand-off open. The last line should set up the silence the listener fills.`;

  const system = `You are Theodore drafting one scene of an Active Character audiobook.

The listener voices "${r.characterName}"${r.characterArchetype ? ` (${r.characterArchetype})` : ''}${r.characterRegister ? ` — register: ${r.characterRegister}` : ''}. They will speak as ${r.characterName} at the end of this scene if it's not the final one.

Hard rules:
- 400-600 words. Tight, vivid, audiobook-friendly prose. No internal monologue from ${r.characterName} unless absolutely necessary.
- Third-person past tense. Sensory details. Concrete actions.
- Do NOT include scene headings, numbers, or markdown.
- Do NOT use placeholder bracket text like [Character speaks].
${introNote ? `- ${introNote}\n` : ''}${bridgeNote ? `- ${bridgeNote}\n` : ''}- ${handoffNote}

Output ONLY the prose. No commentary, no labels.`;

  const priorRecap = r.priorScenesProse.length
    ? `Story so far (prior scenes — for continuity, do NOT repeat verbatim):\n\n${r.priorScenesProse.join('\n\n').slice(-3500)}\n\n`
    : '';

  const user = `${priorRecap}This scene's intent (the guardrail — bend it however the user's last line steered things, but the scene must hit this beat):
${sceneSpec.intent}

${!isLast ? `Hand-off setup for end of scene: ${sceneSpec.beatIntent}` : ''}

Write scene ${r.sceneIndex + 1} of ${r.outline.length} now.`;

  return { system, user };
}

interface SceneStreamHandlers {
  onTextDelta: (delta: string) => void;
  onAudioChunk: (c: { index: number; audio: string }) => void;
}

/** Stream Anthropic Haiku for scene prose, sentence-chunk it, fire Grok TTS
 *  for each sentence in parallel, emit ordered audio chunks back. Listener
 *  hears the first sentence in ~3-5s instead of waiting 30-60s for the
 *  whole scene to render serially. */
async function streamSceneWithAudio(
  req: PlayerSceneRequest,
  voiceId: string,
  handlers: SceneStreamHandlers,
): Promise<string> {
  const { system, user } = buildScenePrompts(req);

  let textBuf = '';
  let chunkIndex = 0;
  const inflight: Promise<void>[] = [];
  const emitter = makeOrderedEmitter(handlers.onAudioChunk);

  const enqueueTTS = (sentence: string) => {
    const myIndex = chunkIndex++;
    const p = ttsSentence(sentence, voiceId)
      .then((audio) => emitter.add(myIndex, audio))
      .catch((err) => {
        console.warn('[play/scene-stream] tts chunk failed:', err?.message || err);
        emitter.add(myIndex, '');
      });
    inflight.push(p);
  };

  let full = '';
  try {
    full = await streamAnthropicLLM(
      { system, user, maxTokens: 1400, temperature: 0.75 },
      (delta) => {
        handlers.onTextDelta(delta);
        textBuf += delta;
        const { sentences, remainder } = extractSentences(textBuf);
        for (const s of sentences) enqueueTTS(s);
        textBuf = remainder;
      },
    );
  } catch (e: any) {
    // Anthropic streaming failed — fall back to non-streaming via callLLM.
    // We still get the prose, just without the per-sentence latency win.
    ac('scene-stream Anthropic failed, falling back to non-streaming', e?.message || e);
    full = await callLLM({ system, user, maxTokens: 1400, temperature: 0.75 });
    handlers.onTextDelta(full);
    textBuf = full;
    const { sentences, remainder } = extractSentences(textBuf);
    for (const s of sentences) enqueueTTS(s);
    textBuf = remainder;
  }

  // TTS any trailing fragment that didn't hit a sentence terminator.
  const tail = textBuf.trim();
  if (tail.length >= 8) enqueueTTS(tail);

  await Promise.all(inflight);
  return full;
}

/** Generate Ara's brief end-of-scene framing. Sets the situation in 1-2
 *  sentences and invites the user to speak. Never scripts the line. */
async function generateCoachLine(r: {
  characterName: string;
  sceneIntent: string;
  beatIntent: string;
  sceneJustEndedTail: string; // last ~600 chars of scene prose so coach knows the moment
}): Promise<string> {
  const sys = `You are the Director — a calm, warm voice that sets up moments in an Active Character audiobook for the listener.

Your output will be read aloud by Ara, a soft female voice. The listener voices "${r.characterName}". You frame the moment in 1-2 short sentences and invite them to speak.

HARD RULES:
- Maximum two sentences. Total under 25 words.
- DO NOT suggest what to say. Never quote or paraphrase a possible line.
- DO NOT recap plot. The listener just heard the scene.
- Just frame the moment ("They wait." "The silence stretches." "His eyes are on you.") and end with a soft cue: "What do you say?" or similar.
- Calm, quiet tone. Like a stage manager whispering a cue.
- Output ONLY the spoken text. No labels, no markdown.`;

  const userMsg = `Scene just ended on this beat: ${r.beatIntent}

Last lines of the scene (for context only):
${r.sceneJustEndedTail.slice(-600)}

Write the Director's cue now.`;

  const line = await callLLM({ system: sys, user: userMsg, maxTokens: 80, temperature: 0.6 });
  if (!line) throw new Error('coach-line returned empty');
  return line;
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

  // ----- React + stream audio chunks (fast-lane for live playback) -----
  //
  // Pipeline: Grok token stream → sentence buffer → parallel Grok TTS per
  // sentence → SSE events with base64 MP3 chunks emitted IN ORDER. The client
  // plays chunks as they arrive so the first sound reaches the ear in ~2s
  // instead of waiting for full-text → full-TTS (10-15s).
  app.post('/api/active-character/react-speak', express.json({ limit: '256kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as ReactRequest & { voiceId?: string };
      if (!body?.cueText || !body?.characterName) {
        return res.status(400).json({ error: 'cueText and characterName required' });
      }
      const voiceId = body.voiceId || 'eve';

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        const full = await streamGrokReactionWithAudio(body, voiceId, {
          onTextDelta: (delta) => {
            res.write(`data: ${JSON.stringify({ type: 'text', delta })}\n\n`);
          },
          onAudioChunk: (chunk) => {
            res.write(`data: ${JSON.stringify({ type: 'audio', index: chunk.index, audio: chunk.audio, mime: 'audio/mpeg' })}\n\n`);
          },
        });
        res.write(`data: ${JSON.stringify({ type: 'done', text: full })}\n\n`);
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'react-speak failed' })}\n\n`);
      } finally {
        res.end();
      }
    } catch (e: any) {
      ac('react-speak outer failed', e?.message || e);
      if (!res.headersSent) res.status(500).json({ error: e?.message || 'react-speak failed' });
    }
  });

  // ----- Continue-chapter: dynamically generate post-beat prose steered by
  // the listener's utterance, and stream it + TTS audio chunks. Used right
  // after a beat completes so the rest of the chapter adapts to what the
  // listener said instead of resuming pre-written prose.
  app.post('/api/active-character/continue-chapter', express.json({ limit: '512kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as ContinueChapterRequest & { voiceId?: string };
      // listenerUtterance may be empty — silence is canon input; we still continue.
      if (!body?.priorProse || !body?.characterName) {
        return res.status(400).json({ error: 'priorProse and characterName required' });
      }
      if (body.listenerUtterance == null) body.listenerUtterance = '';
      const voiceId = body.voiceId || 'eve';

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      try {
        const full = await streamContinueChapterWithAudio(body, voiceId, {
          onTextDelta: (delta) => {
            res.write(`data: ${JSON.stringify({ type: 'text', delta })}\n\n`);
          },
          onAudioChunk: (chunk) => {
            res.write(`data: ${JSON.stringify({ type: 'audio', index: chunk.index, audio: chunk.audio, mime: 'audio/mpeg' })}\n\n`);
          },
        });
        res.write(`data: ${JSON.stringify({ type: 'done', text: full })}\n\n`);
      } catch (err: any) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'continue-chapter failed' })}\n\n`);
      } finally {
        res.end();
      }
    } catch (e: any) {
      ac('continue-chapter outer failed', e?.message || e);
      if (!res.headersSent) res.status(500).json({ error: e?.message || 'continue-chapter failed' });
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

  // ----- Generate chapter outline (structured-improv skeleton) -----
  app.post('/api/active-character/generate-outline', express.json({ limit: '128kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as OutlineRequest;
      if (!body?.chapterPremise || !body?.characterName) {
        return res.status(400).json({ error: 'chapterPremise and characterName required' });
      }
      const scenes = await generateActiveCharacterOutline(body);
      if (scenes.length < 3) {
        return res.status(502).json({ error: 'outline returned fewer than 3 scenes' });
      }
      ac('outline ok', { scenes: scenes.length });
      res.json({ scenes });
    } catch (e: any) {
      ac('outline failed', e?.message || e);
      res.status(500).json({ error: e?.message || 'outline failed' });
    }
  });

  // ====================================================================
  // Scene-by-scene player endpoints (v1.1+ Active Character experience)
  // ====================================================================

  // ----- Pre-roll: Ara welcomes the listener and names the character -----
  app.post('/api/active-character/play/intro', express.json({ limit: '16kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const characterName = String((req.body || {}).characterName || '').trim();
      if (!characterName) return res.status(400).json({ error: 'characterName required' });

      // Static, calm pre-roll. Same wording every time so the listener learns
      // the cadence — Ara's tone (warm, quiet) carries the welcome, not new
      // copy each time.
      const text = `This is an active-character experience. You are ${characterName}. Enjoy.`;
      const rendered = await renderActiveCharacterTTS(text, 'ara', `intro:${characterName}`);
      ac('play/intro ok', { characterName, durationEstimate: rendered.durationEstimate });
      res.json({ text, ...rendered });
    } catch (e: any) {
      ac('play/intro failed', e?.message || e);
      res.status(500).json({ error: e?.message || 'play/intro failed' });
    }
  });

  // ----- Generate one scene's prose + render it as Leo audio -----
  app.post('/api/active-character/play/scene', express.json({ limit: '512kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as PlayerSceneRequest;
      if (!body?.outline?.length || !body?.characterName || typeof body.sceneIndex !== 'number') {
        return res.status(400).json({ error: 'outline, sceneIndex, and characterName required' });
      }
      if (body.sceneIndex < 0 || body.sceneIndex >= body.outline.length) {
        return res.status(400).json({ error: `sceneIndex out of range (outline has ${body.outline.length} scenes)` });
      }

      const prose = await generateActiveCharacterScene(body);
      const rendered = await renderActiveCharacterTTS(prose, 'leo', `scene:${body.sceneIndex}:${body.characterName}`);
      ac('play/scene ok', { sceneIndex: body.sceneIndex, chars: prose.length, durationEstimate: rendered.durationEstimate });
      res.json({ prose, ...rendered, sceneIndex: body.sceneIndex, isFinalScene: body.sceneIndex === body.outline.length - 1 });
    } catch (e: any) {
      ac('play/scene failed', e?.message || e);
      res.status(500).json({ error: e?.message || 'play/scene failed' });
    }
  });

  // ----- Streaming variant of /play/scene — text deltas + sentence-chunked
  //       Grok TTS audio over SSE. First sound lands in ~3-5s; full scene
  //       renders in ~30s but the listener hears it incrementally. -----
  app.post('/api/active-character/play/scene-stream', express.json({ limit: '512kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body as PlayerSceneRequest;
      if (!body?.outline?.length || !body?.characterName || typeof body.sceneIndex !== 'number') {
        return res.status(400).json({ error: 'outline, sceneIndex, and characterName required' });
      }
      if (body.sceneIndex < 0 || body.sceneIndex >= body.outline.length) {
        return res.status(400).json({ error: `sceneIndex out of range (outline has ${body.outline.length} scenes)` });
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      // Some proxies (incl. Render's load balancer) buffer responses unless
      // told not to — without this, the SSE chunks pile up and arrive in
      // a single flush after the request completes, killing the streaming
      // win entirely.
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      // Heartbeat: SSE comment every 12s so Render / mobile don't think
      // the connection is dead during the pre-first-token gap (Anthropic
      // can take 3-5s to start streaming on cold load).
      const heartbeat = setInterval(() => {
        try { res.write(`: keepalive ${Date.now()}\n\n`); } catch {}
      }, 12_000);

      // If the client aborts (player teardown), stop generating.
      const aborted = { v: false };
      req.on('close', () => { aborted.v = true; });

      try {
        const full = await streamSceneWithAudio(body, 'leo', {
          onTextDelta: (delta) => {
            if (aborted.v) return;
            res.write(`data: ${JSON.stringify({ type: 'text', delta })}\n\n`);
          },
          onAudioChunk: (chunk) => {
            if (aborted.v) return;
            res.write(`data: ${JSON.stringify({ type: 'audio', index: chunk.index, audio: chunk.audio })}\n\n`);
          },
        });
        if (!aborted.v) {
          res.write(`data: ${JSON.stringify({ type: 'done', prose: full, sceneIndex: body.sceneIndex, isFinalScene: body.sceneIndex === body.outline.length - 1 })}\n\n`);
        }
        ac('play/scene-stream ok', { sceneIndex: body.sceneIndex, chars: full.length, aborted: aborted.v });
      } catch (err: any) {
        ac('play/scene-stream failed', err?.message || err);
        if (!aborted.v) {
          res.write(`data: ${JSON.stringify({ type: 'error', error: err?.message || 'stream failed' })}\n\n`);
        }
      } finally {
        clearInterval(heartbeat);
        try { res.end(); } catch {}
      }
    } catch (e: any) {
      if (!res.headersSent) res.status(500).json({ error: e?.message || 'play/scene-stream outer failure' });
    }
  });

  // ----- Generate Ara's end-of-scene framing + render her audio -----
  app.post('/api/active-character/play/coach', express.json({ limit: '128kb' }), async (req: Request, res: Response) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const body = req.body || {};
      const characterName = String(body.characterName || '').trim();
      const sceneIntent = String(body.sceneIntent || '').trim();
      const beatIntent = String(body.beatIntent || '').trim();
      const sceneJustEndedTail = String(body.sceneJustEndedTail || '').trim();
      if (!characterName || !beatIntent) {
        return res.status(400).json({ error: 'characterName and beatIntent required' });
      }

      const text = await generateCoachLine({ characterName, sceneIntent, beatIntent, sceneJustEndedTail });
      const rendered = await renderActiveCharacterTTS(text, 'ara', `coach:${characterName}`);
      ac('play/coach ok', { chars: text.length, durationEstimate: rendered.durationEstimate });
      res.json({ text, ...rendered });
    } catch (e: any) {
      ac('play/coach failed', e?.message || e);
      res.status(500).json({ error: e?.message || 'play/coach failed' });
    }
  });
}
