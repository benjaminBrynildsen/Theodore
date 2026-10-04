// Generating a chapter's narration scene by scene. Scenes render in parallel
// batches but reach the player strictly in story order, the moment every
// earlier scene is ready — scene 4 never plays before scene 2. A scene that
// fails is retried once; if it still fails it's skipped (and reported) so the
// rest of the chapter still plays.

import { useAudioStore } from '../store/audio';
import type { NarrationPace } from './tts-types';

/** Publishes results in index order as soon as the next one in line settles. null = failed (skipped). */
export function createOrderedPublisher<T>(count: number, publish: (index: number, value: T) => void) {
  const results: Array<T | null | undefined> = new Array(count);
  let next = 0;
  return {
    settle(index: number, value: T | null) {
      results[index] = value;
      while (next < count && results[next] !== undefined) {
        const v = results[next];
        if (v !== null) publish(next, v as T);
        next++;
      }
    },
    get published() { return next; },
  };
}

export interface SceneAudioResult {
  audioUrl: string;
  durationEstimate: number;
  pace?: NarrationPace;
  creditsUsed?: number | null;
  creditsRemaining?: number | null;
}

/**
 * Render scenes 2..N for a chapter whose scene 1 is already in the store, and
 * append them to the playlist in order. Returns the results (null for scenes
 * that failed twice).
 */
export async function generateRemainingScenes<S extends { id: string }>(args: {
  chapterId: string;
  scenes: S[]; // scenes 2..N, in story order
  generate: (scene: S) => Promise<SceneAudioResult>;
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<Array<SceneAudioResult | null>> {
  const { chapterId, scenes, generate } = args;
  const batchSize = args.batchSize ?? 3;
  const store = useAudioStore.getState();
  store.setExpectedScenes(chapterId, scenes.length + 1);
  const out: Array<SceneAudioResult | null> = new Array(scenes.length).fill(null);
  const publisher = createOrderedPublisher<SceneAudioResult>(scenes.length, (i, r) => {
    useAudioStore.getState().appendSceneAudio(chapterId, {
      sceneAudioUrl: r.audioUrl,
      sceneId: scenes[i].id,
      durationDelta: r.durationEstimate,
      pace: r.pace,
    });
  });
  let done = 0;
  try {
    for (let b = 0; b < scenes.length; b += batchSize) {
      const batch = scenes.slice(b, b + batchSize);
      await Promise.all(batch.map(async (scene, j) => {
        const i = b + j;
        let result: SceneAudioResult | null = null;
        for (let attempt = 0; attempt < 2 && !result; attempt++) {
          try {
            result = await generate(scene);
          } catch (e) {
            console.warn(`[SceneAudio] Scene ${i + 2} attempt ${attempt + 1} failed:`, e);
          }
        }
        out[i] = result;
        publisher.settle(i, result);
        args.onProgress?.(++done, scenes.length);
      }));
    }
  } finally {
    useAudioStore.getState().setExpectedScenes(chapterId, undefined);
  }
  const failed = out.map((r, i) => (r ? null : i + 2)).filter((n): n is number => n !== null);
  if (failed.length) {
    useAudioStore.getState().setError(
      `Scene${failed.length > 1 ? 's' : ''} ${failed.join(', ')} couldn't be narrated and will be skipped. Regenerate the chapter audio to fill ${failed.length > 1 ? 'them' : 'it'} in.`,
    );
  }
  return out;
}
