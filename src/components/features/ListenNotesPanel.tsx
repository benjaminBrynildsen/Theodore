import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MessageSquare, NotebookPen, Pencil, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { useAudioStore } from '../../store/audio';
import { NOTES_CHANGED_EVENT, formatClock, listenNotesApi, notesAsMessage, type ListenNote } from '../../lib/listen-notes';
import { cn } from '../../lib/utils';
import type { Chapter, Project } from '../../types';

type Filter = 'open' | 'all';

/** Play a chapter's existing audio from a moment (never starts a new generation). */
function listenFrom(note: ListenNote) {
  const seek = () => {
    const d = useAudioStore.getState().duration;
    if (d > 0) window.dispatchEvent(new CustomEvent('theodore:seekAudio', { detail: { fraction: Math.min(0.999, note.startTime / d) } }));
  };
  const st = useAudioStore.getState();
  if (st.currentChapterId === note.chapterId) {
    seek();
    if (!st.playing) window.dispatchEvent(new CustomEvent('theodore:togglePlayback'));
    return;
  }
  window.dispatchEvent(new CustomEvent('theodore:playChapter', { detail: { chapterId: note.chapterId } }));
  const started = Date.now();
  const unsub = useAudioStore.subscribe((s) => {
    if (s.currentChapterId === note.chapterId && s.duration > 0) { unsub(); setTimeout(seek, 300); }
    else if (Date.now() - started > 15000) unsub();
  });
}

/**
 * Notes made while listening, by chapter, with the passage each one is about.
 * Nothing here changes the story: notes can be replayed, edited, marked used
 * or dismissed, and sent to Story chat to talk through.
 */
export function ListenNotesPanel({ project, chapters, onDiscuss, onClose }: {
  project: Project;
  chapters: Chapter[];
  /** Hand selected notes to Story chat; absent where Story chat isn't available. */
  onDiscuss?: (message: string) => void;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<ListenNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const chapterAudio = useAudioStore((s) => s.chapterAudio);

  const load = useCallback(() => {
    listenNotesApi.list(project.id).then(setNotes).catch((e) => setError(e instanceof Error ? e.message : 'Could not load notes.'));
  }, [project.id]);
  useEffect(() => {
    load();
    window.addEventListener(NOTES_CHANGED_EVENT, load);
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, load);
  }, [load]);

  const byId = useMemo(() => new Map(chapters.map((c) => [c.id, c])), [chapters]);
  const shown = (notes || []).filter((n) => filter === 'all' || n.status === 'open');
  const groups = useMemo(() => {
    const out = new Map<string, { chapter: Chapter | undefined; number: number; title: string; notes: ListenNote[] }>();
    for (const n of shown) {
      const ch = byId.get(n.chapterId);
      const g = out.get(n.chapterId) || { chapter: ch, number: ch?.number ?? n.chapterNumber ?? 0, title: ch?.title || n.chapterTitle || '', notes: [] };
      g.notes.push(n);
      out.set(n.chapterId, g);
    }
    for (const g of out.values()) g.notes.sort((a, b) => a.audioTime - b.audioTime);
    return [...out.values()].sort((a, b) => a.number - b.number);
  }, [shown, byId]);

  const patch = async (id: string, p: Partial<Pick<ListenNote, 'note' | 'status'>>) => {
    setNotes((prev) => prev?.map((n) => (n.id === id ? { ...n, ...p } : n)) || prev);
    try { await listenNotesApi.update(id, p); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the note.'); load(); }
  };
  const remove = async (id: string) => {
    setNotes((prev) => prev?.filter((n) => n.id !== id) || prev);
    setPicked((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try { await listenNotesApi.remove(id); } catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the note.'); load(); }
  };
  const toggle = (id: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const selected = (notes || []).filter((n) => picked.has(n.id));
  const openCount = (notes || []).filter((n) => n.status === 'open').length;

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 animate-fade-in space-y-3">
      <div className="flex items-center gap-2">
        <NotebookPen size={15} className="text-text-tertiary" />
        <h3 className="flex-1 text-sm font-semibold">Listening notes</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary" aria-label="Close listening notes"><X size={14} /></button>
      </div>
      <p className="text-[11px] text-text-tertiary leading-snug">
        Notes you made with the Note button while listening, each pinned to the 30 seconds before you tapped. They don't change anything until you use them.
      </p>

      <div className="flex gap-1 rounded-xl bg-black/5 p-1 text-[12px] font-medium">
        {([['open', `Open · ${openCount}`], ['all', `All · ${notes?.length ?? 0}`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={cn('flex-1 rounded-lg py-1.5 transition-all', filter === k ? 'bg-white shadow-sm text-text-primary' : 'text-text-tertiary')}>{label}</button>
        ))}
      </div>

      {error && <p className="text-[12px] text-red-600">{error}</p>}
      {notes === null && !error && <p className="text-[12px] text-text-tertiary">Loading…</p>}
      {notes && !shown.length && (
        <p className="text-[12px] text-text-tertiary leading-snug">
          {filter === 'open' && notes.length ? 'No open notes.' : 'No notes yet. While a chapter plays, tap Note in the player and type or talk.'}
        </p>
      )}

      {groups.map((g) => (
        <div key={g.notes[0].chapterId} className="rounded-xl bg-white/60 border border-black/5">
          <div className="px-3 pt-2.5 pb-1 text-[13px] font-medium">Ch {g.number}{g.title ? `: ${g.title}` : ''}</div>
          <div className="divide-y divide-black/5">
            {g.notes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                picked={picked.has(n.id)}
                canListen={!!chapterAudio[n.chapterId]}
                onPick={() => toggle(n.id)}
                onPatch={(p) => patch(n.id, p)}
                onDelete={() => remove(n.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {selected.length > 0 && (
        <div className="sticky bottom-2 rounded-xl bg-white shadow-lg border border-black/10 p-3 flex flex-wrap items-center gap-2">
          <span className="flex-1 text-[13px]">{selected.length} note{selected.length === 1 ? '' : 's'} selected</span>
          {onDiscuss && (
            <button
              onClick={() => onDiscuss(notesAsMessage(selected))}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-text-primary text-text-inverse text-[13px] font-semibold"
            >
              <MessageSquare size={13} /> Talk these through in Story chat
            </button>
          )}
          <button
            onClick={() => { for (const n of selected) patch(n.id, { status: 'used' }); setPicked(new Set()); }}
            className="px-3 py-2 rounded-lg bg-black/5 text-[13px]"
          >
            Mark used
          </button>
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, picked, canListen, onPick, onPatch, onDelete }: {
  note: ListenNote;
  picked: boolean;
  canListen: boolean;
  onPick: () => void;
  onPatch: (p: Partial<Pick<ListenNote, 'note' | 'status'>>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.note);
  const [more, setMore] = useState(false);
  const passage = note.passage || '';
  const long = passage.length > 220;
  const settled = note.status !== 'open';

  return (
    <div className={cn('px-3 py-2.5 flex gap-2.5', settled && 'opacity-60')}>
      <input type="checkbox" checked={picked} onChange={onPick} className="mt-1 flex-shrink-0" aria-label="Select note" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary tabular-nums">
          <span>{formatClock(note.startTime)}–{formatClock(note.audioTime)}</span>
          <span>· {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          {settled && <span className="uppercase text-[10px] px-1 py-px rounded bg-black/5">{note.status}</span>}
        </div>
        {editing ? (
          <div className="space-y-1.5">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus className="w-full rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-[14px] outline-none resize-none" />
            <div className="flex gap-1.5">
              <button onClick={() => { onPatch({ note: text.trim() }); setEditing(false); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-text-primary text-text-inverse text-[12px] font-medium"><Check size={12} /> Save</button>
              <button onClick={() => { setText(note.note); setEditing(false); }} className="px-2.5 py-1 rounded-lg bg-black/5 text-[12px]">Cancel</button>
            </div>
          </div>
        ) : (
          <p className="text-[14px] leading-snug whitespace-pre-wrap">{note.note || <span className="text-text-tertiary italic">Marked this spot</span>}</p>
        )}
        {passage && (
          <button onClick={() => setMore(!more)} className="block text-left text-[12px] text-text-secondary italic leading-snug">
            “{long && !more ? `${passage.slice(0, 220).replace(/\s+\S*$/, '')}…` : passage}”
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {canListen && (
            <button onClick={() => listenFrom(note)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/5 text-[12px]"><Play size={11} /> Listen</button>
          )}
          {!editing && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/5 text-[12px]"><Pencil size={11} /> Edit</button>}
          {settled ? (
            <button onClick={() => onPatch({ status: 'open' })} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-black/5 text-[12px]"><RotateCcw size={11} /> Reopen</button>
          ) : (
            <>
              <button onClick={() => onPatch({ status: 'used' })} className="px-2 py-1 rounded-lg bg-black/5 text-[12px]">Used</button>
              <button onClick={() => onPatch({ status: 'dismissed' })} className="px-2 py-1 rounded-lg bg-black/5 text-[12px]">Dismiss</button>
            </>
          )}
          <button onClick={onDelete} className="ml-auto p-1 rounded text-text-tertiary hover:text-red-600" aria-label="Delete note"><Trash2 size={12} /></button>
        </div>
      </div>
    </div>
  );
}
