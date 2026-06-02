import { useEffect, useRef } from 'react';
import { Coins, Sparkles } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useAuthStore } from '../../store/auth';
import { useSettingsStore } from '../../store/settings';
import { track as jTrack } from '../../lib/journey';
import { cn } from '../../lib/utils';

// Scarcity-priming experiment (2026-06-02). Theory: constantly displaying
// "X credits remaining" makes free users ration even when they have surplus,
// which suppresses engagement and ultimately conversion. Test: hide the
// numeric counter for free users until they're below this threshold; show a
// generic "Free" pill (tappable, same destination) instead. The numbers
// reveal once the user is actually approaching the cap. See
// docs/credit-pill-reveal-test.md for the hypothesis, baseline cohort
// metrics, and the success criteria.
const PILL_REVEAL_THRESHOLD_PCT = 30;

export function CreditsBadge() {
  const { plan } = useCreditsStore();
  const user = useAuthStore((s) => s.user);
  const isGuest = !user;

  const percentage = plan.creditsTotal > 0 ? (plan.creditsRemaining / plan.creditsTotal) * 100 : 100;
  const isLow = percentage < 20;

  const isFreeAuthed = !isGuest && plan.tier === 'free';
  const shouldHideNumbers = isFreeAuthed && percentage > PILL_REVEAL_THRESHOLD_PCT;

  // Fire `credit_pill_revealed` once per session when a free user crosses
  // the threshold going down. Lets us measure engagement before vs after
  // the numbers come back into view.
  const revealedRef = useRef(false);
  useEffect(() => {
    if (!isFreeAuthed) { revealedRef.current = false; return; }
    if (!shouldHideNumbers && !revealedRef.current) {
      revealedRef.current = true;
      jTrack('credit_pill_revealed', {
        credits_remaining: plan.creditsRemaining,
        credits_total: plan.creditsTotal,
        threshold_pct: PILL_REVEAL_THRESHOLD_PCT,
      });
    }
  }, [shouldHideNumbers, isFreeAuthed, plan.creditsRemaining, plan.creditsTotal]);

  const openUsage = () => {
    const settingsStore = useSettingsStore.getState();
    settingsStore.setSettingsViewSection('usage');
    settingsStore.setShowSettingsView(true);
  };

  // Guests don't have a real credit balance — show a "Free trial" badge
  // instead of the misleading "100 credits" placeholder.
  if (isGuest) {
    return (
      <button
        onClick={openUsage}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium glass-pill hover:bg-white/60 transition-all"
      >
        <Sparkles size={12} />
        <span>Free trial</span>
      </button>
    );
  }

  // Pill-reveal experiment: free user well above the threshold — show a
  // generic Free pill, no rationing trigger. Same destination on tap.
  if (shouldHideNumbers) {
    return (
      <button
        onClick={openUsage}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium glass-pill hover:bg-white/60 transition-all"
      >
        <Sparkles size={12} />
        <span>Free</span>
      </button>
    );
  }

  return (
    <button
      onClick={openUsage}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
        'glass-pill hover:bg-white/60',
        isLow && 'text-error'
      )}
    >
      <Coins size={14} />
      <>
        <span>{plan.creditsRemaining.toLocaleString()}</span>
        <div className="w-12 h-1.5 bg-black/5 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isLow ? 'bg-error' : percentage < 50 ? 'bg-warning' : 'bg-success'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </>
    </button>
  );
}
