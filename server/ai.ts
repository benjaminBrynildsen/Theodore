// AI Generation Service — handles Anthropic + OpenAI calls with streaming
import type { Request, Response } from 'express';

// A `TextSink` is anywhere we can deliver streaming text deltas. Two flavors:
//   - Express `Response`: writes SSE frames the live `/api/generate/stream`
//     endpoint sends to web clients.
//   - Plain `(text: string) => void` callback: used by the background job
//     runner so it can accumulate text + persist a partial snapshot to the DB
//     while the phone is suspended. Decoupling the writer from `res` is what
//     lets the job runner reuse the existing streaming providers without
//     faking an Express response object.
export type TextSink = Response | ((text: string) => void);

function emitText(sink: TextSink, text: string) {
  if (typeof sink === 'function') {
    sink(text);
  } else {
    sink.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
  }
}

// LLM streams occasionally stall mid-response — the upstream connection stays
// open but no chunks arrive. fetch() has no per-chunk idle timeout, so a
// naive `await reader.read()` hangs forever. Without this watchdog the prose
// job runner would heartbeat-mask a dead stream indefinitely (the bug we hit
// at "301 / 2500 words"). 60s of zero bytes is already way past Anthropic's
// normal cadence (chunks arrive every few hundred ms), so it's a safe cutoff.
const STREAM_IDLE_TIMEOUT_MS = 60_000;

class StreamIdleTimeoutError extends Error {
  constructor() {
    super(`LLM stream idle for ${Math.round(STREAM_IDLE_TIMEOUT_MS / 1000)}s — aborted`);
    this.name = 'StreamIdleTimeoutError';
  }
}

// Wrap a ReadableStream reader so that if no chunk arrives for IDLE_TIMEOUT_MS,
// we abort and throw. The caller passes its AbortController so abort()
// propagates into the underlying fetch (which closes the socket).
async function readWithIdleTimeout<T>(
  reader: ReadableStreamDefaultReader<T>,
  controller: AbortController,
): Promise<ReadableStreamReadResult<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const idle = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try { controller.abort(); } catch {}
      reject(new StreamIdleTimeoutError());
    }, STREAM_IDLE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([reader.read(), idle]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ========== Provider Interfaces ==========

interface GenerateRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  // User context for credit tracking
  userId: string;
  projectId?: string;
  chapterId?: string;
  action: string; // 'generate-chapter' | 'auto-fill' | 'validate' | 'recap' | etc.
  /** Optional: 'low' for quick conversational replies. Only lowering is allowed. */
  effort?: 'low';
}

interface GenerateResult {
  text: string;
  model: string;
  /** Anthropic stop_reason ('max_tokens' = cut off). */
  stopReason?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  creditsUsed: number;
}

// ========== Token → Credit Mapping ==========
// 1 credit = 1,000 tokens
function tokensToCredits(inputTokens: number, outputTokens: number, model: string): number {
  // Pricing multipliers (output tokens cost more)
  const multipliers: Record<string, { input: number; output: number }> = {
    // Scaled to each model's list price relative to Opus 4.6 ($5 / $25 per MTok).
    'claude-fable-5-1': { input: 2, output: 6 },       // $10 / $50 — most capable
    'claude-opus-5-5': { input: 0.8, output: 2.4 },    // $4 / $20 — default for fiction
    'claude-opus-4-6': { input: 1, output: 3 },       // $5 / $25 (legacy)
    'claude-sonnet-5-5': { input: 0.2, output: 0.67 },  // $2 / $10
    'claude-sonnet-4-6': { input: 0.3, output: 1 },    // $3 / $15
    'claude-haiku-4-5-20251001': { input: 0.1, output: 0.33 }, // $1 / $5
    'claude-sonnet-4-5': { input: 0.3, output: 1 },    // Legacy
    'gpt-5.2': { input: 0.8, output: 2.5 },            // Premium
    'gpt-4.1': { input: 0.2, output: 0.6 },            // Mid-tier
    'default': { input: 0.5, output: 1.5 },
  };

  const m = multipliers[model] || multipliers['default'];
  const weightedTokens = (inputTokens * m.input) + (outputTokens * m.output);
  return Math.ceil(weightedTokens / 1000);
}

// ========== Anthropic ==========

// Opus 5.x / Fable / Mythos / Sonnet 5.x: thinking is always on (it counts
// toward max_tokens), sampling params are rejected with a 400, and safety
// classifiers can decline — so we set effort explicitly, add thinking headroom,
// drop temperature, and opt into Anthropic's server-side refusal fallback.
function isAdaptiveOnlyModel(model: string): boolean {
  return /^claude-(opus-5|fable|mythos|sonnet-5)/.test(model);
}

// Short background analysis doesn't need deep thinking; prose and planning do.
const LOW_EFFORT_ACTIONS = new Set([
  'extract-continuity', 'refine-entities', 'entity-refine', 'generate-chapter-outline',
  'scene-prose-split', 'dialogue-tagging', 'sfx-tagging', 'sfx-ambience',
  'dialogue-clarity-pass', 'categorize', 'canon-cleanup', 'rebuild-notes-check',
]);

function anthropicRequest(req: GenerateRequest, model: string, stream: boolean): { headers: Record<string, string>; body: Record<string, unknown> } {
  const apiKey = process.env.ANTHROPIC_API_KEY as string;
  const maxTokens = req.maxTokens || 4096;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: req.systemPrompt || 'You are Theodore, an expert fiction writer and story architect.',
    messages: [{ role: 'user', content: req.prompt }],
    ...(stream ? { stream: true } : {}),
  };
  if (isAdaptiveOnlyModel(model)) {
    const effort = req.effort === 'low' || LOW_EFFORT_ACTIONS.has(String(req.action || '')) ? 'low' : 'medium';
    body.output_config = { effort };
    // Thinking tokens count toward max_tokens; callers size limits for the reply alone.
    body.max_tokens = maxTokens + (effort === 'low' ? 4000 : 12000);
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  } else {
    body.temperature = req.temperature ?? 0.8;
  }
  return { headers, body };
}

/** Billable tokens across every attempt (a server-side fallback reports one entry per attempt). */
function sumUsage(usage: any): { inputTokens: number; outputTokens: number } {
  const iterations = Array.isArray(usage?.iterations) ? usage.iterations : null;
  if (iterations?.length) {
    return iterations.reduce(
      (acc: { inputTokens: number; outputTokens: number }, it: any) => ({
        inputTokens: acc.inputTokens + (it.input_tokens || 0),
        outputTokens: acc.outputTokens + (it.output_tokens || 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }
  return { inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0 };
}

export class ContentRefusedError extends Error {
  constructor(category?: string | null) {
    super(`The AI declined this request${category ? ` (${category})` : ''}. Try rephrasing the chapter direction.`);
    this.name = 'ContentRefusedError';
  }
}

async function callAnthropic(req: GenerateRequest): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = req.model || 'claude-opus-5-5';
  const { headers, body } = anthropicRequest(req, model, false);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
  }

  const data = await response.json() as any;
  if (data.stop_reason === 'refusal') throw new ContentRefusedError(data.stop_details?.category);
  // Responses can open with thinking/fallback blocks — read text blocks by type.
  const text = (Array.isArray(data.content) ? data.content : [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text || '')
    .join('');
  const { inputTokens, outputTokens } = sumUsage(data.usage);
  const servedModel = data.model || model;

  return {
    text,
    model: servedModel,
    stopReason: data.stop_reason || undefined,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    creditsUsed: tokensToCredits(inputTokens, outputTokens, servedModel),
  };
}

// ========== Anthropic Streaming ==========

async function streamAnthropic(req: GenerateRequest, sink: TextSink): Promise<{ inputTokens: number; outputTokens: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  let model = req.model || 'claude-opus-5-5';
  const { headers, body } = anthropicRequest(req, model, true);

  const controller = new AbortController();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  let refusalCategory: string | null = null;

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error('No response body');

  let buffer = '';
  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout(reader, controller);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          // Only text deltas reach the reader; thinking deltas are skipped.
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            emitText(sink, event.delta.text);
          } else if (event.type === 'message_delta') {
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
            if (event.delta?.stop_details?.category) refusalCategory = event.delta.stop_details.category;
            if (event.usage) {
              const summed = sumUsage(event.usage);
              outputTokens = summed.outputTokens || outputTokens;
              if (Array.isArray(event.usage.iterations)) inputTokens = summed.inputTokens || inputTokens;
            }
          } else if (event.type === 'message_start' && event.message) {
            inputTokens = event.message.usage?.input_tokens || 0;
            // With a pre-output fallback, message_start names the model that served it.
            if (event.message.model) model = event.message.model;
          }
        } catch {}
      }
    }
  } finally {
    // Best-effort cleanup — if we threw mid-read, releasing the lock lets the
    // underlying socket actually close once we abort.
    try { reader.releaseLock(); } catch {}
  }

  if (stopReason === 'refusal') throw new ContentRefusedError(refusalCategory);
  return { inputTokens, outputTokens, model };
}

// ========== OpenAI ==========

async function callOpenAI(req: GenerateRequest): Promise<GenerateResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = req.model || 'gpt-4.1';
  const maxTokens = req.maxTokens || 4096;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: req.temperature ?? 0.8,
      messages: [
        { role: 'system', content: req.systemPrompt || 'You are Theodore, an expert fiction writer and story architect.' },
        { role: 'user', content: req.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
  }

  const data = await response.json() as any;
  const text = data.choices?.[0]?.message?.content || '';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  return {
    text,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    creditsUsed: tokensToCredits(inputTokens, outputTokens, model),
  };
}

// ========== OpenAI Streaming ==========

async function streamOpenAI(req: GenerateRequest, sink: TextSink): Promise<{ inputTokens: number; outputTokens: number; model: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const model = req.model || 'gpt-4.1';
  const maxTokens = req.maxTokens || 4096;

  const controller = new AbortController();
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: req.temperature ?? 0.8,
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: 'system', content: req.systemPrompt || 'You are Theodore, an expert fiction writer and story architect.' },
        { role: 'user', content: req.prompt },
      ],
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
  }

  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  let refusalCategory: string | null = null;

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error('No response body');

  let buffer = '';
  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout(reader, controller);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) {
            emitText(sink, delta);
          }
          if (event.usage) {
            inputTokens = event.usage.prompt_tokens || inputTokens;
            outputTokens = event.usage.completion_tokens || outputTokens;
          }
        } catch {}
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  if (stopReason === 'refusal') throw new ContentRefusedError(refusalCategory);
  return { inputTokens, outputTokens, model };
}

// ========== Unified Generate ==========

// A handful of Anthropic failure modes are transient — the right move is to
// retry once after a short backoff rather than silently bail to OpenAI (which
// for months was masking transient Claude blips and, when OpenAI itself ran
// out of quota on 2026-06-04, surfaced as user-visible HTTP 500s on every
// chat-creation / chapter-gen call). Classify here so the retry knows when
// to re-attempt vs propagate.
function isRetryableAnthropicError(e: any): boolean {
  const msg = String(e?.message || '');
  if (msg.includes('overloaded')) return true;        // Anthropic-specific
  if (msg.includes('rate_limit')) return true;        // Transient throttle
  if (/Anthropic API error 5\d\d/.test(msg)) return true; // 5xx upstream
  if (msg.includes('fetch failed')) return true;      // Node fetch network failure
  if (msg.includes('Failed to fetch')) return true;   // Browser-style network failure
  if (msg.includes('ECONNRESET')) return true;        // TCP reset
  if (msg.includes('ETIMEDOUT')) return true;         // Connect timeout
  if (msg.includes('Idle timeout')) return true;      // Our own readWithIdleTimeout
  return false;
}

const RETRY_DELAY_MS = 600;

async function withAnthropicRetry<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e: any) {
    if (!isRetryableAnthropicError(e)) throw e;
    console.warn(`[AI] Anthropic transient error, retrying in ${RETRY_DELAY_MS}ms: ${e.message}`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return op();
  }
}

function normalizeRequestedModel(model?: string): string {
  const value = String(model || '').trim();
  if (!value || value === 'auto') return 'claude-opus-5-5';
  // Anthropic requires date-suffixed model IDs in some cases. Map the bare
  // names we use in the client to the canonical IDs the API will accept.
  const aliases: Record<string, string> = {
    'gpt-4o': 'gpt-4.1',
    'claude-opus': 'claude-opus-5-5',
    'claude-fable': 'claude-fable-5-1',
    'claude-sonnet': 'claude-sonnet-4-6',
    'claude-sonnet-4-5': 'claude-sonnet-4-6',
    'claude-haiku': 'claude-haiku-4-5-20251001',
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  };
  const normalized = aliases[value] || value;
  const wantsAnthropic = normalized.startsWith('claude') || normalized.startsWith('anthropic');
  if (wantsAnthropic && !process.env.ANTHROPIC_API_KEY) {
    return 'gpt-4.1'; // fallback if no Anthropic key
  }
  return normalized;
}

export async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const model = normalizeRequestedModel(req.model);

  if (model.startsWith('claude') || model.startsWith('anthropic')) {
    // Anthropic with one transient-error retry. We deliberately do NOT fall
    // back to OpenAI here — that fallback existed historically but became a
    // hidden footgun (see 2026-06-04 incident: OpenAI quota exhausted →
    // every Claude blip surfaced as user-visible HTTP 500). The route
    // handler catches this and returns a clean error the client can retry.
    return withAnthropicRetry(() => callAnthropic({ ...req, model }));
  }
  return callOpenAI({ ...req, model });
}

export async function generateStream(req: GenerateRequest, sink: TextSink): Promise<{ inputTokens: number; outputTokens: number; model: string; creditsUsed: number }> {
  const model = normalizeRequestedModel(req.model);

  let result;
  if (model.startsWith('claude') || model.startsWith('anthropic')) {
    // For streaming, only retry if no tokens have been emitted yet — we
    // can't safely re-send a half-streamed response. Wrap the sink so we
    // can detect first-write and short-circuit the retry once we've
    // committed any output.
    let emitted = false;
    // Guard wraps `sink` so we can flip `emitted` on first write. Use
    // emitText so we transparently support both Response and function sinks.
    const guardedSink: TextSink = (text: string) => { emitted = true; emitText(sink, text); };
    try {
      result = await streamAnthropic({ ...req, model }, guardedSink);
    } catch (e: any) {
      if (emitted || !isRetryableAnthropicError(e)) throw e;
      console.warn(`[AI] Anthropic stream transient (pre-emit), retrying: ${e.message}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      result = await streamAnthropic({ ...req, model }, sink);
    }
  } else {
    result = await streamOpenAI({ ...req, model }, sink);
  }

  return {
    ...result,
    creditsUsed: tokensToCredits(result.inputTokens, result.outputTokens, result.model),
  };
}

export { tokensToCredits };
