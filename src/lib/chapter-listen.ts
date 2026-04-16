import { useStore } from '../store';
import { useAudioStore } from '../store/audio';
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

  // Synchronous play() so iOS Safari credits the click as a user gesture.
  // Going through a CustomEvent handler works on desktop but loses the
  // gesture context on iOS, which silently blocks playback.
  try {
    const audio = document.getElementById('theodore-audio') as HTMLAudioElement | null;
    const cached = useAudioStore.getState().chapterAudio[chapterId];
    if (audio && cached) {
      const url = cached.sceneAudioUrls?.[0] || cached.audioUrl;
      if (url) {
        if (audio.src !== url) {
          audio.src = url;
          audio.load();
        }
        // Fire-and-forget; the event handler below will still run to
        // update store state (currentChapter, playing).
        audio.play().catch(() => { /* handler will retry with pending queue */ });
      }
    }
  } catch { /* non-fatal */ }

  window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId } }));
}
