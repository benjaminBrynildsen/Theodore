import { useEffect, useMemo, useState } from 'react';
import { History, ChevronLeft, ChevronRight, RotateCcw, Eye } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStore } from '../../store';

interface Snapshot {
  id: string;
  timestamp: string;
  type: 'ai-generated' | 'human-edit' | 'auto-save';
  wordCount: number;
  preview: string; // first 200 chars
  prose: string;
}

interface Props {
  chapterId: string;
  currentProse: string;
  onRestore: (prose: string) => void;
}

export function VersionTimeline({ chapterId, currentProse, onRestore }: Props) {
  const chapter = useStore((s) => s.chapters.find((c) => c.id === chapterId));
  const snapshots = useMemo<Snapshot[]>(() => {
    const rawHistory = Array.isArray((chapter?.aiIntentMetadata as any)?.versionHistory)
      ? ((chapter?.aiIntentMetadata as any)?.versionHistory as Snapshot[])
      : [];
    const normalizedHistory = rawHistory
      .filter((snap) => !!snap && typeof snap.prose === 'string' && snap.prose.trim().length > 0)
      .map((snap) => ({
        id: snap.id || `snap-${snap.timestamp || Date.now()}`,
        timestamp: snap.timestamp || new Date().toISOString(),
        type: snap.type || 'auto-save',
        wordCount: snap.wordCount || (snap.prose.trim() ? snap.prose.trim().split(/\s+/).length : 0),
        preview: snap.preview || snap.prose.slice(0, 220),
        prose: snap.prose,
      }));

    const currentSnapshot: Snapshot | null = currentProse.trim()
      ? {
          id: 'snap-current-live',
          timestamp: chapter?.updatedAt || new Date().toISOString(),
          type: chapter?.status === 'draft-generated' ? 'ai-generated' : 'human-edit',
          wordCount: currentProse.trim().split(/\s+/).length,
          preview: currentProse.slice(0, 220),
          prose: currentProse,
        }
      : null;

    const combined = [...normalizedHistory];
    const hasCurrent = combined.some((snap) => snap.prose === currentProse);
    if (currentSnapshot && !hasCurrent) combined.push(currentSnapshot);

    const deduped: Snapshot[] = [];
    const seen = new Set<string>();
    for (const snap of combined) {
      const key = `${snap.timestamp}-${snap.prose.slice(0, 120)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(snap);
    }

    return deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [chapter?.aiIntentMetadata, chapter?.status, chapter?.updatedAt, currentProse]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (selectedIdx <= snapshots.length - 1) return;
    setSelectedIdx(0);
  }, [selectedIdx, snapshots.length]);

  if (snapshots.length === 0) {
    return (
      <div className="p-4 text-center text-text-tertiary text-xs">
        <History size={20} className="mx-auto mb-2 opacity-50" />
        No version history yet. Write or generate content to start tracking.
      </div>
    );
  }

  const selected = snapshots[selectedIdx] || snapshots[0];
  const typeLabels = { 'ai-generated': 'AI Generated', 'human-edit': 'Edited', 'auto-save': 'Auto-saved' };
  const typeColors = { 'ai-generated': 'bg-emerald-100 text-emerald-700', 'human-edit': 'bg-blue-100 text-blue-700', 'auto-save': 'bg-gray-100 text-gray-600' };

  return (
    <div className="border-t border-black/5">
      <div className="px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={14} className="text-text-tertiary" />
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">Version History</span>
        </div>
        <span className="text-[10px] text-text-tertiary">{snapshots.length} versions</span>
      </div>

      {/* Timeline scrubber */}
      <div className="px-5 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedIdx(i => Math.min(snapshots.length - 1, i + 1))}
            disabled={selectedIdx >= snapshots.length - 1}
            className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          
          <div className="flex-1 flex items-center gap-1">
            {snapshots.map((snap, idx) => (
              <button
                key={snap.id}
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  'flex-1 h-2 rounded-full transition-all',
                  idx === selectedIdx ? 'bg-text-primary scale-y-150' : 'bg-black/10 hover:bg-black/20'
                )}
              />
            ))}
          </div>

          <button
            onClick={() => setSelectedIdx(i => Math.max(0, i - 1))}
            disabled={selectedIdx <= 0}
            className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Selected version info */}
      <div className="px-5 pb-4">
        <div className="glass-pill rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', typeColors[selected.type])}>
              {typeLabels[selected.type]}
            </span>
            <span className="text-[10px] text-text-tertiary">
              {new Date(selected.timestamp).toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-text-secondary mb-2">{selected.wordCount} words</div>
          <div className="text-xs text-text-tertiary line-clamp-3 italic">"{selected.preview}"</div>
          
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg glass-pill text-xs text-text-secondary hover:bg-white/60"
            >
              <Eye size={12} /> {showPreview ? 'Hide' : 'Show'} Snapshot
            </button>
            {selectedIdx > 0 && (
              <button
                onClick={() => onRestore(selected.prose)}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-text-primary text-text-inverse text-xs hover:shadow-md"
              >
                <RotateCcw size={12} /> Restore
              </button>
            )}
          </div>

          {showPreview && (
            <div className="mt-3 rounded-lg border border-black/10 bg-white/70 p-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">Snapshot Preview</div>
              <div className="text-xs leading-relaxed text-text-secondary max-h-28 overflow-y-auto whitespace-pre-wrap">
                {selected.prose}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
