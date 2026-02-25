import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, Sparkles, Type, Maximize2, Minimize2, History, BookMarked, Mic, Scan, Search, Loader2, Heart, Expand } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { Badge } from '../ui/Badge';
import { VersionTimeline } from '../features/VersionTimeline';
import { TokenBudget } from '../credits/TokenBudget';
import { DictationMode } from '../features/DictationMode';
import { ProseXRay } from '../features/ProseXRay';
import { SmartResearch } from '../features/SmartResearch';
import { generateStream } from '../../lib/generate';
import { buildGenerationPrompt } from '../../lib/prompt-builder';
import { cn } from '../../lib/utils';
import type { Chapter, WritingMode, GenerationType } from '../../types';

interface Props {
  chapter: Chapter;
}

export function ChapterView({ chapter }: Props) {
  const { setActiveChapter, updateChapter, setShowReadingMode } = useStore();
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showDictation, setShowDictation] = useState(false);
  const [showXRay, setShowXRay] = useState(false);
  const [showResearch, setShowResearch] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [extending, setExtending] = useState(false);
  const [generatedText, setGeneratedText] = useState('');
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [chunkSize, setChunkSize] = useState<'short' | 'medium' | 'long'>('medium');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const { getActiveProject, getProjectChapters, chapters: allChapters } = useStore();
  const { getProjectEntries } = useCanonStore();
  const { settings } = useSettingsStore();
  const project = getActiveProject();
  const liked = Boolean((chapter.aiIntentMetadata as any)?.userFeedback?.liked);
  const chunkProfiles: Record<'short' | 'medium' | 'long', { label: string; words: string; maxTokens: number }> = {
    short: { label: 'Quick', words: '700-1,000', maxTokens: 1400 },
    medium: { label: 'Standard', words: '1,000-1,500', maxTokens: 2200 },
    long: { label: 'Long', words: '1,600-2,200', maxTokens: 3200 },
  };
  const chunkProfile = chunkProfiles[chunkSize];

  // AI Generation handler
  const handleGenerate = async () => {
    if (!project) {
      setGenerationError('No active project selected. Open a project and try again.');
      return;
    }
    setGenerationError(null);
    setGenerating(true);
    setGeneratedText('');

    const projectChapters = getProjectChapters(project.id);
    const canonEntries = getProjectEntries(project.id);
    const prevChapter = projectChapters.find(c => c.number === chapter.number - 1);

    const prompt = buildGenerationPrompt({
      project,
      chapter,
      allChapters: projectChapters,
      canonEntries,
      settings,
      writingMode: (settings.ai?.writingMode as WritingMode) || 'draft',
      generationType: 'full-chapter' as GenerationType,
      previousChapterProse: prevChapter?.prose,
    }) + `\n\nWrite only the opening chunk of this chapter (${chunkProfile.words} words). End on a continuation beat so more chunks can be added.`;

    let accumulated = '';
    await generateStream(
      {
        prompt,
        model: settings.ai?.preferredModel || 'gpt-4.1',
        maxTokens: chunkProfile.maxTokens,
        action: 'generate-chapter',
        projectId: project.id,
        chapterId: chapter.id,
      },
      (text) => {
        accumulated += text;
        setGeneratedText(accumulated);
      },
      (usage) => {
        // Generation complete — save to chapter
        updateChapter(chapter.id, {
          prose: accumulated,
          status: 'draft-generated',
          aiIntentMetadata: {
            model: usage.creditsUsed ? settings.ai?.preferredModel || 'gpt-4.1' : 'unknown',
            generatedAt: new Date().toISOString(),
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            creditsUsed: usage.creditsUsed,
            historySource: 'ai-generated',
            chunking: {
              mode: 'start',
              chunkSize,
              targetWords: chunkProfile.words,
            },
          },
        });
        setGenerating(false);
        setGeneratedText('');
      },
      (error) => {
        console.error('Generation error:', error);
        setGenerating(false);
        if (error === 'INSUFFICIENT_CREDITS') {
          setGenerationError('Not enough credits. Upgrade your plan to continue generating.');
          return;
        }
        setGenerationError(`Generation failed: ${error}`);
      },
    );
  };

  const toggleLike = () => {
    const currentMeta = ((chapter.aiIntentMetadata || {}) as Record<string, any>);
    const currentFeedback = (currentMeta.userFeedback || {}) as Record<string, any>;
    updateChapter(chapter.id, {
      aiIntentMetadata: {
        ...currentMeta,
        userFeedback: {
          ...currentFeedback,
          liked: !liked,
          updatedAt: new Date().toISOString(),
        },
      } as any,
    });
  };

  const handleExtend = async () => {
    if (!project) {
      setGenerationError('No active project selected. Open a project and try again.');
      return;
    }
    if (!chapter.prose.trim() || extending) return;
    setGenerationError(null);
    setExtending(true);

    const projectChapters = getProjectChapters(project.id);
    const canonEntries = getProjectEntries(project.id);
    const prevChapter = projectChapters.find(c => c.number === chapter.number - 1);
    const prompt = buildGenerationPrompt({
      project,
      chapter,
      allChapters: projectChapters,
      canonEntries,
      settings,
      writingMode: (settings.ai?.writingMode as WritingMode) || 'draft',
      generationType: 'full-chapter' as GenerationType,
      previousChapterProse: prevChapter?.prose,
    }) + `\n\nContinue this chapter from the exact ending of the current draft. Add only the next ${chunkProfile.words} words. Do not restart scenes. End on a continuation beat.`;

    let extension = '';
    await generateStream(
      {
        prompt,
        model: settings.ai?.preferredModel || 'gpt-4.1',
        maxTokens: chunkProfile.maxTokens,
        action: 'extend-chapter',
        projectId: project.id,
        chapterId: chapter.id,
      },
      (text) => {
        extension += text;
        setGeneratedText(extension);
      },
      () => {
        const latest = useStore.getState().chapters.find((c) => c.id === chapter.id);
        const baseProse = latest?.prose ?? chapter.prose;
        const trimmed = extension.trim();
        if (trimmed) {
          const joiner = baseProse.endsWith('\n') ? '\n' : '\n\n';
          updateChapter(chapter.id, {
            prose: `${baseProse}${joiner}${trimmed}`,
            status: 'human-edited',
            aiIntentMetadata: {
              ...((latest?.aiIntentMetadata || chapter.aiIntentMetadata || {}) as Record<string, any>),
              lastExtendedAt: new Date().toISOString(),
              historySource: 'ai-generated',
              chunking: {
                mode: 'continue',
                chunkSize,
                targetWords: chunkProfile.words,
              },
            } as any,
          });
        }
        setGeneratedText('');
        setExtending(false);
      },
      (error) => {
        console.error('Extend error:', error);
        setGeneratedText('');
        setExtending(false);
        if (error === 'INSUFFICIENT_CREDITS') {
          setGenerationError('Not enough credits. Upgrade your plan to continue extending.');
          return;
        }
        setGenerationError(`Generation failed: ${error}`);
      },
    );
  };

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

  useEffect(() => {
    if (!isFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocusMode]);

  return (
    <div className={cn(
      'flex-1 flex flex-col overflow-hidden animate-fade-in transition-all duration-500',
      isFocusMode && 'fixed inset-0 z-40 bg-white'
    )}>
      {isFocusMode && (
        <button
          onClick={() => setIsFocusMode(false)}
          className="fixed top-4 right-4 z-50 px-3 py-2 rounded-xl bg-black/80 text-white text-xs font-medium hover:bg-black transition-colors"
          title="Exit focus mode"
        >
          Exit Focus
        </button>
      )}

      {/* Minimal top bar */}
      <div className={cn(
        'flex items-center justify-between px-3 sm:px-6 py-3 transition-all duration-300',
        isFocusMode ? 'opacity-0 hover:opacity-100' : ''
      )}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setActiveChapter(null)}
            className="flex items-center gap-1 text-text-tertiary hover:text-text-primary text-sm transition-colors flex-shrink-0"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Chapters</span>
          </button>
          <span className="text-text-tertiary text-xs hidden sm:inline">·</span>
          <span className="text-xs text-text-tertiary font-mono flex-shrink-0">Ch. {chapter.number}</span>
          <span className="hidden sm:inline"><Badge status={chapter.status} /></span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Word count */}
          <span className="text-xs text-text-tertiary font-mono flex-shrink-0">
            {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          </span>

          {/* Like — hidden on mobile */}
          <button
            onClick={toggleLike}
            className={cn(
              'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hidden sm:flex items-center gap-1',
              liked
                ? 'bg-rose-100 text-rose-700'
                : 'text-text-tertiary hover:text-text-primary hover:bg-white/40',
            )}
            title={liked ? 'Unlike chapter' : 'Like chapter'}
          >
            <Heart size={13} className={liked ? 'fill-current' : ''} />
            {liked ? 'Liked' : 'Like'}
          </button>

          {/* Extend — hidden on mobile */}
          <button
            onClick={() => setChunkSize((prev) => (prev === 'short' ? 'medium' : prev === 'medium' ? 'long' : 'short'))}
            className="hidden sm:block px-2 py-1.5 rounded-lg text-[11px] font-medium text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all"
            title="Chunk size"
          >
            {chunkProfile.label}
          </button>
          <button
            onClick={handleExtend}
            disabled={!chapter.prose.trim() || extending || generating}
            className={cn(
              'hidden sm:flex px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all items-center gap-1',
              !chapter.prose.trim() || extending || generating
                ? 'bg-black/5 text-text-tertiary cursor-not-allowed'
                : 'bg-text-primary text-text-inverse hover:shadow-md',
            )}
            title="Extend chapter"
          >
            {extending ? <Loader2 size={13} className="animate-spin" /> : <Expand size={13} />}
            {extending ? 'Extending...' : 'Extend'}
          </button>

          {/* Version history — hidden on mobile */}
          {chapter.prose && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={cn('hidden sm:block p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all', showHistory && 'bg-white/40 text-text-primary')}
              title="Version history"
            >
              <History size={15} />
            </button>
          )}

          {/* X-Ray — hidden on mobile */}
          {chapter.prose && (
            <button
              onClick={() => setShowXRay(!showXRay)}
              className={cn('hidden sm:block p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all', showXRay && 'bg-white/40 text-text-primary')}
              title="Prose X-Ray"
            >
              <Scan size={15} />
            </button>
          )}

          {/* Research — hidden on mobile */}
          <button
            onClick={() => setShowResearch(!showResearch)}
            className={cn('hidden sm:block p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all', showResearch && 'bg-white/40 text-text-primary')}
            title="Smart Research"
          >
            <Search size={15} />
          </button>

          {/* Dictation — hidden on mobile */}
          <button
            onClick={() => setShowDictation(!showDictation)}
            className={cn('hidden sm:block p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all', showDictation && 'bg-white/40 text-red-500')}
            title="Dictation mode"
          >
            <Mic size={15} />
          </button>

          {/* Reading mode */}
          <button
            onClick={() => setShowReadingMode(true)}
            className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all"
            title="Reading mode"
          >
            <BookMarked size={15} />
          </button>

          {/* Focus mode toggle — hidden on mobile */}
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className="hidden sm:block p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40 transition-all"
            title={isFocusMode ? 'Exit focus mode' : 'Focus mode'}
          >
            {isFocusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* THE WRITING SPACE */}
      <div className="flex-1 overflow-y-auto">
        <div className={cn(
          'mx-auto px-4 sm:px-8 pb-32 transition-all duration-500',
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
              <p className="text-sm text-text-tertiary max-w-xs mx-auto mb-4">
                Type below to start writing, or generate.
              </p>
              
              {/* Generate with budget */}
              <div className="mb-4 mx-auto w-fit rounded-xl glass-pill p-1 flex gap-1">
                {(['short', 'medium', 'long'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setChunkSize(size)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs transition-all',
                      chunkSize === size ? 'bg-text-primary text-text-inverse shadow-sm' : 'text-text-secondary',
                    )}
                  >
                    {chunkProfiles[size].label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-tertiary mb-4">Chunk target: {chunkProfile.words} words</p>
              {generating ? (
                <div className="mb-6 flex items-center gap-2 text-sm text-text-secondary justify-center">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Generating...</span>
                </div>
              ) : !showBudget ? (
                <button
                  onClick={() => {
                    setShowBudget(false);
                    handleGenerate();
                  }}
                  className="mb-6 px-5 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-medium flex items-center gap-2 mx-auto hover:shadow-lg transition-all"
                >
                  <Sparkles size={15} /> Generate
                </button>
              ) : (
                <div className="max-w-sm mx-auto mb-6">
                  <TokenBudget
                    chapterId={chapter.id}
                    action="generate-chapter-full"
                    onConfirm={() => {
                      setShowBudget(false);
                      handleGenerate();
                    }}
                    onCancel={() => setShowBudget(false)}
                  />
                </div>
              )}
              {!generating && (
                <button
                  onClick={() => setShowBudget((v) => !v)}
                  className="mb-3 text-xs text-text-tertiary hover:text-text-primary transition-colors"
                >
                  {showBudget ? 'Hide credit budget' : 'View credit budget'}
                </button>
              )}
              {generationError && (
                <div className="max-w-sm mx-auto mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {generationError}
                </div>
              )}
              
              {/* Streaming preview while generating */}
              {generating && generatedText && (
                <div className="font-serif text-lg leading-[2] text-text-primary whitespace-pre-wrap animate-fade-in">
                  {generatedText}
                  <span className="inline-block w-0.5 h-5 bg-black animate-pulse ml-0.5" />
                </div>
              )}

              {/* Quick-start writing area */}
              {!generating && (
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
              )}
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

      {/* Prose X-Ray */}
      {showXRay && chapter.prose && <ProseXRay chapterId={chapter.id} />}

      {/* Smart Research */}
      {showResearch && <SmartResearch chapterId={chapter.id} />}

      {/* Dictation Mode */}
      {showDictation && <DictationMode chapterId={chapter.id} />}

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
