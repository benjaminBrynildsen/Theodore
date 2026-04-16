import { useEffect, useState } from 'react';
import { Play, ChevronLeft } from 'lucide-react';
import { fetchChapter, fetchBook, libraryBookUrl, type PublicBook, type PublicChapter, type PublicAudio, type PublicChapterSummary } from './api';
import { CreateCTA } from './CreateCTA';

interface Props {
  slug: string;
  chapterId: string;
  onPlay?: (slug: string, chapterId: string, book: PublicBook, chapters: PublicChapterSummary[]) => void;
}

export function LibraryChapterPage({ slug, chapterId, onPlay }: Props) {
  const [book, setBook] = useState<PublicBook | null>(null);
  const [chapter, setChapter] = useState<PublicChapter | null>(null);
  const [audio, setAudio] = useState<PublicAudio | null>(null);
  const [chapters, setChapters] = useState<PublicChapterSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChapter(slug, chapterId)
      .then(d => { setBook(d.book); setChapter(d.chapter); setAudio(d.audio); })
      .catch(() => setError('This chapter is not available.'));
    fetchBook(slug)
      .then(d => setChapters(d.chapters))
      .catch(() => {});
  }, [slug, chapterId]);

  const handlePlay = () => {
    if (onPlay && book && chapters.length) onPlay(slug, chapterId, book, chapters);
  };

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

      {/* Play button — opens fullscreen Spotify-style player */}
      <section className="max-w-xl mx-auto px-4 mt-8 flex justify-center">
        <button
          onClick={handlePlay}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-white text-black font-semibold text-sm hover:scale-105 active:scale-95 transition-transform shadow-lg"
        >
          <Play size={18} className="ml-0.5" /> {audio ? 'Listen to this chapter' : 'Play chapter'}
        </button>
      </section>

      {/* Prose */}
      {chapter.prose && book.allowText && (
        <article className="max-w-2xl mx-auto px-4 mt-12">
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
