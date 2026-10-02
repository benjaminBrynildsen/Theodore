import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Merge, Sparkles, Trash2, X } from 'lucide-react';
import type { CleanupProposal } from '../../lib/canon-cleanup';
import { cn } from '../../lib/utils';

const TYPE_LABEL: Record<string, string> = {
  character: 'Characters', location: 'Places', artifact: 'Objects', system: 'Systems', media: 'Media',
};

const GROUPS: Array<{ kind: CleanupProposal['kind']; title: string; icon: React.ElementType }> = [
  { kind: 'delete', title: 'Remove — not real story entries', icon: Trash2 },
  { kind: 'merge', title: 'Merge — same person, place or thing', icon: Merge },
  { kind: 'retype', title: 'Move — filed under the wrong type', icon: ArrowRight },
];

function describe(p: CleanupProposal) {
  if (p.kind === 'merge') return <><span className="font-medium">{p.name}</span> → <span className="font-medium">{p.intoName}</span></>;
  if (p.kind === 'retype') return <><span className="font-medium">{p.name}</span> → {TYPE_LABEL[p.toType] || p.toType}</>;
  return <span className="font-medium">{p.name}</span>;
}

/**
 * Reviews the project's canon (obvious fixes + one AI pass) and lets the
 * author approve which removals, merges and moves to apply.
 */
export function CanonCleanupPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [proposals, setProposals] = useState<CleanupProposal[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    import('../../lib/canon-cleanup-runner')
      .then(({ reviewCanon }) => reviewCanon(projectId))
      .then((list) => {
        if (!alive) return;
        setProposals(list);
        setSelected(new Set(list.map((p) => p.id)));
      })
      .catch((e) => {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : '';
        setError(msg === 'INSUFFICIENT_CREDITS' || /credits/i.test(msg) ? 'Not enough credits to review canon.' : msg || 'Review failed.');
      });
    return () => { alive = false; };
  }, [projectId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const apply = async () => {
    if (!proposals) return;
    const chosen = proposals.filter((p) => selected.has(p.id));
    const { applyCleanup } = await import('../../lib/canon-cleanup-runner');
    applyCleanup(projectId, chosen);
    setApplied(chosen.length);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-text-tertiary" />
        <h3 className="flex-1 text-[15px] font-semibold text-text-primary">Clean up canon</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-white/40" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      {applied !== null ? (
        <div className="space-y-3 text-sm text-text-secondary">
          <p>Done — {applied} {applied === 1 ? 'change' : 'changes'} applied. Chapters now point at the entries that were kept.</p>
          <button onClick={onClose} className="w-full px-3 py-2 rounded-xl bg-text-primary text-text-inverse text-sm font-medium">Back to canon</button>
        </div>
      ) : error ? (
        <p className="text-sm text-error">{error}</p>
      ) : !proposals ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-6 justify-center" role="status">
          <Loader2 size={15} className="animate-spin" /> Reviewing every entry against your book…
        </div>
      ) : !proposals.length ? (
        <p className="text-sm text-text-secondary">Everything looks right — nothing to clean up.</p>
      ) : (
        <>
          <p className="text-xs text-text-tertiary leading-relaxed">
            Uncheck anything you want to keep as it is. Nothing changes until you apply.
          </p>
          {GROUPS.map(({ kind, title, icon: Icon }) => {
            const items = proposals.filter((p) => p.kind === kind);
            if (!items.length) return null;
            return (
              <div key={kind} className="space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-1">
                  <Icon size={12} /> {title} ({items.length})
                </div>
                {items.map((p) => (
                  <label
                    key={p.id}
                    className={cn(
                      'flex items-start gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                      selected.has(p.id) ? 'bg-white/70' : 'opacity-60 hover:bg-white/40',
                    )}
                  >
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="mt-1 accent-current" />
                    <span className="min-w-0">
                      <span className="block text-sm text-text-primary">{describe(p)}</span>
                      <span className="block text-xs text-text-tertiary">{p.reason}</span>
                    </span>
                  </label>
                ))}
              </div>
            );
          })}
          <button
            onClick={apply}
            disabled={!selected.size}
            className="w-full px-3 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-semibold disabled:opacity-50"
          >
            Apply {selected.size} {selected.size === 1 ? 'change' : 'changes'}
          </button>
        </>
      )}
    </div>
  );
}
