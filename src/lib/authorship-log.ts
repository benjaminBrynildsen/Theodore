// Recording authorship events onto chapters (see authorship.ts). Typed edits
// are buffered and written as one grouped event once the author pauses, so
// typing never writes the log on every keystroke.

import { useStore } from '../store';
import type { Chapter } from '../types';
import { appendEvent, changedChars, type AuthorshipEvent } from './authorship';

export function recordAuthorship(chapterId: string, ev: Omit<AuthorshipEvent, 'at'> & { at?: string }): void {
  const chapter = useStore.getState().chapters.find((c) => c.id === chapterId);
  if (!chapter) return;
  const meta = (chapter.aiIntentMetadata || {}) as Record<string, unknown>;
  const authorship = appendEvent(meta.authorship as AuthorshipEvent[] | undefined, { at: new Date().toISOString(), ...ev });
  useStore.getState().updateChapter(chapterId, { aiIntentMetadata: { ...meta, authorship } as unknown as Chapter['aiIntentMetadata'] });
}

/** Book-level event: characters, objects, places and the maps. */
export function recordProjectAuthorship(projectId: string, ev: Omit<AuthorshipEvent, 'at'> & { at?: string }): void {
  const project = useStore.getState().projects.find((p) => p.id === projectId);
  if (!project) return;
  const authorship = appendEvent(project.authorship || undefined, { at: new Date().toISOString(), ...ev }, 1000);
  useStore.getState().updateProject(projectId, { authorship });
}

const typing = new Map<string, { chars: number; timer: ReturnType<typeof setTimeout> }>();

/** Note text the author typed, dictated or changed by hand; flushed after a pause. */
export function noteAuthorTyping(chapterId: string, before: string, after: string): void {
  const chars = changedChars(before, after);
  if (!chars) return;
  const pending = typing.get(chapterId);
  if (pending) clearTimeout(pending.timer);
  const total = (pending?.chars || 0) + chars;
  const timer = setTimeout(() => {
    typing.delete(chapterId);
    recordAuthorship(chapterId, { kind: 'author-edit', chars: total });
  }, 4000);
  typing.set(chapterId, { chars: total, timer });
}
