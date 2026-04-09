import { useState, useEffect, useRef } from 'react';
import { ArrowUp, BookOpen, Sparkles, Headphones, Layers, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LandingPageProps {
  onGetStarted: (initialMessage?: string) => void;
  onSignIn: () => void;
}

const PROMPT_SUGGESTIONS = [
  'A grief-struck botanist finds a greenhouse that should not exist.',
  'Southern gothic. Humid. Suspicious.',
  'A prodigal son returns home and learns the town has been waiting.',
  "A children's book about a fox afraid of the dark.",
  'Two astronauts stranded on a generation ship that forgot its mission.',
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const rotatingWords = ['impulse', 'inspiration', 'intention', 'insight', 'instinct', 'ambition', 'aspiration', 'objective', 'outline', 'idea'];
  const [wordIndex, setWordIndex] = useState(0);
  const [speedStep, setSpeedStep] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const speedCurveMs = [1000, 900, 820, 760, 700, 660, 620, 590, 560, 540];
  const finalWordIndex = rotatingWords.length - 1;

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
    const text = input.trim();
    onGetStarted(text || undefined);
  };

  const features = [
    {
      icon: Headphones,
      title: 'Idea to Audiobook',
      desc: 'Type a sentence. Get a full audiobook — narrated, chapter by chapter.',
    },
    {
      icon: Sparkles,
      title: 'AI That Knows Your Story',
      desc: 'Characters, locations, and lore stay consistent across every chapter.',
    },
    {
      icon: Zap,
      title: 'One Seamless Pipeline',
      desc: 'Write, edit, and listen — all in one place. No exports, no stitching.',
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
          onClick={onSignIn}
          className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-12 sm:py-20 text-center max-w-3xl mx-auto">
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
          Type one sentence. Theodore turns it into a novel — then reads it to you.
        </p>

        {/* Inline chat input — Motion.so style */}
        <div className="w-full max-w-lg">
          <div className="rounded-2xl bg-[#1c1c1e] shadow-[0_8px_40px_rgba(0,0,0,0.15)] overflow-hidden">
            <div className="flex items-end gap-2 p-4">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Describe your story idea..."
                rows={3}
                className="flex-1 bg-transparent text-white/90 placeholder:text-white/30 text-sm resize-none outline-none px-2 py-2 min-h-[4.5rem] max-h-[5.5rem]"
              />
              <button
                onClick={handleSubmit}
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all mb-0.5',
                  input.trim()
                    ? 'bg-white text-black hover:bg-white/90'
                    : 'bg-white/10 text-white/30'
                )}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-black/35 italic">Don't overthink it — even one sentence is enough.</p>

          {/* Prompt suggestion pills */}
          <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-1.5 mt-3">
            {PROMPT_SUGGESTIONS.slice(0, 3).map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  setInput(prompt);
                  inputRef.current?.focus();
                }}
                className="text-[11px] px-3 py-1.5 rounded-full border border-black/[0.08] text-black/45 hover:text-black/70 hover:border-black/15 hover:bg-white/60 transition-all text-left"
              >
                "{prompt}"
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs text-black/30">Free to start · No credit card required</p>
        </div>
      </section>

      {/* Features */}
      <section className="w-full max-w-4xl mx-auto px-6 sm:px-10 pb-20 sm:pb-28">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className="rounded-2xl border border-black/[0.06] bg-white/60 backdrop-blur-sm p-6 animate-fade-in"
              style={{ animationDelay: `${300 + i * 120}ms` }}
            >
              <div className="w-10 h-10 rounded-xl bg-black/[0.04] flex items-center justify-center mb-4">
                <Icon size={20} strokeWidth={1.6} />
              </div>
              <h3 className="font-semibold text-sm mb-1.5">{title}</h3>
              <p className="text-sm text-black/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full border-t border-black/[0.06] py-6 text-center text-xs text-black/30">
        Theodore · Built for writers who think in systems
      </footer>
    </div>
  );
}
