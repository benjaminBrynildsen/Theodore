import { useState, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Volume2, VolumeX, Shuffle, Repeat, Loader2, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { useAudioStore } from '../../store/audio';
import { cn } from '../../lib/utils';

function CoverArt({ project, chapterImage, size = 'full' }: { project: { title: string; coverUrl?: string }; chapterImage?: string; size?: 'mini' | 'full' }) {
  const src = chapterImage || project.coverUrl;
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
export function MobilePlayerBar({ onExpand }: { onExpand: () => void }) {
  const { getActiveProject, getProjectChapters } = useStore();
  const { playing, currentChapterId, currentTime, duration, chapterAudio, generating, setPlaying } = useAudioStore();

  const project = getActiveProject();
  const chapters = project ? getProjectChapters(project.id).sort((a, b) => a.number - b.number) : [];
  const currentChapter = chapters.find(c => c.id === currentChapterId);
  const chapterImage = currentChapter?.imageUrl;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!project) return null;

  const hasActivity = currentChapterId || generating;

  const trackName = currentChapter
    ? `Chapter ${currentChapter.number} · ${currentChapter.title || project.title}`
    : generating ? 'Generating...' : 'No track playing';

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
          <div className="text-[11px] text-text-tertiary truncate">{project.title}</div>
        </div>

        {/* Play/pause */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (currentChapterId) setPlaying(!playing);
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
  const currentChapter = playableChapters.find(c => c.id === currentChapterId);
  const chapterIdx = currentChapterId ? playableChapters.findIndex(c => c.id === currentChapterId) : -1;
  const chapterImage = currentChapter?.imageUrl;
  const isMuted = volume === 0;
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

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

  const currentAudio = currentChapterId ? chapterAudio[currentChapterId] : null;
  const trackTitle = currentChapter
    ? `Chapter ${currentChapter.number} · ${currentChapter.title || ''}`
    : project.title;

  return (
    <div className="fixed inset-0 z-[70] bg-gradient-to-b from-[#e8e8e8] to-[#d0d0d0] flex flex-col animate-slide-up safe-area-top">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <button onClick={onCollapse} className="p-1">
          <ChevronDown size={24} className="text-text-secondary" />
        </button>
        <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">{project.title}</span>
        <div className="w-8" /> {/* Spacer */}
      </div>

      {/* Cover art */}
      <div className="flex-1 flex items-center justify-center px-8 py-4 min-h-0">
        <div className="aspect-square w-full max-w-[85vw] rounded-xl overflow-hidden shadow-xl">
          <CoverArt project={project} chapterImage={chapterImage} />
        </div>
      </div>

      {/* Track info */}
      <div className="px-8 pt-2">
        <h2 className="text-lg font-bold text-text-primary truncate">{trackTitle}</h2>
        <p className="text-sm text-text-tertiary truncate">{project.title}</p>
      </div>

      {/* Progress bar */}
      <div className="px-8 pt-4">
        <div
          className="h-1 bg-black/15 rounded-full cursor-pointer relative group"
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
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-text-primary rounded-full shadow-sm"
            style={{ left: `calc(${progressPct}% - 7px)` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] text-text-tertiary">{formatTime(currentTime)}</span>
          <span className="text-[10px] text-text-tertiary">{formatTime(duration || currentAudio?.durationEstimate || 0)}</span>
        </div>
      </div>

      {/* Playback controls */}
      <div className="flex items-center justify-center gap-7 py-4">
        <button className="text-text-tertiary/50">
          <Shuffle size={18} />
        </button>
        <button
          onClick={skipPrev}
          disabled={chapterIdx <= 0 || !!generating}
          className="text-text-secondary disabled:opacity-25 transition-colors"
        >
          <SkipBack size={28} fill="currentColor" />
        </button>
        <button
          onClick={() => { if (currentChapterId) setPlaying(!playing); }}
          disabled={!currentChapterId || !!generating}
          className="w-16 h-16 rounded-full bg-text-primary text-text-inverse flex items-center justify-center disabled:opacity-40 transition-all shadow-lg active:scale-95"
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
          className="text-text-secondary disabled:opacity-25 transition-colors"
        >
          <SkipForward size={28} fill="currentColor" />
        </button>
        <button className="text-text-tertiary/50">
          <Repeat size={18} />
        </button>
      </div>

      {/* Volume */}
      <div className="flex items-center gap-3 px-8 pb-8">
        <button onClick={() => setVolume(isMuted ? 1 : 0)} className="text-text-tertiary">
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1 h-1 appearance-none bg-black/15 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-text-primary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
        />
      </div>
    </div>
  );
}
