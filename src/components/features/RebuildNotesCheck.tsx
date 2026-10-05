import { Check, CircleDashed, RotateCcw, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { outstandingNotes, type RebuildCheck } from '../../lib/rebuild-notes';

const STATUS = {
  done: { icon: Check, label: 'Done', className: 'text-emerald-700' },
  partly: { icon: CircleDashed, label: 'Partly', className: 'text-amber-700' },
  missing: { icon: X, label: 'Not done', className: 'text-red-700' },
} as const;

/** After a rebuild with notes: which notes the new chapter carries out, and a way to redo the rest. */
export function RebuildNotesCheck({ check, onRedo, onDismiss }: {
  check: RebuildCheck;
  onRedo: (notes: string[]) => void;
  onDismiss: () => void;
}) {
  const done = check.results.filter((r) => r.status === 'done').length;
  const outstanding = outstandingNotes(check);
  return (
    <div className={cn('mb-4 rounded-xl border p-3 text-xs animate-fade-in', outstanding.length ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60')}>
      <div className="flex items-center gap-2 mb-2">
        <span className="flex-1 font-semibold text-text-primary">
          Rebuild notes: {done} of {check.results.length} carried out
        </span>
        <button onClick={onDismiss} className="p-1 rounded text-text-tertiary hover:text-text-primary" aria-label="Dismiss">
          <X size={12} />
        </button>
      </div>
      <ul className="space-y-1.5">
        {check.results.map((r, i) => {
          const s = STATUS[r.status];
          const Icon = s.icon;
          return (
            <li key={i} className="flex gap-2">
              <Icon size={13} className={cn('mt-0.5 flex-shrink-0', s.className)} aria-label={s.label} />
              <span>
                <span className="text-text-primary">{r.note}</span>
                {r.detail && <span className="block text-text-tertiary">{r.detail}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      {!!outstanding.length && (
        <button
          onClick={() => onRedo(outstanding)}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-text-primary text-text-inverse font-semibold"
        >
          <RotateCcw size={12} /> Rebuild again with the {outstanding.length} unfinished note{outstanding.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
