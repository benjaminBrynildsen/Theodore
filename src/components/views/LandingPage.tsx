import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowUp, BookOpen, Sparkles, Headphones, Zap, Play, Pause } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  'Southern gothic. Humid. Suspicious.',
  'A spy who can\'t remember his mission.',
  'Haunted lighthouse. Two sisters. One secret.',
  'Robots raising a human child.',
  'A heist on a moving train.',
];

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const rotatingWords = ['impulse', 'inspiration', 'intention', 'insight', 'instinct', 'ambition', 'aspiration', 'objective', 'outline', 'idea'];
  const [wordIndex, setWordIndex] = useState(0);
  const [speedStep, setSpeedStep] = useState(0);
  const [wordVisible, setWordVisible] = useState(true);
  const [input, setInput] = useState(() => SHORT_PROMPTS[Math.floor(Math.random() * SHORT_PROMPTS.length)]);
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
      <section className="flex-1 flex flex-col items-center sm:justify-center px-6 sm:px-10 py-12 sm:py-20 text-center max-w-3xl mx-auto">
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
                className="flex-1 bg-transparent text-white/90 placeholder:text-white/30 text-base sm:text-sm resize-none outline-none px-2 py-2 min-h-[4.5rem] max-h-[5.5rem]"
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
        </div>
      </section>

      {/* Featured Books */}
      <FeaturedBooksCarousel />

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
    <section className="w-full max-w-4xl mx-auto px-6 sm:px-10 pb-16 sm:pb-20">
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
