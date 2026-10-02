import { useEffect, useMemo, useState } from 'react';
import { PenLine, X } from 'lucide-react';
import { useCanonStore } from '../../store/canon';
import { previewRename, applyRename } from '../../lib/rename-runner';
import type { AnyCanonEntry, CharacterEntry } from '../../types/canon';

/**
 * Rename a character, place or object everywhere: new name, its aliases and
 * nicknames, a count of where it appears, then update the story or only the
 * entry.
 */
export function RenameDialog({ entry, onClose }: { entry: AnyCanonEntry; onClose: () => void }) {
  const [name, setName] = useState(entry.name);
  const aliasList = entry.type === 'character' ? ((entry as CharacterEntry).character?.aliases || []) : [];
  const [aliases, setAliases] = useState<Record<string, string>>(() => Object.fromEntries(aliasList.map((a) => [a, ''])));
  const [done, setDone] = useState<string | null>(null);

  const preview = useMemo(() => previewRename(entry, entry.name, name), [entry, name]);
  // Prefill aliases the rename already covers (e.g. the first name).
  useEffect(() => {
    setAliases((prev) => {
      const next = { ...prev };
      for (const a of Object.keys(next)) {
        const covered = preview.pairs.find((p) => p.from === a)?.to;
        if (covered && !next[a]) next[a] = covered;
      }
      return next;
    });
  }, [preview.pairs]);

  const changed = name.trim() && name.trim() !== entry.name;
  const aliasPairs = Object.entries(aliases)
    .map(([from, to]) => ({ from, to: to.trim() }))
    .filter((p) => p.to && p.to !== p.from && !preview.pairs.some((x) => x.from === p.from));

  const updateEverywhere = () => {
    const n = applyRename(entry, [...preview.pairs, ...aliasPairs]);
    setDone(`Renamed to ${name.trim()} in ${n} ${n === 1 ? 'chapter' : 'chapters'}, the story maps and related entries.`);
  };
  const onlyEntry = () => {
    useCanonStore.getState().updateEntry(entry.id, { name: name.trim() });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-5 space-y-3 text-sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Rename">
        <div className="flex items-center gap-2">
          <PenLine size={16} className="text-text-tertiary" />
          <h3 className="flex-1 font-serif text-lg font-semibold">Rename {entry.name}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary" aria-label="Close"><X size={16} /></button>
        </div>

        {done ? (
          <>
            <p className="text-green-800 bg-green-50 rounded-lg p-2.5 text-xs">{done}</p>
            <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-xl bg-text-primary text-text-inverse font-semibold">Done</button></div>
          </>
        ) : (
          <>
            <label className="block text-xs text-text-secondary">
              New name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="w-full mt-1 px-3 py-2 rounded-lg glass-input text-sm"
              />
            </label>

            {changed && (
              preview.conflict ? (
                <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5">
                  Another entry is already named "{preview.conflict}". Choose a different name, or rename only this entry.
                </p>
              ) : (
                <div className="text-xs space-y-1">
                  <p className="text-text-secondary">
                    "{entry.name}" appears {preview.mentions} {preview.mentions === 1 ? 'time' : 'times'} in {preview.chapters} {preview.chapters === 1 ? 'chapter' : 'chapters'}.
                  </p>
                  {preview.pairs.slice(1).filter((p) => !(p.from in aliases)).map((p) => (
                    <div key={p.from} className="text-text-tertiary">Also: {p.from} → {p.to}</div>
                  ))}
                </div>
              )
            )}

            {aliasList.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Aliases & nicknames (leave blank to keep)</div>
                {aliasList.map((alias) => (
                  <label key={alias} className="flex items-center gap-2 text-xs">
                    <span className="w-28 truncate text-text-secondary">{alias} →</span>
                    <input
                      value={aliases[alias] || ''}
                      onChange={(e) => setAliases({ ...aliases, [alias]: e.target.value })}
                      placeholder={alias}
                      className="flex-1 min-w-0 px-2 py-1 rounded-md glass-input text-xs"
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button onClick={onlyEntry} disabled={!changed} className="px-3 py-2 rounded-xl glass-pill text-text-secondary disabled:opacity-50">Only this entry</button>
              <button
                onClick={updateEverywhere}
                disabled={(!changed && !aliasPairs.length) || !!preview.conflict}
                className="px-4 py-2 rounded-xl bg-text-primary text-text-inverse font-semibold disabled:opacity-50"
              >
                Update everywhere
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
