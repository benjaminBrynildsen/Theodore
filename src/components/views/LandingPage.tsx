import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, BookOpen, Sparkles, Headphones, Zap, Play, Pause, Check, Music, Mic2, BookText, Share2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { track as jTrack } from '../../lib/journey';

interface LandingPageProps {
  onGetStarted: (initialMessage?: string) => void;
  onSignIn: () => void;
}

// ── Static featured books — matches /go page ──
const FEATURED_BOOKS = [
  {
    title: 'Blind Target',
    chapterTitle: 'Touch and Go',
    genre: 'Thriller',
    coverUrl: '/uploads/covers/343d93d9-1525-40fe-82cd-83b07e1bfcfb.png',
    audioUrl: '/uploads/audio/ch-2d1e25b52425.mp3',
  },
  {
    title: 'Henry & Husky',
    chapterTitle: 'The Robot in the Workshop',
    genre: 'Adventure',
    coverUrl: '/uploads/covers/f97a37c5-02d0-4526-b73d-3b8452ce8974.png',
    audioUrl: '/uploads/audio/ch-0b359cb08418.mp3',
  },
  {
    title: 'On Ice and Lanes',
    chapterTitle: 'Spare Time',
    genre: 'Fiction',
    coverUrl: '/uploads/covers/b07fbe31-7eca-4432-ba84-f7a718d072ff.png',
    audioUrl: '/uploads/audio/ch-87341070a4d5.mp3',
  },
];

const SHORT_PROMPTS = [
  'A detective who solves crimes using dreams.',
  'A spy who can\'t remember his mission.',
  'A blind assassin hired to kill the president.',
  'Robots raising a human child.',
  'A heist on a moving train.',
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const rotatingWords = ['impulse', 'inspiration', 'intention', 'insight', 'instinct', 'ambition', 'aspiration', 'objective', 'outline', 'idea'];
  const [wordIndex, setWordIndex] = useState(0);
  const [speedStep, setSpeedStep] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [input, setInput] = useState('');
  const [animatedText, setAnimatedText] = useState('');
  const [userInteracted, setUserInteracted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speedCurveMs = [1000, 900, 820, 760, 700, 660, 620, 590, 560, 540];
  const finalWordIndex = rotatingWords.length - 1;

  // Typewriter for the chat input: cycles through SHORT_PROMPTS with a
  // blinking caret until the user clicks/types. On interaction, hand off
  // the currently-visible text as the input value so they can submit
  // immediately without having to type anything.
  useEffect(() => {
    if (userInteracted) return;
    let charIdx = 0;
    let promptIdx = Math.floor(Math.random() * SHORT_PROMPTS.length);
    let phase: 'typing' | 'holding' | 'deleting' = 'typing';
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const prompt = SHORT_PROMPTS[promptIdx];
      switch (phase) {
        case 'typing':
          charIdx += 1;
          setAnimatedText(prompt.slice(0, charIdx));
          if (charIdx >= prompt.length) {
            phase = 'holding';
            timer = setTimeout(tick, 2000);
          } else {
            timer = setTimeout(tick, 45 + Math.random() * 55);
          }
          break;
        case 'holding':
          phase = 'deleting';
          timer = setTimeout(tick, 30);
          break;
        case 'deleting':
          charIdx -= 1;
          setAnimatedText(prompt.slice(0, charIdx));
          if (charIdx <= 0) {
            promptIdx = (promptIdx + 1) % SHORT_PROMPTS.length;
            phase = 'typing';
            timer = setTimeout(tick, 380);
          } else {
            timer = setTimeout(tick, 22);
          }
          break;
      }
    };
    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, [userInteracted]);

  const handoffToManualInput = () => {
    if (userInteracted) return;
    setUserInteracted(true);
    setInput(animatedText);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }
    }, 0);
  };

  useEffect(() => {
    if (wordIndex >= finalWordIndex) {
      setWordVisible(true);
      return;
    }
    const delay = speedCurveMs[Math.min(speedStep, speedCurveMs.length - 1)];
    const fadeAt = Math.max(0, delay - 140);
    const hideTimeout = setTimeout(() => setWordVisible(false), fadeAt);
    const swapTimeout = setTimeout(() => {
      setWordIndex((prev) => Math.min(prev + 1, finalWordIndex));
      setWordVisible(true);
      setSpeedStep((prev) => Math.min(prev + 1, speedCurveMs.length - 1));
    }, delay);
    return () => { clearTimeout(hideTimeout); clearTimeout(swapTimeout); };
  }, [finalWordIndex, speedStep, wordIndex]);

  const handleSubmit = () => {
    const text = (userInteracted ? input : animatedText).trim();
    onGetStarted(text || undefined);
  };

  const effectiveText = userInteracted ? input : animatedText;

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
          Story Engine
        </div>

        <h1 className="mb-4 flex flex-col items-center font-serif text-[clamp(2.2rem,6vw,4rem)] leading-[1.06] tracking-[-0.025em] text-black">
          <span className="block">All you need is an</span>
          <span className="mt-1 flex min-h-[1.1em] w-[11ch] items-baseline justify-center">
            <span
              className={cn(
                'inline-block font-medium transition-all duration-200',
                wordVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              )}
            >
              {rotatingWords[wordIndex]}
            </span>
            <span
              className={cn(
                'inline-block h-[0.85em] w-[2px] translate-y-[0.06em] rounded-full bg-black/80 transition-opacity duration-200',
                wordIndex === finalWordIndex ? 'caret-blink opacity-100' : 'opacity-0'
              )}
            />
          </span>
        </h1>

        <p className="text-base sm:text-lg text-black/50 leading-relaxed max-w-md mb-8">
          Type one sentence. Get a full novel and audiobook. Free.
        </p>

        {/* Inline chat input */}
        <div className="w-full max-w-lg">
          <div className="rounded-2xl bg-[#1c1c1e] shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
            <div className="flex items-end gap-2 p-4">
              <div className="relative flex-1 min-h-[4.5rem]">
                <textarea
                  ref={inputRef}
                  value={userInteracted ? input : ''}
                  onChange={(e) => {
                    if (!userInteracted) setUserInteracted(true);
                    setInput(e.target.value);
                  }}
                  onFocus={handoffToManualInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                  placeholder={userInteracted ? 'Describe your story idea...' : ''}
                  rows={3}
                  className="w-full bg-transparent text-white/90 placeholder:text-white/30 text-base sm:text-sm resize-none outline-none px-2 py-2 min-h-[4.5rem] max-h-[5.5rem] relative z-10"
                />
                {!userInteracted && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 px-2 py-2 text-white/90 text-base sm:text-sm leading-[1.5] pointer-events-none whitespace-pre-wrap break-words"
                  >
                    <span>{animatedText}</span>
                    <span className="caret-blink inline-block align-[-0.1em] ml-[1px] w-[2px] h-[1.05em] bg-white/80 rounded-[1px]" />
                  </div>
                )}
              </div>
              <button
                onClick={handleSubmit}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5',
                  effectiveText.trim()
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-white/10 text-white/30'
                )}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-black/35 italic">Don't overthink it — even one sentence is enough.</p>
        </div>
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
      <Pricing onGetStarted={() => onGetStarted()} />

      {/* ─── Final CTA ─── */}
      <FinalCTA onGetStarted={onGetStarted} />

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

const HOW_STEPS = [
  {
    num: '01',
    title: 'Type your idea',
    desc: 'One sentence is enough. Theodore asks the right questions to fill in the world.',
    img: '/launch/theodore-02-cowrite.webp',
    alt: 'Imagine chat in Theodore',
  },
  {
    num: '02',
    title: 'Theodore writes',
    desc: 'Characters, plot, and prose — chapter by chapter, in your tone.',
    img: '/launch/theodore-06-read.webp',
    alt: 'A generated chapter in Theodore',
  },
  {
    num: '03',
    title: 'Audio narrates itself',
    desc: 'Professional voices read every chapter the moment it\'s written.',
    img: '/launch/theodore-07-listen.webp',
    alt: 'Audiobook player in Theodore',
  },
  {
    num: '04',
    title: 'Share & listen',
    desc: 'One link your friends can press play on — anywhere, no app.',
    img: '/launch/theodore-08-closer.webp',
    alt: 'Sharing a book from Theodore',
  },
];

function HowItWorks() {
  return (
    <section data-journey-section="landing_how_it_works" className="w-full max-w-6xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
      <div className="text-center mb-12 sm:mb-14">
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-2">How it works</p>
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black">From a sentence to a full audiobook</h2>
        <p className="mt-3 text-sm text-black/50 max-w-md mx-auto">Four steps. About one afternoon. Free to try.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-5">
        {HOW_STEPS.map((step, i) => (
          <div
            key={step.num}
            className="flex flex-col items-center text-center animate-fade-in"
            style={{ animationDelay: `${100 + i * 90}ms` }}
          >
            <div className="text-xs font-semibold text-black/30 tracking-widest mb-3">{step.num}</div>
            <div className="w-full max-w-[180px] mb-5">
              <div className="rounded-[1.6rem] bg-black p-1.5 shadow-xl">
                <img
                  src={step.img}
                  alt={step.alt}
                  className="w-full rounded-[1.3rem] aspect-[9/19] object-cover object-top"
                  loading="lazy"
                />
              </div>
            </div>
            <h3 className="font-serif text-lg sm:text-xl text-black mb-1.5">{step.title}</h3>
            <p className="text-sm text-black/50 leading-relaxed max-w-[20ch]">{step.desc}</p>
          </div>
        ))}
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

const PRICING_TIERS = [
  {
    tier: 'free',
    name: 'Dreamer',
    price: '$0',
    period: 'forever',
    bullets: ['500 credits / month', 'First audiobook chapter free', 'Single-voice narration', 'Share publicly'],
    cta: 'Start free',
    highlight: false,
  },
  {
    tier: 'writer',
    name: 'Writer',
    price: '$10',
    period: '/ month',
    bullets: ['2,500 credits / month', 'Multi-voice narration', 'Per-character casting', 'Priority generation'],
    cta: 'Start free',
    highlight: true,
  },
  {
    tier: 'author',
    name: 'Author',
    price: '$30',
    period: '/ month',
    bullets: ['7,500 credits / month', 'Everything in Writer', 'Music + sound effects', 'Faster audio generation'],
    cta: 'Start free',
    highlight: false,
  },
  {
    tier: 'studio',
    name: 'Studio',
    price: '$99',
    period: '/ month',
    bullets: ['25,000 credits / month', 'Everything in Author', 'ElevenLabs premium voices', 'Studio-quality output'],
    cta: 'Start free',
    highlight: false,
  },
];

function Pricing({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section data-journey-section="landing_pricing" className="w-full max-w-6xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
      <div className="text-center mb-10 sm:mb-12">
        <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black mb-3">Start free. Upgrade when you're hooked.</h2>
        <p className="text-sm text-black/50">No credit card to try. Cancel anytime.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PRICING_TIERS.map((p) => (
          <div
            key={p.tier}
            className={cn(
              'rounded-2xl p-6 flex flex-col',
              p.highlight
                ? 'bg-black text-white border border-black shadow-xl scale-[1.02]'
                : 'bg-white border border-black/[0.08]'
            )}
          >
            <div className="mb-4">
              <div className={cn('text-xs uppercase tracking-widest font-semibold mb-2', p.highlight ? 'text-white/60' : 'text-black/40')}>
                {p.name}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-serif text-3xl sm:text-4xl">{p.price}</span>
                <span className={cn('text-xs', p.highlight ? 'text-white/60' : 'text-black/45')}>{p.period}</span>
              </div>
            </div>
            <ul className="space-y-2.5 mb-6 flex-1">
              {p.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2 text-[13px] leading-relaxed">
                  <Check size={14} className={cn('mt-0.5 flex-shrink-0', p.highlight ? 'text-white/80' : 'text-black/60')} />
                  <span className={cn(p.highlight ? 'text-white/85' : 'text-black/70')}>{b}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                jTrack('pricing_cta_clicked', { tier: p.tier });
                onGetStarted();
              }}
              className={cn(
                'w-full py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]',
                p.highlight
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-black text-white hover:bg-black/85'
              )}
            >
              {p.cta}
            </button>
          </div>
        ))}
      </div>
      <p className="text-center text-xs text-black/35 mt-6">
        All plans include core writing + audio. Credits roll over each month — what you don't use, you keep.
      </p>
    </section>
  );
}

function FinalCTA({ onGetStarted }: { onGetStarted: (msg?: string) => void }) {
  const [val, setVal] = useState('');
  const submit = () => {
    jTrack('final_cta_submitted', { has_text: !!val.trim() });
    onGetStarted(val.trim() || undefined);
  };
  return (
    <section data-journey-section="landing_final_cta" className="w-full max-w-2xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28 text-center">
      <h2 className="font-serif text-3xl sm:text-4xl tracking-tight text-black mb-3">
        Type one sentence. Hear your story.
      </h2>
      <p className="text-sm text-black/50 mb-8">Free to start. Your first audiobook chapter is on us.</p>
      <div className="rounded-2xl bg-[#1c1c1e] shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
        <div className="flex items-end gap-2 p-4">
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Describe your story idea..."
            rows={2}
            className="flex-1 bg-transparent text-white/90 placeholder:text-white/30 text-base sm:text-sm resize-none outline-none px-2 py-2 min-h-[3.5rem] max-h-[5.5rem]"
          />
          <button
            onClick={submit}
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5',
              val.trim() ? 'bg-white text-black hover:bg-white/90' : 'bg-white/10 text-white/30'
            )}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
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
