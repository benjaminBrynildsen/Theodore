import { create } from 'zustand';

// Phases of an in-flight operation:
//   starting   — kicked off but no measurable progress yet
//   streaming  — progress is updating (model emitting tokens, audio rendering, etc.)
//   finalizing — main work done, post-processing (dialogue clarity, scene split, save)
//   done       — fully complete, the bar will fade out shortly
export type GenerationPhase = 'starting' | 'streaming' | 'finalizing' | 'done';

// Every long-running operation that should appear in the global progress bar.
// Add new kinds here when wiring up new call sites.
export type GenerationKind =
  | 'generate-chapter'
  | 'extend-chapter'
  | 'generate-audio'
  | 'create-project'
  | 'inline-edit';

interface GenerationState {
  // null when no operation is active
  kind: GenerationKind | null;
  label: string;       // primary title — chapter name, project title, etc.
  subtitle: string;    // secondary line — word count, % done, "Building chapters…"
  progressPct: number; // 0-100. Honest cap is applied at render time, not here.
  // Indeterminate operations (e.g. project creation) animate the bar without
  // claiming a real percentage. Used when we have no good signal.
  indeterminate: boolean;
  phase: GenerationPhase;

  start: (params: {
    kind: GenerationKind;
    label: string;
    subtitle?: string;
    indeterminate?: boolean;
  }) => void;
  setProgress: (pct: number, subtitle?: string) => void;
  setSubtitle: (subtitle: string) => void;
  setPhase: (phase: GenerationPhase) => void;
  end: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  kind: null,
  label: '',
  subtitle: '',
  progressPct: 0,
  indeterminate: false,
  phase: 'starting',

  start: ({ kind, label, subtitle = '', indeterminate = false }) =>
    set({ kind, label, subtitle, progressPct: 0, indeterminate, phase: 'starting' }),

  // Same-value guard so a flood of equal-progress updates doesn't churn subscribers.
  setProgress: (pct, subtitle) =>
    set((s) => {
      const nextPct = Math.max(0, Math.min(100, pct));
      if (s.progressPct === nextPct && (subtitle == null || s.subtitle === subtitle)) {
        return s;
      }
      return {
        progressPct: nextPct,
        subtitle: subtitle != null ? subtitle : s.subtitle,
        // Auto-promote starting → streaming on first real progress
        phase: s.phase === 'starting' ? 'streaming' : s.phase,
      };
    }),

  setSubtitle: (subtitle) =>
    set((s) => (s.subtitle === subtitle ? s : { subtitle })),

  setPhase: (phase) => set({ phase }),

  end: () =>
    set({ kind: null, label: '', subtitle: '', progressPct: 0, indeterminate: false, phase: 'starting' }),
}));
