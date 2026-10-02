import { useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { memoryOutdated } from '../../lib/story-memory';
import type { Chapter } from '../../types';

/**
 * Offers to re-read written chapters whose memory was extracted before the
 * story clock and who-knows-what were tracked, so the next chapters get both.
 */
export function StoryMemoryCatchUp({ projectId, chapters }: { projectId: string; chapters: Chapter[] }) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outdated = chapters.filter(memoryOutdated).length;
  if (!outdated && !progress) return null;

  const run = async () => {
    setError(null);
    setProgress({ done: 0, total: outdated });
    try {
      const { catchUpStoryMemory } = await import('../../lib/post-generation-pipeline');
      await catchUpStoryMemory(projectId, (done, total) => setProgress({ done, total }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl glass px-4 py-3 text-xs text-text-secondary">
      <Brain size={15} className="text-text-tertiary flex-shrink-0" />
      <p className="flex-1 min-w-[12rem] leading-relaxed">
        {progress
          ? `Re-reading chapter ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
          : `Theodore can now track the story's calendar and who knows each secret. Re-read ${outdated} written chapter${outdated === 1 ? '' : 's'} so the next ones use it (a small credit cost per chapter).`}
      </p>
      <button
        onClick={run}
        disabled={!!progress}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-text-primary text-text-inverse font-medium disabled:opacity-60"
      >
        {progress ? <Loader2 size={12} className="animate-spin" /> : null}
        {progress ? 'Updating…' : 'Update story memory'}
      </button>
      {error && <p className="w-full text-error">{error}</p>}
    </div>
  );
}
