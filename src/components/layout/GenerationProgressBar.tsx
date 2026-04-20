import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useGenerationStore, type GenerationKind } from '../../store/generation';
import { cn } from '../../lib/utils';

/**
 * Apple Glass progress bar — frosted glass with liquid blobs + rotating
 * glow border. Sits at the top of the viewport below TopBar.
 */
export function GenerationProgressBar() {
  const { kind, label, subtitle, progressPct, indeterminate, phase, end } = useGenerationStore();
  const [hideAfterDone, setHideAfterDone] = useState(false);

  useEffect(() => {
    if (phase === 'done') {
      setHideAfterDone(false);
      // Linger the "Complete" state for a beat so users actually see it —
      // 1.5s was short enough that people thought the bar had just vanished
      // mid-generation and assumed work was still happening.
      const t = setTimeout(() => {
        setHideAfterDone(true);
        end();
      }, 3500);
      return () => clearTimeout(t);
    }
    setHideAfterDone(false);
    return;
  }, [phase, end]);

  if (!kind || hideAfterDone) return null;

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
    'generate-image': 'Generating cover for',
    'create-project': 'Creating',
    'inline-edit': 'Editing',
  };
  const verb = verbForKind[kind];

  const displaySubtitle =
    phase === 'done'
      ? 'Complete'
      : phase === 'finalizing' && !subtitle
      ? 'Finalizing…'
      : phase === 'starting' && !subtitle
      ? 'Starting…'
      : subtitle;

  const isDone = phase === 'done';

  return (
    <div className="fixed top-12 sm:top-16 inset-x-0 z-[60] pointer-events-none flex justify-center px-3 animate-fade-in">
      {/* Rotating glow border wrapper */}
      <div className="pointer-events-auto relative p-[1px] rounded-2xl w-full max-w-md sm:max-w-xl">
        {/* Conic gradient border — orbiting glow */}
        {!isDone && (
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'conic-gradient(from var(--angle, 0deg), transparent 30%, rgba(120,119,198,0.5) 45%, rgba(255,255,255,0.25) 50%, rgba(120,119,198,0.5) 55%, transparent 70%)',
              animation: 'rotateBorder 4s linear infinite',
            }}
          />
        )}
        {isDone && (
          <div className="absolute inset-0 rounded-2xl" style={{ background: 'rgba(52,211,153,0.15)' }} />
        )}

        {/* Main glass card */}
        <div
          className="relative rounded-[15px] overflow-hidden"
          style={{
            background: 'rgba(20, 20, 28, 0.8)',
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          }}
        >
          {/* Liquid blobs */}
          {!isDone && (
            <div className="absolute inset-0 overflow-hidden rounded-[15px]">
              <div
                className="absolute w-24 h-24 rounded-full opacity-30"
                style={{
                  background: 'radial-gradient(circle, #6366f1, transparent 70%)',
                  top: '-40%', left: '10%',
                  animation: 'blobFloat1 5s ease-in-out infinite',
                  filter: 'blur(20px)',
                }}
              />
              <div
                className="absolute w-20 h-20 rounded-full opacity-25"
                style={{
                  background: 'radial-gradient(circle, #a855f7, transparent 70%)',
                  bottom: '-30%', right: '20%',
                  animation: 'blobFloat2 6s ease-in-out infinite',
                  filter: 'blur(18px)',
                }}
              />
              <div
                className="absolute w-16 h-16 rounded-full opacity-20"
                style={{
                  background: 'radial-gradient(circle, #ec4899, transparent 70%)',
                  top: '10%', right: '35%',
                  animation: 'blobFloat3 4s ease-in-out infinite',
                  filter: 'blur(15px)',
                }}
              />
            </div>
          )}

          {/* Glass sheen */}
          <div
            className="absolute inset-0 rounded-[15px]"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)' }}
          />

          {/* Content */}
          <div className="relative z-10 flex items-center gap-3 sm:gap-4 px-4 py-2.5 sm:px-6 sm:py-3.5">
            {isDone ? (
              <Check size={18} className="text-emerald-400 flex-shrink-0" />
            ) : (
              <Loader2 size={18} className="animate-spin text-white/80 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[11px] sm:text-sm font-semibold text-white truncate">
                {verb} {label}
              </div>
              {displaySubtitle && (
                <div className="text-[9px] sm:text-xs text-white/50 truncate mt-0.5">{displaySubtitle}</div>
              )}
            </div>
          </div>

          {/* Progress track */}
          <div className="relative h-1 sm:h-1.5 bg-white/[0.06] overflow-hidden">
            {indeterminate && !isDone ? (
              <div
                className="absolute top-0 h-full w-[30%] rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5) 30%, rgba(168,85,247,0.6) 50%, rgba(99,102,241,0.5) 70%, transparent)',
                  animation: 'appleSlide 2s cubic-bezier(0.45,0,0.55,1) infinite',
                }}
              />
            ) : (
              <div
                className={cn(
                  'h-full rounded-r-full transition-all duration-500 ease-out relative',
                  isDone ? 'bg-emerald-400/60' : '',
                )}
                style={{
                  width: `${displayPct}%`,
                  ...(!isDone ? {
                    background: 'linear-gradient(90deg, rgba(99,102,241,0.5), rgba(168,85,247,0.6), rgba(236,72,153,0.5))',
                    backgroundSize: '200% 100%',
                    animation: 'glassShimmer 3s ease-in-out infinite',
                  } : {}),
                }}
              >
                {!isDone && (
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                      animation: 'glassStreak 2.5s ease-in-out infinite',
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
