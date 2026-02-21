import { X, Check, Zap } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { PLAN_DETAILS, type PlanTier } from '../../types/credits';
import { cn } from '../../lib/utils';

export function UpgradeModal() {
  const { showUpgradeModal, setShowUpgradeModal, plan, setPlan } = useCreditsStore();

  if (!showUpgradeModal) return null;

  const handleUpgrade = (tier: PlanTier) => {
    // In production: create Stripe Checkout Session and redirect
    // For now: simulate upgrade
    const details = PLAN_DETAILS[tier];
    setPlan(tier, details.credits);
    setShowUpgradeModal(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-white/70 backdrop-blur-2xl" onClick={() => setShowUpgradeModal(false)} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-3xl mx-4 animate-scale-in overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-2">
          <div>
            <h2 className="text-xl font-serif font-semibold">Upgrade Your Plan</h2>
            <p className="text-sm text-text-tertiary mt-1">More credits, more stories, more power.</p>
          </div>
          <button onClick={() => setShowUpgradeModal(false)} className="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-4 gap-3">
          {(Object.entries(PLAN_DETAILS) as [PlanTier, typeof PLAN_DETAILS[PlanTier]][]).map(([tier, details]) => {
            const isCurrent = plan.tier === tier;
            const isPopular = tier === 'writer';
            
            return (
              <div
                key={tier}
                className={cn(
                  'rounded-2xl p-5 flex flex-col transition-all duration-200 relative',
                  isCurrent
                    ? 'bg-text-primary text-text-inverse'
                    : 'glass hover:bg-white/70'
                )}
              >
                {isPopular && !isCurrent && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="text-[10px] font-semibold bg-text-primary text-text-inverse px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Zap size={10} /> Popular
                    </span>
                  </div>
                )}

                <div className="text-sm font-semibold mb-1">{details.name}</div>
                <div className="text-2xl font-bold mb-1">{details.price}</div>
                <div className={cn('text-xs mb-4', isCurrent ? 'text-white/60' : 'text-text-tertiary')}>
                  {details.description}
                </div>

                <div className="space-y-2 flex-1 mb-4">
                  {details.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 text-xs">
                      <Check size={12} className={cn('mt-0.5 flex-shrink-0', isCurrent ? 'text-white/70' : 'text-success')} />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div className="text-xs text-center py-2 rounded-xl bg-white/10">Current Plan</div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier)}
                    className={cn(
                      'w-full py-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.98]',
                      'bg-text-primary text-text-inverse shadow-md hover:shadow-lg'
                    )}
                  >
                    {tier === 'free' ? 'Downgrade' : 'Upgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Stripe notice */}
        <div className="px-6 pb-5">
          <div className="text-center text-xs text-text-tertiary glass-pill py-2 px-4 rounded-xl">
            🔒 Payments powered by Stripe · Cancel anytime · Credits reset monthly
          </div>
        </div>
      </div>
    </div>
  );
}
