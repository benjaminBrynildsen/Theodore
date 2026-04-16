import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronDown, ChevronUp, RotateCcw, RotateCw, Volume2, VolumeX, List, X, BookOpen } from 'lucide-react';
import { type PublicBook, type PublicChapterSummary, type PublicAudio, trackListen } from './api';

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface PlayerState {
  book: PublicBook;
  slug: string;
  chapters: PublicChapterSummary[];
  currentChapterId: string | null;
  audio: PublicAudio | null;
  prose: string | null;
  chapterTitle: string;
  chapterNumber: number;
}

interface Props {
  state: PlayerState;
  onChapterSelect: (chapterId: string) => void;
  onClose: () => void;
}

function Scrubber({ progressPct, onSeek }: { progressPct: number; onSeek: (fraction: number) => void }) {
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
    const onMove = (e: PointerEvent) => { setDragPct(fractionFromEvent(e.clientX) * 100); onSeek(fractionFromEvent(e.clientX)); };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
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
      <div className="absolute inset-y-0 left-0 bg-white rounded-full" style={{ width: `${displayPct}%`, transition: dragging ? 'none' : 'width 200ms' }} />
      <div className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-sm ${dragging ? 'scale-125' : ''}`} style={{ left: `calc(${displayPct}% - 8px)` }} />
    </div>
  );
}

export function LibraryPlayerFullscreen({ state, onChapterSelect, onClose }: Props & { onMinimize: () => void }) {
  const { book, slug, chapters, audio, chapterTitle, chapterNumber } = state;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showChapters, setShowChapters] = useState(false);
  const [showText, setShowText] = useState(false);
  const [segmentIdx, setSegmentIdx] = useState(0);
  const listenTracked = useRef(false);
  const isMuted = volume === 0;

  const segments = audio?.segments && audio.segments.length ? audio.segments : (audio ? [{ audioUrl: audio.audioUrl, durationSeconds: audio.durationSeconds }] : []);
  const segmentOffsets = segments.reduce<number[]>((acc, _s, i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + (segments[i - 1].durationSeconds || 0));
    return acc;
  }, []);
  const totalDuration = audio?.durationSeconds || segments.reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

  const chapterIdx = chapters.findIndex(c => c.id === state.currentChapterId);
  const coverSrc = book.coverUrl;
  const progressPct = totalDuration > 0 ? ((segmentOffsets[segmentIdx] || 0) + currentTime) / totalDuration * 100 : 0;

  // Reset when audio source changes (chapter change)
  useEffect(() => {
    setSegmentIdx(0);
    setCurrentTime(0);
  }, [audio?.audioUrl]);

  // Load + play current segment
  useEffect(() => {
    if (!segments.length) return;
    const seg = segments[segmentIdx];
    if (!seg) return;

    const a = new Audio(seg.audioUrl);
    a.preload = 'auto';
    a.volume = volume;
    audioRef.current = a;

    a.addEventListener('loadedmetadata', () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration); });
    a.addEventListener('durationchange', () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration); });
    a.addEventListener('timeupdate', () => setCurrentTime(a.currentTime));
    a.addEventListener('ended', () => {
      if (segmentIdx < segments.length - 1) {
        setSegmentIdx(i => i + 1);
      } else {
        setPlaying(false);
        if (chapterIdx < chapters.length - 1) onChapterSelect(chapters[chapterIdx + 1].id);
      }
    });

    if (book && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapterTitle,
        artist: book.authorDisplayName,
        album: book.title,
      });
      navigator.mediaSession.setActionHandler('play', () => { a.play(); setPlaying(true); });
      navigator.mediaSession.setActionHandler('pause', () => { a.pause(); setPlaying(false); });
      navigator.mediaSession.setActionHandler('previoustrack', () => { if (chapterIdx > 0) onChapterSelect(chapters[chapterIdx - 1].id); });
      navigator.mediaSession.setActionHandler('nexttrack', () => { if (chapterIdx < chapters.length - 1) onChapterSelect(chapters[chapterIdx + 1].id); });
    }

    a.play().then(() => setPlaying(true)).catch(() => {});
    if (!listenTracked.current) { listenTracked.current = true; trackListen(slug); }

    return () => { a.pause(); a.src = ''; };
  }, [segments[segmentIdx]?.audioUrl]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Broadcast play state for mini bar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('library:playStateChanged', { detail: { playing } }));
  }, [playing]);

  // Listen for toggle from mini bar
  useEffect(() => {
    const handler = () => togglePlay();
    window.addEventListener('library:togglePlay', handler);
    return () => window.removeEventListener('library:togglePlay', handler);
  }, [playing]);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const seekToGlobal = useCallback((globalSeconds: number) => {
    // Find which segment this falls into
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const segDur = segments[i].durationSeconds || 0;
      if (globalSeconds <= acc + segDur || i === segments.length - 1) {
        const local = Math.max(0, globalSeconds - acc);
        if (i === segmentIdx) {
          const a = audioRef.current;
          if (a) a.currentTime = Math.min(a.duration || local, local);
        } else {
          setSegmentIdx(i);
          // Once new segment loads, jump to local position
          setTimeout(() => { const a = audioRef.current; if (a) a.currentTime = local; }, 100);
        }
        return;
      }
      acc += segDur;
    }
  }, [segments, segmentIdx]);

  const seekTo = useCallback((fraction: number) => {
    seekToGlobal(fraction * totalDuration);
  }, [seekToGlobal, totalDuration]);

  const seekBy = (seconds: number) => {
    const currentGlobal = (segmentOffsets[segmentIdx] || 0) + currentTime;
    seekToGlobal(Math.max(0, Math.min(totalDuration, currentGlobal + seconds)));
  };

  const noAudio = !audio;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-neutral-900" style={{ background: 'linear-gradient(180deg, #1a1a2e 0%, #0a0a0f 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 safe-area-top">
        <button onClick={onClose} className="p-1"><ChevronDown size={24} className="text-white/70" /></button>
        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider truncate max-w-[60%]">{book.title}</span>
        <button onClick={() => setShowChapters(true)} className="p-1"><List size={22} className="text-white/70" /></button>
      </div>

      {/* Cover */}
      <div className="flex-1 flex items-center justify-center px-8 py-4 min-h-0">
        <div className="aspect-square w-full max-w-[80vw] max-h-[40vh] rounded-xl overflow-hidden shadow-2xl">
          {coverSrc ? (
            <img src={coverSrc} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white flex items-center justify-center p-5">
              <span className="text-2xl text-black font-black uppercase tracking-tight text-center">{book.title}</span>
            </div>
          )}
        </div>
      </div>

      {/* Track info */}
      <div className="px-8 pt-2">
        <h2 className="text-lg font-bold text-white truncate">Chapter {chapterNumber} · {chapterTitle}</h2>
        <p className="text-sm text-white/50 truncate">by {book.authorDisplayName}</p>
      </div>

      {/* Chapter + text toggle */}
      <div className="flex items-center justify-center gap-3 mt-3">
        <button onClick={() => setShowChapters(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 active:bg-white/20">
          <List size={14} className="text-white/50" />
          <span className="text-[13px] text-white/70 font-medium">Chapter {chapterNumber}</span>
        </button>
        {state.prose && (
          <button onClick={() => setShowText(!showText)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 active:bg-white/20">
            <BookOpen size={14} className="text-white/50" />
            <span className="text-[13px] text-white/70 font-medium">{showText ? 'Hide text' : 'Read along'}</span>
          </button>
        )}
      </div>

      {noAudio ? (
        <div className="px-8 py-8 text-center">
          <p className="text-white/50 text-sm">Audio hasn't been generated for this chapter yet.</p>
          {state.prose && (
            <button onClick={() => setShowText(true)} className="mt-3 px-4 py-2 rounded-full bg-white/10 text-white/70 text-sm">
              Read the text instead
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Progress bar */}
          <div className="px-8 pt-4">
            <Scrubber progressPct={progressPct} onSeek={seekTo} />
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-white/40">{formatTime((segmentOffsets[segmentIdx] || 0) + currentTime)}</span>
              <span className="text-[10px] text-white/40">{formatTime(totalDuration)}</span>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-7 py-4">
            <button onClick={() => seekBy(-15)} className="text-white/70 relative">
              <RotateCcw size={26} />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none">15</span>
            </button>
            <button onClick={() => { if (chapterIdx > 0) onChapterSelect(chapters[chapterIdx - 1].id); }} disabled={chapterIdx <= 0} className="text-white/80 disabled:opacity-25">
              <SkipBack size={28} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform">
              {playing ? <Pause size={28} /> : <Play size={28} className="ml-1" fill="currentColor" />}
            </button>
            <button onClick={() => { if (chapterIdx < chapters.length - 1) onChapterSelect(chapters[chapterIdx + 1].id); }} disabled={chapterIdx >= chapters.length - 1} className="text-white/80 disabled:opacity-25">
              <SkipForward size={28} fill="currentColor" />
            </button>
            <button onClick={() => seekBy(15)} className="text-white/70 relative">
              <RotateCw size={26} />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none">15</span>
            </button>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-3 px-8 pb-6">
            <button onClick={() => setVolume(isMuted ? 1 : 0)} className="text-white/40">
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <div className="flex-1 relative h-1">
              <div className="absolute inset-0 rounded-full bg-white/20" />
              <div className="absolute top-0 left-0 h-full rounded-full bg-white" style={{ width: `${volume * 100}%` }} />
              <input
                type="range" min="0" max="1" step="0.05" value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-runnable-track]:bg-transparent"
              />
            </div>
          </div>
        </>
      )}

      {/* Read-along text overlay */}
      {showText && state.prose && (
        <div className="absolute inset-0 z-[75] flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-lg font-bold text-white">Chapter {chapterNumber}</h3>
            <button onClick={() => setShowText(false)} className="p-1"><X size={22} className="text-white/60" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-8" style={{ WebkitOverflowScrolling: 'touch' as any }}>
            {state.prose.split(/\n\n+/).map((p, i) => (
              <p key={i} className="text-white/85 leading-relaxed text-lg mb-5 font-serif">{p}</p>
            ))}
          </div>
        </div>
      )}

      {/* Chapter list overlay */}
      {showChapters && (
        <div className="absolute inset-0 z-[80] flex flex-col bg-black/95">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h3 className="text-lg font-bold text-white">Chapters</h3>
            <button onClick={() => setShowChapters(false)} className="p-1"><X size={22} className="text-white/60" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-8" style={{ WebkitOverflowScrolling: 'touch' as any }}>
            {chapters.map((ch) => {
              const isCurrent = ch.id === state.currentChapterId;
              return (
                <button
                  key={ch.id}
                  onClick={() => { onChapterSelect(ch.id); setShowChapters(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-xl text-left transition-all ${isCurrent ? 'bg-white/15' : 'active:bg-white/10'}`}
                >
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    {isCurrent && playing ? (
                      <div className="flex items-end gap-[3px] h-4">
                        <div className="w-[3px] bg-white rounded-full animate-pulse" style={{ height: '60%' }} />
                        <div className="w-[3px] bg-white rounded-full animate-pulse" style={{ height: '100%', animationDelay: '150ms' }} />
                        <div className="w-[3px] bg-white rounded-full animate-pulse" style={{ height: '40%', animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <span className={`text-sm font-bold ${isCurrent ? 'text-white' : 'text-white/40'}`}>{ch.number}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${isCurrent ? 'text-white' : 'text-white/70'}`}>{ch.title}</div>
                    {ch.hasAudio && ch.durationSeconds && (
                      <div className="text-[11px] text-white/30">~{Math.ceil(ch.durationSeconds / 60)} min</div>
                    )}
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

export function LibraryMiniBar({ state, onExpand, onTogglePlay, playing }: { state: PlayerState; onExpand: () => void; onTogglePlay: () => void; playing: boolean }) {
  const { book, chapterTitle, chapterNumber } = state;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/90 backdrop-blur-lg safe-area-bottom">
      <button onClick={onExpand} className="w-full flex items-center gap-3 px-3 py-2.5">
        <div className="w-10 h-10 rounded-md overflow-hidden shadow-sm flex-shrink-0 bg-white/10">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[8px] font-black text-white/60 uppercase">{book.title.slice(0, 6)}</div>
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-[13px] font-semibold text-white truncate">Ch. {chapterNumber} · {chapterTitle}</div>
          <div className="text-[11px] text-white/50 truncate">{book.title}</div>
        </div>
        <div onClick={(e) => { e.stopPropagation(); onTogglePlay(); }} className="w-8 h-8 flex items-center justify-center flex-shrink-0">
          {playing ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-0.5" fill="currentColor" />}
        </div>
        <div onClick={(e) => { e.stopPropagation(); onExpand(); }} className="w-8 h-8 flex items-center justify-center flex-shrink-0">
          <ChevronUp size={18} className="text-white/50" />
        </div>
      </button>
    </div>
  );
}
