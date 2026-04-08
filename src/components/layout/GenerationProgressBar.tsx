import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useGenerationStore, type GenerationKind } from '../../store/generation';
import { cn } from '../../lib/utils';

/**
 * Persistent progress indicator for any long-running operation. Sits at the
 * top of the viewport (below TopBar) so it's visible regardless of which view
 * the user is on. One bar at a time — operations are not interleaved.
 *
 * Honest progress: capped at 95% during streaming, 98% during finalizing,
 * 100% only on actual completion. Indeterminate operations animate without
 * claiming a percentage.
 */
export function GenerationProgressBar() {
  const { kind, label, subtitle, progressPct, indeterminate, phase, end } = useGenerationStore();
  const [hideAfterDone, setHideAfterDone] = useState(false);

  // Auto-dismiss 1.5s after the done phase so the user gets a beat to see "Complete"
  useEffect(() => {
    if (phase === 'done') {
      setHideAfterDone(false);
      const t = setTimeout(() => {
        setHideAfterDone(true);
        end();
      }, 1500);
      return () => clearTimeout(t);
    }
    setHideAfterDone(false);
    return;
  }, [phase, end]);

  if (!kind || hideAfterDone) return null;

  // Honest progress cap
  const displayPct =
    phase === 'done'
      ? 100
      : phase === 'finalizing'
      ? Math.min(98, Math.max(progressPct, 95))
      : Math.min(95, progressPct);

  const verbForKind: Record<GenerationKind, string> = {
    'generate-chapter': 'Generating',
    'extend-chapter': 'Extending',
    'generate-audio': 'Generating audio for',
    'create-project': 'Creating',
    'inline-edit': 'Editing',
  };
  const verb = verbForKind[kind];

  // The "Complete" subtitle override only fires when truly done, since most
  // call sites stop updating their own subtitle once they call setPhase('done').
  const displaySubtitle =
    phase === 'done'
      ? 'Complete'
      : phase === 'finalizing' && !subtitle
      ? 'Finalizing…'
      : phase === 'starting' && !subtitle
      ? 'Starting…'
      : subtitle;

  return (
    <div className="fixed top-12 inset-x-0 z-[60] pointer-events-none flex justify-center px-3 animate-fade-in">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#181818]/95 text-white shadow-2xl backdrop-blur-md border border-white/10 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5">
          {phase === 'done' ? (
            <Check size={14} className="text-emerald-400 flex-shrink-0" />
          ) : (
            <Loader2 size={14} className="animate-spin flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate">
              {verb} {label}
            </div>
            {displaySubtitle && (
              <div className="text-[9px] text-white/50 truncate">{displaySubtitle}</div>
            )}
          </div>
        </div>
        <div className="h-1 bg-white/10 relative overflow-hidden">
          {indeterminate && phase !== 'done' ? (
            // Sliding gradient bar for tasks without a real percentage
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent w-1/3 animate-indeterminate-slide" />
          ) : (
            <div
              className={cn(
                'h-full bg-white rounded-r-full transition-all duration-300 ease-out',
                phase === 'streaming' && progressPct === 0 && 'animate-pulse'
              )}
              style={{ width: `${displayPct}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
