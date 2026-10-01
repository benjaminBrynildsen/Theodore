import { useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, X } from 'lucide-react';
import type { Chapter } from '../../types';
import { memoryMeta, needsReextraction } from '../../lib/story-memory';
import { cn } from '../../lib/utils';

interface Props {
  chapter: Chapter;
}

/**
 * Continuity notices for a chapter:
 *  - contradictions the extractor found against earlier chapters' memory
 *  - "an earlier chapter changed something this one relies on" (stale notice)
 * Re-check runs extraction on the current text (clears both when resolved).
 */
export function ContinuityNotices({ chapter }: Props) {
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const meta = memoryMeta(chapter);
  // Issues describe the text they were found in; hide them once it has been rewritten.
  const current = !needsReextraction(meta, chapter.prose || '');
  const issues = current ? (meta.continuityIssues || []).filter((i) => !i.dismissed) : [];
  const stale = meta.continuityStale;
  if (!issues.length && !stale) return null;

  const pipeline = () => import('../../lib/post-generation-pipeline');
  const recheck = async () => {
    setChecking(true);
    try {
      const { refreshContinuityNow } = await pipeline();
      await refreshContinuityNow(chapter.id, { force: true });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 space-y-2">
      {stale && (
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="font-semibold">Chapter {stale.fromChapter} changed something this chapter relies on</div>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {stale.changes.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <button
            onClick={() => pipeline().then(({ dismissStaleNotice }) => dismissStaleNotice(chapter.id))}
            className="p-1 rounded-lg hover:bg-amber-100"
            title="Dismiss"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {issues.length > 0 && (
        <div>
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 font-semibold w-full text-left">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="flex-1">
              {issues.length} possible continuity {issues.length === 1 ? 'issue' : 'issues'} with earlier chapters
            </span>
            <span className="text-[10px]">{expanded ? '▾' : '▸'}</span>
          </button>
          {expanded && (
            <ul className="mt-2 space-y-2">
              {issues.map((i) => (
                <li key={i.id} className="flex items-start gap-2 rounded-xl bg-white/70 px-3 py-2">
                  <span
                    className={cn(
                      'mt-0.5 px-1.5 rounded text-[10px] font-semibold uppercase flex-shrink-0',
                      i.severity === 'high' ? 'bg-red-100 text-red-700' : i.severity === 'low' ? 'bg-black/5 text-text-secondary' : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    {i.severity}
                  </span>
                  <div className="flex-1 space-y-0.5">
                    {i.quote && <div className="italic text-text-secondary">“{i.quote}”</div>}
                    <div className="text-text-primary">{i.problem}</div>
                    {i.fix && <div className="text-text-tertiary">Fix: {i.fix}</div>}
                  </div>
                  <button
                    onClick={() => pipeline().then(({ dismissContinuityIssue }) => dismissContinuityIssue(chapter.id, i.id))}
                    className="p-1 rounded-lg hover:bg-amber-100 flex-shrink-0"
                    title="Not an issue — dismiss"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={recheck}
          disabled={checking}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold bg-text-primary text-text-inverse hover:shadow-md transition-all disabled:opacity-60"
        >
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {checking ? 'Re-checking…' : 'Re-check continuity'}
        </button>
      </div>
    </div>
  );
}
