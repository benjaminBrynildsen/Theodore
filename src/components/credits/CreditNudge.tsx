import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useAuthStore } from '../../store/auth';
import { track as jTrack } from '../../lib/journey';
import * as pixel from '../../lib/pixel';

const THRESHOLDS = [80, 50, 20] as const;
type Threshold = typeof THRESHOLDS[number];

const COPY: Record<Threshold, { title: string; body: string }> = {
  80: {
    title: "You're cooking",
    body: "20% of your free credits used. Heads up — when you run out, paid plans pick up where you left off.",
  },
  50: {
    title: "Halfway through",
    body: "Half your monthly credits used. Want unlimited chapters? Writer plan is $10/mo.",
  },
  20: {
    title: "Running low — 20% left",
    body: "Don't lose momentum. Upgrade to keep generating chapters and audio.",
  },
};

function storageKey(periodEnd: string | null | undefined) {
  return `theodore_nudge_shown_${periodEnd || 'no-period'}`;
}

function readShown(periodEnd: string | null | undefined): Threshold[] {
  try {
    const raw = localStorage.getItem(storageKey(periodEnd));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => THRESHOLDS.includes(n)) : [];
  } catch {
    return [];
  }
}

function writeShown(periodEnd: string | null | undefined, shown: Threshold[]) {
  try {
    localStorage.setItem(storageKey(periodEnd), JSON.stringify(shown));
  } catch {}
}

export function CreditNudge() {
  const { plan, setShowUpgradeModal } = useCreditsStore();
  const user = useAuthStore((s) => s.user);
  const [active, setActive] = useState<Threshold | null>(null);
  const prevPctRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isFreeAuthed = !!user && plan.tier === 'free' && plan.creditsTotal > 0;
  const pct = plan.creditsTotal > 0 ? (plan.creditsRemaining / plan.creditsTotal) * 100 : 100;
  const used = 100 - pct;
  const periodEnd = plan.stripeCurrentPeriodEnd;

  useEffect(() => {
    if (!isFreeAuthed) {
      prevPctRef.current = null;
      return;
    }
    const prev = prevPctRef.current;
    prevPctRef.current = used;

    if (prev === null) return;
    if (used <= prev) return;

    const shown = readShown(periodEnd);
    const crossed = THRESHOLDS.find(
      (t) => prev < t && used >= t && !shown.includes(t)
    );
    if (!crossed) return;

    writeShown(periodEnd, [...shown, crossed]);
    setActive(crossed);
    jTrack('credit_nudge_shown', { threshold: crossed });
    pixel.trackCustom('CreditNudgeShown', { threshold: crossed });

    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setActive(null), 12000);
  }, [used, isFreeAuthed, periodEnd]);

  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  if (!active) return null;
  const copy = COPY[active];

  return (
    <div className="fixed bottom-6 right-6 z-[55] max-w-sm animate-fade-in pointer-events-none sm:block hidden">
      <div
        className="pointer-events-auto relative overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
        style={{
          background: 'rgba(20, 20, 28, 0.92)',
          backdropFilter: 'blur(28px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.6)',
        }}
      >
        <button
          onClick={() => {
            setActive(null);
            jTrack('credit_nudge_dismissed', { threshold: active });
          }}
          className="absolute top-2 right-2 p-1 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
        <div className="p-4 pr-9">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-indigo-300" />
            <div className="text-sm font-semibold text-white">{copy.title}</div>
          </div>
          <p className="text-xs text-white/60 leading-relaxed">{copy.body}</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => {
                setActive(null);
                jTrack('credit_nudge_clicked', { threshold: active });
                pixel.trackCustom('CreditNudgeClicked', { threshold: active });
                setShowUpgradeModal(true, 'generic');
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-[#16162a] hover:bg-white/90 transition-all active:scale-[0.98]"
            >
              See plans
            </button>
            <button
              onClick={() => {
                setActive(null);
                jTrack('credit_nudge_dismissed', { threshold: active });
              }}
              className="px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white/90 transition-all"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
