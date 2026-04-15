export interface PublicBook {
  slug: string;
  title: string;
  coverUrl: string | null;
  type: string;
  subtype: string | null;
  description: string;
  authorDisplayName: string;
  allowText: boolean;
  allowAudio: boolean;
  publishedAt: string | null;
}

export interface PublicChapterSummary {
  id: string;
  number: number;
  title: string;
  hasAudio: boolean;
  durationSeconds: number | null;
}

export interface PublicChapter {
  id: string;
  number: number;
  title: string;
  prose: string | null;
  imageUrl: string | null;
}

export interface PublicAudio {
  audioUrl: string;
  durationSeconds: number | null;
}

export async function fetchBook(slug: string): Promise<{ book: PublicBook; chapters: PublicChapterSummary[] }> {
  const r = await fetch(`/api/public/book/${encodeURIComponent(slug)}`);
  if (!r.ok) throw new Error('Book not found');
  return r.json();
}

export async function fetchChapter(slug: string, chapterId: string): Promise<{ book: PublicBook; chapter: PublicChapter; audio: PublicAudio | null }> {
  const r = await fetch(`/api/public/book/${encodeURIComponent(slug)}/chapter/${encodeURIComponent(chapterId)}`);
  if (!r.ok) throw new Error('Chapter not available');
  return r.json();
}

export function trackListen(slug: string) {
  fetch(`/api/public/track-listen/${encodeURIComponent(slug)}`, { method: 'POST' }).catch(() => {});
}

/**
 * Parse the library route from the current URL.
 * Supports:
 *  - library.theodore.tools/b/:slug[/c/:chapterId]
 *  - /library/b/:slug[/c/:chapterId]   (local/dev, same origin)
 */
export function parseLibraryRoute(): { slug: string | null; chapterId: string | null } {
  const path = window.location.pathname.replace(/^\/library/, '');
  const m = path.match(/^\/b\/([^/]+)(?:\/c\/([^/]+))?\/?$/);
  if (!m) return { slug: null, chapterId: null };
  return { slug: decodeURIComponent(m[1]), chapterId: m[2] ? decodeURIComponent(m[2]) : null };
}

export function isLibraryHost(): boolean {
  return window.location.hostname.startsWith('library.') || window.location.pathname.startsWith('/library');
}

export function libraryBookUrl(slug: string): string {
  const prefix = window.location.hostname.startsWith('library.') ? '' : '/library';
  return `${prefix}/b/${encodeURIComponent(slug)}`;
}

export function libraryChapterUrl(slug: string, chapterId: string): string {
  return `${libraryBookUrl(slug)}/c/${encodeURIComponent(chapterId)}`;
}

export function mainAppUrl(): string {
  if (window.location.hostname.startsWith('library.')) {
    return `${window.location.protocol}//${window.location.hostname.replace(/^library\./, '')}`;
  }
  return '/';
}
