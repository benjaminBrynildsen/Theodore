import { useState, useEffect } from 'react';
import { BookOpen, Check, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

// Shared centered shell matching the landing aesthetic.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#f6f6f4] flex flex-col items-center justify-center px-6 py-16 text-center">
      <a href="/" className="flex items-center gap-2 mb-8 opacity-80 hover:opacity-100 transition-opacity">
        <BookOpen size={20} strokeWidth={1.8} />
        <span className="text-base font-serif font-semibold tracking-tight">Theodore</span>
      </a>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

const FOUNDING_INCLUDED = [
  'Three months of full Author access',
  'Multi-voice narration and per-character casting',
  'Music and sound design on every chapter',
  'Your finished book printed and shipped to your door',
];

// The buy page a waitlist lead lands on from the "seats are open" email, or
// from the landing CTA while a drop is live. Shows live seat scarcity + the
// $99 CTA → Stripe Checkout.
export function FoundingBuyView() {
  const [drop, setDrop] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/founding/drop/current')
      .then((r) => r.json())
      .then((d) => setDrop(d))
      .catch(() => setDrop({ available: false }))
      .finally(() => setLoading(false));
  }, []);

  const buy = async () => {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { setError('Enter a valid email address.'); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await fetch('/api/founding/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Something went wrong. Please try again.'); setSubmitting(false); return; }
      if (data?.url) { window.location.href = data.url; return; }
      setError('Something went wrong. Please try again.'); setSubmitting(false);
    } catch {
      setError('Something went wrong. Please try again.'); setSubmitting(false);
    }
  };

  if (loading) {
    return <Shell><p className="text-sm text-black/50">Loading…</p></Shell>;
  }

  if (!drop?.available) {
    return (
      <Shell>
        <h1 className="font-serif text-3xl tracking-tight text-black mb-3">This week's seats are taken.</h1>
        <p className="text-sm text-black/55 leading-relaxed mb-8">
          All {drop?.seatCap ?? 10} founding seats are gone for this week. The next batch opens soon. If you're on the list, we'll email you the moment they're live.
        </p>
        <a href="/" className="inline-block rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-black/85 transition-all">Back to Theodore</a>
      </Shell>
    );
  }

  const pct = Math.min(100, Math.round((drop.seatsClaimed / drop.seatCap) * 100));
  return (
    <Shell>
      <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-5">
        <Sparkles size={12} />
        Founding seat
      </div>
      <h1 className="font-serif text-4xl tracking-tight text-black mb-2">Claim your seat.</h1>
      <p className="text-sm text-black/55 mb-7">First-come. When these are gone, the next open next week.</p>

      <div className="rounded-2xl bg-black text-white p-7 text-left shadow-xl">
        <div className="flex items-baseline gap-2">
          <span className="font-serif text-5xl">${Math.round(drop.priceCents / 100)}</span>
          <span className="text-sm text-white/55">for 3 months</span>
        </div>
        {drop.regPriceCents ? (
          <p className="text-xs text-white/45 mb-5">Founding price. Regularly ${Math.round(drop.regPriceCents / 100)}.</p>
        ) : <div className="mb-5" />}
        <ul className="space-y-2.5 mb-6">
          {FOUNDING_INCLUDED.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <Check size={15} className="mt-0.5 flex-shrink-0 text-white/80" />
              <span className="text-white/85">{b}</span>
            </li>
          ))}
        </ul>

        {/* Seat scarcity */}
        <div className="mb-5">
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-white/80 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-white/55">{drop.seatsClaimed} of {drop.seatCap} taken — {drop.seatsRemaining} left this week</p>
        </div>

        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buy(); } }}
          placeholder="your@email.com"
          className="w-full rounded-xl bg-white/5 border border-white/15 px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none focus:border-white/40 transition-colors mb-2"
        />
        <button
          onClick={buy}
          disabled={submitting}
          className="w-full rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 active:scale-[0.99] transition-all disabled:opacity-60"
        >
          {submitting ? 'Taking you to checkout…' : `Take a seat — $${Math.round(drop.priceCents / 100)}`}
        </button>
        {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      </div>
    </Shell>
  );
}

// Post-Stripe-redirect page. Polls the order until the webhook flips it to
// paid, then tells the buyer to check their email for the set-password link.
export function FoundingSuccessView({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<'pending' | 'paid' | 'overcap_refunded' | 'failed' | 'unknown'>('pending');

  useEffect(() => {
    let stop = false;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const r = await fetch(`/api/founding/order/${encodeURIComponent(sessionId)}`);
        if (r.ok) {
          const d = await r.json();
          if (stop) return;
          if (d.status === 'paid' || d.status === 'overcap_refunded' || d.status === 'refunded') { setStatus(d.status === 'refunded' ? 'overcap_refunded' : d.status); return; }
        }
      } catch { /* keep polling */ }
      if (!stop && tries < 40) setTimeout(poll, 2500);
      else if (!stop) setStatus('unknown');
    };
    poll();
    return () => { stop = true; };
  }, [sessionId]);

  if (status === 'paid') {
    return (
      <Shell>
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5"><Check size={22} className="text-emerald-600" /></div>
        <h1 className="font-serif text-3xl tracking-tight text-black mb-3">You're in.</h1>
        <p className="text-sm text-black/55 leading-relaxed">Your founding seat is confirmed. Check your email for a link to set your password and start writing. We'll be in touch about printing your finished book.</p>
      </Shell>
    );
  }
  if (status === 'overcap_refunded') {
    return (
      <Shell>
        <h1 className="font-serif text-3xl tracking-tight text-black mb-3">Just missed it.</h1>
        <p className="text-sm text-black/55 leading-relaxed">This week's seats filled up right as your payment landed, so we've refunded you in full. You're first in line for next week — watch your inbox.</p>
      </Shell>
    );
  }
  if (status === 'unknown' || status === 'failed') {
    return (
      <Shell>
        <h1 className="font-serif text-3xl tracking-tight text-black mb-3">Still confirming.</h1>
        <p className="text-sm text-black/55 leading-relaxed">Your payment is taking a moment to confirm. If you completed checkout, watch your email for a set-password link. Any issue, reply to that email and Ben will sort it out.</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="w-8 h-8 rounded-full border-2 border-black/15 border-t-black/60 animate-spin mx-auto mb-5" />
      <h1 className="font-serif text-3xl tracking-tight text-black mb-3">Confirming your payment…</h1>
      <p className="text-sm text-black/55">One second while we lock in your seat.</p>
    </Shell>
  );
}

// Set-password completion (from the post-purchase email link). On success the
// server mints a session cookie; we reload into the authenticated app.
export function FoundingResetView({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d?.error || 'That link is invalid or expired.'); setSubmitting(false); return; }
      // Session cookie is set — reload into the app (clears the token from URL).
      window.location.assign('/');
    } catch {
      setError('Something went wrong. Please try again.'); setSubmitting(false);
    }
  };

  return (
    <Shell>
      <h1 className="font-serif text-3xl tracking-tight text-black mb-2">Set your password</h1>
      <p className="text-sm text-black/55 mb-7">One last step, then you're writing.</p>
      <div className="text-left">
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Choose a password (8+ characters)"
          className={cn('w-full rounded-xl bg-white border px-4 py-3 text-sm text-black placeholder:text-black/35 outline-none transition-colors mb-2', error ? 'border-red-400' : 'border-black/15 focus:border-black/40')}
        />
        <button
          onClick={submit}
          disabled={submitting}
          className="w-full rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-black/85 active:scale-[0.99] transition-all disabled:opacity-60"
        >
          {submitting ? 'Setting up…' : 'Set password and start writing'}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>
    </Shell>
  );
}
