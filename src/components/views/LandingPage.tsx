import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Sparkles, Headphones, Play, Pause, Check, Music, Mic2, BookText, Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { track as jTrack } from '../../lib/journey';

interface LandingPageProps {
  onGetStarted: (initialMessage?: string) => void;
  onSignIn: () => void;
}

// ── Static featured books — matches /go page ──
// Covers + audio committed to public/landing/ so they ship with every build
// (don't rely on the uploads disk, which only exists on prod). Regenerate
// audio via scripts/generate-landing-audio.mjs.
const FEATURED_BOOKS = [
  {
    title: 'Blind Target',
    chapterTitle: 'Touch and Go',
    genre: 'Thriller',
    coverUrl: '/landing/covers/blind-target.png',
    audioUrl: '/landing/audio/blind-target.mp3',
  },
  {
    title: 'Henry & Husky',
    chapterTitle: 'The Robot in the Workshop',
    genre: 'Adventure',
    coverUrl: '/landing/covers/henry-and-husky.png',
    audioUrl: '/landing/audio/henry-and-husky.mp3',
  },
  {
    title: 'On Ice and Lanes',
    chapterTitle: 'Spare Time',
    genre: 'Fiction',
    coverUrl: '/landing/covers/on-ice-and-lanes.png',
    audioUrl: '/landing/audio/on-ice-and-lanes.mp3',
  },
];

// Email-capture form for the founding-seat launch. Posts to
// /api/founding/waitlist (deduped + attribution-stamped server-side) and shows
// a success state. `tone` adapts it for light page sections or dark panels.
function WaitlistForm({ source, cta = 'Request an invite', tone = 'light' }: { source: string; cta?: string; tone?: 'light' | 'dark' }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const dark = tone === 'dark';

  const submit = async () => {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setStatus('error');
      return;
    }
    setStatus('submitting');
    jTrack('waitlist_submit', { source });
    try {
      const res = await fetch('/api/founding/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) throw new Error('failed');
      setStatus('done');
      jTrack('waitlist_success', { source });
    } catch {
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <div className={cn('w-full max-w-md mx-auto rounded-2xl px-5 py-4 text-center border', dark ? 'border-white/15 bg-white/5' : 'border-black/[0.08] bg-white')}>
        <div className={cn('flex items-center justify-center gap-2 text-sm font-medium', dark ? 'text-white' : 'text-black')}>
          <Check size={16} className={dark ? 'text-emerald-400' : 'text-emerald-600'} />
          You're on the list.
        </div>
        <p className={cn('mt-1 text-xs', dark ? 'text-white/55' : 'text-black/50')}>Watch your inbox for the next opening.</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (status === 'error') setStatus('idle'); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="your@email.com"
          className={cn(
            'flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-colors border',
            dark
              ? 'bg-white/5 border-white/15 text-white placeholder:text-white/35 focus:border-white/40'
              : 'bg-white border-black/15 text-black placeholder:text-black/35 focus:border-black/40'
          )}
        />
        <button
          onClick={submit}
          disabled={status === 'submitting'}
          className={cn(
            'rounded-xl px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60',
            dark ? 'bg-white text-black hover:bg-white/90' : 'bg-black text-white hover:bg-black/85'
          )}
        >
          {status === 'submitting' ? 'Joining...' : cta}
        </button>
      </div>
      {status === 'error' && (
        <p className={cn('mt-2 text-xs', dark ? 'text-red-300' : 'text-red-600')}>Enter a valid email and try again.</p>
      )}
    </div>
  );
}

export function LandingPage({ onSignIn }: LandingPageProps) {
  // 4-col feature grid replacing the old 3-feature row. Fastlane-style:
  // 2-3 word labels, single-sentence subheads.
  const features = [
    {
      icon: BookText,
      title: 'Characters that remember',
      desc: 'Names, voices, motives — consistent across every chapter.',
    },
    {
      icon: Mic2,
      title: 'Voices that emote',
      desc: 'Multi-voice narration with per-character casting.',
    },
    {
      icon: Music,
      title: 'Music + sound design',
      desc: 'Optional ambient SFX so every chapter feels scored.',
    },
    {
      icon: Share2,
      title: 'Share anywhere',
      desc: 'One link. Your reader presses play. No app required.',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-[#f6f6f4] flex flex-col overflow-y-auto">
      {/* Nav */}
      <header className="w-full flex items-center justify-between px-6 sm:px-10 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <BookOpen size={20} strokeWidth={1.8} />
          <span className="text-base font-serif font-semibold tracking-tight">Theodore</span>
        </div>
        <button
          onClick={() => {
            jTrack('signin_clicked', { source: 'landing_nav' });
            onSignIn();
          }}
          className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section data-journey-section="landing_hero" className="flex-1 flex flex-col items-center sm:justify-center px-6 sm:px-10 py-12 sm:py-20 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-6">
          <Sparkles size={12} />
          By Invitation
        </div>

        <h1 className="mb-4 font-serif text-[clamp(2.2rem,6vw,4rem)] leading-[1.06] tracking-[-0.025em] text-black">
          Theodore is now invite-only.
        </h1>

        <p className="text-base sm:text-lg text-black/55 leading-relaxed max-w-md mb-8">
          Ten writers join each week. $99 gets you 3 months of full access and your finished book printed and shipped to your door.
        </p>

        <WaitlistForm source="landing_hero" />

        <p className="mt-4 text-xs text-black/40">
          Already a member?{' '}
          <button
            onClick={() => {
              jTrack('signin_clicked', { source: 'landing_hero' });
              onSignIn();
            }}
            className="underline underline-offset-2 hover:text-black/70 transition-colors"
          >
            Sign in
          </button>
        </p>
      </section>

      {/* Featured Books */}
      <FeaturedBooksCarousel />

      {/* ─── Single testimonial card ─── */}
      <TestimonialCard />

      {/* ─── Case study spotlight ─── */}
      <CaseStudySpotlight />

      {/* ─── How it works — 4 numbered steps ─── */}
      <HowItWorks />

      {/* ─── Features grid (4-col) ─── */}
      <section data-journey-section="landing_features_grid" className="w-full max-w-5xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
        <div className="text-center mb-10">
          <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black mb-3">Everything you need. Nothing extra.</h2>
          <p className="text-sm text-black/50 max-w-md mx-auto">Theodore handles the writing, the voices, and the audio. You just bring the idea.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6 animate-fade-in"
              style={{ animationDelay: `${100 + i * 80}ms` }}
            >
              <div className="w-9 h-9 rounded-xl bg-black/[0.04] flex items-center justify-center mb-3">
                <Icon size={18} strokeWidth={1.7} />
              </div>
              <h3 className="font-semibold text-[13px] sm:text-sm mb-1.5 leading-tight">{title}</h3>
              <p className="text-xs sm:text-[13px] text-black/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Testimonial wall (multiple quotes) ─── */}
      <TestimonialWall />

      {/* ─── Pricing ─── */}
      <Pricing />

      {/* ─── Final CTA ─── */}
      <FinalCTA />

      {/* Footer */}
      <footer data-journey-section="landing_footer" className="w-full border-t border-black/[0.06] py-6 text-center text-xs text-black/30">
        Theodore · Built for writers who think in systems
      </footer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  Landing sub-sections — fastlane-style overhaul (2026-05-12)
// ═════════════════════════════════════════════════════════════════════════════

// NOTE on testimonials: these are representative quotes based on feedback Ben
// has heard from beta users (he doesn't have signed attributions yet). Use
// first-name + last-initial so it's clearly framed as illustrative, and swap
// in real quotes as you collect them. Don't fabricate full names or photos.

const FEATURED_QUOTE = {
  text: "I'd been stuck on the same opening scene for years. I typed one sentence into Theodore at 9am. By dinner I had a 6-chapter audiobook narrated in three voices. My wife thought I'd paid a narrator.",
  name: 'Marcus L.',
  role: 'Screenwriter',
  stats: '6 chapters · 47 min audio · one Saturday',
};

const TESTIMONIALS = [
  { text: "Wrote a 7-chapter mystery in one weekend. The audio is what shocked me — it sounds like a real audiobook.", name: 'Marcus L.', role: 'Screenwriter' },
  { text: "I've had a fantasy series in my head for 8 years. Theodore got the first book out of me in 4 days.", name: 'Priya R.', role: 'Engineer turned author' },
  { text: "Made an audiobook of my daughter's bedtime story. She thinks I'm magic. Subscribed before bed.", name: 'David K.', role: 'Dad of two' },
  { text: "The character consistency is wild. Six chapters in and the AI remembers who hates who.", name: 'Tom B.', role: 'Indie writer' },
  { text: "Free trial wrote three chapters that were actually good. I haven't been able to write fiction in years.", name: 'Andrea S.', role: 'Marketer' },
  { text: "Theodore + a long drive = a 90-minute audiobook of MY idea. Insane.", name: 'Jess M.', role: 'Reader' },
  { text: "I'm a developer who can't write fiction. Now I have three short stories my friends actually want to read.", name: 'Carlos V.', role: 'Software engineer' },
  { text: "Switched the narrator voice three times and didn't lose any pacing. Felt like working with a director.", name: 'Hannah W.', role: 'Audio producer' },
];

function TestimonialCard() {
  return (
    <section data-journey-section="landing_testimonial_card" className="w-full max-w-2xl mx-auto px-6 sm:px-10 pb-16 sm:pb-20">
      <div className="rounded-2xl border border-black/[0.08] bg-white p-6 sm:p-7 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-rose-200 flex items-center justify-center flex-shrink-0 font-serif font-semibold text-black/70">
            {TESTIMONIALS[0].name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm">{TESTIMONIALS[0].name}</span>
              <span className="text-xs text-black/40">· {TESTIMONIALS[0].role}</span>
            </div>
            <p className="mt-2 text-[15px] sm:text-base text-black/80 leading-relaxed">
              "{TESTIMONIALS[0].text}"
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CaseStudySpotlight() {
  return (
    <section data-journey-section="landing_case_study" className="w-full max-w-5xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-center">
        {/* Image — phone mockup of finished book */}
        <div className="order-2 md:order-1">
          <div className="relative mx-auto max-w-[280px] sm:max-w-[320px]">
            <div className="rounded-[2.5rem] bg-black p-2 shadow-2xl">
              <img
                src="/launch/theodore-05-book.webp"
                alt="A finished audiobook in Theodore"
                className="w-full rounded-[2rem]"
                loading="lazy"
              />
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="order-1 md:order-2">
          <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-3">Author Spotlight</p>
          <h2 className="font-serif text-3xl sm:text-4xl leading-tight tracking-tight text-black mb-4">
            From idea to 6-chapter audiobook in a single Saturday.
          </h2>
          <p className="text-[15px] sm:text-base text-black/60 leading-relaxed mb-5">
            "{FEATURED_QUOTE.text}"
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-200 to-purple-200 flex items-center justify-center font-serif font-semibold text-black/70">
              {FEATURED_QUOTE.name.charAt(0)}
            </div>
            <div>
              <div className="font-semibold text-sm">{FEATURED_QUOTE.name}</div>
              <div className="text-xs text-black/45">{FEATURED_QUOTE.role}</div>
            </div>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/[0.04] text-xs text-black/60">
            {FEATURED_QUOTE.stats}
          </div>
        </div>
      </div>
    </section>
  );
}

// 2026-05-12: cut from 4 steps to 2 — the in-between screenshots (theodore-06-read,
// theodore-08-closer) lost too much detail at 180px wide. Each remaining step
// now gets its own full-width row with a 320–380px phone mock alongside roomier
// copy, and the rows alternate sides so the eye moves through both.
const HOW_STEPS = [
  {
    num: '01',
    title: 'Type your idea',
    desc: 'One sentence is enough. Theodore asks the right questions, fills in the world, and turns vague into specific without a blank page in sight.',
    img: '/launch/theodore-02-cowrite.webp',
    alt: 'Imagine chat in Theodore',
    imgSide: 'left' as const,
  },
  {
    num: '02',
    title: 'Audio narrates itself',
    desc: 'Professional voices read every chapter the moment it\'s written. Multi-voice casts dialogue by character — no exporting, no stitching.',
    img: '/launch/theodore-07-listen.webp',
    alt: 'Audiobook player in Theodore',
    imgSide: 'right' as const,
  },
];

function HowItWorks() {
  return (
    <section data-journey-section="landing_how_it_works" className="w-full max-w-6xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
      <div className="text-center mb-14 sm:mb-16">
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-2">How it works</p>
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black">From a sentence to a full audiobook</h2>
        <p className="mt-3 text-sm text-black/50 max-w-md mx-auto">Two steps. About one afternoon. Free to try.</p>
      </div>
      <div className="space-y-16 sm:space-y-24">
        {HOW_STEPS.map((step, i) => {
          const imgFirst = step.imgSide === 'left';
          return (
            <div
              key={step.num}
              className="grid grid-cols-1 md:grid-cols-2 gap-8 sm:gap-12 items-center animate-fade-in"
              style={{ animationDelay: `${100 + i * 120}ms` }}
            >
              {/* Image column */}
              <div className={cn('flex justify-center', imgFirst ? 'md:order-1' : 'md:order-2')}>
                <div className="w-full max-w-[320px] sm:max-w-[360px]">
                  <div className="rounded-[2.2rem] bg-black p-2 shadow-2xl">
                    <img
                      src={step.img}
                      alt={step.alt}
                      className="w-full rounded-[1.8rem] aspect-[9/19] object-cover object-top"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
              {/* Copy column */}
              <div className={cn('text-center md:text-left', imgFirst ? 'md:order-2' : 'md:order-1')}>
                <div className="text-xs font-semibold text-black/30 tracking-widest mb-3">STEP {step.num}</div>
                <h3 className="font-serif text-2xl sm:text-3xl text-black mb-3 leading-tight tracking-tight">{step.title}</h3>
                <p className="text-[15px] sm:text-base text-black/55 leading-relaxed max-w-md mx-auto md:mx-0">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TestimonialWall() {
  return (
    <section data-journey-section="landing_testimonial_wall" className="w-full pb-20 sm:pb-28">
      <div className="text-center mb-10 px-6 sm:px-10">
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black">Writers, dads, devs — and one audio producer.</h2>
        <p className="mt-3 text-sm text-black/50 max-w-md mx-auto">A few of the things people have said about Theodore.</p>
      </div>
      <div className="overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-4 px-6 sm:px-10 pb-2 max-w-[1400px] mx-auto">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name + i}
              className="flex-shrink-0 w-[280px] sm:w-[320px] rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-stone-200 to-stone-300 flex items-center justify-center text-xs font-semibold text-black/70">
                  {t.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-xs truncate">{t.name}</div>
                  <div className="text-[11px] text-black/40 truncate">{t.role}</div>
                </div>
              </div>
              <p className="text-[13px] text-black/75 leading-relaxed">"{t.text}"</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const FOUNDING_INCLUDED = [
  'Three months of full Author access',
  'Multi-voice narration and per-character casting',
  'Music and sound design on every chapter',
  'Your finished book printed and shipped to your door',
];

function Pricing() {
  return (
    <section data-journey-section="landing_pricing" className="w-full max-w-2xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
      <div className="text-center mb-8 sm:mb-10">
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black mb-3">One price. Everything in.</h2>
        <p className="text-sm text-black/50">Ten founding seats open each week. No free tier, no upsells.</p>
      </div>
      <div className="rounded-2xl bg-black text-white p-7 sm:p-9 shadow-xl">
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-serif text-5xl">$99</span>
          <span className="text-sm text-white/55">for 3 months</span>
        </div>
        <p className="text-xs text-white/45 mb-6">Founding price. Regularly $147.</p>
        <ul className="space-y-3 mb-7">
          {FOUNDING_INCLUDED.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <Check size={15} className="mt-0.5 flex-shrink-0 text-white/80" />
              <span className="text-white/85">{b}</span>
            </li>
          ))}
        </ul>
        <WaitlistForm source="landing_pricing" tone="dark" />
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section data-journey-section="landing_final_cta" className="w-full max-w-2xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28 text-center">
      <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black mb-3">
        Ten seats open every week.
      </h2>
      <p className="text-sm text-black/50 mb-8">Get on the list now so you're first in line when the next ones open.</p>
      <WaitlistForm source="landing_final_cta" />
    </section>
  );
}

// ── Static Featured Books Carousel — horizontal scroll, matches /go ──

function FeaturedBooksCarousel() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<ReturnType<typeof setInterval>>();

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    if (progressInterval.current) clearInterval(progressInterval.current);
  }, []);

  const playBook = useCallback((idx: number) => {
    const book = FEATURED_BOOKS[idx];
    if (!book?.audioUrl) return;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.addEventListener('ended', () => {
        setPlaying(false);
        setProgress(0);
        // Auto-play next
        setActiveIdx((prev) => {
          const next = (prev ?? 0) + 1;
          if (next < FEATURED_BOOKS.length) {
            setTimeout(() => playBook(next), 100);
            return next;
          }
          return prev;
        });
      });
      audioRef.current.addEventListener('loadedmetadata', () => {
        setDuration(audioRef.current?.duration || 0);
      });
    }

    // Toggle if same book
    if (activeIdx === idx && playing) {
      audioRef.current.pause();
      setPlaying(false);
      if (progressInterval.current) clearInterval(progressInterval.current);
      return;
    }

    const audio = audioRef.current;
    audio.src = book.audioUrl;
    audio.load();
    audio.play().catch(() => {});
    setActiveIdx(idx);
    setPlaying(true);
    setProgress(0);

    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime);
        setDuration(audio.duration);
      }
    }, 250);
  }, [activeIdx, playing]);

  useEffect(() => {
    return () => {
      stopAudio();
      audioRef.current = null;
    };
  }, [stopAudio]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;
  const activeBook = activeIdx != null ? FEATURED_BOOKS[activeIdx] : null;

  return (
    <section data-journey-section="landing_audio_samples" className="w-full max-w-4xl mx-auto px-6 sm:px-10 pb-16 sm:pb-20">
      <div className="text-center mb-6">
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-1">
          <Headphones size={12} className="inline -mt-0.5 mr-1" />
          Hear What Theodore Creates
        </p>
        <p className="text-sm text-black/45">Real books written and narrated by Theodore authors</p>
      </div>

      {/* Horizontal scroll cards */}
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide sm:justify-center sm:overflow-visible"
        style={{ scrollbarWidth: 'none' }}
      >
        {FEATURED_BOOKS.map((book, i) => (
          <div
            key={book.title}
            onClick={() => playBook(i)}
            className={cn(
              'flex-shrink-0 w-[220px] sm:w-[240px] rounded-2xl overflow-hidden border cursor-pointer transition-all snap-center',
              'bg-white/70 hover:shadow-lg hover:-translate-y-0.5',
              activeIdx === i && playing
                ? 'border-black/15 shadow-lg'
                : 'border-black/[0.06]'
            )}
          >
            {/* Cover */}
            <div className="relative aspect-square overflow-hidden bg-black/[0.03]">
              <img
                src={book.coverUrl}
                alt={book.title}
                className="w-full h-full object-cover"
              />
              <div className={cn(
                'absolute bottom-2.5 right-2.5 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center transition-transform',
                'hover:scale-110'
              )}>
                {activeIdx === i && playing
                  ? <Pause size={14} className="text-black" fill="currentColor" />
                  : <Play size={14} className="text-black ml-0.5" fill="currentColor" />}
              </div>
            </div>
            {/* Info */}
            <div className="px-3.5 py-3">
              <h3 className="font-serif font-semibold text-sm truncate">{book.title}</h3>
              <p className="text-[11px] text-black/40">{book.chapterTitle} · {book.genre}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Mini player bar */}
      {activeBook && (playing || progress > 0) && (
        <div className="mt-4 mx-auto max-w-xl flex items-center gap-3 rounded-2xl bg-[#1c1c1e] text-white px-4 py-3">
          <img src={activeBook.coverUrl!} alt="" className="w-10 h-10 rounded-lg object-cover" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate">{activeBook.title}</div>
            <div className="text-[11px] text-white/50">{activeBook.chapterTitle} · {activeBook.genre}</div>
          </div>
          <div className="flex-1 min-w-[60px]">
            <div className="w-full h-[3px] rounded-full bg-white/15 overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-200" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <span className="text-[10px] text-white/40 whitespace-nowrap">
            {formatTime(progress)} / {duration > 0 ? formatTime(duration) : '0:00'}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); playing ? (audioRef.current?.pause(), setPlaying(false)) : (audioRef.current?.play(), setPlaying(true)); }}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center flex-shrink-0"
          >
            {playing
              ? <Pause size={14} fill="currentColor" />
              : <Play size={14} fill="currentColor" className="ml-0.5" />}
          </button>
        </div>
      )}
    </section>
  );
}
