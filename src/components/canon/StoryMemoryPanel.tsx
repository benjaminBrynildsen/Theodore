import { useMemo } from 'react';
import { BookOpen, Download } from 'lucide-react';
import { useStore } from '../../store';
import {
  artifactStateFor,
  characterStateFor,
  factsFor,
  characterTimeline,
  foldStoryState,
  knowledgeFor,
  resolveCanonEntry,
} from '../../lib/story-memory';
import { ARC_BEAT_LABEL, arcStageAt } from '../../lib/story-arcs';
import type { AnyCanonEntry, ArtifactEntry, CharacterEntry } from '../../types/canon';

interface Props {
  entry: AnyCanonEntry;
  onUpdate: (updates: Record<string, unknown>) => void;
}

/**
 * What the prose has established about this entry, folded from every chapter's
 * extracted continuity memory. Read-only, with a one-click "save to profile"
 * so the author decides what becomes canon.
 */
export function StoryMemoryPanel({ entry, onUpdate }: Props) {
  const chapters = useStore((s) => s.chapters);
  const projectChapters = useMemo(
    () => chapters.filter((c) => c.projectId === entry.projectId),
    [chapters, entry.projectId],
  );
  const state = useMemo(() => foldStoryState(projectChapters), [projectChapters]);
  const project = useStore((s) => s.projects.find((p) => p.id === entry.projectId));
  const timeline = useMemo(
    () => (entry.type === 'character' ? characterTimeline(projectChapters, entry) : []),
    [projectChapters, entry],
  );
  const plannedArc = entry.type === 'character'
    ? project?.arcPlan?.characters.find((c) => resolveCanonEntry(c.name, [entry]) === entry)
    : undefined;
  const lastWritten = Math.max(0, ...projectChapters.filter((c) => c.prose?.trim()).map((c) => c.number || 0));
  const nextBeat = plannedArc?.beats.find((b) => b.chapter > lastWritten);
  const stage = plannedArc ? arcStageAt(plannedArc, lastWritten) : null;

  const charState = entry.type === 'character' ? characterStateFor(state, entry) : undefined;
  const artState = entry.type === 'artifact' ? artifactStateFor(state, entry) : undefined;
  const facts = factsFor(state, entry);
  const secrets = entry.type === 'character' ? knowledgeFor(state, entry) : { knows: [], doesNotKnow: [] };
  if (!charState && !artState && facts.length === 0 && !secrets.knows.length && !secrets.doesNotKnow.length && !plannedArc) return null;

  const rows: [string, string | undefined][] = charState
    ? [
        ['Status', charState.status],
        ['Location', charState.location],
        ['With', charState.with],
        ['Mood', charState.mood],
        ['Physical', charState.physical],
        ['Arc so far', charState.arc],
        ['Relationships', charState.relationships],
      ]
    : artState
    ? [
        ['Held by', artState.holder],
        ['Location', artState.location],
        ['Condition', artState.condition],
      ]
    : [];

  const saveToProfile = () => {
    if (entry.type === 'character' && charState) {
      const c = (entry as CharacterEntry).character;
      const known = new Set((c.storyState?.knowledgeState || []).map((k) => k.toLowerCase()));
      onUpdate({
        character: {
          ...c,
          arc: { ...c.arc, currentState: charState.arc || c.arc?.currentState || '' },
          storyState: {
            ...c.storyState,
            currentLocation: charState.location || c.storyState?.currentLocation || '',
            emotionalState: charState.mood || c.storyState?.emotionalState || '',
            alive: charState.status ? !/dead|deceased|killed/i.test(charState.status) : c.storyState?.alive !== false,
            knowledgeState: [
              ...(c.storyState?.knowledgeState || []),
              ...(charState.learned || []).filter((l) => !known.has(l.toLowerCase())),
            ],
            lastSeenChapter: charState.lastSeenChapter,
          },
        },
      });
    } else if (entry.type === 'artifact' && artState) {
      const a = (entry as ArtifactEntry).artifact;
      onUpdate({
        artifact: {
          ...a,
          physical: { ...a.physical, condition: artState.condition || a.physical?.condition || '' },
          history: {
            ...a.history,
            currentOwner: artState.holder || a.history?.currentOwner || '',
            currentLocation: artState.location || a.history?.currentLocation || '',
          },
        },
      });
    }
  };

  const lastSeen = charState?.lastSeenChapter ?? artState?.lastSeenChapter;

  return (
    <div className="px-5 py-4 border-b border-black/5 bg-black/[0.015] space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-text-tertiary uppercase tracking-wider">
        <BookOpen size={13} />
        <span className="flex-1">From the story{lastSeen ? ` · as of Ch. ${lastSeen}` : ''}</span>
        {(charState || artState) && (
          <button
            onClick={saveToProfile}
            className="flex items-center gap-1 px-2 py-1 rounded-lg normal-case tracking-normal font-medium text-text-secondary hover:bg-white/60 transition-all"
            title="Copy this state into the profile fields below"
          >
            <Download size={11} /> Save to profile
          </button>
        )}
      </div>
      {rows.some(([, v]) => v) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-text-tertiary">{k}</dt>
              <dd className="text-text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {!!charState?.learned?.length && (
        <div className="text-xs">
          <div className="text-text-tertiary mb-1">Knows</div>
          <ul className="list-disc pl-4 space-y-0.5 text-text-primary">
            {charState.learned.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </div>
      )}
      {plannedArc && (
        <div className="text-xs space-y-0.5">
          <div className="text-text-tertiary mb-1">Planned arc</div>
          {plannedArc.want && <p><span className="text-text-tertiary">Wants: </span>{plannedArc.want}</p>}
          {plannedArc.need && <p><span className="text-text-tertiary">Needs: </span>{plannedArc.need}</p>}
          {plannedArc.flaw && <p><span className="text-text-tertiary">Flaw: </span>{plannedArc.flaw}</p>}
          {stage && <p><span className="text-text-tertiary">Now: </span>{ARC_BEAT_LABEL[stage.type]} (Ch. {stage.chapter}){stage.note ? ` — ${stage.note}` : ''}</p>}
          {nextBeat && <p><span className="text-text-tertiary">Next: </span>{ARC_BEAT_LABEL[nextBeat.type]} in Ch. {nextBeat.chapter}{nextBeat.note ? ` — ${nextBeat.note}` : ''}</p>}
        </div>
      )}
      {timeline.length > 1 && (
        <div className="text-xs">
          <div className="text-text-tertiary mb-1">How they've developed</div>
          <ol className="space-y-1">
            {timeline.map((t) => (
              <li key={t.chapter} className="flex gap-2">
                <span className="w-10 flex-shrink-0 text-text-tertiary tabular-nums">Ch. {t.chapter}</span>
                <span className="text-text-primary">
                  {[t.arc, t.mood && `feeling ${t.mood}`, t.relationships].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!!secrets.knows.length && (
        <div className="text-xs">
          <div className="text-text-tertiary mb-1">Secrets they know</div>
          <ul className="list-disc pl-4 space-y-0.5 text-text-primary">
            {secrets.knows.map((k) => <li key={k.secret}>{k.secret} <span className="text-text-tertiary">· since Ch. {k.chapter}</span></li>)}
          </ul>
        </div>
      )}
      {!!secrets.doesNotKnow.length && (
        <div className="text-xs">
          <div className="text-text-tertiary mb-1">Kept from them</div>
          <ul className="list-disc pl-4 space-y-0.5 text-text-primary">
            {secrets.doesNotKnow.map((k) => <li key={k.secret}>{k.secret}</li>)}
          </ul>
        </div>
      )}
      {facts.length > 0 && (
        <div className="text-xs">
          <div className="text-text-tertiary mb-1">Established facts</div>
          <ul className="list-disc pl-4 space-y-0.5 text-text-primary">
            {facts.map((f) => (
              <li key={`${f.chapter}-${f.fact}`}>
                {f.fact} <span className="text-text-tertiary">· Ch. {f.chapter}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
