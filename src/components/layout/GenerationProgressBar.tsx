import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useGenerationStore } from '../../store/generation';
import { cn } from '../../lib/utils';

/**
 * Persistent generation progress indicator. Sits at the top of the viewport
 * (below TopBar) so it's visible regardless of which view the user is on.
 *
 * Honest progress: capped at 95% during streaming because the model can keep
 * generating well past the visible word count, and capped at 98% during the
 * post-stream finalizing phase. Only hits 100% on actual completion.
 */
export function GenerationProgressBar() {
  const { chapterId, label, kind, wordsGenerated, wordTarget, phase, end } = useGenerationStore();
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

  if (!chapterId || hideAfterDone) return null;

  const rawPct = wordTarget > 0 ? (wordsGenerated / wordTarget) * 100 : 0;
  const displayPct =
    phase === 'done' ? 100 : phase === 'finalizing' ? Math.min(98, Math.max(rawPct, 95)) : Math.min(95, rawPct);

  const verb = kind === 'extend' ? 'Extending' : 'Generating';
  const subtitle =
    phase === 'done'
      ? 'Complete'
      : phase === 'finalizing'
      ? 'Finalizing…'
      : wordsGenerated > 0
      ? `${wordsGenerated.toLocaleString()} words${wordTarget > 0 ? ` · target ~${wordTarget.toLocaleString()}` : ''}`
      : 'Starting…';

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
            <div className="text-[9px] text-white/50 truncate">{subtitle}</div>
          </div>
        </div>
        <div className="h-1 bg-white/10">
          <div
            className={cn(
              'h-full bg-white rounded-r-full transition-all duration-300 ease-out',
              phase === 'streaming' && rawPct === 0 && 'animate-pulse'
            )}
            style={{ width: `${displayPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
