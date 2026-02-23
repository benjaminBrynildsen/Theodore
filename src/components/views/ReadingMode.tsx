import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen, Minus, Plus, Sun, Moon, Coffee, List } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface Props {
  onClose: () => void;
}

type ReaderTheme = 'light' | 'sepia' | 'dark';
type FlipDir = 'next' | 'prev' | null;

function paginateProse(prose: string, fontSize: number): string[] {
  const paragraphs = prose.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return [''];

  const targetChars = Math.max(900, Math.round(2400 - (fontSize - 18) * 70));
  const pages: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) pages.push(current.trim());
    current = '';
  };

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= targetChars) {
      current = candidate;
      continue;
    }

    if (current) pushCurrent();

    let remaining = para;
    while (remaining.length > targetChars) {
      let splitAt = remaining.lastIndexOf(' ', targetChars);
      if (splitAt < Math.floor(targetChars * 0.6)) splitAt = targetChars;
      pages.push(remaining.slice(0, splitAt).trim());
      remaining = remaining.slice(splitAt).trim();
    }
    current = remaining;
  }

  pushCurrent();
  return pages.length ? pages : [''];
}

export function ReadingMode({ onClose }: Props) {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter((c) => c.prose).sort((a, b) => a.number - b.number) : [];

  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [flipDir, setFlipDir] = useState<FlipDir>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapter = chapters[currentChapterIdx];

  const themes: Record<ReaderTheme, { bg: string; text: string; accent: string; paper: string; border: string }> = {
    light: { bg: 'bg-[#f5f5f0]', text: 'text-[#2d2d2d]', accent: 'text-[#666]', paper: 'bg-white', border: 'border-[#e0e0da]' },
    sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]', accent: 'text-[#8b7355]', paper: 'bg-[#faf4e8]', border: 'border-[#d4c5a9]' },
    dark: { bg: 'bg-[#1a1a1a]', text: 'text-[#ccc]', accent: 'text-[#888]', paper: 'bg-[#242424]', border: 'border-[#333]' },
  };
  const t = themes[theme];

  const chapterPages = useMemo(() => {
    if (!chapter?.prose) return [''];
    return paginateProse(chapter.prose, fontSize);
  }, [chapter?.prose, fontSize]);

  const totalPages = chapterPages.length;
  const pageText = chapterPages[currentPage] || '';

  const globalProgress = chapters.length > 0 ? ((currentChapterIdx + 1) / chapters.length) * 100 : 0;

  const canGoPrev = currentPage > 0 || currentChapterIdx > 0;
  const canGoNext = currentPage < totalPages - 1 || currentChapterIdx < chapters.length - 1;

  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimeout.current) clearTimeout(controlsTimeout.current); };
  }, []);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentChapterIdx, fontSize]);

  const runFlip = (dir: Exclude<FlipDir, null>, action: () => void) => {
    if (isFlipping) return;
    setIsFlipping(true);
    setFlipDir(dir);
    setTimeout(() => {
      action();
      setFlipDir(null);
    }, 120);
    setTimeout(() => setIsFlipping(false), 260);
  };

  const goNext = () => {
    if (!canGoNext) return;
    runFlip('next', () => {
      if (currentPage < totalPages - 1) {
        setCurrentPage((p) => p + 1);
      } else if (currentChapterIdx < chapters.length - 1) {
        setCurrentChapterIdx((c) => c + 1);
        setCurrentPage(0);
      }
    });
  };

  const goPrev = () => {
    if (!canGoPrev) return;
    runFlip('prev', () => {
      if (currentPage > 0) {
        setCurrentPage((p) => p - 1);
      } else if (currentChapterIdx > 0) {
        const prevChapterIdx = currentChapterIdx - 1;
        const prevPages = paginateProse(chapters[prevChapterIdx].prose, fontSize);
        setCurrentChapterIdx(prevChapterIdx);
        setCurrentPage(Math.max(0, prevPages.length - 1));
      }
    });
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
      resetControlsTimer();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  if (!project || chapters.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#f5f5f0] flex items-center justify-center">
        <div className="text-center">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-serif mb-2">Nothing to read yet</h2>
          <p className="text-gray-500 mb-6">Generate or write some chapters first.</p>
          <button onClick={onClose} className="px-6 py-2 rounded-lg bg-black text-white text-sm">Back to Editor</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn('fixed inset-0 z-50 transition-colors duration-500', t.bg)}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      <div className={cn(
        'absolute top-0 left-0 right-0 z-10 transition-all duration-500',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      )}>
        <div className="flex items-center justify-between px-8 py-4">
          <button onClick={onClose} className={cn('flex items-center gap-2 text-sm transition-colors', t.accent, 'hover:' + t.text)}>
            <X size={18} />
            <span>Exit Reading Mode</span>
          </button>

          <div className={cn('text-sm font-serif', t.accent)}>{project.title}</div>

          <div className="flex items-center gap-3">
            <button onClick={() => setShowToc(!showToc)} className={cn('p-2 rounded-lg transition-colors', t.accent)}>
              <List size={18} />
            </button>

            <div className="flex items-center gap-1">
              <button onClick={() => setFontSize((s) => Math.max(14, s - 2))} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
                <Minus size={14} />
              </button>
              <span className={cn('text-xs font-mono w-8 text-center', t.accent)}>{fontSize}</span>
              <button onClick={() => setFontSize((s) => Math.min(28, s + 2))} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
                <Plus size={14} />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => setTheme('light')} className={cn('p-1.5 rounded-lg transition-colors', theme === 'light' ? t.text : t.accent)}>
                <Sun size={16} />
              </button>
              <button onClick={() => setTheme('sepia')} className={cn('p-1.5 rounded-lg transition-colors', theme === 'sepia' ? t.text : t.accent)}>
                <Coffee size={16} />
              </button>
              <button onClick={() => setTheme('dark')} className={cn('p-1.5 rounded-lg transition-colors', theme === 'dark' ? t.text : t.accent)}>
                <Moon size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showToc && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" onClick={() => setShowToc(false)}>
          <div className={cn('w-80 max-h-[70vh] rounded-2xl shadow-2xl overflow-hidden', t.paper, t.border, 'border')} onClick={(e) => e.stopPropagation()}>
            <div className={cn('px-5 py-4 border-b', t.border)}>
              <h3 className={cn('font-serif font-semibold', t.text)}>Table of Contents</h3>
            </div>
            <div className="overflow-y-auto max-h-[55vh]">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  onClick={() => {
                    setCurrentChapterIdx(idx);
                    setCurrentPage(0);
                    setShowToc(false);
                  }}
                  className={cn(
                    'w-full text-left px-5 py-3 transition-colors border-b last:border-0',
                    t.border,
                    idx === currentChapterIdx ? `${t.paper} font-medium` : `hover:${t.paper}`,
                  )}
                >
                  <div className={cn('text-sm', t.text)}>
                    <span className={cn('font-mono text-xs mr-2', t.accent)}>{ch.number}</span>
                    {ch.title}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 flex items-stretch pt-16 pb-16 overflow-hidden">
        <button
          onClick={goPrev}
          className={cn(
            'w-16 flex-shrink-0 flex items-center justify-center transition-opacity',
            canGoPrev ? 'opacity-30 hover:opacity-70 cursor-pointer' : 'opacity-0 cursor-default'
          )}
        >
          <ChevronLeft size={24} className={t.accent} />
        </button>

        <div className="flex-1 flex justify-center overflow-hidden px-4">
          <div
            className={cn('max-w-[760px] w-full rounded-sm shadow-lg overflow-hidden border', t.paper, t.border)}
            style={{
              transform: flipDir === 'next'
                ? 'perspective(1200px) rotateY(-12deg) scale(0.98)'
                : flipDir === 'prev'
                ? 'perspective(1200px) rotateY(12deg) scale(0.98)'
                : 'perspective(1200px) rotateY(0deg) scale(1)',
              opacity: flipDir ? 0.5 : 1,
              transition: 'transform 180ms ease, opacity 180ms ease',
            }}
          >
            <div className="h-full px-12 py-10 overflow-hidden">
              <div className="mb-8 text-center">
                <div className={cn('text-xs uppercase tracking-[0.3em] mb-3 font-sans', t.accent)}>
                  Chapter {chapter.number}
                </div>
                <h1 className={cn('font-serif font-semibold mb-4', t.text)} style={{ fontSize: fontSize + 8 }}>
                  {chapter.title}
                </h1>
                <div className={cn('w-12 h-px mx-auto', theme === 'dark' ? 'bg-white/20' : 'bg-black/15')} />
              </div>

              <div className="h-[calc(100%-120px)] overflow-hidden">
                {pageText.split('\n\n').map((para, i) => (
                  <p
                    key={i}
                    className={cn('mb-5 leading-[1.9] font-serif', t.text)}
                    style={{
                      fontSize,
                      textIndent: i === 0 ? 0 : '2em',
                      textAlign: 'justify',
                    }}
                  >
                    {i === 0 ? (
                      <>
                        <span className={cn('float-left text-[3.5em] leading-[0.8] mr-2 mt-1 font-serif font-bold', t.text)}>
                          {para.charAt(0)}
                        </span>
                        {para.slice(1)}
                      </>
                    ) : para}
                  </p>
                ))}
              </div>

              <div className={cn('text-center mt-5 text-xs font-mono', t.accent)}>
                Page {currentPage + 1} of {totalPages}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={goNext}
          className={cn(
            'w-16 flex-shrink-0 flex items-center justify-center transition-opacity',
            canGoNext ? 'opacity-30 hover:opacity-70 cursor-pointer' : 'opacity-0 cursor-default'
          )}
        >
          <ChevronRight size={24} className={t.accent} />
        </button>
      </div>

      <div className={cn(
        'absolute bottom-0 left-0 right-0 transition-all duration-500',
        showControls ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="px-8 pb-4">
          <div className="flex items-center justify-between mb-2">
            <span className={cn('text-xs font-mono', t.accent)}>
              Chapter {chapter.number} of {chapters.length}
            </span>
            <span className={cn('text-xs font-mono', t.accent)}>
              {Math.round(globalProgress)}% complete
            </span>
          </div>
          <div className={cn('w-full h-1 rounded-full', theme === 'dark' ? 'bg-white/10' : 'bg-black/10')}>
            <div
              className={cn('h-full rounded-full transition-all duration-500', theme === 'dark' ? 'bg-white/40' : 'bg-black/30')}
              style={{ width: `${globalProgress}%` }}
            />
          </div>
          <div className="flex justify-center gap-1.5 mt-3">
            {chapters.map((_, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setCurrentChapterIdx(idx);
                  setCurrentPage(0);
                }}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  idx === currentChapterIdx
                    ? (theme === 'dark' ? 'bg-white/60 w-4' : 'bg-black/40 w-4')
                    : idx < currentChapterIdx
                      ? (theme === 'dark' ? 'bg-white/25' : 'bg-black/20')
                      : (theme === 'dark' ? 'bg-white/10' : 'bg-black/8')
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
