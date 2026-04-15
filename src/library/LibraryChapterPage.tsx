import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronLeft } from 'lucide-react';
import { fetchChapter, libraryBookUrl, trackListen, type PublicBook, type PublicChapter, type PublicAudio } from './api';
import { CreateCTA } from './CreateCTA';

function formatTime(s: number): string {
  if (!s || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function LibraryChapterPage({ slug, chapterId }: { slug: string; chapterId: string }) {
  const [book, setBook] = useState<PublicBook | null>(null);
  const [chapter, setChapter] = useState<PublicChapter | null>(null);
  const [audio, setAudio] = useState<PublicAudio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenTracked = useRef(false);

  useEffect(() => {
    fetchChapter(slug, chapterId)
      .then(d => {
        setBook(d.book);
        setChapter(d.chapter);
        setAudio(d.audio);
        setDuration(d.audio?.durationSeconds || 0);
      })
      .catch(() => setError('This chapter is not available.'));
  }, [slug, chapterId]);

  useEffect(() => {
    if (!audio) return;
    const a = new Audio(audio.audioUrl);
    a.preload = 'metadata';
    audioRef.current = a;
    a.addEventListener('loadedmetadata', () => { if (a.duration && isFinite(a.duration)) setDuration(a.duration); });
    a.addEventListener('timeupdate', () => setCurrentTime(a.currentTime));
    a.addEventListener('ended', () => setPlaying(false));
    if (book && chapter && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.title,
        artist: book.authorDisplayName,
        album: book.title,
      });
    }
    return () => { a.pause(); a.src = ''; };
  }, [audio, book, chapter]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else {
      a.play();
      setPlaying(true);
      if (!listenTracked.current && book) { listenTracked.current = true; trackListen(book.slug); }
    }
  };

  const seek = (offset: number) => {
    const a = audioRef.current; if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + offset));
  };

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    a.currentTime = frac * duration;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex items-center justify-center p-6">
        <div className="text-center text-white/60">
          <p className="text-lg">{error}</p>
          <div className="mt-6"><CreateCTA variant="inline" /></div>
        </div>
      </div>
    );
  }
  if (!book || !chapter) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 via-neutral-950 to-black text-white pb-40">
      <header className="max-w-3xl mx-auto px-4 pt-6 flex items-center justify-between">
        <a href={libraryBookUrl(slug)} className="inline-flex items-center gap-1 text-white/70 hover:text-white text-sm">
          <ChevronLeft size={16} /> {book.title}
        </a>
        <CreateCTA variant="inline" />
      </header>

      {/* Title */}
      <section className="max-w-2xl mx-auto px-4 pt-10 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Chapter {chapter.number}</p>
        <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight">{chapter.title}</h1>
      </section>

      {/* Audio player */}
      {audio && book.allowAudio && (
        <section className="max-w-xl mx-auto px-4 mt-10">
          <div className="rounded-2xl bg-white/5 p-6">
            <div className="h-1.5 bg-white/10 rounded-full cursor-pointer relative mb-3" onClick={seekTo}>
              <div className="h-full bg-white rounded-full transition-[width] duration-200" style={{ width: `${progressPct}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg" style={{ left: `calc(${progressPct}% - 6px)` }} />
            </div>
            <div className="flex justify-between text-xs text-white/40 mb-4">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div className="flex items-center justify-center gap-8">
              <button onClick={() => seek(-15)} className="text-white/60 hover:text-white"><SkipBack size={22} /></button>
              <button
                onClick={togglePlay}
                className="w-14 h-14 rounded-full bg-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
              >
                {playing ? <Pause size={24} className="text-black" /> : <Play size={24} className="text-black ml-1" />}
              </button>
              <button onClick={() => seek(15)} className="text-white/60 hover:text-white"><SkipForward size={22} /></button>
            </div>
          </div>
        </section>
      )}

      {/* Prose */}
      {chapter.prose && book.allowText && (
        <article className="max-w-2xl mx-auto px-4 mt-12 prose prose-invert">
          {chapter.prose.split(/\n\n+/).map((p, i) => (
            <p key={i} className="text-white/85 leading-relaxed text-lg mb-5 font-serif">{p}</p>
          ))}
        </article>
      )}

      {/* End-of-chapter CTA */}
      <section className="max-w-2xl mx-auto px-4 mt-16">
        <CreateCTA variant="card" authorName={book.authorDisplayName} />
      </section>

      <CreateCTA variant="sticky" />
    </div>
  );
}
