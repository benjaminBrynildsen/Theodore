import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Sparkles, Type, AlignLeft, Maximize2, Minimize2, History, BookMarked } from 'lucide-react';
import { useStore } from '../../store';
import { Badge } from '../ui/Badge';
import { VersionTimeline } from '../features/VersionTimeline';
import { cn } from '../../lib/utils';
import type { Chapter } from '../../types';

interface Props {
  chapter: Chapter;
}

export function ChapterView({ chapter }: Props) {
  const { setActiveChapter, updateChapter, setShowReadingMode } = useStore();
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Calculate word count
  useEffect(() => {
    const words = chapter.prose.trim() ? chapter.prose.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, [chapter.prose]);

  // Auto-resize textarea
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto';
      editorRef.current.style.height = Math.max(editorRef.current.scrollHeight, 500) + 'px';
    }
  }, [chapter.prose]);

  return (
    <div className={cn(
      'flex-1 flex flex-col overflow-hidden animate-fade-in transition-all duration-500',
      isFocusMode && 'fixed inset-0 z-40 bg-white'
    )}>
      {/* Minimal top bar */}
      <div className={cn(
        'flex items-center justify-between px-6 py-3 transition-all duration-300',
        isFocusMode ? 'opacity-0 hover:opacity-100' : ''
      )}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveChapter(null)}
            className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm transition-colors"
          >
            <ChevronLeft size={16} />
            <span>Chapters</span>
          </button>
          <span className="text-text-tertiary text-xs">·</span>
          <span className="text-xs text-text-tertiary font-mono">Ch. {chapter.number}</span>
          <Badge status={chapter.status} />
        </div>

        <div className="flex items-center gap-3">
          {/* Word count */}
          <span className="text-xs text-text-tertiary font-mono">
            {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          </span>

          {/* Version history */}
          {chapter.prose && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn('p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all', showHistory && 'bg-white/40 text-text-primary')}
              title="Version history"
            >
              <History size={15} />
            </button>
          )}

          {/* Reading mode */}
          <button
            onClick={() => setShowReadingMode(true)}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all"
            title="Reading mode"
          >
            <BookMarked size={15} />
          </button>

          {/* Focus mode toggle */}
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all"
            title={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
          >
            {isFocusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* THE WRITING SPACE */}
      <div className="flex-1 overflow-y-auto">
        <div className={cn(
          'mx-auto px-8 pb-32 transition-all duration-500',
          isFocusMode ? 'max-w-2xl pt-16' : 'max-w-3xl pt-4'
        )}>
          {/* Chapter Title */}
          <input
            type="text"
            value={chapter.title}
            onChange={(e) => updateChapter(chapter.id, { title: e.target.value })}
            className={cn(
              'w-full bg-transparent border-none outline-none font-serif font-semibold tracking-tight placeholder:text-text-tertiary mb-2 transition-all duration-300',
              isFocusMode ? 'text-4xl' : 'text-3xl'
            )}
            placeholder="Chapter title..."
          />

          {/* Chapter number + premise hint */}
          {!chapter.prose && chapter.premise.purpose && (
            <div className="mb-8 glass-pill rounded-xl p-4 animate-fade-in">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5">Premise</div>
              <p className="text-sm text-text-secondary leading-relaxed">{chapter.premise.purpose}</p>
              {chapter.premise.emotionalBeat && (
                <p className="text-xs text-text-tertiary mt-2 italic">Beat: {chapter.premise.emotionalBeat}</p>
              )}
            </div>
          )}

          {/* Empty state — no prose yet */}
          {!chapter.prose && (
            <div className="py-16 text-center animate-fade-in">
              <div className="glass-pill w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Type size={28} className="text-text-tertiary" />
              </div>
              <p className="text-text-secondary mb-2 font-medium">Start writing</p>
              <p className="text-sm text-text-tertiary max-w-xs mx-auto mb-6">
                Type below to start writing, or use the <strong>Generate</strong> tab in the sidebar to have AI draft this chapter.
              </p>
              
              {/* Quick-start writing area */}
              <textarea
                ref={editorRef}
                value={chapter.prose}
                onChange={(e) => updateChapter(chapter.id, { 
                  prose: e.target.value, 
                  status: e.target.value.trim() ? 'human-edited' : 'premise-only',
                  updatedAt: new Date().toISOString(),
                })}
                placeholder="Begin your chapter here..."
                className={cn(
                  'w-full bg-transparent border-none outline-none resize-none',
                  'font-serif text-lg leading-[2] text-text-primary',
                  'placeholder:text-text-tertiary/50 placeholder:italic',
                  'min-h-[200px]'
                )}
              />
            </div>
          )}

          {/* THE EDITOR — prose exists */}
          {chapter.prose && (
            <div className="mt-6">
              <textarea
                ref={editorRef}
                value={chapter.prose}
                onChange={(e) => updateChapter(chapter.id, { 
                  prose: e.target.value, 
                  status: 'human-edited',
                  updatedAt: new Date().toISOString(),
                })}
                className={cn(
                  'w-full bg-transparent border-none outline-none resize-none',
                  'font-serif leading-[2] text-text-primary',
                  'focus:ring-0',
                  isFocusMode ? 'text-xl' : 'text-lg'
                )}
                style={{ minHeight: '500px' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Version Timeline */}
      {showHistory && chapter.prose && (
        <VersionTimeline
          chapterId={chapter.id}
          currentProse={chapter.prose}
          onRestore={(prose) => {
            updateChapter(chapter.id, { prose, status: 'human-edited', updatedAt: new Date().toISOString() });
            setShowHistory(false);
          }}
        />
      )}

      {/* Bottom status bar — subtle */}
      <div className={cn(
        'flex items-center justify-between px-6 py-2 border-t border-black/5 text-[10px] text-text-tertiary transition-all duration-300',
        isFocusMode && 'opacity-0 hover:opacity-100'
      )}>
        <div className="flex items-center gap-3">
          <span>{chapter.status === 'human-edited' ? 'Edited' : chapter.status === 'draft-generated' ? 'AI Draft' : 'Writing'}</span>
          <span>·</span>
          <span>Last saved {new Date(chapter.updatedAt).toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{wordCount.toLocaleString()} words</span>
          <span>·</span>
          <span>~{Math.ceil(wordCount / 250)} min read</span>
        </div>
      </div>
    </div>
  );
}
