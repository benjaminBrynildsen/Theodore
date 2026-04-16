import { useStore } from '../store';
import { track as jTrack } from './journey';

const READY_MIN_WORDS = 200;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

function wordsIn(prose: string | undefined | null): number {
  const t = (prose || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

/** source: where the listen was triggered from (e.g. 'cover', 'chapter-toolbar', 'auto') */
export function triggerListen(chapterId: string, source: string = 'unknown'): void {
  const state = useStore.getState();
  const chapter = state.chapters.find((c) => c.id === chapterId);
  if (!chapter) {
    jTrack('listen_click', { source, chapter_id: chapterId, state: 'chapter_not_found' });
    return;
  }

  const words = wordsIn(chapter.prose);
  if (words >= READY_MIN_WORDS) {
    jTrack('listen_click', { source, chapter_id: chapterId, state: 'prose_ready', words });
    window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId } }));
    return;
  }

  // Prose still streaming — poll until ready, then fire.
  jTrack('listen_click', { source, chapter_id: chapterId, state: 'queued_waiting_prose', words });
  const startedAt = Date.now();
  const poll = window.setInterval(() => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      window.clearInterval(poll);
      jTrack('listen_queue_timeout', { source, chapter_id: chapterId });
      return;
    }
    const latest = useStore.getState().chapters.find((c) => c.id === chapterId);
    if (latest && wordsIn(latest.prose) >= READY_MIN_WORDS) {
      window.clearInterval(poll);
      jTrack('listen_queue_fired', { source, chapter_id: chapterId, words: wordsIn(latest.prose) });
      window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId } }));
    }
  }, POLL_INTERVAL_MS);
}

export function playExistingAudio(chapterId: string, source: string = 'unknown'): void {
  jTrack('listen_click', { source, chapter_id: chapterId, state: 'play_existing' });
  window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId } }));
}
