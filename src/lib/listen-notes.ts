// ========== Listening notes ==========
// Notes typed (or dictated with the keyboard mic) while an audiobook plays.
// Each is pinned to its chapter and the stretch of audio just before the tap,
// with the passage heard over that stretch, so it can be found again later.
// Notes are only stored: nothing here feeds them into generation.

import { stripProductionTags } from './story-memory';

/** How far back a note reaches: the moment usually prompted it a little earlier. */
export const NOTE_LOOKBACK_SECONDS = 30;

export interface ListenNote {
  id: string;
  projectId: string;
  chapterId: string;
  chapterNumber: number | null;
  chapterTitle: string | null;
  audioTime: number;
  startTime: number;
  passage: string | null;
  passageStart: number | null;
  passageEnd: number | null;
  note: string;
  status: 'open' | 'used' | 'dismissed';
  createdAt: string;
  updatedAt?: string;
}

/**
 * The text heard between `fromSec` and `toSec` of a chapter's audio, estimated
 * from how far through the chapter those times are and widened to whole
 * sentences. Offsets are into the prose with production tags removed.
 */
export function passageAt(prose: string, fromSec: number, toSec: number, totalSec: number, maxChars = 1400): { text: string; start: number; end: number } | null {
  const text = stripProductionTags(prose || '');
  if (!text.trim() || !(totalSec > 0)) return null;
  const at = (sec: number) => Math.round(Math.max(0, Math.min(1, sec / totalSec)) * text.length);
  let start = at(Math.min(fromSec, toSec));
  let end = Math.max(start + 1, at(Math.max(fromSec, toSec)));

  // Back to the start of the sentence, forward to the end of one.
  const breaks = /[.!?]["”’]?\s+|\n+/g;
  let sentenceStart = 0;
  for (let m = breaks.exec(text); m && m.index < start; m = breaks.exec(text)) sentenceStart = m.index + m[0].length;
  start = Math.min(sentenceStart, start);
  const head = text.slice(0, end).trimEnd();
  if (/[.!?]["”’]?$/.test(head)) end = head.length;
  else {
    const after = text.slice(end).search(/[.!?]["”’]?(\s|$)|\n/);
    end = after >= 0 ? end + after + 1 : text.length;
  }
  while (end < text.length && /["”’]/.test(text[end])) end++;

  if (end - start > maxChars) start = Math.max(start, end - maxChars);
  const slice = text.slice(start, end).trim();
  return slice ? { text: slice, start, end } : null;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The notes as one message: chapter, time, the passage, and what I noted. */
export function notesAsMessage(notes: ListenNote[]): string {
  const lines = notes.map((n) => {
    const where = `Ch ${n.chapterNumber ?? '?'}${n.chapterTitle ? ` (“${n.chapterTitle}”)` : ''} at ${formatClock(n.startTime)}–${formatClock(n.audioTime)}`;
    const passage = n.passage ? `\n  While listening to: “${n.passage.length > 400 ? `${n.passage.slice(0, 400)}…` : n.passage}”` : '';
    return `- ${where}: ${n.note || '(marked this spot)'}${passage}`;
  });
  return `Notes I made while listening to the book:\n${lines.join('\n')}\n\nHow could we change the story to work these in?`;
}

// ---------- API ----------

const API_BASE = '/api';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const listenNotesApi = {
  list: (projectId: string) => call<{ notes: ListenNote[] }>(`/listen-notes?projectId=${encodeURIComponent(projectId)}`).then((r) => r.notes),
  create: (note: Omit<ListenNote, 'status' | 'createdAt'>) => call<{ note: ListenNote }>('/listen-notes', { method: 'POST', body: JSON.stringify(note) }).then((r) => r.note),
  update: (id: string, patch: Partial<Pick<ListenNote, 'note' | 'status'>>) => call<{ note: ListenNote }>(`/listen-notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r.note),
  remove: (id: string) => call<{ ok: boolean }>(`/listen-notes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

/** Tells open Notes panels to reload after a note is added elsewhere. */
export const NOTES_CHANGED_EVENT = 'theodore:listenNotesChanged';
