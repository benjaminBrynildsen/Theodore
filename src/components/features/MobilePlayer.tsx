import { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Volume2, VolumeX, RotateCcw, RotateCw, Loader2, Sparkles, List, X, Check } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { extractDominantColor } from '../../lib/color-extract';
import { cn } from '../../lib/utils';

function CoverArt({ project, chapterImage, size = 'full' }: { project: { title: string; coverUrl?: string }; chapterImage?: string; size?: 'mini' | 'full' }) {
  // Prefer chapter image, then AI-generated project cover. Skip the old
  // procedural data-URL covers (just white bg + text) — the text fallback
  // below looks better than those.
  const projectCover = project.coverUrl && !project.coverUrl.startsWith('data:') ? project.coverUrl : null;
  const src = chapterImage || projectCover;
  if (src) {
    return <img src={src} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className={cn(
      'w-full h-full bg-white flex items-center justify-center border border-black/[0.06]',
      size === 'mini' ? 'p-1' : 'p-5'
    )}>
      <span className={cn(
        'text-black font-black leading-tight text-center uppercase tracking-tight',
        size === 'mini' ? 'text-[8px]' : 'text-2xl'
      )}>
        {project.title}
      </span>
    </div>
  );
}

/**
 * Compact mini-bar that sits at the bottom of the Studio panel.
 * Tap to expand into fullscreen player.
 */
/** Draggable progress scrubber for mobile fullscreen player */
function MobileScrubber({ progressPct, onSeek }: { progressPct: number; onSeek: (fraction: number) => void }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState(0);

  const fractionFromEvent = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const f = fractionFromEvent(e.clientX);
      setDragPct(f * 100);
      onSeek(f);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, fractionFromEvent, onSeek]);

  const displayPct = dragging ? dragPct : progressPct;

  return (
    <div
      ref={barRef}
      className="h-3 bg-white/20 rounded-full cursor-pointer relative touch-none select-none"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const f = fractionFromEvent(e.clientX);
        setDragPct(f * 100);
        setDragging(true);
        onSeek(f);
      }}
    >
      <div
        className="absolute inset-y-0 left-0 bg-white rounded-full"
        style={{ width: `${displayPct}%`, transition: dragging ? 'none' : 'width 200ms' }}
      />
      <div
        className={cn(
          'absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-sm',
          dragging ? 'scale-125' : ''
        )}
        style={{ left: `calc(${displayPct}% - 8px)` }}
      />
    </div>
  );
}

export function MobilePlayerBar({ onExpand }: { onExpand: () => void }) {
  const { getActiveProject, getProjectChapters } = useStore();
  const { playing, currentChapterId, currentTime, duration, chapterAudio, generating, setPlaying } = useAudioStore();

  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const currentChapter = chapters.find(c => c.id === currentChapterId)
    || (currentChapterId?.startsWith('scene-')
      ? chapters.find(c => (c as any).scenes?.some((s: any) => `scene-${s.id}` === currentChapterId))
      : undefined);
  const chapterImage = currentChapter?.imageUrl;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!project) return null;

  const hasActivity = currentChapterId || generating;

  const activeChapterId = useStore.getState().activeChapterId;
  const activeSceneId = useStore.getState().activeSceneId;
  const activeChapter = currentChapter || chapters.find(c => c.id === activeChapterId);
  const activeScene = activeChapter?.scenes?.find((s: any) => s.id === activeSceneId);
  const activeAudio = activeChapter ? chapterAudio[activeChapter.id] : null;
  const activeVersion = activeAudio?.activeVersion;

  const trackName = currentChapter
    ? `Chapter ${currentChapter.number} · ${currentChapter.title || project.title}`
    : generating ? 'Generating...'
    : activeChapter
      ? [
          project.title,
          `Ch. ${activeChapter.number}`,
          activeScene ? (activeScene as any).title : null,
          activeVersion ? `v${activeVersion}` : null,
        ].filter(Boolean).join(' · ')
      : project.title;

  return (
    <div className="flex-shrink-0">
      {/* Progress line at top */}
      <div className="h-[2px] bg-black/10">
        <div className="h-full bg-text-primary transition-[width] duration-200" style={{ width: `${progressPct}%` }} />
      </div>

      <button
        onClick={onExpand}
        className="w-full flex items-center gap-3 px-3 py-2.5 bg-[#f5f5f5] active:bg-[#eee] transition-colors"
      >
        {/* Mini cover art */}
        <div className="w-10 h-10 rounded-md overflow-hidden shadow-sm flex-shrink-0">
          <CoverArt project={project} chapterImage={chapterImage} size="mini" />
        </div>

        {/* Track info */}
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[13px] font-semibold text-text-primary truncate">{trackName}</div>
          <div className="text-[11px] text-text-tertiary truncate">
            {currentChapter ? project.title : activeChapter ? `${activeChapter.title || ''}` : project.title}
          </div>
        </div>

        {/* Play/pause */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (currentChapterId) {
              window.dispatchEvent(new CustomEvent('theodore:togglePlayback'));
            }
          }}
          className="w-8 h-8 flex items-center justify-center flex-shrink-0"
        >
          {generating ? (
            <Loader2 size={18} className="animate-spin text-text-tertiary" />
          ) : playing ? (
            <Pause size={20} className="text-text-primary" />
          ) : (
            <Play size={20} className="text-text-primary ml-0.5" fill="currentColor" />
          )}
        </div>
      </button>
    </div>
  );
}

/**
 * Fullscreen player — Spotify-style expanded view.
 */
export function MobilePlayerFullscreen({ onCollapse }: { onCollapse: () => void }) {
  const { getActiveProject, getProjectChapters, activeChapterId } = useStore();
  const {
    playing, currentChapterId, currentTime, duration, volume,
    chapterAudio, generating, error,
    setPlaying, setVolume, setError,
  } = useAudioStore();

  const project = getActiveProject();
  const allChapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const playableChapters = allChapters.filter(c => c?.id && c.prose);
  const currentChapter = playableChapters.find(c => c.id === currentChapterId)
    || (currentChapterId?.startsWith('scene-')
      ? playableChapters.find(c => (c as any).scenes?.some((s: any) => `scene-${s.id}` === currentChapterId))
      : undefined);
  const chapterIdx = currentChapter ? playableChapters.indexOf(currentChapter) : -1;
  const projectCover = project?.coverUrl && !project.coverUrl.startsWith('data:') ? project.coverUrl : null;
  const chapterImage = currentChapter?.imageUrl;
  const coverSrc = chapterImage || projectCover;
  const isMuted = volume === 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Extract dominant color from cover for dynamic background
  const [bgColor, setBgColor] = useState('#18181e');
  useEffect(() => {
    if (coverSrc) {
      void extractDominantColor(coverSrc).then(setBgColor);
    }
  }, [coverSrc]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const dispatchPlay = useCallback((chapterId: string) => {
    window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId } }));
  }, []);

  const dispatchGenerate = useCallback((chapterId: string) => {
    window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId } }));
  }, []);

  const seekTo = useCallback((fraction: number) => {
    window.dispatchEvent(new CustomEvent('theodore:seekAudio', { detail: { fraction } }));
  }, []);

  const skipPrev = useCallback(() => {
    if (chapterIdx > 0) dispatchPlay(playableChapters[chapterIdx - 1].id);
  }, [chapterIdx, playableChapters, dispatchPlay]);

  const skipNext = useCallback(() => {
    if (chapterIdx < playableChapters.length - 1) dispatchPlay(playableChapters[chapterIdx + 1].id);
  }, [chapterIdx, playableChapters, dispatchPlay]);

  const [showChapterList, setShowChapterList] = useState(false);
  const chapterListRef = useRef<HTMLDivElement>(null);

  // Scroll to current chapter when list opens
  useEffect(() => {
    if (showChapterList && chapterListRef.current && currentChapter) {
      const el = chapterListRef.current.querySelector(`[data-chapter="${currentChapter.id}"]`);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [showChapterList, currentChapter?.id]);

  // Check if a chapter has audio ready
  function getChapterAudioStatus(ch: any) {
    // Full chapter audio
    if (chapterAudio[ch.id]?.audioUrl) return { ready: true, dispatchId: ch.id };
    // Scene-level audio: check if first scene has audio
    const scenes = (ch.scenes || []).filter((s: any) => s.prose?.trim()).sort((a: any, b: any) => a.order - b.order);
    for (const s of scenes) {
      if (chapterAudio[`scene-${s.id}`]?.audioUrl) return { ready: true, dispatchId: `scene-${s.id}` };
    }
    return { ready: false, dispatchId: ch.id };
  }

  if (!project) return null;

  const currentAudio = currentChapterId ? chapterAudio[currentChapterId] : null;
  const trackTitle = currentChapter
    ? `Chapter ${currentChapter.number} · ${currentChapter.title || ''}`
    : project.title;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col animate-slide-up safe-area-top transition-colors duration-700"
      style={{ backgroundColor: bgColor }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <button onClick={onCollapse} className="p-1">
          <ChevronDown size={24} className="text-white/70" />
        </button>
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">{project.title}</span>
        <button onClick={() => setShowChapterList(true)} className="p-1" aria-label="Chapter list">
          <List size={22} className="text-white/70" />
        </button>
      </div>

      {/* Cover art */}
      <div className="flex-1 flex items-center justify-center px-8 py-4 min-h-0">
        <div className="aspect-square w-full max-w-[85vw] rounded-xl overflow-hidden shadow-2xl">
          <CoverArt project={project} chapterImage={chapterImage} />
        </div>
      </div>

      {/* Track info */}
      <div className="px-8 pt-2">
        <h2 className="text-lg font-bold text-white truncate">{trackTitle}</h2>
        <p className="text-sm text-white/50 truncate">{project.title}</p>
      </div>

      {/* Chapter selector button — like Audible */}
      <button
        onClick={() => setShowChapterList(true)}
        className="flex items-center justify-center gap-2 mx-auto mt-3 px-4 py-1.5 rounded-full bg-white/10 active:bg-white/20 transition-colors"
      >
        <List size={14} className="text-white/50" />
        <span className="text-[13px] text-white/70 font-medium">
          {currentChapter ? `Chapter ${currentChapter.number}` : 'Chapters'}
        </span>
      </button>

      {/* Progress bar — draggable */}
      <div className="px-8 pt-4">
        <MobileScrubber progressPct={progressPct} onSeek={seekTo} />
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-white/40">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-white/40">{formatTime(duration || currentAudio?.durationEstimate || 0)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-7 py-4">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('theodore:seekBy', { detail: { seconds: -15 } }))}
          disabled={!currentChapterId || !!generating}
          className="text-white/70 disabled:opacity-25 transition-colors relative"
          aria-label="Rewind 15 seconds"
        >
          <RotateCcw size={26} />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none">15</span>
        </button>
        <button
          onClick={skipPrev}
          disabled={chapterIdx <= 0 || !!generating}
          className="text-white/80 disabled:opacity-25 transition-colors"
          aria-label="Previous chapter"
        >
          <SkipBack size={28} fill="currentColor" />
        </button>
        <button
          onClick={() => { if (currentChapterId) window.dispatchEvent(new CustomEvent('theodore:togglePlayback')); }}
          disabled={!currentChapterId || !!generating}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center disabled:opacity-40 transition-all shadow-lg active:scale-95"
        >
          {generating ? (
            <Loader2 size={28} className="animate-spin" />
          ) : playing ? (
            <Pause size={28} />
          ) : (
            <Play size={28} className="ml-1" fill="currentColor" />
          )}
        </button>
        <button
          onClick={skipNext}
          disabled={chapterIdx >= playableChapters.length - 1 || !!generating}
          className="text-white/80 disabled:opacity-25 transition-colors"
          aria-label="Next chapter"
        >
          <SkipForward size={28} fill="currentColor" />
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('theodore:seekBy', { detail: { seconds: 15 } }))}
          disabled={!currentChapterId || !!generating}
          className="text-white/70 disabled:opacity-25 transition-colors relative"
          aria-label="Forward 15 seconds"
        >
          <RotateCw size={26} />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none">15</span>
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 px-8 pb-8">
        <button onClick={() => setVolume(isMuted ? 1 : 0)} className="text-white/40">
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
        />
      </div>

      {/* Chapter list overlay */}
      {showChapterList && (
        <div className="absolute inset-0 z-[80] flex flex-col bg-black/95 animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-lg font-bold text-white">Chapters</h3>
            <button onClick={() => setShowChapterList(false)} className="p-1">
              <X size={22} className="text-white/60" />
            </button>
          </div>

          {/* Scrollable chapter list */}
          <div ref={chapterListRef} className="flex-1 overflow-y-auto px-4 pb-8" style={{ WebkitOverflowScrolling: 'touch' }}>
            {allChapters.map((ch) => {
              const hasProse = !!ch.prose?.trim();
              const status = getChapterAudioStatus(ch);
              const isCurrent = currentChapter?.id === ch.id;
              const isGenerating = generating === ch.id;
              const durationEst = chapterAudio[ch.id]?.durationEstimate
                || chapterAudio[`scene-${(ch as any).scenes?.[0]?.id}`]?.durationEstimate;

              return (
                <button
                  key={ch.id}
                  data-chapter={ch.id}
                  disabled={!hasProse}
                  onClick={() => {
                    if (status.ready) {
                      dispatchPlay(status.dispatchId);
                    }
                    setShowChapterList(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left transition-all',
                    isCurrent ? 'bg-white/15' : 'active:bg-white/10',
                    !hasProse && 'opacity-30 cursor-not-allowed',
                  )}
                >
                  {/* Number / playing indicator */}
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    {isGenerating ? (
                      <Loader2 size={16} className="animate-spin text-white/60" />
                    ) : isCurrent && playing ? (
                      <div className="flex items-end gap-[3px] h-4">
                        <div className="w-[3px] bg-white rounded-full animate-pulse" style={{ height: '60%', animationDelay: '0ms' }} />
                        <div className="w-[3px] bg-white rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                        <div className="w-[3px] bg-white rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <span className={cn('text-sm font-bold', isCurrent ? 'text-white' : 'text-white/40')}>
                        {ch.number}
                      </span>
                    )}
                  </div>

                  {/* Title + duration */}
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-sm font-medium truncate', isCurrent ? 'text-white' : 'text-white/70')}>
                      {ch.title || `Chapter ${ch.number}`}
                    </div>
                    {durationEst && (
                      <div className="text-[11px] text-white/30">
                        ~{Math.ceil(durationEst / 60)} min
                      </div>
                    )}
                  </div>

                  {/* Audio status */}
                  <div className="flex-shrink-0">
                    {status.ready ? (
                      <Check size={16} className="text-emerald-400" />
                    ) : hasProse ? (
                      <div className="w-4 h-4 rounded-full border border-white/20" />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
