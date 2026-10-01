// Model choices for writing vs background analysis.
// The author's preferred model writes prose. Background passes (continuity
// extraction, scene splitting, outline updates) stay on Opus even when Fable
// is chosen — they're analysis, and Fable costs ~2.5x as much.

export const DEFAULT_WRITING_MODEL = 'claude-opus';

export function writingModel(preferred?: string | null): string {
  return preferred || DEFAULT_WRITING_MODEL;
}

export function analysisModel(preferred?: string | null): string {
  const model = writingModel(preferred);
  return model === 'claude-fable' ? 'claude-opus' : model;
}
