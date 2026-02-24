// Frontend generation client — calls server API with streaming support

import { useAuthStore } from '../store/auth';
import { useCreditsStore } from '../store/credits';

interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  projectId?: string;
  chapterId?: string;
  action: string;
  userId?: string;
}

interface GenerateResult {
  text: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    creditsUsed: number;
    creditsRemaining: number | null;
  };
}

// Non-streaming generation
export async function generateText(options: GenerateOptions): Promise<GenerateResult> {
  const fallbackUserId = useAuthStore.getState().user?.id;
  const res = await fetch('/api/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...options, userId: options.userId || fallbackUserId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 402) {
      throw new Error('INSUFFICIENT_CREDITS');
    }
    throw new Error(err.error || `Generation failed: ${res.status}`);
  }

  const data = await res.json() as GenerateResult;
  useCreditsStore.getState().recordUsage({
    action: options.action as any,
    creditsUsed: data.usage.creditsUsed || 0,
    tokensInput: data.usage.inputTokens || 0,
    tokensOutput: data.usage.outputTokens || 0,
    model: data.model,
    projectId: options.projectId,
    chapterId: options.chapterId,
    creditsRemaining: data.usage.creditsRemaining,
  });
  return data;
}

// Streaming generation
export async function generateStream(
  options: GenerateOptions,
  onText: (text: string) => void,
  onDone?: (usage: GenerateResult['usage']) => void,
  onError?: (error: string) => void,
): Promise<void> {
  const fallbackUserId = useAuthStore.getState().user?.id;
  const res = await fetch('/api/generate/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...options, userId: options.userId || fallbackUserId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    if (res.status === 402) {
      onError?.('INSUFFICIENT_CREDITS');
      return;
    }
    onError?.(err.error || `Generation failed: ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    onError?.('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === 'text') {
          onText(event.text);
        } else if (event.type === 'done') {
          useCreditsStore.getState().recordUsage({
            action: options.action as any,
            creditsUsed: event.usage?.creditsUsed || 0,
            tokensInput: event.usage?.inputTokens || 0,
            tokensOutput: event.usage?.outputTokens || 0,
            model: options.model || 'auto',
            projectId: options.projectId,
            chapterId: options.chapterId,
            creditsRemaining: event.usage?.creditsRemaining,
          });
          onDone?.(event.usage);
        } else if (event.type === 'error') {
          onError?.(event.error);
        }
      } catch {}
    }
  }
}

// Estimate credits before generation
export function estimateCredits(inputTokens: number, outputTokens: number, model: string): number {
  const multipliers: Record<string, { input: number; output: number }> = {
    'claude-opus-4-6': { input: 1, output: 3 },
    'claude-sonnet-4-5': { input: 0.3, output: 1 },
    'gpt-5.2': { input: 0.8, output: 2.5 },
    'gpt-4.1': { input: 0.2, output: 0.6 },
    'default': { input: 0.5, output: 1.5 },
  };
  const m = multipliers[model] || multipliers['default'];
  return Math.ceil(((inputTokens * m.input) + (outputTokens * m.output)) / 1000);
}
