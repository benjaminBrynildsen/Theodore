import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, RotateCcw } from 'lucide-react';
import { useStore } from '../../store';
import { useCanonStore } from '../../store/canon';
import { useSettingsStore } from '../../store/settings';
import { generateText } from '../../lib/generate';
import { analysisModel } from '../../lib/models';
import { buildSynopsisPrompt, parseSynopsis, synopsisSourceKey } from '../../lib/synopsis';
import type { Chapter, Project } from '../../types';

/**
 * The book's one-page synopsis, shown under the title. Written on first open
 * and saved on the project; offers a refresh when the story has changed. The
 * ending stays hidden until the reader asks for it.
 */
export function SynopsisPanel({ project, chapters }: { project: Project; chapters: Chapter[] }) {
  const updateProject = useStore((s) => s.updateProject);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEnding, setShowEnding] = useState(false);
  const started = useRef(false);

  const synopsis = project.synopsis || null;
  const sourceKey = useMemo(() => synopsisSourceKey(project, chapters), [project, chapters]);
  const stale = !!synopsis && synopsis.sourceKey !== sourceKey;

  const write = async () => {
    setWriting(true);
    setError(null);
    try {
      const canon = useCanonStore.getState().getProjectEntries(project.id);
      const result = await generateText({
        prompt: buildSynopsisPrompt({ project, chapters, canon }),
        model: analysisModel(useSettingsStore.getState().settings.ai?.preferredModel),
        maxTokens: 1800,
        action: 'write-synopsis',
        projectId: project.id,
      });
      const parsed = parseSynopsis(result.text || '', sourceKey, chapters.some((c) => !c.prose?.trim()));
      if (!parsed) throw new Error('The synopsis came back incomplete. Try again.');
      updateProject(project.id, { synopsis: parsed });
      setShowEnding(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg === 'INSUFFICIENT_CREDITS' ? 'Not enough credits to write the synopsis.' : msg || 'Synopsis failed.');
    } finally {
      setWriting(false);
    }
  };

  // First open with no synopsis yet: write one.
  useEffect(() => {
    if (!synopsis && !started.current && chapters.length) {
      started.current = true;
      void write();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-4 text-left rounded-2xl glass p-4 sm:p-5 space-y-3 animate-fade-in">
      {writing && !synopsis && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-secondary" role="status">
          <Loader2 size={15} className="animate-spin" /> Writing the synopsis…
        </div>
      )}
      {error && <p className="text-xs text-error">{error}</p>}

      {synopsis && (
        <>
          {synopsis.logline && (
            <p className="font-serif text-[15px] italic text-text-primary leading-relaxed">{synopsis.logline}</p>
          )}
          <div className="space-y-3 font-serif text-[15px] leading-relaxed text-text-primary">
            {synopsis.body.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          {!!synopsis.ending.length && (
            showEnding ? (
              <div className="space-y-3 font-serif text-[15px] leading-relaxed text-text-primary">
                {synopsis.ending.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ) : (
              <button
                onClick={() => setShowEnding(true)}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full glass-pill text-text-secondary hover:bg-white/70"
              >
                <Eye size={12} /> Show the ending (spoilers)
              </button>
            )
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-text-tertiary">
            {synopsis.fromOutline && <span>Includes chapters not written yet, from the outline.</span>}
            {stale && <span>The story has changed since this was written.</span>}
            <button
              onClick={write}
              disabled={writing}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/60 text-text-secondary disabled:opacity-60"
              title="Rewrite the synopsis from the current chapters"
            >
              {writing ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
              {writing ? 'Rewriting…' : stale ? 'Update synopsis' : 'Rewrite'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
