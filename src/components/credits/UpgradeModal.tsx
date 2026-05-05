import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Check, Sparkles, BookOpen, Headphones, Mail, Lock } from 'lucide-react';
import { useCreditsStore } from '../../store/credits';
import { useAuthStore } from '../../store/auth';
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

const GOOGLE_CLIENT_ID = '296594825511-3m0g5t2l0ombm3j8cdc5ncqe673obg4d.apps.googleusercontent.com';

export function UpgradeModal() {
  const { showUpgradeModal, setShowUpgradeModal, plan, upgradeReason } = useCreditsStore();
  const user = useAuthStore((s) => s.user);
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [error, setError] = useState('');
  const [showAllPlans, setShowAllPlans] = useState(false);
  const displayCurrency = useMemo(() => detectDisplayCurrency(), []);
  const showUsdDisclaimer = isNonUsdDisplay(displayCurrency);
  const isAudioCap = upgradeReason === 'audio_cap';
  const isGuestUpgrade = !user;
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
    }
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
                  <h2 className="text-xl font-serif font-semibold text-white">Like what you heard?</h2>
                  <p className="text-sm text-white/60 mt-1.5 max-w-sm mx-auto">
                    Finish this chapter and ~29 more. Writer · $10/mo, 7 days free.
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

            {/* Tier cards — hidden for guest upgrade flow unless they expand */}
            {(!isGuestUpgrade || showAllPlans) && (
            <>
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

  useEffect(() => {
    const evt = isAudioCap ? 'audio_cap_inline_shown' : 'upgrade_inline_shown';
    const pix = isAudioCap ? 'AudioCapInlineShown' : 'UpgradeInlineShown';
    jTrack(evt);
    pixel.trackCustom(pix);
  }, [isAudioCap]);

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
