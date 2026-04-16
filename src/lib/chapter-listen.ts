import { useStore } from '../store';

const READY_MIN_WORDS = 200;
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 180_000;

function wordsIn(prose: string | undefined | null): number {
  const t = (prose || '').trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function triggerListen(chapterId: string): void {
  const state = useStore.getState();
  const chapter = state.chapters.find((c) => c.id === chapterId);
  if (!chapter) return;

  // Read cached audio through the audio store — do NOT import the store here
  // to keep this helper framework-agnostic; callers typically pass their own
  // `hasAudio` check via audio store hooks. For listen-click logic we dispatch
  // events that downstream stores (AudioPlayerBar, AudiobookPanel) already
  // listen to — they handle the "already have audio" case internally.

  if (wordsIn(chapter.prose) >= READY_MIN_WORDS) {
    window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId } }));
    return;
  }

  // Prose still streaming — poll until ready, then fire.
  const startedAt = Date.now();
  const poll = window.setInterval(() => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      window.clearInterval(poll);
      return;
    }
    const latest = useStore.getState().chapters.find((c) => c.id === chapterId);
    if (latest && wordsIn(latest.prose) >= READY_MIN_WORDS) {
      window.clearInterval(poll);
      window.dispatchEvent(new CustomEvent('theodore:generateAudio', { detail: { chapterId } }));
    }
  }, POLL_INTERVAL_MS);
}

export function playExistingAudio(chapterId: string): void {
  window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId } }));
}
