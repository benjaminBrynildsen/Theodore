import { useState, useEffect } from 'react';
import { Sparkles, DollarSign, Gift, Wallet, ArrowRight, Mic, PenLine, Share2, ChevronDown, X } from 'lucide-react';

function TheodoreLogo({ size = 64, className = '' }: { size?: number; className?: string }) {
  const radius = (14 / 64) * size;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Theodore"
      className={className}
    >
      <rect x="0" y="0" width="64" height="64" rx={(radius / size) * 64} fill="#111827" />
      <path d="M12 15h40v11H38v24h-12V26H12z" fill="#f9fafb" />
    </svg>
  );
}
import { cn } from '../../lib/utils';
import { track as jTrack } from '../../lib/journey';
import type { Creator } from '../../data/creators';

const APPLY_EMAIL = 'ben@theodore.tools';
const APPLY_SUBJECT = 'Theodore Creator Program';
const APPLY_BODY = `Hey Ben,

I'd love to join the Theodore creator program.

Channel / platform:
Audience size:
Why my audience would love Theodore:

Thanks,
`;

const applyHref = `mailto:${APPLY_EMAIL}?subject=${encodeURIComponent(APPLY_SUBJECT)}&body=${encodeURIComponent(APPLY_BODY)}`;

const EARNINGS = [
  {
    icon: Gift,
    amount: '$2',
    label: 'on redemption',
    desc: 'Paid the moment someone signs up with your code and claims their free month.',
  },
  {
    icon: DollarSign,
    amount: '$10',
    label: 'on paid conversion',
    desc: 'Bonus when they keep going past the free month and pay their first invoice.',
  },
  {
    icon: Wallet,
    amount: 'Monthly',
    label: 'via Wise / PayPal',
    desc: 'Automatic payouts once you\'ve earned $25 — no invoicing, no chasing.',
  },
];

const STEPS = [
  { icon: PenLine, title: 'Apply', desc: 'Quick email with your channel and audience. We\'ll onboard you within a couple of days.' },
  { icon: Sparkles, title: 'Get your code', desc: 'We issue you a unique promo code and referral link, plus a dashboard to watch it all come in.' },
  { icon: Share2, title: 'Share & earn', desc: 'Mention Theodore in a video, a newsletter, a tweet — wherever your audience is. Earnings accrue in real time.' },
];

const FAQ = [
  {
    q: 'How does attribution work?',
    a: 'Two layers. When someone clicks your referral link, we drop a 60-day first-touch cookie. When someone enters your code at checkout, it\'s recorded directly. Either path credits you.',
  },
  {
    q: 'When do I get paid?',
    a: 'Payouts run monthly, any month you\'ve accrued $25 or more. If you\'re under, it rolls to the next month. Wise and PayPal supported out of the box.',
  },
  {
    q: 'What does my audience actually get?',
    a: 'A free month of the Writer plan — $10/mo value, 2,500 credits. That\'s enough to generate a full audiobook from a single sentence. After the free month, they\'re billed $10/mo unless they cancel or upgrade.',
  },
  {
    q: 'What if they upgrade to a bigger plan?',
    a: 'You still earn the $10 bonus on their first paid invoice, regardless of tier. If they jump to Author or Studio right away, that works too — same $2 / $10 structure.',
  },
  {
    q: 'Taxes?',
    a: 'For US creators earning $600+ in a calendar year we\'ll send a W-9 request and issue a 1099 in January. International payouts are gross — you handle reporting wherever you live.',
  },
];

interface CreatorsPageProps {
  creator?: Creator | null;
}

export function CreatorsPage({ creator }: CreatorsPageProps = {}) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    jTrack('creator_page_view', {
      slug: creator?.slug ?? null,
      creator: creator?.channelName ?? null,
      personalized: !!creator,
    });
  }, [creator]);

  return (
    <div className="min-h-screen w-full bg-[#f6f6f4] flex flex-col overflow-y-auto">
      {/* Nav */}
      <header className="w-full flex items-center justify-center px-6 sm:px-10 py-5 max-w-6xl mx-auto w-full">
        <a href="/" className="flex items-center gap-2">
          <TheodoreLogo size={22} className="rounded-md" />
          <span className="text-base font-serif font-semibold tracking-tight">Theodore</span>
        </a>
      </header>

      {/* Personalized collab masthead */}
      {creator && (
        <section className="w-full max-w-4xl mx-auto px-6 sm:px-10 pt-4 sm:pt-8 pb-10 sm:pb-14 text-center">
          <div className="grid w-fit mx-auto grid-cols-[auto_auto_auto] items-center gap-x-5 sm:gap-x-8 gap-y-3 mb-8 animate-fade-in">
            <TheodoreLogo size={96} className="w-20 h-20 sm:w-24 sm:h-24 shadow-[0_10px_40px_rgba(0,0,0,0.12)] rounded-[22px] justify-self-center" />
            <X size={28} className="text-black/25 justify-self-center" strokeWidth={1.5} />
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-black/[0.04] shadow-[0_10px_40px_rgba(0,0,0,0.12)] justify-self-center">
              <img
                src={creator.photo}
                alt={creator.channelName}
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-black/40 text-center">Theodore</div>
            <div />
            <div className="text-[11px] uppercase tracking-[0.18em] font-semibold text-black/40 text-center">
              {creator.channelName}
            </div>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-4 animate-fade-in" style={{ animationDelay: '120ms' }}>
            <Mic size={12} />
            A note for you
          </div>
          <h1 className="font-serif text-[clamp(2.6rem,8vw,5rem)] leading-[1.02] tracking-[-0.03em] text-black animate-fade-in" style={{ animationDelay: '200ms' }}>
            Hey <span className="italic">{creator.firstName}</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-black/60 leading-relaxed max-w-xl mx-auto animate-fade-in" style={{ animationDelay: '280ms' }}>
            I built this page for you specifically. If you're open to partnering on Theodore, here's exactly how it'd work — and what your audience would get.
          </p>
          {creator.hasVideo && (
            <div className="mt-8 max-w-xl mx-auto animate-fade-in" style={{ animationDelay: '320ms' }}>
              <div className="relative overflow-hidden rounded-2xl bg-black shadow-[0_20px_60px_rgba(0,0,0,0.18)] aspect-video">
                <video
                  src={`/creators/videos/${creator.slug}.mp4`}
                  poster={creator.photo}
                  controls
                  preload="metadata"
                  playsInline
                  onPlay={() => jTrack('creator_video_play', { slug: creator.slug, creator: creator.channelName })}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center animate-fade-in" style={{ animationDelay: '400ms' }}>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1c1c1e] px-6 py-3 text-[15px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-transform"
            >
              See Theodore in action <ArrowRight size={16} />
            </a>
            <a
              href={applyHref}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/60 backdrop-blur-sm px-6 py-3 text-[15px] font-medium text-black/75 hover:bg-white transition-colors"
            >
              Reply to Ben
            </a>
          </div>
        </section>
      )}

      {/* Hero (only for the generic /creators page) */}
      {!creator && (
        <section className="flex flex-col items-center px-6 sm:px-10 pt-12 pb-16 sm:pt-20 sm:pb-24 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-6 animate-fade-in">
            <Mic size={12} />
            Creator Program
          </div>

          <h1 className="mb-5 font-serif text-[clamp(2.2rem,6vw,4rem)] leading-[1.06] tracking-[-0.025em] text-black animate-fade-in" style={{ animationDelay: '80ms' }}>
            Turn your audience into <span className="italic">authors.</span>
          </h1>

          <p className="text-base sm:text-lg text-black/55 leading-relaxed max-w-xl mb-10 animate-fade-in" style={{ animationDelay: '160ms' }}>
            Partner with Theodore and give your audience a full month of our writing + audiobook studio — free. Earn on every signup. Earn again when they stick around.
          </p>

          <div className="animate-fade-in" style={{ animationDelay: '240ms' }}>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1c1c1e] px-6 py-3 text-[15px] font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-transform"
            >
              See Theodore in action <ArrowRight size={16} />
            </a>
          </div>
        </section>
      )}

      {/* The offer */}
      <section className="w-full max-w-4xl mx-auto px-6 sm:px-10 pb-16">
        <div className="rounded-3xl border border-black/[0.06] bg-white/70 backdrop-blur-sm p-8 sm:p-12 animate-fade-in" style={{ animationDelay: '320ms' }}>
          <div className="text-center mb-8">
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-2">
              <Gift size={12} className="inline -mt-0.5 mr-1" />
              What your audience gets
            </p>
            <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-black mb-3">
              One month of <span className="italic">Writer</span>, on the house.
            </h2>
            <p className="text-sm sm:text-base text-black/55 max-w-xl mx-auto leading-relaxed">
              $10/mo of Theodore — 2,500 credits, enough to take a single sentence and ship a fully narrated audiobook. Your code unlocks it; they pay nothing for the first month.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            <span className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium text-black/60">2,500 credits</span>
            <span className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium text-black/60">Full audiobook pipeline</span>
            <span className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium text-black/60">Voice characters</span>
            <span className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium text-black/60">Chapter planning</span>
            <span className="rounded-full bg-black/[0.04] px-3 py-1.5 font-medium text-black/60">No card required</span>
          </div>
        </div>
      </section>

      {/* Earnings */}
      <section className="w-full max-w-4xl mx-auto px-6 sm:px-10 pb-20">
        <div className="text-center mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-2">
            <DollarSign size={12} className="inline -mt-0.5 mr-1" />
            What you earn
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-black">
            Paid twice for every good fit.
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {EARNINGS.map(({ icon: Icon, amount, label, desc }, i) => (
            <div
              key={label}
              className="rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-sm p-6 animate-fade-in"
              style={{ animationDelay: `${400 + i * 120}ms` }}
            >
              <div className="w-10 h-10 rounded-xl bg-black/[0.04] flex items-center justify-center mb-4">
                <Icon size={20} strokeWidth={1.6} />
              </div>
              <div className="font-serif text-3xl tracking-tight mb-1">{amount}</div>
              <div className="text-[13px] font-semibold text-black/70 mb-2">{label}</div>
              <p className="text-sm text-black/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-4xl mx-auto px-6 sm:px-10 pb-20">
        <div className="text-center mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-2">
            <Sparkles size={12} className="inline -mt-0.5 mr-1" />
            How it works
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-black">Three steps, then you're live.</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="relative rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-sm p-6 animate-fade-in"
              style={{ animationDelay: `${500 + i * 120}ms` }}
            >
              <div className="absolute top-5 right-5 font-serif text-2xl text-black/15">{i + 1}</div>
              <div className="w-10 h-10 rounded-xl bg-black/[0.04] flex items-center justify-center mb-4">
                <Icon size={20} strokeWidth={1.6} />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-sm text-black/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Who we're looking for */}
      <section className="w-full max-w-3xl mx-auto px-6 sm:px-10 pb-20 text-center">
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-3">
          Who we're looking for
        </p>
        <p className="font-serif text-xl sm:text-2xl leading-relaxed text-black/80 tracking-tight">
          AI tool reviewers. Writers and storytellers. Indie authors and audiobook folks. Productivity and creator-economy channels. If your audience builds, writes, or creates — you're a fit.
        </p>
      </section>

      {/* FAQ */}
      <section className="w-full max-w-2xl mx-auto px-6 sm:px-10 pb-24">
        <div className="text-center mb-10">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-2">Questions</p>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-black">The stuff you'd ask anyway.</h2>
        </div>
        <div className="space-y-2">
          {FAQ.map((item, i) => (
            <div
              key={item.q}
              className="rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-sm overflow-hidden"
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 hover:bg-white/40 transition-colors"
              >
                <span className="font-medium text-sm text-black/85">{item.q}</span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'flex-shrink-0 text-black/40 transition-transform duration-200',
                    openFaq === i && 'rotate-180'
                  )}
                />
              </button>
              <div
                className={cn(
                  'grid transition-all duration-300',
                  openFaq === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm text-black/55 leading-relaxed">{item.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Apply CTA */}
      <section className="w-full max-w-3xl mx-auto px-6 sm:px-10 pb-24">
        <div className="rounded-3xl bg-[#1c1c1e] text-white p-10 sm:p-14 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight mb-4">
            Let's build something with your audience.
          </h2>
          <p className="text-white/60 mb-8 max-w-lg mx-auto leading-relaxed">
            We're onboarding creators in small waves so we can actually support you. Tell us about your channel and we'll get back within a couple of days.
          </p>
          <a
            href={applyHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 text-[15px] font-semibold text-black hover:bg-white/90 hover:-translate-y-0.5 transition-all"
          >
            Apply to join <ArrowRight size={16} />
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-black/[0.06] py-6 text-center text-xs text-black/30">
        Theodore · Built for writers who think in systems
      </footer>
    </div>
  );
}
