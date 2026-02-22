import { useState, useEffect, useRef, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen, Type, Minus, Plus, Sun, Moon, Coffee, Maximize2, Minimize2, List } from 'lucide-react';
import { useStore } from '../../store';
import { cn } from '../../lib/utils';

interface Props {
  onClose: () => void;
}

type ReaderTheme = 'light' | 'sepia' | 'dark';

export function ReadingMode({ onClose }: Props) {
  const { getActiveProject, getProjectChapters } = useStore();
  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).filter(c => c.prose).sort((a, b) => a.number - b.number) : [];

  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState<ReaderTheme>('light');
  const [showControls, setShowControls] = useState(true);
  const [showToc, setShowToc] = useState(false);
  const [twoPage, setTwoPage] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);
  const controlsTimeout = useRef<any>(null);

  const chapter = chapters[currentChapterIdx];

  // Theme configs
  const themes: Record<ReaderTheme, { bg: string; text: string; accent: string; paper: string; border: string }> = {
    light: { bg: 'bg-[#f5f5f0]', text: 'text-[#2d2d2d]', accent: 'text-[#666]', paper: 'bg-white', border: 'border-[#e0e0da]' },
    sepia: { bg: 'bg-[#f4ecd8]', text: 'text-[#5b4636]', accent: 'text-[#8b7355]', paper: 'bg-[#faf4e8]', border: 'border-[#d4c5a9]' },
    dark: { bg: 'bg-[#1a1a1a]', text: 'text-[#ccc]', accent: 'text-[#888]', paper: 'bg-[#242424]', border: 'border-[#333]' },
  };
  const t = themes[theme];

  // Split prose into paragraphs
  const paragraphs = chapter?.prose.split('\n').filter(p => p.trim()) || [];

  // Calculate pages for two-page spread
  const calculatePages = useCallback(() => {
    if (!contentRef.current || !twoPage) {
      setTotalPages(1);
      setCurrentPage(0);
      return;
    }
    // Estimate pages based on content height vs viewport
    const contentHeight = contentRef.current.scrollHeight;
    const pageHeight = window.innerHeight - 200; // Account for margins
    const pages = Math.max(1, Math.ceil(contentHeight / pageHeight));
    setTotalPages(pages);
  }, [twoPage, chapter, fontSize]);

  useEffect(() => {
    calculatePages();
  }, [calculatePages]);

  // Auto-hide controls
  const resetControlsTimer = () => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    resetControlsTimer();
    return () => { if (controlsTimeout.current) clearTimeout(controlsTimeout.current); };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        if (currentChapterIdx < chapters.length - 1) setCurrentChapterIdx(i => i + 1);
      } else if (e.key === 'ArrowLeft') {
        if (currentChapterIdx > 0) setCurrentChapterIdx(i => i - 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
      resetControlsTimer();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentChapterIdx, chapters.length]);

  // Reset page when chapter changes
  useEffect(() => {
    setCurrentPage(0);
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [currentChapterIdx]);

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

  const progress = chapters.length > 0 ? ((currentChapterIdx + 1) / chapters.length) * 100 : 0;

  return (
    <div
      className={cn('fixed inset-0 z-50 transition-colors duration-500', t.bg)}
      onMouseMove={resetControlsTimer}
      onClick={resetControlsTimer}
    >
      {/* Top controls — fade in/out */}
      <div className={cn(
        'absolute top-0 left-0 right-0 z-10 transition-all duration-500',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
      )}>
        <div className="flex items-center justify-between px-8 py-4">
          <button onClick={onClose} className={cn('flex items-center gap-2 text-sm transition-colors', t.accent, 'hover:' + t.text)}>
            <X size={18} />
            <span>Exit Reading Mode</span>
          </button>

          <div className={cn('text-sm font-serif', t.accent)}>
            {project.title}
          </div>

          <div className="flex items-center gap-3">
            {/* TOC */}
            <button onClick={() => setShowToc(!showToc)} className={cn('p-2 rounded-lg transition-colors', t.accent)}>
              <List size={18} />
            </button>

            {/* Font size */}
            <div className="flex items-center gap-1">
              <button onClick={() => setFontSize(s => Math.max(14, s - 2))} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
                <Minus size={14} />
              </button>
              <span className={cn('text-xs font-mono w-8 text-center', t.accent)}>{fontSize}</span>
              <button onClick={() => setFontSize(s => Math.min(28, s + 2))} className={cn('p-1.5 rounded-lg transition-colors', t.accent)}>
                <Plus size={14} />
              </button>
            </div>

            {/* Theme */}
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

            {/* Two-page toggle */}
            <button
              onClick={() => setTwoPage(!twoPage)}
              className={cn('p-1.5 rounded-lg transition-colors', twoPage ? t.text : t.accent)}
              title={twoPage ? 'Single page' : 'Two-page spread'}
            >
              <BookOpen size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Table of Contents overlay */}
      {showToc && (
        <div className="absolute inset-0 z-20 flex items-center justify-center" onClick={() => setShowToc(false)}>
          <div className={cn('w-80 max-h-[70vh] rounded-2xl shadow-2xl overflow-hidden', t.paper, t.border, 'border')} onClick={e => e.stopPropagation()}>
            <div className={cn('px-5 py-4 border-b', t.border)}>
              <h3 className={cn('font-serif font-semibold', t.text)}>Table of Contents</h3>
            </div>
            <div className="overflow-y-auto max-h-[55vh]">
              {chapters.map((ch, idx) => (
                <button
                  key={ch.id}
                  onClick={() => { setCurrentChapterIdx(idx); setShowToc(false); }}
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

      {/* Main reading area */}
      <div className="absolute inset-0 flex items-stretch pt-16 pb-16 overflow-hidden">
        {/* Left page turn zone */}
        <button
          onClick={() => currentChapterIdx > 0 && setCurrentChapterIdx(i => i - 1)}
          className={cn(
            'w-16 flex-shrink-0 flex items-center justify-center transition-opacity',
            currentChapterIdx > 0 ? 'opacity-30 hover:opacity-70 cursor-pointer' : 'opacity-0 cursor-default'
          )}
        >
          <ChevronLeft size={24} className={t.accent} />
        </button>

        {/* Book content */}
        <div className="flex-1 flex justify-center gap-0 overflow-hidden">
          {twoPage ? (
            /* Two-page spread */
            <div className="flex gap-0 max-w-[1100px] w-full">
              {/* Left page */}
              <div className={cn('flex-1 rounded-l-sm shadow-lg overflow-hidden', t.paper, t.border, 'border-r')}>
                <div className="h-full overflow-y-auto px-12 py-10" ref={contentRef}>
                  {/* Chapter heading on left page */}
                  <div className="mb-10 text-center">
                    <div className={cn('text-xs uppercase tracking-[0.3em] mb-3 font-sans', t.accent)}>
                      Chapter {chapter.number}
                    </div>
                    <h1 className={cn('font-serif font-semibold mb-6', t.text)} style={{ fontSize: fontSize + 8 }}>
                      {chapter.title}
                    </h1>
                    <div className={cn('w-12 h-px mx-auto', theme === 'dark' ? 'bg-white/20' : 'bg-black/15')} />
                  </div>

                  {/* First half of paragraphs */}
                  <div className="columns-1">
                    {paragraphs.slice(0, Math.ceil(paragraphs.length / 2)).map((para, i) => (
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

                  {/* Page number */}
                  <div className={cn('text-center mt-8 text-xs font-mono', t.accent)}>
                    {currentChapterIdx * 2 + 1}
                  </div>
                </div>
              </div>

              {/* Spine shadow */}
              <div className={cn('w-[2px] flex-shrink-0', theme === 'dark' ? 'bg-black/40' : 'bg-black/10')} />

              {/* Right page */}
              <div className={cn('flex-1 rounded-r-sm shadow-lg overflow-hidden', t.paper)}>
                <div className="h-full overflow-y-auto px-12 py-10">
                  {/* Second half of paragraphs */}
                  <div>
                    {paragraphs.slice(Math.ceil(paragraphs.length / 2)).map((para, i) => (
                      <p
                        key={i}
                        className={cn('mb-5 leading-[1.9] font-serif', t.text)}
                        style={{
                          fontSize,
                          textIndent: '2em',
                          textAlign: 'justify',
                        }}
                      >
                        {para}
                      </p>
                    ))}

                    {/* End-of-chapter marker */}
                    {paragraphs.length > 0 && (
                      <div className={cn('text-center mt-12 mb-8', t.accent)}>
                        <span className="text-lg tracking-[0.5em]">· · ·</span>
                      </div>
                    )}

                    {/* Next chapter preview */}
                    {currentChapterIdx < chapters.length - 1 && (
                      <button
                        onClick={() => setCurrentChapterIdx(i => i + 1)}
                        className={cn('w-full text-center py-6 rounded-lg transition-colors', `hover:${t.paper}`)}
                      >
                        <div className={cn('text-[10px] uppercase tracking-[0.3em] mb-1', t.accent)}>Next Chapter</div>
                        <div className={cn('font-serif text-sm', t.text)}>{chapters[currentChapterIdx + 1].title}</div>
                      </button>
                    )}

                    {currentChapterIdx === chapters.length - 1 && (
                      <div className={cn('text-center py-8', t.accent)}>
                        <div className="text-sm font-serif italic">End of available chapters</div>
                      </div>
                    )}
                  </div>

                  {/* Page number */}
                  <div className={cn('text-center mt-8 text-xs font-mono', t.accent)}>
                    {currentChapterIdx * 2 + 2}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Single page / scroll mode */
            <div className={cn('max-w-[600px] w-full rounded-sm shadow-lg overflow-hidden', t.paper)}>
              <div className="h-full overflow-y-auto px-12 py-10" ref={contentRef}>
                <div className="mb-10 text-center">
                  <div className={cn('text-xs uppercase tracking-[0.3em] mb-3 font-sans', t.accent)}>
                    Chapter {chapter.number}
                  </div>
                  <h1 className={cn('font-serif font-semibold mb-6', t.text)} style={{ fontSize: fontSize + 8 }}>
                    {chapter.title}
                  </h1>
                  <div className={cn('w-12 h-px mx-auto', theme === 'dark' ? 'bg-white/20' : 'bg-black/15')} />
                </div>

                {paragraphs.map((para, i) => (
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

                {paragraphs.length > 0 && (
                  <div className={cn('text-center mt-12 mb-8', t.accent)}>
                    <span className="text-lg tracking-[0.5em]">· · ·</span>
                  </div>
                )}

                {currentChapterIdx < chapters.length - 1 && (
                  <button
                    onClick={() => setCurrentChapterIdx(i => i + 1)}
                    className={cn('w-full text-center py-6 rounded-lg transition-colors mb-8')}
                  >
                    <div className={cn('text-[10px] uppercase tracking-[0.3em] mb-1', t.accent)}>Next Chapter</div>
                    <div className={cn('font-serif text-sm', t.text)}>{chapters[currentChapterIdx + 1].title}</div>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right page turn zone */}
        <button
          onClick={() => currentChapterIdx < chapters.length - 1 && setCurrentChapterIdx(i => i + 1)}
          className={cn(
            'w-16 flex-shrink-0 flex items-center justify-center transition-opacity',
            currentChapterIdx < chapters.length - 1 ? 'opacity-30 hover:opacity-70 cursor-pointer' : 'opacity-0 cursor-default'
          )}
        >
          <ChevronRight size={24} className={t.accent} />
        </button>
      </div>

      {/* Bottom progress bar */}
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
              {Math.round(progress)}% complete
            </span>
          </div>
          {/* Progress bar */}
          <div className={cn('w-full h-1 rounded-full', theme === 'dark' ? 'bg-white/10' : 'bg-black/10')}>
            <div
              className={cn('h-full rounded-full transition-all duration-500', theme === 'dark' ? 'bg-white/40' : 'bg-black/30')}
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Chapter dots */}
          <div className="flex justify-center gap-1.5 mt-3">
            {chapters.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentChapterIdx(idx)}
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
