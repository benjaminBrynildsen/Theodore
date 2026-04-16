import { useEffect, useState } from 'react';
import { Play, Clock, FileText, Headphones } from 'lucide-react';
import { fetchBook, libraryChapterUrl, type PublicBook, type PublicChapterSummary } from './api';
import { CreateCTA } from './CreateCTA';

function formatDuration(s: number | null): string {
  if (!s || !isFinite(s)) return '';
  const m = Math.round(s / 60);
  return `${m} min`;
}

export function LibraryBookPage({ slug }: { slug: string }) {
  const [book, setBook] = useState<PublicBook | null>(null);
  const [chapters, setChapters] = useState<PublicChapterSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBook(slug)
      .then(d => { setBook(d.book); setChapters(d.chapters); })
      .catch(() => setError('This book is not available.'));
  }, [slug]);

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
  const firstAudioChapter = chapters.find(c => c.hasAudio);

  if (!book) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 via-neutral-950 to-black text-white pb-28">
      {/* Header */}
      <header className="max-w-3xl mx-auto px-4 pt-6 flex items-center justify-between">
        <a href="/" className="text-white/70 hover:text-white text-sm font-semibold tracking-wide">Theodore</a>
        <CreateCTA variant="inline" />
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-4 pt-10 pb-8 flex flex-col items-center text-center">
        <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden shadow-2xl bg-white flex items-center justify-center mb-6">
          {book.coverUrl ? (
            <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="px-6 text-center">
              <h1 className="text-2xl font-bold text-neutral-900 uppercase tracking-tight">{book.title}</h1>
            </div>
          )}
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-semibold tracking-tight">{book.title}</h1>
        <p className="text-white/50 text-sm mt-2">by {book.authorDisplayName}</p>
        {firstAudioChapter && book.allowAudio && (
          <a
            href={libraryChapterUrl(slug, firstAudioChapter.id)}
            className="mt-5 inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-white text-black font-semibold text-sm hover:scale-105 active:scale-95 transition-transform shadow-lg"
          >
            <Play size={18} className="ml-0.5" /> Listen now
          </a>
        )}
        {book.description && (
          <p className="text-white/70 text-base mt-5 max-w-xl leading-relaxed">{book.description}</p>
        )}
        <div className="flex items-center gap-4 mt-4 text-xs text-white/40">
          {book.allowAudio && <span className="inline-flex items-center gap-1"><Headphones size={12} /> Audio</span>}
          {book.allowText && <span className="inline-flex items-center gap-1"><FileText size={12} /> Text</span>}
          <span>{chapters.length} chapter{chapters.length === 1 ? '' : 's'}</span>
        </div>
      </section>

      {/* Chapter list */}
      <section className="max-w-3xl mx-auto px-4">
        <h2 className="text-xs uppercase tracking-widest text-white/40 mb-3 px-1">Chapters</h2>
        <ul className="space-y-2">
          {chapters.map((c) => (
            <li key={c.id}>
              <a
                href={libraryChapterUrl(slug, c.id)}
                className="flex items-center gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  {c.hasAudio && book.allowAudio ? <Play size={16} className="ml-0.5" /> : <FileText size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white/50">Chapter {c.number}</div>
                  <div className="font-medium truncate">{c.title}</div>
                </div>
                {c.durationSeconds && book.allowAudio && (
                  <div className="text-xs text-white/40 inline-flex items-center gap-1 shrink-0">
                    <Clock size={12} /> {formatDuration(c.durationSeconds)}
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* End-of-list CTA card */}
      <section className="max-w-3xl mx-auto px-4 mt-10">
        <CreateCTA variant="card" authorName={book.authorDisplayName} />
      </section>

      <CreateCTA variant="sticky" />
    </div>
  );
}
