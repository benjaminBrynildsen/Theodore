import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen, Minus, Plus, Sun, Moon, Coffee, List } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface Props {
  onClose: () => void;
}

type ReaderTheme = 'light' | 'sepia' | 'dark';
type FlipDir = 'next' | 'prev' | null;

function paginateProse(prose: string, fontSize: number, isMobile: boolean): string[] {
  const paragraphs = prose.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return [''];

  // Mobile gets smaller pages
  const targetChars = isMobile
    ? Math.max(500, Math.round(1200 - (fontSize - 18) * 40))
    : Math.max(900, Math.round(2400 - (fontSize - 18) * 70));
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

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

export function ReadingMode({ onClose }: Props) {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter((c) => c.prose).sort((a, b) => a.number - b.number) : [];
  const isMobile = useIsMobile();

  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [flipDir, setFlipDir] = useState<FlipDir>(null);
  const [isFlipping, setIsFlipping] = useState(false);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Touch/swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  const chapter = chapters[currentChapterIdx];

  const themes: Record<ReaderTheme, { bg: string; text: string; accent: string; paper: string; border: string }> = {
    light: { bg: 'bg-[#f5f5f0]', text: 'text-[#2d2d2d]', accent: 'text-[#666]', paper: 'bg-white', border: 'border-[#e0e0da]' },
    sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]', accent: 'text-[#8b7355]', paper: 'bg-[#faf4e8]', border: 'border-[#d4c5a9]' },
    dark: { bg: 'bg-[#1a1a1a]', text: 'text-[#ccc]', accent: 'text-[#888]', paper: 'bg-[#242424]', border: 'border-[#333]' },
  };
  const t = themes[theme];

  const chapterPages = useMemo(() => {
    if (!chapter?.prose) return [''];
    return paginateProse(chapter.prose, fontSize, isMobile);
  }, [chapter?.prose, fontSize, isMobile]);

  const totalPages = chapterPages.length;

  // For desktop two-page spread
  const spreadStart = isMobile ? currentPage : Math.floor(currentPage / 2) * 2;
  const leftPageText = chapterPages[isMobile ? currentPage : spreadStart] || '';
  const rightPageText = isMobile ? '' : (chapterPages[spreadStart + 1] || '');

  const globalProgress = chapters.length > 0 ? ((currentChapterIdx + 1) / chapters.length) * 100 : 0;
  const pageStep = isMobile ? 1 : 2;

  const canGoPrev = currentPage > 0 || currentChapterIdx > 0;
  const canGoNext = currentPage + pageStep < totalPages || currentChapterIdx < chapters.length - 1;

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimeout.current) clearTimeout(controlsTimeout.current); };
  }, [resetControlsTimer]);

  useEffect(() => {
    setCurrentPage(0);
  }, [currentChapterIdx, fontSize, isMobile]);

  const runFlip = useCallback((dir: Exclude<FlipDir, null>, action: () => void) => {
    if (isFlipping) return;
    setIsFlipping(true);
    setFlipDir(dir);
    setTimeout(() => {
      action();
      setFlipDir(null);
    }, 120);
    setTimeout(() => setIsFlipping(false), 260);
  }, [isFlipping]);

  const goNext = useCallback(() => {
    if (!canGoNext) return;
    runFlip('next', () => {
      if (currentPage + pageStep < totalPages) {
        setCurrentPage((p) => p + pageStep);
      } else if (currentChapterIdx < chapters.length - 1) {
        setCurrentChapterIdx((c) => c + 1);
        setCurrentPage(0);
      }
    });
  }, [canGoNext, currentPage, pageStep, totalPages, currentChapterIdx, chapters.length, runFlip]);

  const goPrev = useCallback(() => {
    if (!canGoPrev) return;
    runFlip('prev', () => {
      if (currentPage > 0) {
        setCurrentPage((p) => Math.max(0, p - pageStep));
      } else if (currentChapterIdx > 0) {
        const prevChapterIdx = currentChapterIdx - 1;
        const prevPages = paginateProse(chapters[prevChapterIdx].prose, fontSize, isMobile);
        setCurrentChapterIdx(prevChapterIdx);
        setCurrentPage(Math.max(0, prevPages.length - pageStep));
      }
    });
  }, [canGoPrev, currentPage, pageStep, currentChapterIdx, chapters, fontSize, isMobile, runFlip]);

  // Keyboard navigation
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
  }, [goNext, goPrev, onClose, resetControlsTimer]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    const elapsed = Date.now() - touchStartTime.current;

    // Must be horizontal swipe (not vertical scroll), min 50px, max 500ms
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 500) {
      if (deltaX < 0) goNext();
      else goPrev();
    }
  };

  // Tap zones on mobile: left third = prev, right third = next, center = toggle controls
  const handleTap = (e: React.MouseEvent) => {
    if (!isMobile) {
      resetControlsTimer();
      return;
    }
    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width * 0.3) {
      goPrev();
    } else if (x > width * 0.7) {
      goNext();
    } else {
      setShowControls((s) => !s);
    }
  };

  if (!project || chapters.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-[#f5f5f0] flex items-center justify-center">
        <div className="text-center px-6">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-400" />
          <h2 className="text-xl font-serif mb-2">Nothing to read yet</h2>
          <p className="text-gray-500 mb-6">Generate or write some chapters first.</p>
          <button onClick={onClose} className="px-6 py-2 rounded-lg bg-black text-white text-sm">Back to Editor</button>
        </div>
      </div>
    );
  }

  const renderPage = (text: string, pageNum: number, isFirst: boolean) => (
    <div className={cn('h-full flex flex-col', isMobile ? 'px-6 py-6' : 'px-10 py-10')}>
      {isFirst && currentPage === 0 && (
        <div className="mb-6 text-center">
          <div className={cn('text-xs uppercase tracking-[0.3em] mb-2 font-sans', t.accent)}>
            Chapter {chapter.number}
          </div>
          <h1 className={cn('font-serif font-semibold mb-3', t.text)} style={{ fontSize: fontSize + (isMobile ? 4 : 8) }}>
            {chapter.title}
          </h1>
          <div className={cn('w-12 h-px mx-auto', theme === 'dark' ? 'bg-white/20' : 'bg-black/15')} />
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {text.split('\n\n').filter(Boolean).map((para, i) => (
          <p
            key={i}
            className={cn('mb-4 sm:mb-5 leading-[1.8] sm:leading-[1.9] font-serif', t.text)}
            style={{
              fontSize,
              textIndent: (i === 0 && isFirst && currentPage === 0) ? 0 : '1.5em',
              textAlign: 'justify',
            }}
          >
            {(i === 0 && isFirst && currentPage === 0) ? (
              <>
                <span className={cn('float-left text-[3em] sm:text-[3.5em] leading-[0.8] mr-2 mt-1 font-serif font-bold', t.text)}>
                  {para.charAt(0)}
                </span>
                {para.slice(1)}
              </>
            ) : para}
          </p>
        ))}
      </div>
      <div className={cn('text-center text-xs font-mono pt-2', t.accent)}>
        {pageNum} / {totalPages}
      </div>
    </div>
  );

  return (
    <div
      className={cn('fixed inset-0 z-50 transition-colors duration-500 select-none', t.bg)}
      onMouseMove={!isMobile ? resetControlsTimer : undefined}
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top controls */}
      <div className={cn(
        'absolute top-0 left-0 right-0 z-10 transition-all duration-300',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      )}>
        <div className={cn('flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4', isMobile && 'safe-area-top')}>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={cn('flex items-center gap-1.5 text-sm transition-colors', t.accent)}>
            <X size={18} />
            <span className="hidden sm:inline">Exit</span>
          </button>

          <div className={cn('text-sm font-serif truncate max-w-[50%]', t.accent)}>{project.title}</div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={(e) => { e.stopPropagation(); setShowToc(!showToc); }} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
              <List size={18} />
            </button>

            <div className="hidden sm:flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); setFontSize((s) => Math.max(14, s - 2)); }} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
                <Minus size={14} />
              </button>
              <span className={cn('text-xs font-mono w-8 text-center', t.accent)}>{fontSize}</span>
              <button onClick={(e) => { e.stopPropagation(); setFontSize((s) => Math.min(28, s + 2)); }} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
                <Plus size={14} />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={(e) => { e.stopPropagation(); setTheme('light'); }} className={cn('p-1.5 rounded-lg transition-colors', theme === 'light' ? t.text : t.accent)}>
                <Sun size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setTheme('sepia'); }} className={cn('p-1.5 rounded-lg transition-colors', theme === 'sepia' ? t.text : t.accent)}>
                <Coffee size={14} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setTheme('dark'); }} className={cn('p-1.5 rounded-lg transition-colors', theme === 'dark' ? t.text : t.accent)}>
                <Moon size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* TOC overlay */}
      {showToc && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4" onClick={(e) => { e.stopPropagation(); setShowToc(false); }}>
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
                    idx === currentChapterIdx ? `${t.paper} font-medium` : '',
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

      {/* Book content */}
      <div className="absolute inset-0 flex items-stretch pt-14 sm:pt-16 pb-14 sm:pb-16 overflow-hidden">
        {/* Prev button — desktop only */}
        {!isMobile && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className={cn(
              'w-20 flex-shrink-0 flex items-center justify-center transition-opacity',
              canGoPrev ? 'opacity-90 hover:opacity-100 cursor-pointer' : 'opacity-0 cursor-default'
            )}
          >
            <span className={cn('w-11 h-11 rounded-full border flex items-center justify-center', t.paper, t.border)}>
              <ChevronLeft size={24} className={t.accent} />
            </span>
          </button>
        )}

        <div className="flex-1 flex justify-center overflow-hidden px-2 sm:px-4">
          <div
            className={cn(
              'w-full rounded-sm shadow-lg overflow-hidden border',
              isMobile ? 'max-w-full' : 'max-w-[1100px]',
              t.paper, t.border
            )}
            style={{
              transform: flipDir === 'next'
                ? isMobile ? 'translateX(-8px) scale(0.98)' : 'perspective(1200px) rotateY(-12deg) scale(0.98)'
                : flipDir === 'prev'
                ? isMobile ? 'translateX(8px) scale(0.98)' : 'perspective(1200px) rotateY(12deg) scale(0.98)'
                : isMobile ? 'translateX(0) scale(1)' : 'perspective(1200px) rotateY(0deg) scale(1)',
              opacity: flipDir ? 0.5 : 1,
              transition: 'transform 180ms ease, opacity 180ms ease',
            }}
          >
            {isMobile ? (
              /* Single page on mobile */
              renderPage(leftPageText, currentPage + 1, true)
            ) : (
              /* Two-page spread on desktop */
              <div className="h-full grid grid-cols-2">
                <div className={cn('border-r', t.border)}>
                  {renderPage(leftPageText, spreadStart + 1, true)}
                </div>
                <div>
                  {rightPageText ? (
                    renderPage(rightPageText, spreadStart + 2, false)
                  ) : (
                    <div className={cn('h-full flex items-center justify-center text-sm italic', t.accent)}>
                      End of chapter
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Next button — desktop only */}
        {!isMobile && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className={cn(
              'w-20 flex-shrink-0 flex items-center justify-center transition-opacity',
              canGoNext ? 'opacity-90 hover:opacity-100 cursor-pointer' : 'opacity-0 cursor-default'
            )}
          >
            <span className={cn('w-11 h-11 rounded-full border flex items-center justify-center', t.paper, t.border)}>
              <ChevronRight size={24} className={t.accent} />
            </span>
          </button>
        )}
      </div>

      {/* Bottom progress */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 transition-all duration-300',
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <div className={cn('px-4 sm:px-8 pb-3 sm:pb-4', isMobile && 'safe-area-bottom')}>
          <div className="flex items-center justify-between mb-1.5">
            <span className={cn('text-[10px] sm:text-xs font-mono', t.accent)}>
              Ch. {chapter.number} of {chapters.length}
            </span>
            <span className={cn('text-[10px] sm:text-xs font-mono', t.accent)}>
              {Math.round(globalProgress)}%
            </span>
          </div>
          <div className={cn('w-full h-1 rounded-full', theme === 'dark' ? 'bg-white/10' : 'bg-black/10')}>
            <div
              className={cn('h-full rounded-full transition-all duration-500', theme === 'dark' ? 'bg-white/40' : 'bg-black/30')}
              style={{ width: `${globalProgress}%` }}
            />
          </div>
          {isMobile && (
            <div className={cn('text-center text-[10px] mt-2', t.accent)}>
              Tap edges or swipe to turn pages
            </div>
          )}
          {!isMobile && (
            <div className="flex justify-center gap-1.5 mt-3">
              {chapters.map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
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
          )}
        </div>
      </div>
    </div>
  );
}
