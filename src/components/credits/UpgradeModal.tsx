import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Sparkles, BookOpen, Headphones, Mail, Lock, Loader2, ChevronDown } from 'lucide-react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useCreditsStore } from '../../store/credits';
import { useAuthStore } from '../../store/auth';
import { useStore } from '../../store';
import { PLAN_DETAILS, TIER_PRICES_USD, type PlanTier } from '../../types/credits';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import * as pixel from '../../lib/pixel';
import { track as jTrack } from '../../lib/journey';
import {
  detectDisplayCurrency,
  formatDisplayPrice,
  isNonUsdDisplay,
} from '../../lib/currency';
import { CoffeeWalletButton, CoffeeCardFallbackButton } from './CoffeeWalletButton';

// Stripe.js is loaded lazily on first modal open with a publishable key.
// loadStripe() caches the promise internally so repeated calls are no-ops.
// The key comes from /api/billing/config so config + deploy stay decoupled
// — you can rotate the Render env var without rebuilding the bundle.
let stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise && publishableKey) {
    stripePromise = loadStripe(publishableKey);
  }
  return stripePromise || Promise.resolve(null);
}

const GOOGLE_CLIENT_ID = '296594825511-3m0g5t2l0ombm3j8cdc5ncqe673obg4d.apps.googleusercontent.com';

// Hormozi-style A/B for the generic upgrade modal anchor:
//   'stacked'  — three subscription benchmarks (ChatGPT/Audible/Spotify) vs $10
//   'audible'  — single consumer→creator flip (Audible $14.95 listen vs $10 write)
// Stable per-visitor via localStorage so the same user always sees the same
// variant. Tracked via data.anchor_variant on upgrade_inline_shown +
// upgrade_checkout_redirect, AND via dedicated event names so the Prompts
// dashboard shows the split without extra backend work.
// The three Author-tier differentiators shown side-by-side in the tier cards.
// Author shows these as ✓ (included); Writer shows them as ✗ (not included)
// to make the Author-vs-Writer trade-off obvious at a glance. Studio + Publisher
// use their default PLAN_DETAILS features list.
const DREAM_OFFER_DIFFERENTIATORS = [
  'Printed Paperback',
  'Studio Grade Audiobook',
  'Cover Design',
];

type AnchorVariant = 'stacked' | 'audible';
const ANCHOR_VARIANT_KEY = 'theodore_anchor_variant_v1';
function getAnchorVariant(): AnchorVariant {
  if (typeof window === 'undefined') return 'stacked';
  try {
    const cached = localStorage.getItem(ANCHOR_VARIANT_KEY);
    if (cached === 'stacked' || cached === 'audible') return cached;
    const assigned: AnchorVariant = Math.random() < 0.5 ? 'stacked' : 'audible';
    localStorage.setItem(ANCHOR_VARIANT_KEY, assigned);
    return assigned;
  } catch {
    return 'stacked';
  }
}

// Coffee-variant cover placement A/B (2026-06-09):
//   'small' — 64×64 rounded-square thumb in the top-right corner (decoration)
//   'hero'  — ~full-width rounded square between headline and pack selector
// Stable per-visitor via localStorage. Tagged on every upgrade_inline_shown
// + dream_offer events so we can compare conversion of the two placements.
// Flip the storage value in dev tools to preview either variant on demand.
type CoverVariant = 'small' | 'hero';
const COVER_VARIANT_KEY = 'theodore_cover_variant_v1';
function getCoverVariant(): CoverVariant {
  if (typeof window === 'undefined') return 'small';
  try {
    // URL override — `?cover=hero` or `?cover=small` forces that variant
    // for the current session AND persists it so subsequent opens stick.
    // Same pattern as `?devex=1`. Used to preview either variant on a phone
    // without dev-console access. Caught from query params on every modal
    // open (and on root page-loads via the existing URL-param sweep).
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('cover');
    if (fromUrl === 'small' || fromUrl === 'hero') {
      try { localStorage.setItem(COVER_VARIANT_KEY, fromUrl); } catch {}
      return fromUrl;
    }
    const cached = localStorage.getItem(COVER_VARIANT_KEY);
    if (cached === 'small' || cached === 'hero') return cached;
    const assigned: CoverVariant = Math.random() < 0.5 ? 'small' : 'hero';
    localStorage.setItem(COVER_VARIANT_KEY, assigned);
    return assigned;
  } catch {
    return 'small';
  }
}

// Boost packs — same shape + fallback as BoostModal.tsx. Kept in sync with
// server BOOST_PACKS. Surfaced inline at the top of the UpgradeModal so the
// "ran out of credits" user sees a one-tap fix before the subscription pitch.
interface BoostPack { id: string; priceUsd: number; priceCents: number; credits: number }
const DEFAULT_BOOST_PACKS: BoostPack[] = [
  { id: 'boost_5',  priceUsd: 5,  priceCents: 500,  credits: 400 },
  { id: 'boost_10', priceUsd: 10, priceCents: 1000, credits: 1200 },
  { id: 'boost_20', priceUsd: 20, priceCents: 2000, credits: 3000 },
];

export function UpgradeModal() {
  const { showUpgradeModal, setShowUpgradeModal, plan, upgradeReason, applyBoost } = useCreditsStore();
  const user = useAuthStore((s) => s.user);
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [error, setError] = useState('');
  const [showAllPlans, setShowAllPlans] = useState(false);
  // Inline top-up state — packs + active purchase + post-grant confirmation.
  const [boostPacks, setBoostPacks] = useState<BoostPack[]>(DEFAULT_BOOST_PACKS);
  const [busyBoostId, setBusyBoostId] = useState<string | null>(null);
  const [boostGranted, setBoostGranted] = useState<number | null>(null);
  // Coffee variant (generic case): which pack is the wallet button bound to.
  // Defaults to $10 / 1,200 credits per Ben's call on 2026-06-09.
  const [selectedPackId, setSelectedPackId] = useState<string>('boost_10');
  // Stripe.js bootstrap. Fetched from /api/billing/config on modal open so
  // STRIPE_PUBLISHABLE_KEY can live as a Render env var (no rebuild needed).
  const [stripeConfig, setStripeConfig] = useState<{ stripePublishableKey: string; walletEnabled: boolean } | null>(null);
  // canMakePayment() result from the wallet button — null = checking, true =
  // Apple/Google Pay available, false = neither (render card fallback).
  const [walletAvailable, setWalletAvailable] = useState<boolean | null>(null);
  const displayCurrency = useMemo(() => detectDisplayCurrency(), []);
  const showUsdDisclaimer = isNonUsdDisplay(displayCurrency);
  const isAudioCap = upgradeReason === 'audio_cap';
  const isMultiVoice = upgradeReason === 'multi_voice';
  const isGuestUpgrade = !user;
  const isGeneric = !isAudioCap && !isMultiVoice;
  const anchorVariant = useMemo(() => getAnchorVariant(), []);
  const coverVariant = useMemo(() => getCoverVariant(), []);
  // Pull the user's active project so we can showcase their cover in the
  // upgrade modal — emotional sunk-cost trigger. Falls back to the most
  // recently updated project if no active one is set. null → no cover shown.
  const activeProject = useStore((s) => {
    const active = s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : null;
    if (active?.coverUrl) return active;
    // No active project, or active has no cover yet → fall back to most
    // recently updated project that DOES have a cover.
    const withCover = s.projects.filter((p) => p.coverUrl);
    if (!withCover.length) return null;
    return [...withCover].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
  });
  const coverUrl = activeProject?.coverUrl || null;
  const priceFor = (tier: PlanTier): string => {
    if (tier === 'free') return PLAN_DETAILS.free.price;
    const usd = TIER_PRICES_USD[tier as 'writer' | 'author' | 'studio' | 'publisher'];
    return `${formatDisplayPrice(usd, displayCurrency)}`;
  };

  useEffect(() => {
    if (showUpgradeModal) {
      setShowAllPlans(false);
      setBusyTier(null);
      setError('');
      setBusyBoostId(null);
      setBoostGranted(null);
      setSelectedPackId('boost_10');
      setWalletAvailable(null);
      // Refresh pack prices from the server in case BOOST_PACKS changed since
      // last open; DEFAULT_BOOST_PACKS keeps the UI populated meanwhile.
      api.billingBoosts().then((r) => { if (r?.packs?.length) setBoostPacks(r.packs); }).catch(() => {});
      // Fetch the Stripe publishable key + wallet availability flag. Cached
      // on success so subsequent opens reuse the result.
      if (!stripeConfig) {
        api.billingConfig().then(setStripeConfig).catch(() => setStripeConfig({ stripePublishableKey: '', walletEnabled: false }));
      }
    }
  }, [showUpgradeModal, stripeConfig]);

  // Inline top-up purchase. Mirrors BoostModal.buy: instant grant if a saved
  // card is on file, otherwise redirect to Stripe checkout. Closes the modal
  // on a successful instant grant so the user lands back in their workspace
  // with the new balance visible.
  const handleBoostBuy = async (pack: BoostPack) => {
    if (!user) {
      // Guests don't have a payment method yet — defer to the standard
      // upgrade flow which collects auth before checkout.
      try {
        localStorage.setItem('theodore_pending_boost', JSON.stringify({ packId: pack.id, at: Date.now() }));
      } catch {}
      setShowUpgradeModal(false);
      window.dispatchEvent(new CustomEvent('theodore:showAuth'));
      return;
    }
    setBusyBoostId(pack.id);
    setError('');
    jTrack('boost_clicked', { packId: pack.id, amount: pack.priceUsd, source: 'upgrade_modal_inline' });
    try {
      const r = await api.billingBoost({ packId: pack.id });
      if (r.mode === 'checkout' && r.url) {
        pixel.trackInitiateCheckout(pack.priceUsd);
        window.location.href = r.url;
        return;
      }
      if (r.mode === 'instant' && typeof r.creditsRemaining === 'number') {
        applyBoost(r.creditsRemaining);
        setBoostGranted(pack.credits);
        pixel.trackSubscribe(pack.priceUsd);
        pixel.trackCustom('BoostPurchased', { packId: pack.id, amount: pack.priceUsd, source: 'upgrade_modal_inline' });
        jTrack('boost_purchased', { packId: pack.id, amount: pack.priceUsd, mode: 'instant', source: 'upgrade_modal_inline' });
      }
    } catch (e: any) {
      setError(e?.message || 'Top-up failed. Please try again.');
    } finally {
      setBusyBoostId(null);
    }
  };

  // Fire the "shown" event whenever the modal opens, for EVERY user (guest
  // or signed-in). Previously this only fired inside the guest-only
  // GuestCapInline subcomponent, so the funnel dashboard reported ~0
  // impressions for the 15 call sites that open the modal for signed-in
  // free users (402 errors, multi-voice toggle, credit nudges, settings,
  // etc.). Tag with variant + is_guest so the funnel can slice both ways.
  useEffect(() => {
    if (!showUpgradeModal) return;
    const variant = isAudioCap ? 'audio_cap' : isMultiVoice ? 'multi_voice' : 'generic';
    const evt = isAudioCap ? 'audio_cap_inline_shown' : 'upgrade_inline_shown';
    const pix = isAudioCap ? 'AudioCapInlineShown' : 'UpgradeInlineShown';
    const data: Record<string, unknown> = { variant, is_guest: !user };
    if (isGeneric) {
      data.anchor_variant = anchorVariant;
      data.cover_variant = coverVariant;     // 'small' | 'hero' (2026-06-09 A/B)
      data.has_cover = !!coverUrl;           // whether the modal actually rendered a cover
    }
    jTrack(evt, data);
    pixel.trackCustom(pix, data);
    // Dedicated "Dream Offer" event name for the generic variant. This is the
    // Hormozi value-stack rebuild (paperback + audiobook + Author tier hero).
    // Fired alongside upgrade_inline_shown so historical comparison is intact
    // but Prompts admin can now slice the dream-offer impressions cleanly.
    if (isGeneric) {
      jTrack('dream_offer_shown', {
        is_guest: !user,
        credits_remaining: plan.creditsRemaining,
        credits_total: plan.creditsTotal,
        tier: plan.tier,
      });
      pixel.trackCustom('DreamOfferShown', { is_guest: !user });
    }
    // Anchor-A/B events still fire (localStorage variant assignment kept) so
    // historical data continuity holds; the visual anchor block was removed
    // but the infrastructure is intact in case we revive it.
    if (isGeneric) {
      const anchorEvt = anchorVariant === 'stacked'
        ? 'upgrade_inline_shown_anchor_stacked'
        : 'upgrade_inline_shown_anchor_audible';
      jTrack(anchorEvt, { variant, is_guest: !user });
    }
    // Intentionally only depend on the open-flip so we fire once per open,
    // not on every variant prop tweak while the modal is already visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUpgradeModal]);

  // Reset stuck "Redirecting..." state when the browser restores this page
  // from bfcache after a back-nav from Stripe. Without this the CTA stays
  // disabled and the user can't retry checkout.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusyTier(null);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  if (!showUpgradeModal) return null;

  const handleUpgrade = async (tier: PlanTier) => {
    if (tier !== 'writer' && tier !== 'author' && tier !== 'studio' && tier !== 'publisher') return;
    // Guests choosing a paid tier from the expanded picker — defer checkout
    // until signup completes. Post-auth hook in App.tsx resumes into Stripe.
    if (!user) {
      try {
        localStorage.setItem('theodore_pending_checkout', JSON.stringify({
          tier,
          reason: isAudioCap ? 'audio_cap' : undefined,
          at: Date.now(),
        }));
      } catch {}
      setShowUpgradeModal(false);
      window.dispatchEvent(new CustomEvent('theodore:showAuth'));
      return;
    }
    setBusyTier(tier);
    setError('');
    try {
      const checkout = await api.billingCheckout({ tier, reason: isAudioCap ? 'audio_cap' : undefined });
      if (!checkout?.url) throw new Error('Stripe checkout URL was not returned.');
      if (isGeneric) {
        jTrack('upgrade_checkout_redirect', { tier, anchor_variant: anchorVariant });
        // Dedicated Dream Offer conversion event so the Prompts admin shows
        // a clean shown→checkout funnel for the Hormozi rebuild.
        jTrack('dream_offer_checkout_redirect', { tier });
        pixel.trackCustom('DreamOfferCheckoutRedirect', { tier });
        const anchorEvt = anchorVariant === 'stacked'
          ? 'upgrade_checkout_redirect_anchor_stacked'
          : 'upgrade_checkout_redirect_anchor_audible';
        jTrack(anchorEvt, { tier });
      }
      window.location.href = checkout.url;
    } catch (e: any) {
      setError(e?.message || 'Unable to start checkout.');
      setBusyTier(null);
    }
  };

  // 2026-06-08 v2 — Dream Offer hero + hoisted Author card retired.
  // The modal is now: credit pill → top-up packs → Writer → Author →
  // Studio (ordered ascending so the user reads price low-to-high after
  // they've seen the instant-fix top-ups). Author keeps the Recommended
  // halo so it still draws the eye as the middle pick, but without the
  // printed-paperback hook or value-stack.
  const tiers: { tier: PlanTier; icon: typeof Sparkles; recommended?: boolean }[] = [
    { tier: 'writer', icon: Sparkles },
    { tier: 'author', icon: BookOpen, recommended: true },
    { tier: 'studio', icon: Headphones },
  ];

  // Tier-card renderer — extracted so we can render the Author card hoisted
  // above the dream-offer hook (price anchor first) AND the Writer/Studio
  // cards below the value stack in the normal slot.
  const renderTierCard = ({ tier, icon: Icon, recommended }: typeof tiers[number]) => {
    const details = PLAN_DETAILS[tier];
    const isCurrent = plan.tier === tier;
    return (
      // Outer wrapper does NOT clip — needed so the "Recommended" badge
      // hanging above the card stays visible. The inner wrapper handles the
      // rounded-corner clip for the rotating gradient border.
      <div key={tier} className="relative">
        <div className="relative rounded-2xl overflow-hidden">
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

          {/* Features — Author and Writer share the same three differentiator
              rows so users can compare at a glance. Author marks them ✓,
              Writer marks them ✗, both add a credit-count row. Studio +
              Publisher fall back to their PLAN_DETAILS feature list. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {(() => {
              if (tier === 'author' || tier === 'writer') {
                const credits = (details.credits ?? 0).toLocaleString();
                const rows = [
                  ...DREAM_OFFER_DIFFERENTIATORS.map((label) => ({ label, included: tier === 'author' })),
                  { label: `${credits} credits/month`, included: true },
                ];
                return rows.map(({ label, included }) => (
                  <div key={label} className="flex items-center gap-1.5 text-xs text-white/60">
                    {included ? (
                      <Check size={11} className="flex-shrink-0 text-emerald-400/80" />
                    ) : (
                      <X size={11} className="flex-shrink-0 text-rose-400/70" />
                    )}
                    <span>{label}</span>
                  </div>
                ));
              }
              return details.features.slice(0, 4).map((feature) => (
                <div key={feature} className="flex items-center gap-1.5 text-xs text-white/60">
                  <Check size={11} className="flex-shrink-0 text-emerald-400/80" />
                  <span>{feature}</span>
                </div>
              ));
            })()}
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
                  : tier === 'author'
                  ? `Become an author · ${priceFor('author')}`
                  : `Choose ${details.name}`}
              </button>
            </div>
          )}
        </div>
        </div>
        {/* Recommended badge — outside the overflow-hidden wrapper so it can
            hang above the card without being clipped. z-10 keeps it above
            the rotating border. */}
        {recommended && !isCurrent && (
          <div className="absolute -top-2 left-4 z-10 pointer-events-none">
            <span className="text-[10px] font-semibold text-white px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg" style={{ background: 'linear-gradient(90deg, #6366f1, #a855f7)' }}>
              <Sparkles size={9} /> Recommended
            </span>
          </div>
        )}
      </div>
    );
  };

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

          {/* SMALL cover variant (top-right corner). Only renders for the
              coffee-generic case, when we have a coverUrl, and when the
              A/B assignment selected 'small'. The cover sits below the X
              close button and is a 64×64 rounded square with object-cover
              so book-cover aspect ratios crop center-safe. */}
          {isGeneric && coverUrl && coverVariant === 'small' && (
            <div className="absolute top-12 right-4 z-10">
              <img
                src={coverUrl}
                alt={activeProject?.title || 'Your book'}
                className="w-16 h-16 object-cover rounded-xl border border-white/10 shadow-lg"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
            </div>
          )}

          <div className="relative z-10 p-6 sm:p-8">
            {/* Credit-state pill — restyled for the coffee variant to read
                "OUT OF CREDITS · X left" per the 2026-06-09 design mock. */}
            {isGeneric && (
              <div className="flex items-center justify-between mb-5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-400/30">
                  <span className="text-[11px] font-semibold text-rose-300 uppercase tracking-wider">Out of credits</span>
                  <span className="text-[11px] text-rose-300/50">·</span>
                  <span className="text-[11px] text-rose-200/80">{plan.creditsRemaining} left</span>
                </div>
              </div>
            )}

            {boostGranted != null ? (
              // Post-purchase success card — same look for every variant.
              <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.08] p-4 text-center animate-fade-in">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/15 mb-2">
                  <Check size={20} className="text-emerald-400" />
                </div>
                <div className="text-base font-semibold text-white">+{boostGranted.toLocaleString()} credits added</div>
                <div className="text-xs text-white/60 mt-0.5">You're good to keep writing.</div>
                <button
                  onClick={() => setShowUpgradeModal(false)}
                  className="mt-3 w-full py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-white/90"
                >
                  Back to writing →
                </button>
              </div>
            ) : isGeneric ? (
              // ── Coffee variant (generic case) ────────────────────────────
              // Mirrors the W8 "Less than one coffee a [week]" design from the
              // 2026-06-09 design bundle. Pack buttons SELECT (don't auto-buy);
              // the Apple/Google Pay wallet button below confirms the payment.
              <div className="mb-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] mb-2.5" style={{ color: '#ff9f5a' }}>
                  Worth it
                </div>
                <h2
                  className="font-semibold text-white leading-[1.04] mb-5"
                  style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 'clamp(28px, 7vw, 38px)', letterSpacing: '-0.01em' }}
                >
                  Finish what you
                  <br />
                  <span
                    className="px-1.5 rounded"
                    style={{ background: '#ff9f5a', color: '#1a1500', boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
                  >
                    started
                  </span>
                  <span style={{ color: '#ff9f5a' }}>.</span>
                </h2>

                {/* HERO cover variant (full-width). Sits between headline and
                    pack selector. Square with rounded corners, aspect-square so
                    portrait + landscape covers both crop cleanly. Slight orange
                    glow at the top-right edge matches the modal's accent radial.
                    Only renders when 'hero' was the A/B assignment + we have
                    a cover. */}
                {coverUrl && coverVariant === 'hero' && (
                  <div className="mb-5 relative">
                    <img
                      src={coverUrl}
                      alt={activeProject?.title || 'Your book'}
                      className="w-full aspect-square object-cover rounded-2xl border border-white/10 shadow-2xl"
                      style={{ background: 'rgba(255,255,255,0.04)' }}
                    />
                  </div>
                )}

                {/* Pack selector — middle pre-selected, taps update selectedPackId.
                    The actual charge happens via the wallet button below. */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {boostPacks.slice(0, 3).map((p) => {
                    const isSelected = selectedPackId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedPackId(p.id)}
                        className={cn(
                          'flex flex-col items-center justify-center py-4 rounded-2xl border transition-all',
                          isSelected
                            ? 'border-[#ff9f5a] bg-[#ff9f5a]/[0.14]'
                            : 'border-white/15 bg-white/[0.06] hover:bg-white/[0.10] hover:border-white/25',
                        )}
                      >
                        <div className="text-2xl font-bold text-white leading-none" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
                          ${p.priceUsd}
                        </div>
                        <div className="text-[11px] text-white/70 mt-1.5">{p.credits.toLocaleString()} credits</div>
                      </button>
                    );
                  })}
                </div>

                {/* Wallet button (Apple Pay / Google Pay one-tap) — wrapped in
                    Stripe Elements so PaymentRequestButtonElement can render.
                    Only mounts when config has a publishable key AND we haven't
                    yet determined the platform has no wallet. CoffeeWalletButton
                    signals onNoWallet when canMakePayment returns null so the
                    card fallback below takes over without a flash. */}
                {stripeConfig?.walletEnabled && stripeConfig.stripePublishableKey && walletAvailable !== false ? (
                  <Elements stripe={getStripePromise(stripeConfig.stripePublishableKey)}>
                    <CoffeeWalletButton
                      packs={boostPacks}
                      selectedPackId={selectedPackId}
                      onSuccess={({ credits }) => {
                        setBoostGranted(credits);
                        // Stripe webhook does the actual server-side credit
                        // grant; we optimistically show the success card here.
                      }}
                      onNoWallet={() => setWalletAvailable(false)}
                      onError={(msg) => setError(msg)}
                    />
                  </Elements>
                ) : null}

                {/* Card fallback — shown when wallet check finished with no
                    Apple/Google Pay available, OR when stripeConfig.walletEnabled
                    is false (env var unset). Routes through the existing
                    Stripe-Checkout-redirect path so all flows stay supported. */}
                {(walletAvailable === false || !stripeConfig?.walletEnabled) && (
                  <CoffeeCardFallbackButton
                    packId={selectedPackId}
                    busy={!!busyBoostId}
                    onClick={(packId) => {
                      const pack = boostPacks.find((p) => p.id === packId);
                      if (pack) handleBoostBuy(pack);
                    }}
                  />
                )}

                <div className="text-center text-[10px] text-white/40 mt-2">
                  One-time · credits never expire
                </div>
              </div>
            ) : (
              // ── Existing boost-tap grid (multi-voice + audio-cap variants) ──
              // Coffee variant is generic-only for the first ship. These two
              // upgrade reasons keep the tap-to-purchase flow.
              <div className="mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-xl" role="img" aria-label="bolt">⚡</span>
                  <div className="text-sm font-semibold text-white">Need credits right now?</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {boostPacks.slice(0, 3).map((p) => {
                    const isBusy = busyBoostId === p.id;
                    const disabled = !!busyBoostId && !isBusy;
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleBoostBuy(p)}
                        disabled={disabled || isBusy}
                        className="relative flex flex-col items-center justify-center py-4 rounded-2xl border border-white/15 bg-white/[0.06] hover:bg-white/[0.12] hover:border-white/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-2xl font-serif font-bold text-white leading-none">${p.priceUsd}</div>
                        <div className="text-[11px] text-white/70 mt-1.5">{p.credits.toLocaleString()} credits</div>
                        {isBusy && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 backdrop-blur-sm">
                            <Loader2 size={18} className="animate-spin text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="text-center text-[10px] text-white/40 mt-2">One-time · credits never expire</div>
              </div>
            )}

            {/* Header — multi-voice and audio-cap variants keep their own
                hook copy. Generic variant has NO header here anymore (the
                Dream Offer hero / value stack was retired 2026-06-08); the
                credit pill above + top-up section + tier list speak for
                themselves. Falling straight from top-ups to tier cards. */}
            {(isMultiVoice || isAudioCap) && (
              <div className="text-center mb-6">
                {isMultiVoice ? (
                  <>
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-purple-500/15 mb-3">
                      <Sparkles size={22} className="text-purple-300" />
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/15 border border-purple-400/20 text-[10px] font-bold uppercase tracking-wider text-purple-300 mb-2">
                      Beta · Writer early access
                    </div>
                    <h2 className="text-xl font-serif font-semibold text-white">A voice for every character</h2>
                    <p className="text-sm text-white/60 mt-1.5 max-w-sm mx-auto">
                      Writer subscribers get early access to multi-voice narration — each character speaks with their own xAI voice, auto-cast by role and gender. Plus everything else in Writer · $10/mo, 7 days free.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.08] mb-3">
                      <Headphones size={22} className="text-white/80" />
                    </div>
                    <h2 className="text-xl font-serif font-semibold text-white">Like what you heard?</h2>
                    <p className="text-sm text-white/60 mt-1.5 max-w-sm mx-auto">
                      Finish this chapter and ~29 more. Writer · $10/mo, 7 days free.
                    </p>
                    <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-xs text-emerald-300">
                      <Sparkles size={11} /> 7 days free · cancel anytime
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Guest upgrade: inline signup + direct-to-Stripe.
                Collapses 3 view-switches (modal → auth page → redirect) into
                one continuous flow. Tier grid is hidden until "See all plans".
                Audio-cap variant gets the 7-day trial copy; generic variant
                shows monthly price. */}
            {isGuestUpgrade && !showAllPlans && (
              <GuestCapInline
                isAudioCap={isAudioCap}
                onSeeAllPlans={() => setShowAllPlans(true)}
                onError={setError}
              />
            )}

            {error && (
              <div className="mt-3 text-xs rounded-xl border border-red-400/30 bg-red-500/10 text-red-300 px-3 py-2">
                {error}
              </div>
            )}

            {/* Tier cards — hidden for guest upgrade flow unless they expand.
                For the generic Dream Offer flow we filter Author out here
                because it's already hoisted above the hook. Other variants
                (multi-voice, audio-cap) keep showing all three. */}
            {(!isGuestUpgrade || showAllPlans) && (
            <>
            {/* "OR GO UNLIMITED" divider sits between the coffee wallet
                section and the subscription card(s). Generic case shows
                only Writer; multi-voice + audio-cap show all three tiers. */}
            {isGeneric && boostGranted == null && (
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-medium">or go unlimited</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
            )}
            <div className="space-y-3">
              {/* Coffee variant: Writer only (subscription = "or go unlimited"
                  alternative to top-ups). Multi-voice / audio-cap variants
                  keep the full Writer → Author → Studio list. */}
              {(isGeneric ? tiers.filter((t) => t.tier === 'writer') : tiers).map(renderTierCard)}
            </div>

            {/* Publisher tier — only show if not already on Publisher.
                Writer is now a full card above so the footnote-link version
                was removed; only Publisher remains as a small text link.
                Coffee variant hides this — the modal is intentionally
                minimal (top-up OR Writer subscription only). */}
            {plan.tier !== 'publisher' && !isGeneric && (
              <button
                onClick={() => handleUpgrade('publisher')}
                className="mt-3 w-full text-center text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Need more? See Publisher plan ({priceFor('publisher')}/mo) →
              </button>
            )}
            {/* Old bottom "Top up once" link removed 2026-06-06 — the three
                $5/$10/$20 pack buttons are now hoisted to the top of the
                modal, immediately under the "Not enough credits" pill. */}
            </>
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

          {/* Scroll-hint arrow — sticky at the bottom of the scrollable
              modal viewport. While there's content below the fold, this
              chevron bobs at the bottom edge to signal "more to see."
              When the user scrolls all the way down, the sticky element
              reaches its natural position (just below the glass card)
              and visually merges out of the way.
              Coffee variant only — the multi-voice/audio-cap variants
              don't have the same below-the-fold content density. */}
          {isGeneric && boostGranted == null && (
            <div className="sticky bottom-2 z-30 pointer-events-none flex justify-center -mt-12 mb-3 animate-fade-in">
              <div
                className="rounded-full w-9 h-9 flex items-center justify-center border border-white/15 shadow-lg"
                style={{
                  background: 'rgba(20, 20, 28, 0.7)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  animation: 'bounce 2.2s ease-in-out infinite',
                }}
              >
                <ChevronDown size={18} className="text-white/80" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Guest inline signup for the audio cap ───────────────────────────────
// Collapses "sign up → redirect → Stripe" into one continuous flow inside
// the cap modal. Google is the primary path (2 clicks). Email is progressive
// disclosure. After auth completes, we call billingCheckout directly so the
// session cookie is already present when Stripe fires.
function GuestCapInline({
  isAudioCap,
  onSeeAllPlans,
  onError,
}: {
  isAudioCap: boolean;
  onSeeAllPlans: () => void;
  onError: (msg: string) => void;
}) {
  const { register, login, googleLogin } = useAuthStore();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Removed: was a duplicate of the top-level fire in UpgradeModal. Kept here
  // only for guests previously — but the parent's useEffect now fires for all
  // users (with is_guest tag), so this would double-count guests.

  // bfcache restore from Stripe back-nav — clear the stuck "Redirecting…" state
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const continueToStripe = async () => {
    const checkout = await api.billingCheckout({ tier: 'writer', reason: isAudioCap ? 'audio_cap' : undefined });
    if (!checkout?.url) throw new Error('Stripe checkout URL was not returned.');
    jTrack(isAudioCap ? 'audio_cap_checkout_redirect' : 'upgrade_checkout_redirect');
    window.location.href = checkout.url;
  };

  // Load Google GSI script lazily
  useEffect(() => {
    if ((window as any).google?.accounts?.id) { setGoogleReady(true); return; }
    if (document.getElementById('google-gsi-script')) {
      const check = setInterval(() => {
        if ((window as any).google?.accounts?.id) { setGoogleReady(true); clearInterval(check); }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => setGoogleReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!googleReady || !googleBtnRef.current) return;
    const google = (window as any).google;
    if (!google?.accounts?.id) return;
    const cb = async (response: any) => {
      setBusy(true);
      onError('');
      try {
        await googleLogin(response.credential);
        jTrack(isAudioCap ? 'audio_cap_signup_google' : 'upgrade_signup_google');
        pixel.trackCustom(isAudioCap ? 'AudioCapSignupGoogle' : 'UpgradeSignupGoogle');
        await continueToStripe();
      } catch (err: any) {
        onError(err?.message || 'Google sign-in failed.');
        setBusy(false);
      }
    };
    googleBtnRef.current.innerHTML = '';
    google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: cb });
    google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'filled_black', size: 'large', width: googleBtnRef.current.offsetWidth || 300,
      text: 'continue_with', shape: 'pill',
    });
  }, [googleReady, googleLogin]);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (mode === 'register' && password.length < 8) {
      onError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    onError('');
    try {
      if (mode === 'register') {
        await register(email.trim(), password, name.trim() || undefined);
        jTrack(isAudioCap ? 'audio_cap_signup_email' : 'upgrade_signup_email');
        pixel.trackCustom(isAudioCap ? 'AudioCapSignupEmail' : 'UpgradeSignupEmail');
      } else {
        await login(email.trim(), password);
        jTrack(isAudioCap ? 'audio_cap_login_email' : 'upgrade_login_email');
      }
      await continueToStripe();
    } catch (err: any) {
      const msg = String(err?.message || 'Something went wrong.');
      onError(
        msg.toLowerCase().includes('invalid email or password') ? 'Incorrect email or password.' :
        msg.toLowerCase().includes('already exists') ? 'Account exists — try signing in instead.' :
        msg
      );
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Google primary */}
      <div ref={googleBtnRef} className="w-full flex justify-center" />

      {/* Email progressive disclosure */}
      {!showEmail ? (
        <button
          onClick={() => setShowEmail(true)}
          disabled={busy}
          className="w-full py-2.5 rounded-full text-sm font-medium text-white/80 border border-white/15 hover:bg-white/[0.06] transition-all disabled:opacity-40"
        >
          Continue with email
        </button>
      ) : (
        <form onSubmit={submitEmail} className="space-y-2.5 animate-fade-in">
          {mode === 'register' && (
            <input
              type="text"
              placeholder="Name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder-white/40 outline-none focus:border-white/25 transition-all disabled:opacity-50"
            />
          )}
          <div className="relative">
            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
              disabled={busy}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder-white/40 outline-none focus:border-white/25 transition-all disabled:opacity-50"
            />
          </div>
          <div className="relative">
            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="password"
              placeholder={mode === 'register' ? 'Password (8+ chars)' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              disabled={busy}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white placeholder-white/40 outline-none focus:border-white/25 transition-all disabled:opacity-50"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white text-[#16162a] hover:bg-white/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy
              ? 'Redirecting…'
              : mode === 'register'
              ? isAudioCap
                ? 'Start 7-day trial · Writer'
                : 'Sign up & continue · Writer $10/mo'
              : 'Sign in & continue'}
          </button>
          <div className="text-center text-xs text-white/40">
            {mode === 'register' ? (
              <>Already have an account? <button type="button" onClick={() => setMode('login')} className="text-white/70 hover:text-white underline">Sign in</button></>
            ) : (
              <>No account? <button type="button" onClick={() => setMode('register')} className="text-white/70 hover:text-white underline">Create one</button></>
            )}
          </div>
        </form>
      )}

      {/* See all plans */}
      <button
        onClick={onSeeAllPlans}
        className="w-full text-center text-xs text-white/35 hover:text-white/70 transition-colors pt-1"
      >
        See all plans →
      </button>
    </div>
  );
}
