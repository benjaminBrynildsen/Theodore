// ========== Per-user chapter-writing lock ==========
// Stops one account from writing two chapters at once. Only prose-writing
// actions take it; edits and background analysis never block or wait.
//
// A phone that sleeps mid-generation can leave its connection looking open
// for minutes, so the lock must never strand the author:
//   - retrying the SAME chapter supersedes the abandoned run (it is aborted);
//   - a lock older than the TTL no longer blocks (its run is left alone);
//   - only the request that took a lock can release it (a superseded run
//     finishing late can't free its successor's lock).

export const PROSE_LOCK_ACTIONS = new Set(['generate-chapter', 'extend-chapter', 'generate-scene']);
export const PROSE_LOCK_TTL_MS = 5 * 60 * 1000;

export interface ProseLock {
  token: string;
  startedAt: number;
  chapterId?: string;
  abort: AbortController;
}

export type AcquireResult =
  | { ok: true; lock: ProseLock; superseded: boolean }
  | { ok: false; busyChapterId?: string };

export class ProseLocks {
  private locks = new Map<string, ProseLock>();
  constructor(private ttlMs = PROSE_LOCK_TTL_MS, private now = () => Date.now()) {}

  acquire(userId: string, chapterId?: string): AcquireResult {
    const current = this.locks.get(userId);
    let superseded = false;
    if (current && this.now() - current.startedAt <= this.ttlMs) {
      if (!chapterId || current.chapterId !== chapterId) return { ok: false, busyChapterId: current.chapterId };
      current.abort.abort(new Error('Superseded by a newer generation of the same chapter'));
      superseded = true;
    }
    // An expired lock is just replaced, not aborted: a long chapter can
    // legitimately run past the TTL.
    const lock: ProseLock = { token: Math.random().toString(36).slice(2), startedAt: this.now(), chapterId, abort: new AbortController() };
    this.locks.set(userId, lock);
    return { ok: true, lock, superseded };
  }

  release(userId: string, lock: ProseLock): void {
    if (this.locks.get(userId) === lock) this.locks.delete(userId);
  }

  get size(): number {
    return this.locks.size;
  }
}
