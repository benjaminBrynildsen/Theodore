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
}

interface GenerateResult {
  text: string;
  model: string;
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
    'claude-opus-4-6': { input: 1, output: 3 },       // Most expensive
    'claude-sonnet-4-6': { input: 0.3, output: 1 },    // Default — best quality/cost for fiction
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

async function callAnthropic(req: GenerateRequest): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = req.model || 'claude-sonnet-4-6';
  const maxTokens = req.maxTokens || 4096;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: req.temperature ?? 0.8,
      system: req.systemPrompt || 'You are Theodore, an expert fiction writer and story architect.',
      messages: [{ role: 'user', content: req.prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
  }

  const data = await response.json() as any;
  const text = data.content?.[0]?.text || '';
  const inputTokens = data.usage?.input_tokens || 0;
  const outputTokens = data.usage?.output_tokens || 0;

  return {
    text,
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    creditsUsed: tokensToCredits(inputTokens, outputTokens, model),
  };
}

// ========== Anthropic Streaming ==========

async function streamAnthropic(req: GenerateRequest, sink: TextSink): Promise<{ inputTokens: number; outputTokens: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = req.model || 'claude-sonnet-4-6';
  const maxTokens = req.maxTokens || 4096;

  const controller = new AbortController();
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: req.temperature ?? 0.8,
      stream: true,
      system: req.systemPrompt || 'You are Theodore, an expert fiction writer and story architect.',
      messages: [{ role: 'user', content: req.prompt }],
    }),
    signal: controller.signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error ${response.status}: ${(err as any).error?.message || response.statusText}`);
  }

  let inputTokens = 0;
  let outputTokens = 0;

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
          if (event.type === 'content_block_delta' && event.delta?.text) {
            emitText(sink, event.delta.text);
          } else if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens || outputTokens;
          } else if (event.type === 'message_start' && event.message?.usage) {
            inputTokens = event.message.usage.input_tokens || 0;
          }
        } catch {}
      }
    }
  } finally {
    // Best-effort cleanup — if we threw mid-read, releasing the lock lets the
    // underlying socket actually close once we abort.
    try { reader.releaseLock(); } catch {}
  }

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

  return { inputTokens, outputTokens, model };
}

// ========== Unified Generate ==========

function normalizeRequestedModel(model?: string): string {
  const value = String(model || '').trim();
  if (!value || value === 'auto') return 'claude-sonnet-4-6';
  // Anthropic requires date-suffixed model IDs in some cases. Map the bare
  // names we use in the client to the canonical IDs the API will accept.
  const aliases: Record<string, string> = {
    'gpt-4o': 'gpt-4.1',
    'claude-opus': 'claude-opus-4-6',
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
    try {
      return await callAnthropic({ ...req, model });
    } catch (e: any) {
      console.error(`[AI] Anthropic failed (${e.message}), falling back to OpenAI`);
      return callOpenAI({ ...req, model: 'gpt-4.1' });
    }
  } else {
    return callOpenAI({ ...req, model });
  }
}

export async function generateStream(req: GenerateRequest, sink: TextSink): Promise<{ inputTokens: number; outputTokens: number; model: string; creditsUsed: number }> {
  const model = normalizeRequestedModel(req.model);

  let result;
  if (model.startsWith('claude') || model.startsWith('anthropic')) {
    try {
      result = await streamAnthropic({ ...req, model }, sink);
    } catch (e: any) {
      console.error(`[AI] Anthropic stream failed (${e.message}), falling back to OpenAI`);
      result = await streamOpenAI({ ...req, model: 'gpt-4.1' }, sink);
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
