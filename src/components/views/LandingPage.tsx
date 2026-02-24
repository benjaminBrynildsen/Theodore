import { useState, useEffect } from 'react';
import { ArrowRight, BookOpen, Sparkles, Layers, Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const rotatingWords = ['impulse', 'inspiration', 'intention', 'insight', 'instinct', 'ambition', 'aspiration', 'objective', 'outline', 'idea'];
  const [wordIndex, setWordIndex] = useState(0);
  const [speedStep, setSpeedStep] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
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

  const features = [
    {
      icon: Sparkles,
      title: 'AI-Powered Writing',
      desc: 'Premium models craft prose that sounds like you, not a machine.',
    },
    {
      icon: Layers,
      title: 'Living Canon',
      desc: 'Characters, locations, and lore that stay consistent across every chapter.',
    },
    {
      icon: Zap,
      title: 'Idea to Published',
      desc: 'From first spark to Amazon KDP — one seamless pipeline.',
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
          onClick={onGetStarted}
          className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          Sign in
        </button>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 py-16 sm:py-24 text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold text-black/40 mb-6">
          <Sparkles size={12} />
          Story Engine
        </div>

        <h1 className="font-serif text-[clamp(2.2rem,6vw,4rem)] leading-[1.06] tracking-[-0.025em] text-black mb-6">
          All you need is an{' '}
          <span className="inline-flex items-baseline">
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

        <p className="text-lg sm:text-xl text-black/55 leading-relaxed max-w-xl mb-10">
          Theodore turns your story ideas into fully realized novels — with AI that understands your characters, your world, and your voice.
        </p>

        <button
          onClick={onGetStarted}
          className="group inline-flex items-center gap-2.5 bg-black text-white rounded-2xl px-8 py-4 text-base font-semibold hover:shadow-[0_8px_30px_rgba(0,0,0,0.2)] active:scale-[0.98] transition-all duration-200"
        >
          Start Writing
          <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </button>

        <p className="mt-4 text-xs text-black/35">Free to start · No credit card required</p>
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
