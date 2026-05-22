import { useEffect, useRef, useState } from 'react';
import { X, Apple, ChevronLeft, ChevronRight } from 'lucide-react';

export type IosLaunchScreenshot = { src: string; alt: string };

export const APP_STORE_URL = 'https://apps.apple.com/app/id6762391179';

export type IosLaunchModalProps = {
  open: boolean;
  onClose: () => void;
  /** Called when the user taps "Get it on the App Store". Used to mark seen on the server. */
  onGetApp: () => Promise<void> | void;
  /** Phone-framed screenshots for the carousel. */
  screenshots?: IosLaunchScreenshot[];
};

const DEFAULT_SCREENSHOTS: IosLaunchScreenshot[] = [
  { src: '/launch/theodore-01-hook.webp', alt: 'Theodore — your AI co-writer' },
  { src: '/launch/theodore-02-cowrite.webp', alt: 'Co-write chapters with AI' },
  { src: '/launch/theodore-03-voice.webp', alt: 'Voice mode — talk through your story' },
  { src: '/launch/theodore-04-world.webp', alt: 'World wiki and canon' },
  { src: '/launch/theodore-05-book.webp', alt: 'Generate a book cover' },
  { src: '/launch/theodore-06-read.webp', alt: 'Read your story' },
  { src: '/launch/theodore-07-listen.webp', alt: 'Listen with narrated audio' },
  { src: '/launch/theodore-08-closer.webp', alt: 'Start writing on iPhone' },
];

export function IosLaunchModal({
  open,
  onClose,
  onGetApp,
  screenshots = DEFAULT_SCREENSHOTS,
}: IosLaunchModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Track which slide is centered for the dot indicator.
  useEffect(() => {
    const el = trackRef.current;
    if (!el || !open) return;
    const onScroll = () => {
      const slideW = el.clientWidth;
      if (slideW <= 0) return;
      const idx = Math.round(el.scrollLeft / slideW);
      setActiveIndex(idx);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const handleGetApp = () => {
    // Fire-and-forget: mark seen on the server, open the App Store, close.
    void onGetApp();
    window.open(APP_STORE_URL, '_blank', 'noopener');
    onClose();
  };

  const scrollToIndex = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-md px-3 sm:px-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[92vh] overflow-hidden rounded-3xl bg-bg shadow-2xl border border-black/10 flex flex-col animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>

        {/* Hero carousel */}
        <div className="relative bg-gradient-to-br from-[#1a1a1d] via-[#0f0f12] to-[#1a1a1d] pt-10 pb-6 px-6 sm:px-10">
          <div className="flex items-center justify-center gap-2 mb-5">
            <Apple size={14} className="text-white/70" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold">
              Now on iOS
            </span>
          </div>

          <div className="relative">
            <div
              ref={trackRef}
              className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-6 sm:-mx-10 px-6 sm:px-10 gap-4"
            >
              {screenshots.map((s, i) => (
                <div
                  key={s.src + i}
                  className="snap-center shrink-0 w-full flex justify-center"
                >
                  <PhoneFrame>
                    <img
                      src={s.src}
                      alt={s.alt}
                      className="w-full h-full object-cover"
                      draggable={false}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  </PhoneFrame>
                </div>
              ))}
            </div>

            {/* Desktop arrows */}
            <button
              onClick={() => scrollToIndex(Math.max(0, activeIndex - 1))}
              disabled={activeIndex === 0}
              aria-label="Previous slide"
              className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur items-center justify-center text-white transition-all disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => scrollToIndex(Math.min(screenshots.length - 1, activeIndex + 1))}
              disabled={activeIndex === screenshots.length - 1}
              aria-label="Next slide"
              className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 backdrop-blur items-center justify-center text-white transition-all disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Dot indicator */}
          <div className="flex justify-center gap-1.5 mt-4">
            {screenshots.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollToIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Copy + CTAs */}
        <div className="px-6 sm:px-8 py-6 sm:py-7 flex flex-col items-center text-center overflow-y-auto">
          <h2 className="text-2xl sm:text-3xl font-serif font-bold text-text-primary leading-tight mb-2">
            Theodore is now on iPhone
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            Live on the App Store today. Write, narrate, and listen on the go — your projects sync automatically.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-black/10 text-sm font-semibold text-text-primary hover:bg-black/5 transition-colors order-2 sm:order-1"
            >
              Maybe later
            </button>
            <button
              onClick={handleGetApp}
              className="flex-1 py-3 rounded-xl bg-text-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 order-1 sm:order-2"
            >
              <Apple size={15} />
              Get it on the App Store
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[200px] sm:w-[230px] aspect-[9/19.5] rounded-[34px] bg-black p-[6px] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
      <div className="relative w-full h-full rounded-[28px] overflow-hidden bg-bg">
        {children}
        {/* Notch */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-[55px] h-[16px] bg-black rounded-full z-10" />
      </div>
    </div>
  );
}
