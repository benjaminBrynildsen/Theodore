import { Coins } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useSettingsStore } from '../../store/settings';
import { cn } from '../../lib/utils';

export function CreditsBadge() {
  const { plan } = useCreditsStore();
  
  const percentage = plan.creditsTotal > 0 ? (plan.creditsRemaining / plan.creditsTotal) * 100 : 100;
  const isLow = percentage < 20;
  const isByok = plan.tier === 'byok';

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
        isLow && !isByok && 'text-error'
      )}
    >
      <Coins size={14} />
      {isByok ? (
        <span>BYOK</span>
      ) : (
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
      )}
    </button>
  );
}
