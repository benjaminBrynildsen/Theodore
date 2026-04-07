import { create } from 'zustand';

// Phases of an in-flight generation:
//   streaming  — model is still emitting tokens
//   finalizing — stream finished, post-processing (dialogue clarity pass, scene split, etc.)
//   done       — fully complete, the bar will fade out shortly
export type GenerationPhase = 'streaming' | 'finalizing' | 'done';

export type GenerationKind = 'generate' | 'extend';

interface GenerationState {
  chapterId: string | null;
  label: string;
  kind: GenerationKind;
  wordsGenerated: number;
  wordTarget: number;
  phase: GenerationPhase | null;
  start: (params: { chapterId: string; label: string; wordTarget: number; kind: GenerationKind }) => void;
  updateWords: (words: number) => void;
  setPhase: (phase: GenerationPhase) => void;
  end: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  chapterId: null,
  label: '',
  kind: 'generate',
  wordsGenerated: 0,
  wordTarget: 0,
  phase: null,
  start: ({ chapterId, label, wordTarget, kind }) =>
    set({ chapterId, label, wordTarget, kind, wordsGenerated: 0, phase: 'streaming' }),
  // Same-value guard so a flood of equal-word stream chunks doesn't churn subscribers.
  updateWords: (words) =>
    set((s) => (s.wordsGenerated === words ? s : { wordsGenerated: words })),
  setPhase: (phase) => set({ phase }),
  end: () =>
    set({ chapterId: null, label: '', wordsGenerated: 0, wordTarget: 0, phase: null }),
}));
