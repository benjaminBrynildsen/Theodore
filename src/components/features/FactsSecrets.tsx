import { useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, ScrollText, Trash2, X } from 'lucide-react';
import { useStore } from '../../store';
import { foldStoryState, memoryMeta, type KnowledgeRecord, type MeetingState, type TimelineRecord } from '../../lib/story-memory';
import {
  addFact, applyFactBook, deleteFact, editFact, factRows, groupBySubject, markSeen, setMeeting, setSecret, setTimeline,
  type FactBook, type FactRow,
} from '../../lib/fact-book';
import { recordProjectAuthorship } from '../../lib/authorship-log';
import { cn } from '../../lib/utils';
import { StoryMemoryCatchUp } from './StoryMemoryCatchUp';
import type { Chapter, Project } from '../../types';

type Tab = 'facts' | 'secrets' | 'timeline' | 'meetings' | 'standing';

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
        message={(n) => `${n} written chapter${n === 1 ? " hasn't" : "s haven't"} been read for everything this tracks yet (facts, secrets, timeline, who's met whom). Read ${n === 1 ? 'it' : 'them'} to fill this in (a small credit cost per chapter).`}
      />

      <div className="flex gap-1 rounded-xl bg-black/5 p-1 text-[12px] font-medium overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ['facts', `Facts · ${rows.length}`],
          ['secrets', `Secrets · ${state.knowledge.length}`],
          ['timeline', 'Timeline'],
          ['meetings', `Who's met · ${state.meetings.length}`],
          ['standing', 'Right now'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 transition-all', tab === k ? 'bg-white shadow-sm text-text-primary' : 'text-text-tertiary')}>
            {label}
          </button>
        ))}
      </div>

      {tab !== 'standing' && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'facts' ? 'Search facts…' : tab === 'timeline' ? 'Search the timeline…' : 'Search names…'}
          className={input}
        />
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

      {tab === 'timeline' && (
        <Timeline
          chapters={chapters}
          items={state.timeline.filter((t) => match(t.subject, t.detail, t.when))}
          onSave={(original, next) => save(setTimeline(book, original, next), next ? `Set ${next.kind === 'age' ? `${next.subject}'s age` : `the ${next.kind} “${next.subject}”`}` : `Removed the ${original?.kind} “${original?.subject}”`)}
        />
      )}

      {tab === 'meetings' && (
        <Meetings
          meetings={state.meetings.filter((m) => match(m.a, m.b, m.how))}
          complete={state.meetingsComplete}
          onSave={(original, next) => save(setMeeting(book, original, next), next ? `Set how ${next.a} and ${next.b} know each other` : `Marked that ${original?.a} and ${original?.b} haven't met`)}
        />
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

const KIND_LABEL: Record<TimelineRecord['kind'], string> = { age: 'Ages', deadline: 'Deadlines', healing: 'Injuries & healing', date: 'Key dates' };
const KIND_HINT: Record<TimelineRecord['kind'], string> = {
  age: 'How old people are. Ages only change as story time passes.',
  deadline: 'What has to happen by when, counted against the story clock.',
  healing: 'Injuries and how long they take to heal.',
  date: 'Events in the past or future that the story keeps referring to.',
};

function Timeline({ chapters, items, onSave }: {
  chapters: Chapter[];
  items: TimelineRecord[];
  onSave: (original: TimelineRecord | null, next: { kind: TimelineRecord['kind']; subject: string; detail?: string; when?: string; status?: string } | null) => void;
}) {
  const clocks = [...chapters]
    .sort((a, b) => a.number - b.number)
    .map((c) => ({ n: c.number, clock: memoryMeta(c).storyClock }))
    .filter((c) => c.clock);
  return (
    <div className="space-y-3">
      <Section title="Story calendar" hint="When each chapter ends in story time.">
        {clocks.length ? clocks.map(({ n, clock }) => (
          <div key={n} className="text-[13px] leading-snug py-0.5">
            <span className="text-[11px] text-text-tertiary tabular-nums mr-1.5">Ch {n}</span>
            {[clock!.day, clock!.time].filter(Boolean).join(', ') || 'time not stated'}
            {(clock!.season || clock!.weather) && <span className="text-text-secondary"> · {[clock!.season, clock!.weather].filter(Boolean).join(', ')}</span>}
            {clock!.elapsed && <span className="text-text-tertiary"> (covered {clock!.elapsed})</span>}
          </div>
        )) : <p className="text-[12px] text-text-tertiary">Fills in as chapters are read.</p>}
      </Section>
      {(['age', 'deadline', 'healing', 'date'] as const).map((kind) => (
        <Section key={kind} title={KIND_LABEL[kind]} hint={KIND_HINT[kind]}>
          {items.filter((t) => t.kind === kind).map((t) => (
            <TimelineLine key={`${t.kind}:${t.subject}:${t.detail}`} kind={kind} item={t} onSave={(next) => onSave(t, next)} onDelete={() => onSave(t, null)} />
          ))}
          <TimelineLine kind={kind} item={null} onSave={(next) => onSave(null, next)} />
        </Section>
      ))}
    </div>
  );
}

const FIELDS: Record<TimelineRecord['kind'], { subject: string; detail?: string; when?: string; status?: string[] }> = {
  age: { subject: 'Who', detail: 'Age (e.g. 34)' },
  deadline: { subject: 'What has to happen', when: 'Due (e.g. Day 10)', status: ['open', 'met', 'missed'] },
  healing: { subject: 'Who', detail: 'Injury', when: 'Since / how long to heal', status: ['healing', 'healed'] },
  date: { subject: 'Event', when: 'When (e.g. ten years ago)' },
};

function TimelineLine({ kind, item, onSave, onDelete }: {
  kind: TimelineRecord['kind'];
  item: TimelineRecord | null;
  onSave: (next: { kind: TimelineRecord['kind']; subject: string; detail?: string; when?: string; status?: string }) => void;
  onDelete?: () => void;
}) {
  const f = FIELDS[kind];
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(item?.subject || '');
  const [detail, setDetail] = useState(item?.detail || '');
  const [when, setWhen] = useState(item?.when || '');
  const [status, setStatus] = useState(item?.status || f.status?.[0] || '');
  const reset = () => { setSubject(item?.subject || ''); setDetail(item?.detail || ''); setWhen(item?.when || ''); setStatus(item?.status || f.status?.[0] || ''); setEditing(false); };

  if (!editing) {
    if (!item) return <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-lg bg-black/5 text-[12px] font-medium"><Plus size={12} /> Add</button>;
    const settled = item.status && /met|missed|healed/.test(item.status);
    return (
      <div className="group flex items-start gap-2 text-[13px] leading-snug py-0.5">
        <span className={cn('flex-1', settled && 'text-text-tertiary')}>
          <span className="font-medium">{item.subject}</span>
          {item.detail && item.detail !== item.subject && <span>{kind === 'age' ? ` — ${item.detail}` : `: ${item.detail}`}</span>}
          {item.when && <span className="text-text-secondary"> — {kind === 'deadline' ? `due ${item.when}` : item.when}</span>}
          {item.status && <span className={cn('ml-1.5 text-[10px] px-1 py-px rounded uppercase', item.status === 'missed' ? 'bg-red-100 text-red-800' : 'bg-black/5 text-text-secondary')}>{item.status}</span>}
          {item.chapter ? <span className="ml-1.5 text-[10px] text-text-tertiary tabular-nums">Ch {item.chapter}</span> : <span className="ml-1.5 text-[10px] text-text-tertiary">· yours</span>}
        </span>
        <button onClick={() => setEditing(true)} className="p-1 rounded text-text-tertiary hover:text-text-primary" aria-label="Edit"><Pencil size={12} /></button>
        <button onClick={onDelete} className="p-1 rounded text-text-tertiary hover:text-red-600" aria-label="Delete"><Trash2 size={12} /></button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 py-1">
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={f.subject} className={input} autoFocus />
      {f.detail && <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={f.detail} className={input} />}
      {f.when && <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder={f.when} className={input} />}
      {f.status && (
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={input} aria-label="Status">
          {f.status.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={() => { if (!subject.trim()) return; onSave({ kind, subject, detail, when, status: f.status ? status : undefined }); if (item) setEditing(false); else reset(); }}
          disabled={!subject.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-text-primary text-text-inverse text-[12px] font-medium disabled:opacity-40"
        >
          <Check size={12} /> Save
        </button>
        <button onClick={reset} className="px-2.5 py-1 rounded-lg bg-black/5 text-[12px]">Cancel</button>
      </div>
    </div>
  );
}

type MeetingInput = { a: string; b: string; how?: string; aCalls?: string; bCalls?: string };

function Meetings({ meetings, complete, onSave }: {
  meetings: MeetingState[];
  complete: boolean;
  onSave: (original: MeetingState | null, next: MeetingInput | null) => void;
}) {
  const sorted = [...meetings].sort((x, y) => x.firstChapter - y.firstChapter || x.a.localeCompare(y.a));
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-text-tertiary leading-snug">
        {complete
          ? "Anyone not paired here hasn't met on the page. Unless their profiles say they already know each other, the writer treats a meeting between them as a first meeting, and pairs here never meet “for the first time” again."
          : 'Pairs here have met and never meet “for the first time” again. Read the remaining chapters so Theodore also knows who has never met.'}
      </p>
      {sorted.map((m) => <MeetingLine key={m.key} meeting={m} onSave={(next) => onSave(m, next)} onDelete={() => onSave(m, null)} />)}
      {!meetings.length && <p className="text-[12px] text-text-tertiary">No meetings recorded yet.</p>}
      <MeetingLine meeting={null} onSave={(next) => onSave(null, next)} />
    </div>
  );
}

function MeetingLine({ meeting, onSave, onDelete }: { meeting: MeetingState | null; onSave: (next: MeetingInput) => void; onDelete?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState(meeting?.a || '');
  const [b, setB] = useState(meeting?.b || '');
  const [how, setHow] = useState(meeting?.how || '');
  const [aCalls, setACalls] = useState(meeting?.aCalls || '');
  const [bCalls, setBCalls] = useState(meeting?.bCalls || '');
  const reset = () => { setA(meeting?.a || ''); setB(meeting?.b || ''); setHow(meeting?.how || ''); setACalls(meeting?.aCalls || ''); setBCalls(meeting?.bCalls || ''); setEditing(false); };

  if (!editing) {
    if (!meeting) return <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-black/5 text-[12px] font-medium"><Plus size={12} /> Add two people who've met</button>;
    return (
      <div className="rounded-xl bg-white/60 border border-black/5 px-3 py-2.5 text-[13px]">
        <div className="flex items-start gap-2">
          <span className="flex-1 leading-snug">
            <span className="font-medium">{meeting.a} & {meeting.b}</span>
            <span className="ml-1.5 text-[10px] text-text-tertiary">{meeting.firstChapter ? `met Ch ${meeting.firstChapter}` : 'knew each other before the story'}</span>
          </span>
          <button onClick={() => setEditing(true)} className="p-1 rounded text-text-tertiary hover:text-text-primary" aria-label="Edit"><Pencil size={12} /></button>
          <button onClick={onDelete} className="p-1 rounded text-text-tertiary hover:text-red-600" aria-label="They haven't met" title="They haven't met"><Trash2 size={12} /></button>
        </div>
        {meeting.how && <div className="text-[12px] text-text-secondary mt-0.5">{meeting.how}</div>}
        {(meeting.aCalls || meeting.bCalls) && (
          <div className="text-[12px] text-text-secondary">
            {[meeting.aCalls && `${meeting.a} calls ${meeting.b} “${meeting.aCalls}”`, meeting.bCalls && `${meeting.b} calls ${meeting.a} “${meeting.bCalls}”`].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>
    );
  }
  const ok = a.trim() && b.trim() && a.trim().toLowerCase() !== b.trim().toLowerCase();
  return (
    <div className="rounded-xl bg-white/80 border border-black/10 p-3 space-y-1.5">
      <div className="flex gap-1.5">
        <input value={a} onChange={(e) => setA(e.target.value)} placeholder="Name" className={input} disabled={!!meeting} autoFocus={!meeting} />
        <input value={b} onChange={(e) => setB(e.target.value)} placeholder="Name" className={input} disabled={!!meeting} />
      </div>
      <input value={how} onChange={(e) => setHow(e.target.value)} placeholder="How they know each other" className={input} autoFocus={!!meeting} />
      <input value={aCalls} onChange={(e) => setACalls(e.target.value)} placeholder={`What ${a.trim() || 'the first'} calls ${b.trim() || 'the second'}`} className={input} />
      <input value={bCalls} onChange={(e) => setBCalls(e.target.value)} placeholder={`What ${b.trim() || 'the second'} calls ${a.trim() || 'the first'}`} className={input} />
      <div className="flex gap-1.5">
        <button
          onClick={() => { if (!ok) return; onSave({ a, b, how, aCalls, bCalls }); if (meeting) setEditing(false); else reset(); }}
          disabled={!ok}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-text-primary text-text-inverse text-[12px] font-medium disabled:opacity-40"
        >
          <Check size={12} /> Save
        </button>
        <button onClick={reset} className="px-2.5 py-1 rounded-lg bg-black/5 text-[12px]">Cancel</button>
      </div>
    </div>
  );
}
