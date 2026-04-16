import { useEffect, useState } from 'react';
import { parseLibraryRoute, fetchBook, fetchChapter, type PublicBook, type PublicChapterSummary, type PublicAudio } from './api';
import { LibraryBookPage } from './LibraryBookPage';
import { LibraryChapterPage } from './LibraryChapterPage';
import { LibraryPlayerFullscreen, LibraryMiniBar } from './LibraryPlayer';
import { CreateCTA } from './CreateCTA';

interface ActivePlayer {
  book: PublicBook;
  slug: string;
  chapters: PublicChapterSummary[];
  currentChapterId: string;
  audio: PublicAudio | null;
  prose: string | null;
  chapterTitle: string;
  chapterNumber: number;
}

export function LibraryApp() {
  const [route, setRoute] = useState(parseLibraryRoute());
  const [player, setPlayer] = useState<ActivePlayer | null>(null);
  const [playerExpanded, setPlayerExpanded] = useState(false);
  const [playerPlaying, setPlayerPlaying] = useState(false);

  useEffect(() => {
    const onPop = () => setRoute(parseLibraryRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const startPlayer = async (slug: string, chapterId: string, bookData?: PublicBook, chaptersData?: PublicChapterSummary[]) => {
    try {
      let book = bookData;
      let chapters = chaptersData;
      if (!book || !chapters) {
        const bd = await fetchBook(slug);
        book = bd.book;
        chapters = bd.chapters;
      }
      const chapterData = await fetchChapter(slug, chapterId);
      setPlayer({
        book,
        slug,
        chapters,
        currentChapterId: chapterId,
        audio: chapterData.audio,
        prose: chapterData.chapter.prose,
        chapterTitle: chapterData.chapter.title,
        chapterNumber: chapterData.chapter.number,
      });
      setPlayerExpanded(true);
    } catch {
      // Fall through to chapter page
    }
  };

  const handleChapterSelect = async (chapterId: string) => {
    if (!player) return;
    try {
      const chapterData = await fetchChapter(player.slug, chapterId);
      setPlayer(prev => prev ? {
        ...prev,
        currentChapterId: chapterId,
        audio: chapterData.audio,
        prose: chapterData.chapter.prose,
        chapterTitle: chapterData.chapter.title,
        chapterNumber: chapterData.chapter.number,
      } : null);
    } catch {}
  };

  // Toggle play/pause for the mini bar (dispatch to fullscreen via custom event)
  const handleTogglePlay = () => {
    window.dispatchEvent(new CustomEvent('library:togglePlay'));
  };

  // Listen for play state changes from the fullscreen player
  useEffect(() => {
    const handler = (e: Event) => setPlayerPlaying((e as CustomEvent).detail?.playing ?? false);
    window.addEventListener('library:playStateChanged', handler);
    return () => window.removeEventListener('library:playStateChanged', handler);
  }, []);

  if (!route.slug) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex items-center justify-center p-6">
        <div className="text-center text-white/70 max-w-md">
          <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Theodore Library</p>
          <h1 className="text-3xl font-serif font-semibold mb-4">A library of AI-written books</h1>
          <p className="text-white/50 text-sm mb-8">Listen to audiobooks and stories created by Theodore authors.</p>
          <CreateCTA variant="inline" />
        </div>
      </div>
    );
  }

  return (
    <>
      {route.chapterId ? (
        <LibraryChapterPage
          slug={route.slug}
          chapterId={route.chapterId}
          onPlay={(slug, chapterId, book, chapters) => startPlayer(slug, chapterId, book, chapters)}
        />
      ) : (
        <LibraryBookPage
          slug={route.slug}
          onPlay={(chapterId, book, chapters) => startPlayer(route.slug!, chapterId, book, chapters)}
        />
      )}

      {/* Fullscreen player */}
      {player && playerExpanded && (
        <LibraryPlayerFullscreen
          state={player}
          onChapterSelect={handleChapterSelect}
          onClose={() => setPlayerExpanded(false)}
          onMinimize={() => setPlayerExpanded(false)}
        />
      )}

      {/* Mini bar (when player active but collapsed) */}
      {player && !playerExpanded && (
        <LibraryMiniBar
          state={player}
          onExpand={() => setPlayerExpanded(true)}
          onTogglePlay={handleTogglePlay}
          playing={playerPlaying}
        />
      )}
    </>
  );
}
