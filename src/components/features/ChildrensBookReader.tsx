import { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ImageIcon, Edit3 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Chapter } from '../../types';

interface Props {
  chapters: Chapter[];
  startIdx: number;
  projectTitle: string;
  onClose: () => void;
  onEdit?: (chapterId: string) => void;
}

/**
 * Fullscreen reader for children's book pages. Tap a page card → this opens.
 * Image on top, prose below, prev/next navigation, and a quick Edit hop to
 * ChapterView for text/premise changes.
 */
export function ChildrensBookReader({ chapters, startIdx, projectTitle, onClose, onEdit }: Props) {
  const [idx, setIdx] = useState(Math.max(0, Math.min(startIdx, chapters.length - 1)));
  const page = chapters[idx];
  const canPrev = idx > 0;
  const canNext = idx < chapters.length - 1;

  const goPrev = useCallback(() => setIdx((i) => (i > 0 ? i - 1 : i)), []);
  const goNext = useCallback(() => setIdx((i) => (i < chapters.length - 1 ? i + 1 : i)), [chapters.length]);

  // Keyboard navigation — arrows + esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, goPrev, goNext]);

  if (!page) return null;

  const bodyText = page.prose?.trim() || page.premise?.purpose?.trim() || '';

  return (
    <div className="fixed inset-0 z-[90] bg-black/95 flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
        >
          <X size={18} /> Close
        </button>
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-wider text-white/40">{projectTitle}</div>
          <div className="text-xs text-white/60">Page {page.number} of {chapters.length}</div>
        </div>
        {onEdit ? (
          <button
            onClick={() => onEdit(page.id)}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition-colors"
          >
            <Edit3 size={16} /> Edit
          </button>
        ) : (
          <div className="w-14" />
        )}
      </div>

      {/* Spread — portrait stacks image over text; landscape puts them
          side-by-side so a rotated phone fits the whole page without
          scrolling. Tailwind's `landscape:` variant applies whenever the
          viewport is wider than tall. */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 sm:px-12 py-4 relative">
        <button
          onClick={goPrev}
          disabled={!canPrev}
          className={cn(
            'hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full border border-white/20 transition-all',
            canPrev ? 'text-white/80 hover:bg-white/10' : 'opacity-25 cursor-not-allowed',
          )}
          aria-label="Previous page"
        >
          <ChevronLeft size={22} />
        </button>

        <div className="flex flex-col landscape:flex-row landscape:items-center items-center max-w-2xl landscape:max-w-5xl w-full gap-5 landscape:gap-6 h-full min-h-0">
          {/* Image */}
          <div className="w-full landscape:w-auto landscape:h-full landscape:flex-shrink-0 landscape:aspect-square aspect-square max-h-[55vh] landscape:max-h-[78vh] rounded-2xl overflow-hidden bg-white/5 shadow-2xl flex items-center justify-center">
            {page.imageUrl ? (
              <img src={page.imageUrl} alt={page.title} className="w-full h-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-white/25">
                <ImageIcon size={40} strokeWidth={1} />
                <span className="text-xs">No illustration yet</span>
              </div>
            )}
          </div>

          {/* Page title + text */}
          <div className="w-full landscape:flex-1 landscape:min-w-0 text-center landscape:text-left px-2 landscape:overflow-y-auto landscape:max-h-[78vh]">
            {page.title && (
              <div className="text-sm text-white/50 mb-2 font-serif italic">{page.title}</div>
            )}
            {bodyText ? (
              <p className="text-lg sm:text-xl text-white leading-relaxed whitespace-pre-line font-serif">
                {bodyText}
              </p>
            ) : (
              <p className="text-sm text-white/40 italic">This page hasn't been written yet.</p>
            )}
          </div>
        </div>

        <button
          onClick={goNext}
          disabled={!canNext}
          className={cn(
            'hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full border border-white/20 transition-all',
            canNext ? 'text-white/80 hover:bg-white/10' : 'opacity-25 cursor-not-allowed',
          )}
          aria-label="Next page"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Mobile nav + progress */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0 safe-area-bottom">
        <div className="flex items-center gap-3 max-w-md mx-auto">
          <button
            onClick={goPrev}
            disabled={!canPrev}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/20 text-sm text-white/80 transition-all',
              canPrev ? 'hover:bg-white/10' : 'opacity-25 cursor-not-allowed',
            )}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/50 transition-all"
                style={{ width: `${((idx + 1) / chapters.length) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={goNext}
            disabled={!canNext}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-white/20 text-sm text-white/80 transition-all',
              canNext ? 'hover:bg-white/10' : 'opacity-25 cursor-not-allowed',
            )}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
