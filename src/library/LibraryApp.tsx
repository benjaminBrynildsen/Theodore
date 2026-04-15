import { useEffect, useState } from 'react';
import { parseLibraryRoute } from './api';
import { LibraryBookPage } from './LibraryBookPage';
import { LibraryChapterPage } from './LibraryChapterPage';
import { CreateCTA } from './CreateCTA';

export function LibraryApp() {
  const [route, setRoute] = useState(parseLibraryRoute());

  useEffect(() => {
    const onPop = () => setRoute(parseLibraryRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
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

  if (route.chapterId) {
    return <LibraryChapterPage slug={route.slug} chapterId={route.chapterId} />;
  }
  return <LibraryBookPage slug={route.slug} />;
}
