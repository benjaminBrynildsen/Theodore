import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, ScrollText, Trash2, X } from 'lucide-react';
import { useStore } from '../../store';
import { foldStoryState, type KnowledgeRecord } from '../../lib/story-memory';
import {
  addFact, applyFactBook, deleteFact, editFact, factRows, groupBySubject, markSeen, setSecret,
  type FactBook, type FactRow,
} from '../../lib/fact-book';
import { recordProjectAuthorship } from '../../lib/authorship-log';
import { cn } from '../../lib/utils';
import { StoryMemoryCatchUp } from './StoryMemoryCatchUp';
import type { Chapter, Project } from '../../types';

type Tab = 'facts' | 'secrets' | 'standing';

const input = 'w-full rounded-lg border border-black/10 bg-white/80 px-2.5 py-1.5 text-[13px] outline-none focus:border-black/30';
const names = (s: string) => s.split(',').map((n) => n.trim()).filter(Boolean);

/**
 * Facts & Secrets: everything that's true in the book and who knows what.
 * Facts the chapter reader finds land here on their own; the author can add,
 * correct or delete any of them, and every one of them binds the writer.
 */
export function FactsSecrets({ project, chapters, onClose }: { project: Project; chapters: Chapter[]; onClose: () => void }) {
  const updateProject = useStore((s) => s.updateProject);
  const [tab, setTab] = useState<Tab>('facts');
  const [query, setQuery] = useState('');
  const book = project.factBook;
  const folded = useMemo(() => foldStoryState(chapters), [chapters]);
  const state = useMemo(() => applyFactBook(folded, book), [folded, book]);
  const rows = useMemo(() => factRows(folded, book), [folded, book]);

  const save = (next: FactBook, note: string) => {
    updateProject(project.id, { factBook: next });
    recordProjectAuthorship(project.id, { kind: 'author-plan-edit', subject: 'facts & secrets', note });
  };

  // First open: everything already known counts as seen; only later finds show as New.
  useEffect(() => {
    if (book || !rows.length) return;
    updateProject(project.id, { factBook: markSeen(null, rows.filter((r) => r.source === 'page').map((r) => r.key)) });
  }, [book, rows, project.id, updateProject]);

  const q = query.trim().toLowerCase();
  const match = (...parts: Array<string | undefined>) => !q || parts.some((p) => p?.toLowerCase().includes(q));
  const world = rows.filter((r) => r.kind === 'world' && match(r.subject, r.fact));
  const story = groupBySubject(rows.filter((r) => r.kind === 'story' && match(r.subject, r.fact)));
  const newKeys = rows.filter((r) => r.isNew).map((r) => r.key);
  const secrets = state.knowledge.filter((k) => match(k.secret, ...k.knownBy, ...k.hiddenFrom));

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 animate-fade-in space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText size={15} className="text-text-tertiary" />
        <h3 className="flex-1 text-sm font-semibold">Facts & Secrets</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-text-tertiary hover:text-text-primary" aria-label="Close facts and secrets">
          <X size={14} />
        </button>
      </div>
      <p className="text-[11px] text-text-tertiary leading-snug">
        Everything here is binding: every chapter is written and checked against it. Facts from your chapters are added after each one is written; change or delete any that are wrong.
      </p>

      <StoryMemoryCatchUp
        projectId={project.id}
        chapters={chapters}
        message={(n) => `${n} written chapter${n === 1 ? " hasn't" : "s haven't"} been read for facts and secrets yet. Read ${n === 1 ? 'it' : 'them'} to fill this in (a small credit cost per chapter).`}
      />

      <div className="flex gap-1 rounded-xl bg-black/5 p-1 text-[12px] font-medium">
        {([['facts', `Facts · ${rows.length}`], ['secrets', `Secrets · ${state.knowledge.length}`], ['standing', 'Where things stand']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex-1 rounded-lg py-1.5 transition-all', tab === k ? 'bg-white shadow-sm text-text-primary' : 'text-text-tertiary')}>
            {label}
          </button>
        ))}
      </div>

      {tab !== 'standing' && (
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tab === 'facts' ? 'Search facts…' : 'Search secrets or names…'} className={input} />
      )}

      {tab === 'facts' && (
        <div className="space-y-3">
          {newKeys.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-text-secondary">
              <span className="flex-1">{newKeys.length} new fact{newKeys.length === 1 ? '' : 's'} from recent chapters.</span>
              <button onClick={() => updateProject(project.id, { factBook: markSeen(book, newKeys) })} className="px-2 py-1 rounded-lg bg-black/5 font-medium">Mark all seen</button>
            </div>
          )}

          <Section title="World" hint="True throughout the book: rules, history, how things work, the era.">
            {world.map((r) => <FactLine key={r.key} row={r} onSave={(s, f) => save(editFact(book, r, s, f), `Changed a world fact: ${f}`)} onDelete={() => save(deleteFact(book, r), `Removed a world fact: ${r.fact}`)} />)}
            <AddFact kind="world" onAdd={(subject, fact) => save(addFact(book, { kind: 'world', subject, fact }), `Added a world fact: ${fact}`)} />
          </Section>

          {story.map((g) => (
            <Section key={g.subject} title={g.subject}>
              {g.rows.map((r) => (
                <FactLine
                  key={r.key}
                  row={r}
                  onSave={(s, f) => save(editFact(markSeen(book, [r.key]), r, s, f), `Corrected “${r.fact}” to “${f}”`)}
                  onDelete={() => save(deleteFact(book, r), `Removed the fact “${r.fact}”`)}
                />
              ))}
            </Section>
          ))}

          <Section title="Add a story fact" hint="About a person, object or place.">
            <AddFact kind="story" onAdd={(subject, fact) => save(addFact(book, { kind: 'story', subject, fact }), `Added the fact “${subject}: ${fact}”`)} />
          </Section>

          {!rows.length && !q && <p className="text-[12px] text-text-tertiary">No facts yet. They appear here as chapters are written, or add your own.</p>}
        </div>
      )}

      {tab === 'secrets' && (
        <div className="space-y-2">
          {secrets.map((k) => (
            <SecretLine
              key={k.secret}
              record={k}
              onSave={(next) => save(setSecret(book, k, next), `Set who knows “${next.secret}”`)}
              onDelete={() => save(setSecret(book, k, null), `Removed the secret “${k.secret}”`)}
            />
          ))}
          {!state.knowledge.length && <p className="text-[12px] text-text-tertiary">No secrets tracked yet.</p>}
          <SecretLine record={null} onSave={(next) => save(setSecret(book, null, next), `Added the secret “${next.secret}”`)} />
        </div>
      )}

      {tab === 'standing' && <Standing state={state} />}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/60 border border-black/5">
      <div className="px-3 pt-2.5 pb-1">
        <div className="text-[13px] font-medium">{title}</div>
        {hint && <div className="text-[11px] text-text-tertiary">{hint}</div>}
      </div>
      <div className="px-3 pb-2.5 space-y-1">{children}</div>
    </div>
  );
}

function FactLine({ row, onSave, onDelete }: { row: FactRow; onSave: (subject: string, fact: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(row.subject);
  const [fact, setFact] = useState(row.fact);
  if (editing) {
    return (
      <div className="space-y-1.5 py-1">
        {row.kind === 'story' && <input value={subject} onChange={(e) => setSubject(e.target.value)} className={input} aria-label="About" />}
        <textarea value={fact} onChange={(e) => setFact(e.target.value)} rows={2} className={cn(input, 'resize-none')} aria-label="Fact" autoFocus />
        <div className="flex gap-1.5">
          <button onClick={() => { onSave(subject, fact); setEditing(false); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-text-primary text-text-inverse text-[12px] font-medium"><Check size={12} /> Save</button>
          <button onClick={() => { setSubject(row.subject); setFact(row.fact); setEditing(false); }} className="px-2.5 py-1 rounded-lg bg-black/5 text-[12px]">Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex items-start gap-2 text-[13px] leading-snug py-0.5">
      <span className="flex-1">
        {row.fact}
        {row.chapter ? <span className="ml-1.5 text-[10px] text-text-tertiary tabular-nums">Ch {row.chapter}</span> : null}
        {row.source === 'author' && <span className="ml-1.5 text-[10px] text-text-tertiary">· yours</span>}
        {row.isNew && <span className="ml-1.5 text-[10px] px-1 py-px rounded bg-amber-100 text-amber-800">New</span>}
      </span>
      <button onClick={() => setEditing(true)} className="p-1 rounded text-text-tertiary hover:text-text-primary" aria-label="Edit fact"><Pencil size={12} /></button>
      <button onClick={onDelete} className="p-1 rounded text-text-tertiary hover:text-red-600" aria-label="Delete fact"><Trash2 size={12} /></button>
    </div>
  );
}

function AddFact({ kind, onAdd }: { kind: 'story' | 'world'; onAdd: (subject: string, fact: string) => void }) {
  const [subject, setSubject] = useState('');
  const [fact, setFact] = useState('');
  const ok = fact.trim() && (kind === 'world' || subject.trim());
  const submit = () => { if (!ok) return; onAdd(subject, fact); setSubject(''); setFact(''); };
  return (
    <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
      {kind === 'story' && <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="About (e.g. Mara)" className={cn(input, 'sm:w-36')} />}
      <input value={fact} onChange={(e) => setFact(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={kind === 'world' ? 'e.g. Magic costs the user a memory' : 'e.g. Has a scar over her left eye'} className={input} />
      <button onClick={submit} disabled={!ok} className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/5 text-[12px] font-medium disabled:opacity-40"><Plus size={12} /> Add</button>
    </div>
  );
}

function SecretLine({ record, onSave, onDelete }: {
  record: KnowledgeRecord | null;
  onSave: (next: { secret: string; knownBy: string[]; hiddenFrom: string[] }) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [secret, setSecretText] = useState(record?.secret || '');
  const [known, setKnown] = useState(record?.knownBy.join(', ') || '');
  const [hidden, setHidden] = useState(record?.hiddenFrom.join(', ') || '');
  const reset = () => { setSecretText(record?.secret || ''); setKnown(record?.knownBy.join(', ') || ''); setHidden(record?.hiddenFrom.join(', ') || ''); setEditing(false); };

  if (!editing) {
    if (!record) {
      return <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/5 text-[12px] font-medium"><Plus size={12} /> Add a secret</button>;
    }
    return (
      <div className="rounded-xl bg-white/60 border border-black/5 px-3 py-2.5 text-[13px]">
        <div className="flex items-start gap-2">
          <span className="flex-1 font-medium leading-snug">{record.secret}</span>
          <button onClick={() => setEditing(true)} className="p-1 rounded text-text-tertiary hover:text-text-primary" aria-label="Edit secret"><Pencil size={12} /></button>
          <button onClick={onDelete} className="p-1 rounded text-text-tertiary hover:text-red-600" aria-label="Delete secret"><Trash2 size={12} /></button>
        </div>
        <div className="mt-1 text-[12px] text-text-secondary">Knows: {record.knownBy.join(', ') || 'no one yet'}</div>
        {record.hiddenFrom.length > 0 && <div className="text-[12px] text-text-secondary">Doesn't know: {record.hiddenFrom.join(', ')}</div>}
        {record.chapter ? <div className="text-[10px] text-text-tertiary mt-0.5">Last changed in Ch {record.chapter}</div> : null}
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white/80 border border-black/10 p-3 space-y-1.5">
      <textarea value={secret} onChange={(e) => setSecretText(e.target.value)} rows={2} placeholder="The secret (e.g. Eli's father is alive)" className={cn(input, 'resize-none')} autoFocus />
      <input value={known} onChange={(e) => setKnown(e.target.value)} placeholder="Who knows (comma separated)" className={input} />
      <input value={hidden} onChange={(e) => setHidden(e.target.value)} placeholder="Who doesn't know (comma separated)" className={input} />
      <div className="flex gap-1.5">
        <button
          onClick={() => { if (!secret.trim()) return; onSave({ secret, knownBy: names(known), hiddenFrom: names(hidden) }); if (record) setEditing(false); else reset(); }}
          disabled={!secret.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-text-primary text-text-inverse text-[12px] font-medium disabled:opacity-40"
        >
          <Check size={12} /> Save
        </button>
        <button onClick={reset} className="px-2.5 py-1 rounded-lg bg-black/5 text-[12px]">Cancel</button>
      </div>
    </div>
  );
}

function Standing({ state }: { state: ReturnType<typeof foldStoryState> }) {
  const chars = [...state.characters.values()].sort((a, b) => b.lastSeenChapter - a.lastSeenChapter);
  const objects = [...state.artifacts.values()].sort((a, b) => b.lastSeenChapter - a.lastSeenChapter);
  if (!chars.length && !objects.length && !state.clock) {
    return <p className="text-[12px] text-text-tertiary">Nothing yet. This fills in as chapters are written.</p>;
  }
  const line = (parts: Array<string | false | undefined>) => parts.filter(Boolean).join(' · ');
  return (
    <div className="space-y-3">
      {state.clock && (
        <div className="rounded-xl bg-white/60 border border-black/5 px-3 py-2.5 text-[13px]">
          <span className="font-medium">Story time:</span> end of Ch {state.clock.chapter}{[state.clock.day, state.clock.time].filter(Boolean).length ? ` — ${[state.clock.day, state.clock.time].filter(Boolean).join(', ')}` : ''}
          {state.clock.elapsed && <span className="text-text-tertiary"> (that chapter covered {state.clock.elapsed})</span>}
        </div>
      )}
      {chars.length > 0 && (
        <Section title="People">
          {chars.map((c) => (
            <div key={c.key} className="text-[13px] leading-snug py-0.5">
              <span className="font-medium">{c.name}</span>
              {c.status && !/^alive$/i.test(c.status) && <span className="ml-1.5 text-[10px] px-1 py-px rounded bg-red-100 text-red-800 uppercase">{c.status}</span>}
              <span className="text-text-secondary"> — {line([c.location && `at ${c.location}`, c.with && `with ${c.with}`, c.physical, c.capacity && !/^none/i.test(c.capacity) && `can't: ${c.capacity}`, c.mood]) || 'no details yet'}</span>
              <span className="ml-1.5 text-[10px] text-text-tertiary">last seen Ch {c.lastSeenChapter}</span>
            </div>
          ))}
        </Section>
      )}
      {objects.length > 0 && (
        <Section title="Objects">
          {objects.map((a) => (
            <div key={a.key} className="text-[13px] leading-snug py-0.5">
              <span className="font-medium">{a.name}</span>
              <span className="text-text-secondary"> — {line([a.holder && `held by ${a.holder}`, a.location && `at ${a.location}`, a.condition]) || 'no details yet'}</span>
              <span className="ml-1.5 text-[10px] text-text-tertiary">Ch {a.lastSeenChapter}</span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}
