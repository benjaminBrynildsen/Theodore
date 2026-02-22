// AI Generation Service — handles Anthropic + OpenAI calls with streaming
import type { Request, Response } from 'express';

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
    'claude-sonnet-4-5': { input: 0.3, output: 1 },    // Mid-tier
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

  const model = req.model || 'claude-opus-4-6';
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

async function streamAnthropic(req: GenerateRequest, res: Response): Promise<{ inputTokens: number; outputTokens: number; model: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const model = req.model || 'claude-opus-4-6';
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
      stream: true,
      system: req.systemPrompt || 'You are Theodore, an expert fiction writer and story architect.',
      messages: [{ role: 'user', content: req.prompt }],
    }),
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
  while (true) {
    const { done, value } = await reader.read();
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
          res.write(`data: ${JSON.stringify({ type: 'text', text: event.delta.text })}\n\n`);
        } else if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens || outputTokens;
        } else if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens || 0;
        }
      } catch {}
    }
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

async function streamOpenAI(req: GenerateRequest, res: Response): Promise<{ inputTokens: number; outputTokens: number; model: string }> {
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
      stream: true,
      stream_options: { include_usage: true },
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

  let inputTokens = 0;
  let outputTokens = 0;

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) throw new Error('No response body');

  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
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
          res.write(`data: ${JSON.stringify({ type: 'text', text: delta })}\n\n`);
        }
        if (event.usage) {
          inputTokens = event.usage.prompt_tokens || inputTokens;
          outputTokens = event.usage.completion_tokens || outputTokens;
        }
      } catch {}
    }
  }

  return { inputTokens, outputTokens, model };
}

// ========== BYOK Support ==========

async function callWithUserKey(req: GenerateRequest, provider: string, apiKey: string): Promise<GenerateResult> {
  if (provider === 'anthropic') {
    const origKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = apiKey;
    try {
      return await callAnthropic(req);
    } finally {
      process.env.ANTHROPIC_API_KEY = origKey;
    }
  } else {
    const origKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = apiKey;
    try {
      return await callOpenAI(req);
    } finally {
      process.env.OPENAI_API_KEY = origKey;
    }
  }
}

// ========== Unified Generate ==========

export async function generate(req: GenerateRequest): Promise<GenerateResult> {
  const model = req.model || 'claude-opus-4-6';

  if (model.startsWith('claude') || model.startsWith('anthropic')) {
    return callAnthropic({ ...req, model });
  } else {
    return callOpenAI({ ...req, model });
  }
}

export async function generateStream(req: GenerateRequest, res: Response): Promise<{ inputTokens: number; outputTokens: number; model: string; creditsUsed: number }> {
  const model = req.model || 'claude-opus-4-6';

  let result;
  if (model.startsWith('claude') || model.startsWith('anthropic')) {
    result = await streamAnthropic({ ...req, model }, res);
  } else {
    result = await streamOpenAI({ ...req, model }, res);
  }

  return {
    ...result,
    creditsUsed: tokensToCredits(result.inputTokens, result.outputTokens, result.model),
  };
}

export { tokensToCredits, callWithUserKey };
