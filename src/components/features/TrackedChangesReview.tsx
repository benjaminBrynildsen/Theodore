import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { EditSuggestion } from '../../lib/tracked-edits';

const OP_LABEL: Record<EditSuggestion['op'], string> = { replace: 'Rewrite', insert_after: 'Add', delete: 'Cut' };

function where(s: EditSuggestion): string {
  if (s.op === 'insert_after') return s.p === 0 ? 'at the start' : `after ¶${s.p}`;
  return `¶${s.p}`;
}

/**
 * Suggested changes to a chapter, shown like tracked changes: each one is
 * accepted unless the author taps it off; nothing touches the chapter until
 * they apply.
 */
export function TrackedChangesReview({ summary, suggestions, onApply, onDiscard }: {
  summary: string;
  suggestions: EditSuggestion[];
  onApply: (accepted: Set<string>) => void;
  onDiscard: () => void;
}) {
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const accepted = suggestions.filter((s) => !rejected.has(s.id));
  const toggle = (id: string) => setRejected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="rounded-xl bg-white border border-black/10 shadow-sm animate-fade-in">
      <div className="px-3 pt-3 pb-2 border-b border-black/5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {suggestions.length} suggested change{suggestions.length === 1 ? '' : 's'}
          </span>
          <div className="flex gap-1 text-[11px]">
            <button onClick={() => setRejected(new Set())} className="px-2 py-0.5 rounded-md hover:bg-black/5 text-text-secondary">Accept all</button>
            <button onClick={() => setRejected(new Set(suggestions.map((s) => s.id)))} className="px-2 py-0.5 rounded-md hover:bg-black/5 text-text-secondary">Reject all</button>
          </div>
        </div>
        {summary && <p className="text-[12px] text-text-secondary mt-1 leading-snug">{summary}</p>}
      </div>

      <div className="max-h-[50vh] overflow-y-auto divide-y divide-black/5">
        {suggestions.map((s) => {
          const on = !rejected.has(s.id);
          const open = expanded === s.id;
          return (
            <div key={s.id} className={cn('px-3 py-2.5 transition-opacity', !on && 'opacity-50')}>
              <div className="flex items-start gap-2">
                <button
                  onClick={() => toggle(s.id)}
                  className={cn(
                    'mt-0.5 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center border transition-colors',
                    on ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-black/15 text-text-tertiary',
                  )}
                  aria-pressed={on}
                  aria-label={on ? 'Accepted — tap to reject' : 'Rejected — tap to accept'}
                  title={on ? 'Accepted — tap to reject' : 'Rejected — tap to accept'}
                >
                  {on ? <Check size={13} /> : <X size={13} />}
                </button>
                <button onClick={() => setExpanded(open ? null : s.id)} className="flex-1 min-w-0 text-left">
                  <div className="text-[11px] text-text-tertiary">
                    <span className="font-semibold text-text-secondary">{OP_LABEL[s.op]}</span> {where(s)}
                    {s.why && <span> · {s.why}</span>}
                  </div>
                  {s.before && (
                    <p className={cn('mt-1 font-serif text-[13px] leading-relaxed text-red-800/80 line-through decoration-red-300', !open && 'line-clamp-2')}>
                      {s.before}
                    </p>
                  )}
                  {s.after && (
                    <p className={cn('mt-1 font-serif text-[13px] leading-relaxed text-emerald-900 bg-emerald-50 rounded px-1 whitespace-pre-wrap', !open && 'line-clamp-4')}>
                      {s.after}
                    </p>
                  )}
                  {!open && <span className="text-[10px] text-text-tertiary">Tap to read in full</span>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 flex gap-2 border-t border-black/5">
        <button
          onClick={() => onApply(new Set(accepted.map((s) => s.id)))}
          disabled={!accepted.length}
          className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 transition-all"
        >
          Apply {accepted.length} change{accepted.length === 1 ? '' : 's'}
        </button>
        <button onClick={onDiscard} className="px-4 py-2.5 rounded-xl text-[13px] font-medium bg-black/5 text-text-secondary hover:bg-black/10">
          Discard
        </button>
      </div>
    </div>
  );
}
