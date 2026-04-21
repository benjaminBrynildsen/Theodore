import { useMemo, useState } from 'react';
import { X, Check, Sparkles, BookOpen, Headphones } from 'lucide-react';
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
  const { showUpgradeModal, setShowUpgradeModal, plan, upgradeReason } = useCreditsStore();
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [error, setError] = useState('');
  const displayCurrency = useMemo(() => detectDisplayCurrency(), []);
  const showUsdDisclaimer = isNonUsdDisplay(displayCurrency);
  const isAudioCap = upgradeReason === 'audio_cap';
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
      const checkout = await api.billingCheckout({ tier, reason: isAudioCap ? 'audio_cap' : undefined });
      if (!checkout?.url) throw new Error('Stripe checkout URL was not returned.');
      window.location.href = checkout.url;
    } catch (e: any) {
      setError(e?.message || 'Unable to start checkout.');
      setBusyTier(null);
    }
  };

  const tiers: { tier: PlanTier; icon: typeof Sparkles; recommended?: boolean }[] = [
    { tier: 'writer', icon: Sparkles, recommended: true },
    { tier: 'author', icon: BookOpen },
    { tier: 'studio', icon: Headphones },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUpgradeModal(false)} />

      <div className="relative w-full max-w-lg mx-4 animate-scale-in max-h-[90vh] overflow-y-auto rounded-3xl">
        {/* Outer glass card */}
        <div
          className="relative overflow-hidden rounded-3xl border border-white/10"
          style={{
            background: 'rgba(20, 20, 28, 0.85)',
            backdropFilter: 'blur(40px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
          }}
        >
          {/* Background blobs */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <div className="absolute w-40 h-40 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #6366f1, transparent 70%)', top: '-10%', left: '10%', animation: 'blobFloat1 6s ease-in-out infinite', filter: 'blur(30px)' }} />
            <div className="absolute w-32 h-32 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #a855f7, transparent 70%)', bottom: '5%', right: '10%', animation: 'blobFloat2 7s ease-in-out infinite', filter: 'blur(25px)' }} />
            <div className="absolute w-28 h-28 rounded-full opacity-12" style={{ background: 'radial-gradient(circle, #ec4899, transparent 70%)', top: '40%', right: '30%', animation: 'blobFloat3 5s ease-in-out infinite', filter: 'blur(22px)' }} />
          </div>

          {/* Glass sheen */}
          <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)' }} />

          {/* Close button */}
          <button
            onClick={() => setShowUpgradeModal(false)}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/10 transition-all z-10"
          >
            <X size={18} />
          </button>

          <div className="relative z-10 p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              {isAudioCap ? (
                <>
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.08] mb-3">
                    <Headphones size={22} className="text-white/80" />
                  </div>
                  <h2 className="text-xl font-serif font-semibold text-white">That's your preview</h2>
                  <p className="text-sm text-white/60 mt-1.5 max-w-sm mx-auto">
                    Keep listening — unlock unlimited audio with any paid plan.
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-300">
                    <Sparkles size={11} /> 7 days free · cancel anytime
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-serif font-semibold text-white">Unlock more of Theodore</h2>
                  <p className="text-sm text-white/50 mt-1">
                    {plan.creditsRemaining <= 0
                      ? "You've used all your free credits. Upgrade to keep creating."
                      : 'More credits, more chapters, more audiobooks.'}
                  </p>
                  {plan.tier === 'free' && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs text-white/60">
                      <span className="font-semibold text-white/80">{plan.creditsRemaining}</span> of {plan.creditsTotal} free credits remaining
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Tier cards */}
            <div className="space-y-3">
              {tiers.map(({ tier, icon: Icon, recommended }) => {
                const details = PLAN_DETAILS[tier];
                const isCurrent = plan.tier === tier;

                return (
                  <div
                    key={tier}
                    className="relative rounded-2xl overflow-hidden"
                  >
                    {/* Card border glow for recommended */}
                    {recommended && !isCurrent && (
                      <div className="absolute inset-0 rounded-2xl" style={{
                        background: 'conic-gradient(from var(--angle, 0deg), transparent 30%, rgba(99,102,241,0.4) 45%, rgba(255,255,255,0.15) 50%, rgba(99,102,241,0.4) 55%, transparent 70%)',
                        animation: 'rotateBorder 4s linear infinite',
                        padding: '1px',
                      }} />
                    )}

                    <div
                      className={cn(
                        'relative rounded-2xl p-5 transition-all',
                        isCurrent ? 'bg-white/[0.12]' : 'bg-white/[0.06] hover:bg-white/[0.08]',
                        recommended && !isCurrent ? 'm-[1px]' : '',
                      )}
                    >
                      {recommended && !isCurrent && (
                        <div className="absolute -top-0 left-4 -translate-y-1/2">
                          <span className="text-[10px] font-semibold text-white px-2.5 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'linear-gradient(90deg, #6366f1, #a855f7)' }}>
                            <Sparkles size={9} /> Recommended
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.08]">
                            <Icon size={18} className="text-white/70" />
                          </div>
                          <div>
                            <div className="font-semibold text-white">{details.name}</div>
                            <div className="text-xs text-white/40">{details.description}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-white">{priceFor(tier)}</div>
                          <div className="text-[10px] text-white/30">/month</div>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                        {details.features.slice(0, 4).map((feature) => (
                          <div key={feature} className="flex items-center gap-1.5 text-xs text-white/60">
                            <Check size={11} className="flex-shrink-0 text-emerald-400/80" />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* CTA */}
                      {isCurrent ? (
                        <div className="mt-3 text-xs text-center py-2 rounded-xl bg-white/[0.06] text-white/40">Current Plan</div>
                      ) : (
                        <div className="mt-3 relative p-[1px] rounded-xl overflow-hidden">
                          {recommended && (
                            <div className="absolute inset-0 rounded-xl" style={{
                              background: 'linear-gradient(90deg, #6366f1, #a855f7, #6366f1)',
                              backgroundSize: '200% 100%',
                              animation: 'stripeFlow 3s linear infinite',
                            }} />
                          )}
                          <button
                            onClick={() => handleUpgrade(tier)}
                            disabled={busyTier !== null}
                            className={cn(
                              'relative w-full py-2.5 rounded-[11px] text-sm font-semibold transition-all active:scale-[0.98]',
                              busyTier !== null
                                ? 'bg-white/10 text-white/30 cursor-not-allowed'
                                : recommended
                                ? 'bg-[#16162a] text-white hover:bg-[#1a1a35]'
                                : 'bg-white/[0.08] text-white hover:bg-white/[0.12]'
                            )}
                          >
                            {busyTier === tier
                              ? 'Redirecting...'
                              : isAudioCap && recommended
                              ? `Start 7-day trial · ${details.name}`
                              : `Choose ${details.name}`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Publisher tier */}
            <button
              onClick={() => handleUpgrade('publisher')}
              className="mt-3 w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Need more? See Publisher plan ({priceFor('publisher')}/mo) →
            </button>

            {error && (
              <div className="mt-3 text-xs rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 px-3 py-2">
                {error}
              </div>
            )}

            {/* Stripe notice */}
            <div className="mt-4 text-center text-[10px] text-white/25">
              {isAudioCap
                ? 'Card required · no charge for 7 days · cancel anytime'
                : 'Payments by Stripe · Cancel anytime · Credits reset monthly'}
              {showUsdDisclaimer && (
                <span className="block mt-0.5">
                  Prices in {displayCurrency} for reference · billed in USD
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
