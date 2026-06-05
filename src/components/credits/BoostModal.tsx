import { useEffect, useState } from 'react';
import { Zap, Check, Loader2, CreditCard } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { api } from '../../lib/api';
import * as pixel from '../../lib/pixel';
import { track as jTrack } from '../../lib/journey';

interface Pack { id: string; priceUsd: number; priceCents: number; credits: number }

// Fallback packs if /billing/boosts is slow — kept in sync with server BOOST_PACKS.
const DEFAULT_PACKS: Pack[] = [
  { id: 'boost_5', priceUsd: 5, priceCents: 500, credits: 800 },
  { id: 'boost_10', priceUsd: 10, priceCents: 1000, credits: 1800 },
  { id: 'boost_20', priceUsd: 20, priceCents: 2000, credits: 4000 },
];

export function BoostModal() {
  const show = useCreditsStore((s) => s.showBoostModal);
  const setShow = useCreditsStore((s) => s.setShowBoostModal);
  const applyBoost = useCreditsStore((s) => s.applyBoost);

  const [packs, setPacks] = useState<Pack[]>(DEFAULT_PACKS);
  const [savedCard, setSavedCard] = useState<{ hasCard: boolean; brand?: string | null; last4?: string | null } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [granted, setGranted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!show) return;
    setGranted(null);
    setError(null);
    api.billingBoosts().then((r) => { if (r?.packs?.length) setPacks(r.packs); }).catch(() => {});
    api.billingSavedCard().then(setSavedCard).catch(() => setSavedCard({ hasCard: false }));
    jTrack('boost_modal_shown');
    pixel.trackCustom('BoostModalShown');
  }, [show]);

  if (!show) return null;

  const buy = async (pack: Pack) => {
    setPending(pack.id);
    setError(null);
    jTrack('boost_clicked', { packId: pack.id, amount: pack.priceUsd });
    try {
      const r = await api.billingBoost({ packId: pack.id });
      if (r.mode === 'checkout' && r.url) {
        pixel.trackInitiateCheckout(pack.priceUsd);
        window.location.href = r.url;
        return;
      }
      if (r.mode === 'instant' && typeof r.creditsRemaining === 'number') {
        applyBoost(r.creditsRemaining);
        setGranted(pack.credits);
        pixel.trackSubscribe(pack.priceUsd); // Meta Purchase + X (subscribe slot) on success
        pixel.trackCustom('BoostPurchased', { packId: pack.id, amount: pack.priceUsd });
        jTrack('boost_purchased', { packId: pack.id, amount: pack.priceUsd, mode: 'instant' });
      }
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShow(false)} />
      <div className="relative w-full max-w-md rounded-2xl bg-[#f6f6f4] shadow-2xl border border-black/[0.06] overflow-hidden">
        {granted != null ? (
          <div className="p-8 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
              <Check className="text-emerald-500" size={28} />
            </div>
            <h2 className="text-xl font-serif font-semibold text-text-primary">+{granted.toLocaleString()} credits added</h2>
            <p className="text-sm text-text-tertiary mt-1.5">Charged to your card on file. You're topped up and ready to keep going.</p>
            <button onClick={() => setShow(false)} className="mt-6 w-full py-3 rounded-xl bg-black text-white font-semibold text-sm hover:opacity-90">
              Back to writing
            </button>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={18} className="text-amber-500" />
              <h2 className="text-lg font-serif font-semibold text-text-primary">Add credits</h2>
            </div>
            <p className="text-sm text-text-tertiary mb-5">
              A one-time top-up — no subscription. Credits never expire and stack on top of your monthly balance.
            </p>

            <div className="space-y-2.5">
              {packs.map((p) => {
                const isPending = pending === p.id;
                return (
                  <button
                    key={p.id}
                    disabled={!!pending}
                    onClick={() => buy(p)}
                    className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border border-black/[0.08] bg-white hover:border-black/20 hover:shadow-sm transition-all disabled:opacity-50 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-text-primary">{p.credits.toLocaleString()} credits</div>
                      <div className="text-xs text-text-tertiary">one-time</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-serif font-semibold text-text-primary">${p.priceUsd}</span>
                      {isPending && <Loader2 size={16} className="animate-spin text-text-tertiary" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {error && <div className="mt-3 text-xs rounded-lg border border-red-400/30 bg-red-500/10 text-red-600 px-3 py-2">{error}</div>}

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-tertiary">
              <CreditCard size={12} />
              {savedCard?.hasCard
                ? <span>Instant — charged to your {savedCard.brand ? `${savedCard.brand} ` : ''}card ending {savedCard.last4 || '••••'}</span>
                : <span>Secure checkout · card saved for one-click top-ups next time</span>}
            </div>

            <button onClick={() => setShow(false)} className="mt-4 w-full text-center text-sm text-text-tertiary hover:text-text-secondary">
              Maybe later
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
