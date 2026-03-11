import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, Sparkles, Type, Maximize2, Minimize2, History, BookMarked, Mic, Scan, Search, Loader2, Heart, Expand, PenLine, MessageSquare } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { Badge } from '../ui/Badge';
import { VersionTimeline } from '../features/VersionTimeline';
import type { ProseSelection } from '../../types';
import { TokenBudget } from '../credits/TokenBudget';
import { DictationMode } from '../features/DictationMode';
import { ProseXRay } from '../features/ProseXRay';
import { SmartResearch } from '../features/SmartResearch';
import { VibeEditor } from '../editmode/VibeEditor';
import { generateStream } from '../../lib/generate';
import { buildGenerationPrompt } from '../../lib/prompt-builder';
import { cn } from '../../lib/utils';
import type { Chapter, WritingMode, GenerationType, Scene } from '../../types';

interface Props {
  chapter: Chapter;
}

export function ChapterView({ chapter }: Props) {
  const { setActiveChapter, updateChapter, setShowReadingMode, editMode, inlineEditOpen, setInlineEditOpen, activeSceneId, setActiveScene, updateScene, syncScenesToProse, inlineSelection, setInlineSelection, editHighlight, setEditHighlight } = useStore();
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
  const [showVibeEditor, setShowVibeEditor] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);
  const [sceneGeneratedText, setSceneGeneratedText] = useState('');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const proseDisplayRef = useRef<HTMLDivElement>(null);

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

    const isChildrensBook = project.subtype === 'childrens-book';
    const basePrompt = buildGenerationPrompt({
      project,
      chapter,
      allChapters: projectChapters,
      canonEntries,
      settings,
      writingMode: (settings.ai?.writingMode as WritingMode) || 'draft',
      generationType: 'full-chapter' as GenerationType,
      previousChapterProse: prevChapter?.prose,
    });
    // Children's books: the prompt already has strict word limits, no chunking needed
    const prompt = isChildrensBook
      ? basePrompt
      : basePrompt + `\n\nWrite only the opening chunk of this chapter (${chunkProfile.words} words). End on a continuation beat so more chunks can be added.`;

    let accumulated = '';
    await generateStream(
      {
        prompt,
        model: settings.ai?.preferredModel || 'gpt-4.1',
        maxTokens: isChildrensBook ? 300 : chunkProfile.maxTokens,
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

  // Generate prose for a single scene
  const handleGenerateScene = async (scene: Scene) => {
    if (!project) {
      setGenerationError('No active project selected.');
      return;
    }
    setGenerationError(null);
    setGeneratingSceneId(scene.id);
    setSceneGeneratedText('');

    const projectChapters = getProjectChapters(project.id);
    const canonEntries = getProjectEntries(project.id);
    const prevChapter = projectChapters.find(c => c.number === chapter.number - 1);

    const basePrompt = buildGenerationPrompt({
      project,
      chapter,
      allChapters: projectChapters,
      canonEntries,
      settings,
      writingMode: (settings.ai?.writingMode as WritingMode) || 'draft',
      generationType: 'full-chapter' as GenerationType,
      previousChapterProse: prevChapter?.prose,
    });

    // Find previous scenes' prose for continuity
    const sortedScenes = [...(chapter.scenes || [])].sort((a, b) => a.order - b.order);
    const sceneIdx = sortedScenes.findIndex(s => s.id === scene.id);
    const prevSceneProse = sortedScenes
      .slice(0, sceneIdx)
      .map(s => s.prose)
      .filter(Boolean)
      .join('\n\n');

    const scenePrompt = basePrompt +
      `\n\n=== SCENE TO WRITE ===\nScene ${scene.order}: "${scene.title}"\nSummary: ${scene.summary}` +
      (prevSceneProse ? `\n\n=== PREVIOUS SCENES IN THIS CHAPTER ===\n${prevSceneProse.slice(-2000)}` : '') +
      `\n\nWrite ONLY this scene (${chunkProfile.words} words). Write finished prose for this single scene only — no scene titles or headers.`;

    let accumulated = '';
    await generateStream(
      {
        prompt: scenePrompt,
        model: settings.ai?.preferredModel || 'gpt-4.1',
        maxTokens: chunkProfile.maxTokens,
        action: 'generate-scene',
        projectId: project.id,
        chapterId: chapter.id,
      },
      (text) => {
        accumulated += text;
        setSceneGeneratedText(accumulated);
      },
      () => {
        updateScene(chapter.id, scene.id, {
          prose: accumulated,
          status: 'drafted',
        });
        syncScenesToProse(chapter.id);
        setGeneratingSceneId(null);
        setSceneGeneratedText('');
      },
      (error) => {
        console.error('Scene generation error:', error);
        setGeneratingSceneId(null);
        setSceneGeneratedText('');
        if (error === 'INSUFFICIENT_CREDITS') {
          setGenerationError('Not enough credits.');
          return;
        }
        setGenerationError(`Generation failed: ${error}`);
      },
    );
  };

  // Helper: compute character offset within proseDisplayRef for a given node+offset
  const computeProseOffset = useCallback((container: Node, offset: number): number => {
    const proseEl = proseDisplayRef.current;
    if (!proseEl) return -1;
    const treeWalker = document.createTreeWalker(proseEl, NodeFilter.SHOW_TEXT);
    let charOffset = 0;
    while (treeWalker.nextNode()) {
      if (treeWalker.currentNode === container) return charOffset + offset;
      charOffset += (treeWalker.currentNode.textContent || '').length;
    }
    return -1;
  }, []);

  // Find the sentence boundaries around a character offset in the full prose
  const findSentenceAt = useCallback((text: string, offset: number): { start: number; end: number; sentence: string } | null => {
    // Sentence-ending pattern: . ! ? followed by space/newline or end of string
    const sentenceEnds = /[.!?](?:\s|$)/g;
    let sentenceStart = 0;
    let match;
    const ends: number[] = [];
    while ((match = sentenceEnds.exec(text)) !== null) {
      ends.push(match.index + 1); // include the punctuation
    }
    // Add end of text as final boundary
    ends.push(text.length);

    for (const end of ends) {
      if (offset <= end) {
        const sentence = text.slice(sentenceStart, end).trim();
        if (sentence.length > 0) {
          // Find actual start (skip leading whitespace)
          const actualStart = text.indexOf(sentence, sentenceStart);
          return { start: actualStart, end: actualStart + sentence.length, sentence };
        }
      }
      sentenceStart = end;
      // Skip whitespace after sentence
      while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) sentenceStart++;
    }
    return null;
  }, []);

  // Inline edit: handle click (sentence) or drag-select (custom range)
  const handleProseSelect = useCallback(() => {
    if (!inlineEditOpen || !proseDisplayRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);

    // Find which scene this click is in
    const sceneEl = (range.startContainer as Node).parentElement?.closest('[data-scene-name]');
    const sceneName = sceneEl?.getAttribute('data-scene-name') || undefined;

    if (!sel.isCollapsed) {
      // Drag-select: use the selected text directly
      const selectedText = sel.toString().trim();
      if (!selectedText || selectedText.length < 3) return;

      const startOffset = computeProseOffset(range.startContainer, range.startOffset);
      const endOffset = computeProseOffset(range.endContainer, range.endOffset);

      if (startOffset >= 0 && endOffset > startOffset) {
        setInlineSelection({ text: selectedText, startOffset, endOffset, sceneName });
        setEditHighlight({ start: startOffset, end: endOffset });
      }
    } else {
      // Click: auto-select the sentence at click position
      const clickOffset = computeProseOffset(range.startContainer, range.startOffset);
      if (clickOffset < 0) {
        // Clicked outside text — clear highlight
        setEditHighlight(null);
        setInlineSelection(null);
        return;
      }

      const result = findSentenceAt(chapter.prose, clickOffset);
      if (!result) {
        setEditHighlight(null);
        setInlineSelection(null);
        return;
      }

      setInlineSelection({ text: result.sentence, startOffset: result.start, endOffset: result.end, sceneName });
      setEditHighlight({ start: result.start, end: result.end });

      // Visually select the sentence in the DOM
      try {
        const proseEl = proseDisplayRef.current;
        const treeWalker = document.createTreeWalker(proseEl, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let startNode: Node | null = null;
        let startOff = 0;
        let endNode: Node | null = null;
        let endOff = 0;

        while (treeWalker.nextNode()) {
          const node = treeWalker.currentNode;
          const len = (node.textContent || '').length;
          if (!startNode && charCount + len > result.start) {
            startNode = node;
            startOff = result.start - charCount;
          }
          if (charCount + len >= result.end) {
            endNode = node;
            endOff = result.end - charCount;
            break;
          }
          charCount += len;
        }

        if (startNode && endNode) {
          const newRange = document.createRange();
          newRange.setStart(startNode, startOff);
          newRange.setEnd(endNode, endOff);
          sel.removeAllRanges();
          sel.addRange(newRange);
        }
      } catch {}
    }
  }, [inlineEditOpen, chapter.prose, computeProseOffset, findSentenceAt]);


  // Render prose with optional highlight for inline editing
  const renderHighlightedProse = useCallback((text: string) => {
    if (!editHighlight || !inlineEditOpen) return null;
    const before = text.slice(0, editHighlight.start);
    const highlighted = text.slice(editHighlight.start, editHighlight.end);
    const after = text.slice(editHighlight.end);

    const renderSection = (str: string) =>
      str.split('\n\n').map((p, i) => (
        <span key={i}>
          {i > 0 && <><br /><br /></>}
          {p.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {line}
            </span>
          ))}
        </span>
      ));

    return (
      <div className="font-serif leading-[2] text-text-primary" style={{ fontSize: isFocusMode ? '1.25rem' : '1.125rem' }}>
        {renderSection(before)}
        <mark className="bg-emerald-100 text-emerald-900 rounded px-0.5 transition-all duration-500">
          {renderSection(highlighted)}
        </mark>
        {renderSection(after)}
      </div>
    );
  }, [editHighlight, inlineEditOpen, isFocusMode]);

  // Edit mode scene state
  const scenes = chapter.scenes || [];
  const activeScene = editMode ? scenes.find(s => s.id === activeSceneId) || null : null;
  const displayProse = editMode && activeScene ? activeScene.prose : chapter.prose;
  const displayTitle = editMode && activeScene ? activeScene.title : chapter.title;

  // Calculate word count
  useEffect(() => {
    const text = editMode && activeScene ? activeScene.prose : chapter.prose;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setWordCount(words);
  }, [chapter.prose, activeScene?.prose, editMode]);

  // Auto-resize textarea
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto';
      editorRef.current.style.height = Math.max(editorRef.current.scrollHeight, 500) + 'px';
    }
  }, [chapter.prose, activeScene?.prose]);

  useEffect(() => {
    if (!isFocusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFocusMode]);

  // Scene scroll tracking
  const [visibleSceneId, setVisibleSceneId] = useState<string | null>(null);
  const sceneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const setSceneRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) sceneRefs.current.set(id, el);
    else sceneRefs.current.delete(id);
  }, []);

  useEffect(() => {
    if (editMode || !chapter.prose || scenes.length === 0) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible scene
        let topScene: { id: string; top: number } | null = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const sceneId = entry.target.getAttribute('data-scene-id');
            if (sceneId && (!topScene || entry.boundingClientRect.top < topScene.top)) {
              topScene = { id: sceneId, top: entry.boundingClientRect.top };
            }
          }
        }
        if (topScene) setVisibleSceneId(topScene.id);
      },
      {
        root: container,
        rootMargin: '-10% 0px -60% 0px',
        threshold: 0,
      }
    );

    for (const el of sceneRefs.current.values()) {
      observer.observe(el);
    }

    // Initialize with first scene
    const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
    if (sortedScenes.length > 0 && !visibleSceneId) {
      setVisibleSceneId(sortedScenes[0].id);
    }

    return () => observer.disconnect();
  }, [editMode, chapter.prose, scenes, scenes.length]);

  // Vibe Editor overlay
  if (showVibeEditor) {
    return <VibeEditor chapter={chapter} onClose={() => setShowVibeEditor(false)} />;
  }

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
          {editMode && activeScene && (
            <>
              <span className="text-text-tertiary text-xs hidden sm:inline">›</span>
              <span className="text-xs text-text-secondary font-medium truncate hidden sm:inline">Scene {activeScene.order}: {activeScene.title}</span>
            </>
          )}
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

          {/* Extend — hidden on mobile, hidden for children's books (pages are short) */}
          {project?.subtype !== 'childrens-book' && (
            <>
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
            </>
          )}

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

      {/* THE WRITING SPACE + INLINE EDIT */}
      <div className="flex-1 flex overflow-hidden">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        <div className={cn(
          'mx-auto px-4 sm:px-16 pb-32 transition-all duration-500',
          isFocusMode ? 'max-w-2xl pt-16' : 'max-w-3xl pt-4'
        )}>
          {/* Chapter / Scene Title */}
          <input
            type="text"
            value={displayTitle}
            onChange={(e) => {
              if (editMode && activeScene) {
                updateScene(chapter.id, activeScene.id, { title: e.target.value });
              } else {
                updateChapter(chapter.id, { title: e.target.value });
              }
            }}
            className={cn(
              'w-full bg-transparent border-none outline-none font-serif font-semibold tracking-tight placeholder:text-text-tertiary mb-2 transition-all duration-300',
              isFocusMode ? 'text-4xl' : 'text-3xl'
            )}
            placeholder={editMode && activeScene ? 'Scene title...' : 'Chapter title...'}
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

          {/* Empty state — no prose yet (or edit mode with empty scene) */}
          {(editMode && activeScene && !activeScene.prose) && (
            <div className="py-16 text-center animate-fade-in">
              <div className="glass-pill w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <Type size={28} className="text-text-tertiary" />
              </div>
              <p className="text-text-secondary mb-2 font-medium">Start writing this scene</p>
              <p className="text-sm text-text-tertiary max-w-xs mx-auto mb-4">
                Type below or use the chat panel to generate prose.
              </p>
              <textarea
                ref={editorRef}
                value=""
                onChange={(e) => {
                  updateScene(chapter.id, activeScene.id, {
                    prose: e.target.value,
                    status: e.target.value.trim() ? 'drafted' : 'outline',
                  });
                  syncScenesToProse(chapter.id);
                }}
                placeholder="Begin this scene..."
                className={cn(
                  'w-full bg-transparent border-none outline-none resize-none',
                  'font-serif text-lg leading-[2] text-text-primary',
                  'placeholder:text-text-tertiary/50 placeholder:italic',
                  'min-h-[200px]'
                )}
              />
            </div>
          )}
          {!editMode && !chapter.prose && (
            <div className="py-16 animate-fade-in">
              {/* Header */}
              <div className="text-center mb-8">
                <div className="glass-pill w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <Type size={28} className="text-text-tertiary" />
                </div>
                <p className="text-text-secondary mb-2 font-medium">Start writing</p>
                <p className="text-sm text-text-tertiary max-w-xs mx-auto mb-4">
                  {scenes.length > 0
                    ? 'Generate the whole chapter at once, or write scene by scene.'
                    : 'Type below to start writing, or generate.'}
                </p>
              </div>

              {/* Chunk size selector */}
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
              <p className="text-xs text-text-tertiary mb-4 text-center">Chunk target: {chunkProfile.words} words</p>

              {/* Generate whole chapter button */}
              <div className="text-center">
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
                    disabled={!!generatingSceneId}
                    className={cn(
                      'mb-6 px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 mx-auto transition-all',
                      generatingSceneId
                        ? 'bg-black/5 text-text-tertiary cursor-not-allowed'
                        : 'bg-text-primary text-text-inverse hover:shadow-lg',
                    )}
                  >
                    <Sparkles size={15} /> {project?.subtype === 'childrens-book' ? 'Generate Page Text' : 'Generate Full Chapter'}
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
                {!generating && !generatingSceneId && (
                  <button
                    onClick={() => setShowBudget((v) => !v)}
                    className="mb-3 text-xs text-text-tertiary hover:text-text-primary transition-colors"
                  >
                    {showBudget ? 'Hide credit budget' : 'View credit budget'}
                  </button>
                )}
              </div>

              {generationError && (
                <div className="max-w-sm mx-auto mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 text-center">
                  {generationError}
                </div>
              )}

              {/* Streaming preview while generating full chapter */}
              {generating && generatedText && (
                <div className="font-serif text-lg leading-[2] text-text-primary whitespace-pre-wrap animate-fade-in text-center">
                  {generatedText}
                  <span className="inline-block w-0.5 h-5 bg-black animate-pulse ml-0.5" />
                </div>
              )}

              {/* Scene-by-scene generation */}
              {scenes.length > 0 && !generating && (
                <div className="mt-8 border-t border-black/5 pt-8">
                  <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4 text-center">Or generate scene by scene</p>
                  <div className="space-y-3">
                    {[...scenes].sort((a, b) => a.order - b.order).map((scene) => {
                      const isThisGenerating = generatingSceneId === scene.id;
                      return (
                        <div key={scene.id} className="glass-pill rounded-xl p-4 animate-fade-in">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-1">
                                Scene {scene.order}
                              </div>
                              <p className="text-sm font-medium text-text-primary">{scene.title}</p>
                              {scene.summary && (
                                <p className="text-xs text-text-secondary mt-1 leading-relaxed">{scene.summary}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleGenerateScene(scene)}
                              disabled={!!generatingSceneId || generating}
                              className={cn(
                                'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all',
                                isThisGenerating
                                  ? 'bg-black/5 text-text-tertiary'
                                  : generatingSceneId || generating
                                    ? 'bg-black/5 text-text-tertiary cursor-not-allowed'
                                    : 'bg-text-primary text-text-inverse hover:shadow-md',
                              )}
                            >
                              {isThisGenerating ? (
                                <><Loader2 size={12} className="animate-spin" /> Writing...</>
                              ) : scene.prose ? (
                                <><Sparkles size={12} /> Regenerate</>
                              ) : (
                                <><Sparkles size={12} /> Generate</>
                              )}
                            </button>
                          </div>
                          {/* Streaming preview for this scene */}
                          {isThisGenerating && sceneGeneratedText && (
                            <div className="mt-3 pt-3 border-t border-black/5 font-serif text-base leading-[2] text-text-primary whitespace-pre-wrap">
                              {sceneGeneratedText}
                              <span className="inline-block w-0.5 h-4 bg-black animate-pulse ml-0.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick-start writing area */}
              {!generating && !generatingSceneId && (
                <div className={cn(scenes.length > 0 && 'mt-8 border-t border-black/5 pt-8')}>
                  {scenes.length > 0 && (
                    <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-4 text-center">Or write manually</p>
                  )}
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
            </div>
          )}

          {/* THE EDITOR — prose exists */}
          {/* Edit mode: scene-specific or all-scenes view */}
          {editMode && activeScene && activeScene.prose && (
            <div className="mt-6">
              <textarea
                ref={editorRef}
                value={activeScene.prose}
                onChange={(e) => {
                  updateScene(chapter.id, activeScene.id, {
                    prose: e.target.value,
                    status: 'edited',
                  });
                  syncScenesToProse(chapter.id);
                }}
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
          {editMode && !activeScene && scenes.length > 0 && (
            <div className="mt-6 space-y-0">
              {[...scenes].sort((a, b) => a.order - b.order).map((scene, idx) => (
                <div key={scene.id}>
                  {idx > 0 && (
                    <div className="flex items-center gap-3 py-4">
                      <div className="flex-1 border-t border-black/10" />
                      <span className="text-[10px] text-text-tertiary font-mono uppercase">Scene Break</span>
                      <div className="flex-1 border-t border-black/10" />
                    </div>
                  )}
                  <button
                    onClick={() => setActiveScene(scene.id)}
                    className="w-full text-left group cursor-pointer"
                    title={`Click to edit: ${scene.title}`}
                  >
                    <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2 group-hover:text-text-primary transition-colors">
                      Scene {scene.order}: {scene.title}
                    </div>
                    {scene.prose ? (
                      <div className={cn(
                        'font-serif leading-[2] text-text-primary whitespace-pre-wrap rounded-lg p-3 -mx-3 group-hover:bg-white/30 transition-colors',
                        isFocusMode ? 'text-xl' : 'text-lg'
                      )}>
                        {scene.prose}
                      </div>
                    ) : (
                      <div className="text-sm text-text-tertiary italic py-4 rounded-lg p-3 -mx-3 group-hover:bg-white/30 transition-colors">
                        No prose yet — click to edit this scene
                      </div>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* Normal mode — prose exists */}
          {!editMode && chapter.prose && (
            <div
              className="mt-6"
              onClick={(e) => {
                // Click on empty margin area (not on text) → clear highlight
                if (inlineEditOpen && e.target === e.currentTarget) {
                  setEditHighlight(null);
                  setInlineSelection(null);
                  window.getSelection()?.removeAllRanges();
                }
              }}
            >
              {/* INLINE EDIT MODE: selectable prose with highlights */}
              {inlineEditOpen ? (
                <div
                  ref={proseDisplayRef}
                  onMouseUp={handleProseSelect}
                  className="cursor-text select-text"
                >
                  {/* If we have a highlight, render with mark */}
                  {editHighlight ? (
                    renderHighlightedProse(chapter.prose)
                  ) : scenes.length > 0 ? (
                    /* Scenes: continuous selectable view */
                    <div className="relative">
                      {[...scenes].sort((a, b) => a.order - b.order).map((scene, idx) => {
                        const isActive = visibleSceneId === scene.id;
                        const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
                        const activeIdx = sortedScenes.findIndex(s => s.id === visibleSceneId);
                        const isFuture = idx > activeIdx;
                        return (
                          <div
                            key={scene.id}
                            ref={(el) => setSceneRef(scene.id, el)}
                            data-scene-id={scene.id}
                            data-scene-name={scene.title}
                            className="relative"
                          >
                            <div className={cn(
                              'absolute -left-4 sm:-left-12 top-0 bottom-0 w-1 rounded-full transition-all duration-500',
                              isActive ? 'bg-black' : 'bg-black/5'
                            )} />
                            <div className={cn(
                              'absolute -left-10 sm:-left-[5.5rem] z-10 transition-all duration-500 pointer-events-none',
                              isActive ? 'opacity-100' : 'opacity-0'
                            )} style={{ top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-lr' }}>
                              <span className="text-3xl font-black text-black uppercase tracking-[0.35em] whitespace-nowrap" style={{ transform: 'rotate(180deg)', display: 'block' }}>
                                Scene {scene.order}
                              </span>
                            </div>
                            {idx > 0 && (
                              <div className={cn('flex items-center gap-3 py-4 transition-opacity duration-500', isFuture ? 'opacity-30' : 'opacity-100')}>
                                <div className="flex-1 border-t border-black/10" />
                                <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider flex-shrink-0">
                                  {scene.title || `Scene ${scene.order}`}
                                </span>
                                <div className="flex-1 border-t border-black/10" />
                              </div>
                            )}
                            {idx === 0 && scene.title && (
                              <div className="pb-3 opacity-60">
                                <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">{scene.title}</span>
                              </div>
                            )}
                            {scene.prose ? (
                              <div className={cn(
                                'font-serif leading-[2] whitespace-pre-wrap transition-all duration-500',
                                isFocusMode ? 'text-xl' : 'text-lg',
                                isActive ? 'text-text-primary' : isFuture ? 'text-text-tertiary/40' : 'text-text-primary',
                              )}>
                                {scene.prose}
                              </div>
                            ) : (
                              <div className={cn('py-6 flex items-center gap-3 transition-opacity duration-500', isFuture ? 'opacity-30' : 'opacity-100')}>
                                <p className="text-sm text-text-tertiary italic flex-1">No prose yet</p>
                                <button
                                  onClick={() => handleGenerateScene(scene)}
                                  disabled={!!generatingSceneId || generating}
                                  className={cn(
                                    'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all',
                                    generatingSceneId === scene.id ? 'bg-black/5 text-text-tertiary'
                                      : generatingSceneId || generating ? 'bg-black/5 text-text-tertiary cursor-not-allowed'
                                      : 'bg-text-primary text-text-inverse hover:shadow-md',
                                  )}
                                >
                                  {generatingSceneId === scene.id ? <><Loader2 size={12} className="animate-spin" /> Writing...</> : <><Sparkles size={12} /> Generate</>}
                                </button>
                              </div>
                            )}
                            {generatingSceneId === scene.id && sceneGeneratedText && (
                              <div className="font-serif text-lg leading-[2] text-text-primary whitespace-pre-wrap animate-fade-in pb-4">
                                {sceneGeneratedText}
                                <span className="inline-block w-0.5 h-5 bg-black animate-pulse ml-0.5" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* No scenes: flat prose selectable view */
                    <div className={cn(
                      'font-serif leading-[2] text-text-primary whitespace-pre-wrap',
                      isFocusMode ? 'text-xl' : 'text-lg',
                    )}>
                      {chapter.prose}
                    </div>
                  )}
                </div>
              ) : (
                /* NORMAL MODE: editable textareas */
                <>
                  {scenes.length > 0 ? (
                    <div className="relative">
                      {[...scenes].sort((a, b) => a.order - b.order).map((scene, idx) => {
                        const isActive = visibleSceneId === scene.id;
                        const sortedScenes = [...scenes].sort((a, b) => a.order - b.order);
                        const activeIdx = sortedScenes.findIndex(s => s.id === visibleSceneId);
                        const isFuture = idx > activeIdx;
                        return (
                          <div
                            key={scene.id}
                            ref={(el) => setSceneRef(scene.id, el)}
                            data-scene-id={scene.id}
                            className="relative"
                          >
                            <div className={cn(
                              'absolute -left-4 sm:-left-12 top-0 bottom-0 w-1 rounded-full transition-all duration-500',
                              isActive ? 'bg-black' : 'bg-black/5'
                            )} />
                            <div className={cn(
                              'absolute -left-10 sm:-left-[5.5rem] z-10 transition-all duration-500 pointer-events-none',
                              isActive ? 'opacity-100' : 'opacity-0'
                            )} style={{ top: '50%', transform: 'translateY(-50%)', writingMode: 'vertical-lr' }}>
                              <span className="text-3xl font-black text-black uppercase tracking-[0.35em] whitespace-nowrap" style={{ transform: 'rotate(180deg)', display: 'block' }}>
                                Scene {scene.order}
                              </span>
                            </div>
                            {idx > 0 && (
                              <div className={cn('flex items-center gap-3 py-4 transition-opacity duration-500', isFuture ? 'opacity-30' : 'opacity-100')}>
                                <div className="flex-1 border-t border-black/10" />
                                <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider flex-shrink-0">
                                  {scene.title || `Scene ${scene.order}`}
                                </span>
                                <div className="flex-1 border-t border-black/10" />
                              </div>
                            )}
                            {idx === 0 && scene.title && (
                              <div className="pb-3 opacity-60">
                                <span className="text-[10px] text-text-tertiary font-mono uppercase tracking-wider">{scene.title}</span>
                              </div>
                            )}
                            {scene.prose ? (
                              <textarea
                                value={scene.prose}
                                onChange={(e) => {
                                  updateScene(chapter.id, scene.id, {
                                    prose: e.target.value,
                                    status: e.target.value.trim() ? 'edited' : 'outline',
                                  });
                                  syncScenesToProse(chapter.id);
                                }}
                                className={cn(
                                  'w-full bg-transparent border-none outline-none resize-none overflow-hidden',
                                  'font-serif leading-[2]',
                                  'focus:ring-0',
                                  'transition-all duration-500',
                                  isFocusMode ? 'text-xl' : 'text-lg',
                                  isActive ? 'text-text-primary' : isFuture ? 'text-text-tertiary/40' : 'text-text-primary',
                                )}
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = 'auto';
                                    el.style.height = Math.max(80, el.scrollHeight) + 'px';
                                  }
                                }}
                                onInput={(e) => {
                                  const el = e.target as HTMLTextAreaElement;
                                  el.style.height = 'auto';
                                  el.style.height = Math.max(80, el.scrollHeight) + 'px';
                                }}
                              />
                            ) : (
                              <div className={cn('py-6 flex items-center gap-3 transition-opacity duration-500', isFuture ? 'opacity-30' : 'opacity-100')}>
                                <p className="text-sm text-text-tertiary italic flex-1">No prose yet</p>
                                <button
                                  onClick={() => handleGenerateScene(scene)}
                                  disabled={!!generatingSceneId || generating}
                                  className={cn(
                                    'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all',
                                    generatingSceneId === scene.id ? 'bg-black/5 text-text-tertiary'
                                      : generatingSceneId || generating ? 'bg-black/5 text-text-tertiary cursor-not-allowed'
                                      : 'bg-text-primary text-text-inverse hover:shadow-md',
                                  )}
                                >
                                  {generatingSceneId === scene.id ? <><Loader2 size={12} className="animate-spin" /> Writing...</> : <><Sparkles size={12} /> Generate</>}
                                </button>
                              </div>
                            )}
                            {generatingSceneId === scene.id && sceneGeneratedText && (
                              <div className="font-serif text-lg leading-[2] text-text-primary whitespace-pre-wrap animate-fade-in pb-4">
                                {sceneGeneratedText}
                                <span className="inline-block w-0.5 h-5 bg-black animate-pulse ml-0.5" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
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
                  )}
                </>
              )}
            </div>
          )}
        </div>
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
