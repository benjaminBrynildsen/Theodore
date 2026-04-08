import { Coins, Sparkles } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useAuthStore } from '../../store/auth';
import { useSettingsStore } from '../../store/settings';
import { cn } from '../../lib/utils';

export function CreditsBadge() {
  const { plan } = useCreditsStore();
  const user = useAuthStore((s) => s.user);
  const isGuest = !user;

  const percentage = plan.creditsTotal > 0 ? (plan.creditsRemaining / plan.creditsTotal) * 100 : 100;
  const isLow = percentage < 20;

  // Guests don't have a real credit balance — show a "Free trial" badge
  // instead of the misleading "100 credits" placeholder.
  if (isGuest) {
    return (
      <button
        onClick={() => {
          const settingsStore = useSettingsStore.getState();
          settingsStore.setSettingsViewSection('usage');
          settingsStore.setShowSettingsView(true);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium glass-pill hover:bg-white/60 transition-all"
      >
        <Sparkles size={12} />
        <span>Free trial</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => {
        const settingsStore = useSettingsStore.getState();
        settingsStore.setSettingsViewSection('usage');
        settingsStore.setShowSettingsView(true);
      }}
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
