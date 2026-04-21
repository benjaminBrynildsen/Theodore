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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
  const sceneCount = Math.min(Math.max(r.targetScenes ?? 4, 3), 5);

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
      temperature: 0.5,
      system: sys,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`generate-outline ${resp.status}: ${body.slice(0, 400)}`);
  }

  const json = (await resp.json()) as any;
  const raw = json?.content?.[0]?.text ?? '';
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
  // Anthropic Claude Haiku handles this structured-extraction task cheaply and
  // reliably. Previously delegated to Grok (xAI) but their chat model names
  // keep moving (grok-2-latest, grok-beta, grok-4) — the resulting 400s
  // silently shipped 0 beats. Using Haiku removes that fragility.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing');
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
}
