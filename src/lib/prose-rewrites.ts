// Registry of in-flight background rewrites of a chapter's prose (e.g. the
// dialogue-clarity polish). Continuity extraction waits for these so memory is
// built from the final text instead of being extracted twice. Dependency-free
// so views can register synchronously before the pipeline module loads.

const pending = new Map<string, Promise<unknown>>();

export function registerProseRewrite(chapterId: string, work: Promise<unknown>): void {
  const tracked: Promise<unknown> = work.finally(() => {
    if (pending.get(chapterId) === tracked) pending.delete(chapterId);
  });
  pending.set(chapterId, tracked);
}

export function hasPendingProseRewrite(chapterId: string): boolean {
  return pending.has(chapterId);
}

export async function waitForProseRewrite(chapterId: string, timeoutMs = 50_000): Promise<void> {
  const work = pending.get(chapterId);
  if (!work) return;
  await Promise.race([work.catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
}
