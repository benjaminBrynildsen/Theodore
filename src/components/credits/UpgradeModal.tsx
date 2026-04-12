import { useMemo, useState } from 'react';
import { X, Check, Zap, Sparkles, BookOpen, Headphones } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { PLAN_DETAILS, TIER_PRICES_USD, type PlanTier } from '../../types/credits';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import {
  detectDisplayCurrency,
  formatDisplayPrice,
  isNonUsdDisplay,
} from '../../lib/currency';

export function UpgradeModal() {
  const { showUpgradeModal, setShowUpgradeModal, plan } = useCreditsStore();
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [error, setError] = useState('');
  const displayCurrency = useMemo(() => detectDisplayCurrency(), []);
  const showUsdDisclaimer = isNonUsdDisplay(displayCurrency);
  const priceFor = (tier: PlanTier): string => {
    if (tier === 'free') return PLAN_DETAILS.free.price;
    const usd = TIER_PRICES_USD[tier as 'writer' | 'author' | 'studio' | 'publisher'];
    return `${formatDisplayPrice(usd, displayCurrency)}`;
  };

  if (!showUpgradeModal) return null;

  const handleUpgrade = async (tier: PlanTier) => {
    if (tier !== 'writer' && tier !== 'author' && tier !== 'studio' && tier !== 'publisher') return;
    setBusyTier(tier);
    setError('');
    try {
      const checkout = await api.billingCheckout({ tier });
      if (!checkout?.url) throw new Error('Stripe checkout URL was not returned.');
      window.location.href = checkout.url;
    } catch (e: any) {
      setError(e?.message || 'Unable to start checkout.');
      setBusyTier(null);
    }
  };

  const tiers: { tier: PlanTier; icon: typeof Sparkles; highlight?: boolean }[] = [
    { tier: 'writer', icon: Sparkles, highlight: true },
    { tier: 'author', icon: BookOpen },
    { tier: 'studio', icon: Headphones },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative bg-white rounded-3xl shadow-2xl border border-black/5 w-full max-w-lg mx-4 animate-scale-in overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={() => setShowUpgradeModal(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-all z-10"
        >
          <X size={18} />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
              <Zap size={20} className="text-violet-700" />
            </div>
            <h2 className="text-xl font-serif font-semibold">Unlock more of Theodore</h2>
            <p className="text-sm text-text-tertiary mt-1">
              {plan.creditsRemaining <= 0
                ? "You've used all your free credits. Upgrade to keep creating."
                : 'More credits, more chapters, more audiobooks.'}
            </p>
            {plan.tier === 'free' && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-xs text-amber-800">
                <span className="font-semibold">{plan.creditsRemaining}</span> of {plan.creditsTotal} free credits remaining
              </div>
            )}
          </div>

          {/* Tier cards */}
          <div className="space-y-3">
            {tiers.map(({ tier, icon: Icon, highlight }) => {
              const details = PLAN_DETAILS[tier];
              const isCurrent = plan.tier === tier;

              return (
                <div
                  key={tier}
                  className={cn(
                    'rounded-2xl p-5 transition-all duration-200 relative',
                    isCurrent
                      ? 'bg-text-primary text-text-inverse'
                      : highlight
                      ? 'bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-200/60'
                      : 'glass border border-black/5 hover:bg-white/70'
                  )}
                >
                  {highlight && !isCurrent && (
                    <div className="absolute -top-2.5 left-4">
                      <span className="text-[10px] font-semibold bg-violet-600 text-white px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Zap size={10} /> Most Popular
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-10 h-10 rounded-xl flex items-center justify-center',
                        isCurrent ? 'bg-white/20' : highlight ? 'bg-violet-100' : 'bg-black/[0.04]'
                      )}>
                        <Icon size={18} className={isCurrent ? 'text-white' : highlight ? 'text-violet-700' : ''} />
                      </div>
                      <div>
                        <div className="font-semibold">{details.name}</div>
                        <div className={cn('text-xs', isCurrent ? 'text-white/60' : 'text-text-tertiary')}>
                          {details.description}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold">{priceFor(tier)}</div>
                      <div className={cn('text-[10px]', isCurrent ? 'text-white/50' : 'text-text-tertiary')}>/month</div>
                    </div>
                  </div>

                  {/* Features */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    {details.features.slice(0, 4).map((feature) => (
                      <div key={feature} className="flex items-center gap-1.5 text-xs">
                        <Check size={11} className={cn('flex-shrink-0', isCurrent ? 'text-white/70' : highlight ? 'text-violet-600' : 'text-green-600')} />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  {isCurrent ? (
                    <div className="mt-3 text-xs text-center py-2 rounded-xl bg-white/10">Current Plan</div>
                  ) : (
                    <button
                      onClick={() => handleUpgrade(tier)}
                      disabled={busyTier !== null}
                      className={cn(
                        'mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
                        busyTier !== null
                          ? 'bg-black/10 text-text-tertiary cursor-not-allowed'
                          : highlight
                          ? 'bg-violet-600 text-white shadow-md hover:shadow-lg hover:bg-violet-700'
                          : 'bg-text-primary text-text-inverse shadow-md hover:shadow-lg'
                      )}
                    >
                      {busyTier === tier ? 'Redirecting to checkout...' : `Choose ${details.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Publisher tier — small link */}
          <button
            onClick={() => handleUpgrade('publisher')}
            className="mt-3 w-full text-center text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            Need more? See Publisher plan ({priceFor('publisher')}/mo) →
          </button>

          {error && (
            <div className="mt-3 text-xs rounded-xl border border-red-200 bg-red-50 text-red-700 px-3 py-2">
              {error}
            </div>
          )}

          {/* Stripe notice */}
          <div className="mt-4 text-center text-[10px] text-text-tertiary">
            Payments by Stripe · Cancel anytime · Credits reset monthly
            {showUsdDisclaimer && (
              <span className="block mt-0.5">
                Prices in {displayCurrency} for reference · billed in USD
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
