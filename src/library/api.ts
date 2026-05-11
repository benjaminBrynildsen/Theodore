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

export interface PublicAudioSegment {
  audioUrl: string;
  durationSeconds: number | null;
}

export interface PublicAudio {
  audioUrl: string;
  durationSeconds: number | null;
  segments?: PublicAudioSegment[];
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

// Share-referral attribution. The library page parses `?ref=<userId>` from the
// URL once on mount, calls the capture endpoint, and stashes the ref here so
// other library components (player, CTA) can stamp it into journey events.
let activeRef: string | null = null;

export function parseRefParam(): string | null {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('ref');
    if (!raw) return null;
    if (raw.length > 200) return null;
    return raw;
  } catch {
    return null;
  }
}

export function getActiveRef(): string | null {
  return activeRef;
}

export async function captureReferrer(slug: string, ref: string): Promise<boolean> {
  activeRef = ref;
  try {
    const r = await fetch('/api/referrer/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ref, slug }),
    });
    if (!r.ok) return false;
    const j = await r.json();
    return !!j?.captured;
  } catch {
    return false;
  }
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
