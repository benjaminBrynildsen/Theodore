import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2 } from 'lucide-react';

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface ShareData {
  audioUrl: string;
  duration: number;
  chapterTitle: string;
  chapterNumber: number;
  projectTitle: string;
}

export function ListenPage() {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Extract chapterId from URL
  const chapterId = window.location.pathname.split('/listen/')[1];

  useEffect(() => {
    if (!chapterId) { setError('No audio ID provided'); return; }
    fetch(`/api/share/audio/${chapterId}`)
      .then(r => r.ok ? r.json() : Promise.reject('Audio not found'))
      .then(d => { setData(d); setDuration(d.duration || 0); })
      .catch(() => setError('This audio link is no longer available.'));
  }, [chapterId]);

  useEffect(() => {
    if (!data) return;
    const audio = new Audio(data.audioUrl);
    audio.preload = 'metadata';
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    });
    audio.addEventListener('durationchange', () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    });
    audio.addEventListener('timeupdate', () => setCurrentTime(audio.currentTime));
    audio.addEventListener('ended', () => setPlaying(false));

    // Media Session
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: data.chapterTitle,
        artist: data.projectTitle,
        album: data.projectTitle,
      });
      navigator.mediaSession.setActionHandler('play', () => { audio.play(); setPlaying(true); });
      navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); setPlaying(false); });
    }

    return () => { audio.pause(); audio.src = ''; };
  }, [data]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  };

  const seek = (offset: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + offset));
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = frac * duration;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex items-center justify-center p-6">
        <div className="text-center text-white/60">
          <p className="text-lg">{error}</p>
          <a href="/" className="mt-4 inline-block text-sm text-white/40 hover:text-white/60 underline">
            Create your own story on Theodore
          </a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex flex-col items-center justify-center p-6">
      {/* Cover art placeholder */}
      <div className="w-64 h-64 sm:w-80 sm:h-80 rounded-2xl bg-white shadow-2xl flex items-center justify-center mb-8">
        <div className="text-center px-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 leading-tight uppercase tracking-tight">
            {data.projectTitle}
          </h1>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-8 max-w-md">
        <h2 className="text-xl font-semibold text-white">{data.chapterTitle}</h2>
        <p className="text-sm text-white/50 mt-1">Chapter {data.chapterNumber} · {data.projectTitle}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-3">
        <div
          className="h-1.5 bg-white/10 rounded-full cursor-pointer relative"
          onClick={seekTo}
        >
          <div
            className="h-full bg-white rounded-full transition-[width] duration-200"
            style={{ width: `${progressPct}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg"
            style={{ left: `calc(${progressPct}% - 8px)` }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-xs text-white/40">{formatTime(currentTime)}</span>
          <span className="text-xs text-white/40">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-8 mb-12">
        <button onClick={() => seek(-10)} className="text-white/60 hover:text-white transition-colors">
          <SkipBack size={24} />
        </button>
        <button
          onClick={togglePlay}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
        >
          {playing ? <Pause size={28} className="text-black" /> : <Play size={28} className="text-black ml-1" />}
        </button>
        <button onClick={() => seek(10)} className="text-white/60 hover:text-white transition-colors">
          <SkipForward size={24} />
        </button>
      </div>

      {/* Branding */}
      <a href="/" className="text-white/30 hover:text-white/50 text-xs transition-colors">
        Made with Theodore — Story Engine
      </a>
    </div>
  );
}
