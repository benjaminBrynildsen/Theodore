import { useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Loader2, Shuffle, Repeat, Sparkles, Check, Circle } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { cn } from '../../lib/utils';

function CoverArt({ project, chapterImage }: { project: { title: string; coverUrl?: string }; chapterImage?: string }) {
  const src = chapterImage || project.coverUrl;
  if (src) {
    return <img src={src} alt="" className="w-full h-full object-cover" />;
  }
  return (
    <div className="w-full h-full bg-white flex items-center justify-center p-5 border border-black/[0.06]">
      <span className="text-black font-black text-2xl leading-tight text-center uppercase tracking-tight">
        {project.title}
      </span>
    </div>
  );
}

function buildTrackTitle(chapter: { number: number; scenes?: any[] }, sceneIndex: number | null, bookTitle: string): string {
  const chapterPart = sceneIndex !== null && (chapter.scenes?.length || 0) > 1
    ? `Chapter ${chapter.number}.${sceneIndex + 1}`
    : `Chapter ${chapter.number}`;
  return `${chapterPart}  |  ${bookTitle}`;
}

export function NowPlayingPanel() {
  const { getActiveProject, getProjectChapters, activeChapterId, chapters: allChapters } = useStore();
  const {
    playing, currentChapterId, currentTime, duration, volume,
    chapterAudio, generating, error,
    setPlaying, setVolume, setError,
  } = useAudioStore();

  const project = getActiveProject();
  const allProjectChapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const playableChapters = allProjectChapters.filter(c => c?.id && c.prose);
  const currentChapter = playableChapters.find(c => c.id === currentChapterId);
  const currentAudio = currentChapterId ? chapterAudio[currentChapterId] : null;
  const chapterIdx = currentChapterId ? playableChapters.findIndex(c => c.id === currentChapterId) : -1;
  const chapterImage = currentChapter?.imageUrl;
  const isMuted = volume === 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const generateTargetId = activeChapterId || currentChapterId;
  const generateTarget = generateTargetId ? playableChapters.find(c => c.id === generateTargetId) : null;

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

  if (!project) return null;

  const generatedCount = Object.keys(chapterAudio).filter(id => playableChapters.some(ch => ch.id === id)).length;
  const totalWords = allProjectChapters.reduce((sum, ch) => sum + (ch.prose?.split(/\s+/).filter(Boolean).length || 0), 0);

  const trackTitle = currentChapter
    ? buildTrackTitle(currentChapter, null, project.title)
    : project.title;

  return (
    <div className="h-full flex flex-col justify-between">
      {/* Top: scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Book header */}
        <div className="px-4 pt-4 pb-2">
          <h3 className="text-sm font-bold text-text-primary">{project.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-text-tertiary">{allProjectChapters.length} chapters</span>
            <span className="text-[11px] text-text-tertiary">·</span>
            <span className="text-[11px] text-text-tertiary">{totalWords.toLocaleString()} words</span>
            <span className="text-[11px] text-text-tertiary">·</span>
            <span className="text-[11px] text-text-tertiary">{generatedCount} audio</span>
          </div>
        </div>

        {/* Generate buttons */}
        {generateTarget && (() => {
          const scenes = (generateTarget.scenes || []).filter((s: any) => s?.id && s.prose?.trim()).sort((a: any, b: any) => a.order - b.order);
          const hasScenes = scenes.length > 1;
          const hasFullAudio = !!chapterAudio[generateTarget.id];

          return (
            <div className="px-4 pb-3 space-y-1.5">
              {/* Primary: Scene-level generate (when scenes exist) or full chapter */}
              <button
                onClick={() => dispatchGenerate(generateTarget.id)}
                disabled={!!generating}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all',
                  generating
                    ? 'bg-black/5 text-text-tertiary'
                    : 'bg-text-primary text-text-inverse hover:opacity-90 active:scale-[0.98] shadow-sm'
                )}
              >
                {generating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                {generating
                  ? 'Generating...'
                  : hasScenes
                    ? hasFullAudio
                      ? `Regenerate Scene 1`
                      : `Generate Scene 1`
                    : hasFullAudio
                      ? `Regenerate Ch. ${generateTarget.number}`
                      : `Generate Ch. ${generateTarget.number}`
                }
              </button>

              {/* Secondary: Full chapter button (greyed out when scenes exist) */}
              {hasScenes && (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium bg-black/[0.04] text-text-tertiary cursor-not-allowed"
                >
                  Generate Full Chapter
                </button>
              )}
            </div>
          );
        })()}

        {/* Error */}
        {error && (
          <div className="mx-4 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs mb-3">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}

        {/* Chapter tracklist */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">Tracklist</span>
            <span className="text-[10px] text-text-tertiary">{generatedCount}/{allProjectChapters.length}</span>
          </div>
          <div className="space-y-0.5">
            {allProjectChapters.map((ch) => {
              const audio = chapterAudio[ch.id];
              const isCurrent = ch.id === currentChapterId;
              const isChGenerating = generating === ch.id;
              const hasProse = !!ch.prose?.trim();

              return (
                <button
                  key={ch.id}
                  onClick={() => {
                    if (audio) dispatchPlay(ch.id);
                    else if (hasProse) dispatchPlay(ch.id);
                  }}
                  disabled={!hasProse}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all group',
                    isCurrent ? 'bg-black/[0.07]' : 'hover:bg-black/[0.03]',
                    !hasProse && 'opacity-30'
                  )}
                >
                  {/* Track number / status */}
                  <div className="w-6 flex-shrink-0 text-center">
                    {isChGenerating ? (
                      <Loader2 size={12} className="animate-spin text-text-tertiary mx-auto" />
                    ) : isCurrent && playing ? (
                      <div className="flex items-center justify-center gap-[2px] h-3">
                        <span className="w-[3px] h-2 bg-text-primary rounded-full animate-pulse" />
                        <span className="w-[3px] h-3 bg-text-primary rounded-full animate-pulse [animation-delay:150ms]" />
                        <span className="w-[3px] h-1.5 bg-text-primary rounded-full animate-pulse [animation-delay:300ms]" />
                      </div>
                    ) : (
                      <span className={cn(
                        'text-[12px] font-medium',
                        isCurrent ? 'text-text-primary' : 'text-text-tertiary group-hover:hidden'
                      )}>
                        {ch.number}
                      </span>
                    )}
                    {/* Play icon on hover (hidden when current) */}
                    {!isCurrent && !isChGenerating && hasProse && (
                      <Play size={12} className="text-text-primary hidden group-hover:block mx-auto" fill="currentColor" />
                    )}
                  </div>

                  {/* Title + status */}
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      'text-[12px] truncate',
                      isCurrent ? 'font-semibold text-text-primary' : 'text-text-secondary'
                    )}>
                      {ch.title || `Chapter ${ch.number}`}
                    </div>
                  </div>

                  {/* Audio status indicator */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {audio ? (
                      <>
                        <span className="text-[10px] text-text-tertiary">{formatTime(audio.durationEstimate)}</span>
                        <Check size={11} className="text-green-500" />
                      </>
                    ) : hasProse ? (
                      <Circle size={11} className="text-text-tertiary/30" />
                    ) : (
                      <span className="text-[9px] text-text-tertiary italic">no text</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Cover art + scrolling title + controls (pinned) */}
      <div className="flex-shrink-0 border-t border-black/[0.06]">
        {/* Cover art */}
        <div className="px-4 pt-4">
          <div className="aspect-square w-full rounded-lg overflow-hidden shadow-md">
            <CoverArt project={project} chapterImage={chapterImage} />
          </div>
        </div>

        {/* Scrolling track title */}
        <div className="px-4 pt-3 overflow-hidden">
          <div className="marquee-container">
            <div className={cn(
              'whitespace-nowrap text-[13px] font-semibold',
              currentChapter ? 'text-text-primary marquee-scroll' : 'text-text-tertiary'
            )}>
              <span>{trackTitle}</span>
              {currentChapter && (
                <span className="ml-16">{trackTitle}</span>
              )}
            </div>
          </div>
          {currentChapter && (
            <p className="text-[11px] text-text-tertiary mt-0.5 truncate">{currentChapter.title}</p>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-4 pt-2.5">
          <div
            className="h-1 bg-black/10 rounded-full cursor-pointer relative group"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seekTo((e.clientX - rect.left) / rect.width);
            }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-text-primary rounded-full transition-[width] duration-200"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-text-primary rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-text-tertiary">{formatTime(currentTime)}</span>
            <span className="text-[9px] text-text-tertiary">{formatTime(duration || currentAudio?.durationEstimate || 0)}</span>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center justify-center gap-5 py-2.5">
          <button className="text-text-tertiary/50 hover:text-text-secondary transition-colors">
            <Shuffle size={15} />
          </button>
          <button
            onClick={skipPrev}
            disabled={chapterIdx <= 0 || !!generating}
            className="text-text-secondary hover:text-text-primary disabled:opacity-25 transition-colors"
          >
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button
            onClick={() => {
              if (currentChapterId) setPlaying(!playing);
            }}
            disabled={!currentChapterId || !!generating}
            className="w-10 h-10 rounded-full bg-text-primary text-text-inverse flex items-center justify-center hover:scale-105 disabled:opacity-40 transition-all shadow-md"
          >
            {generating ? (
              <Loader2 size={20} className="animate-spin" />
            ) : playing ? (
              <Pause size={20} />
            ) : (
              <Play size={20} className="ml-0.5" fill="currentColor" />
            )}
          </button>
          <button
            onClick={skipNext}
            disabled={chapterIdx >= playableChapters.length - 1 || !!generating}
            className="text-text-secondary hover:text-text-primary disabled:opacity-25 transition-colors"
          >
            <SkipForward size={20} fill="currentColor" />
          </button>
          <button className="text-text-tertiary/50 hover:text-text-secondary transition-colors">
            <Repeat size={15} />
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2 px-4 pb-4">
          <button
            onClick={() => setVolume(isMuted ? 1 : 0)}
            className="text-text-tertiary hover:text-text-primary transition-colors"
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-1 appearance-none bg-black/10 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full"
          />
        </div>
      </div>
    </div>
  );
}
