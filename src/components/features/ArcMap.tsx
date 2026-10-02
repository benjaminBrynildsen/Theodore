import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Info, Loader2, RotateCcw, Trash2, Users } from 'lucide-react';
import { useStore } from '../../store';
import { buildArcMap, pendingArcMap, resumeArcMapIfPending, subscribeArcMapProgress, type ArcMapProgress } from '../../lib/arc-planner';
import {
  ARC_BEAT_LABEL,
  ARTIFACT_BEAT_LABEL,
  analyzeArcPlan,
  arcsForChapter,
  type ArcBeatType,
  type ArtifactBeatType,
  type ArtifactJourney,
  type CharacterArc,
} from '../../lib/story-arcs';
import { cn } from '../../lib/utils';
import type { Chapter, Project } from '../../types';

// Same validated categorical palette as the thread map: blue for characters,
// orange for objects. Every row is labelled and the chapter panel repeats the
// data as text, so identity never rests on color alone.
const CHAR_COLOR = '#2a78d6';
const OBJ_COLOR = '#eb6834';
const COL_MIN = 30; // px per chapter column

type MarkShape = 'dot' | 'small' | 'ring' | 'diamond' | 'square' | 'x';
const ARC_SHAPE: Record<ArcBeatType, MarkShape> = {
  setup: 'dot', test: 'small', setback: 'ring', turn: 'diamond', crisis: 'x', change: 'square',
};
const OBJ_SHAPE: Record<ArtifactBeatType, MarkShape> = {
  introduce: 'dot', handoff: 'ring', use: 'small', reveal: 'diamond', payoff: 'square', lost: 'x',
};

function Mark({ shape, color }: { shape: MarkShape; color: string }) {
  const ring = `0 0 0 2px var(--color-bg, #f2f2f7)`;
  if (shape === 'diamond') return <span className="block w-[11px] h-[11px] rotate-45 rounded-[2px]" style={{ background: color, boxShadow: ring }} />;
  if (shape === 'ring') return <span className="block w-[10px] h-[10px] rounded-full bg-white" style={{ border: `2px solid ${color}`, boxShadow: ring }} />;
  if (shape === 'small') return <span className="block w-[8px] h-[8px] rounded-full" style={{ background: color, boxShadow: ring }} />;
  if (shape === 'square') return <span className="block w-[11px] h-[11px] rounded-[3px]" style={{ background: color, boxShadow: ring }} />;
  if (shape === 'x') {
    return (
      <span className="relative block w-[12px] h-[12px]" aria-hidden>
        <span className="absolute left-1/2 top-0 w-[3px] h-full -translate-x-1/2 rotate-45 rounded" style={{ background: color }} />
        <span className="absolute left-1/2 top-0 w-[3px] h-full -translate-x-1/2 -rotate-45 rounded" style={{ background: color }} />
      </span>
    );
  }
  return <span className="block w-[11px] h-[11px] rounded-full" style={{ background: color, boxShadow: ring }} />;
}

function BuildProgress({ progress }: { progress: ArcMapProgress | null }) {
  const secs = Math.round((progress?.elapsedMs || 0) / 1000);
  const label = !progress || progress.phase === 'reading'
    ? `Reading your outline and planning arcs… ${secs}s`
    : progress.phase === 'saving'
    ? 'Saving the map…'
    : `${progress.found} of ~${progress.expected} characters & objects mapped · ${secs}s`;
  return (
    <div className="w-full max-w-md mx-auto space-y-1.5" role="status" aria-live="polite">
      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
        <div className="h-full rounded-full bg-text-primary transition-[width] duration-700 ease-out" style={{ width: `${Math.max(4, progress?.pct ?? 4)}%` }} />
      </div>
      <p className="text-[11px] text-text-tertiary text-center tabular-nums">{label}</p>
      {(!progress || progress.phase === 'reading') && secs > 20 && (
        <p className="text-[11px] text-text-tertiary text-center">Usually 1–2 minutes. You can keep working — the map appears here when it's ready.</p>
      )}
    </div>
  );
}

interface Props {
  project: Project;
  chapters: Chapter[];
}

interface Lane {
  id: string;
  title: string;
  sub: string;
  color: string;
  beats: Array<{ chapter: number; shape: MarkShape; label: string; note: string; spoiler: boolean }>;
  from: number;
  to: number;
}

export function ArcMap({ project, chapters }: Props) {
  const updateProject = useStore((s) => s.updateProject);
  const [building, setBuilding] = useState(() => !!pendingArcMap(project.id));
  const [error, setError] = useState<string | null>(null);
  const [hideSpoilers, setHideSpoilers] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = useMemo(() => [...chapters].sort((a, b) => a.number - b.number), [chapters]);
  const n = sorted.length;
  const written = useMemo(() => new Set(sorted.filter((c) => c.prose?.trim()).map((c) => c.number)), [sorted]);
  const nextUnwritten = sorted.find((c) => !c.prose?.trim())?.number ?? 1;
  const [focusChapter, setFocusChapter] = useState<number>(nextUnwritten);

  const [progress, setProgress] = useState<ArcMapProgress | null>(null);
  useEffect(() => subscribeArcMapProgress(project.id, setProgress), [project.id]);

  useEffect(() => {
    const pending = pendingArcMap(project.id) || resumeArcMapIfPending(project.id);
    if (!pending) return;
    setBuilding(true);
    let alive = true;
    pending
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Map failed.'); })
      .finally(() => { if (alive) setBuilding(false); });
    return () => { alive = false; };
  }, [project.id]);

  const plan = project.arcPlan || null;
  const warnings = useMemo(() => analyzeArcPlan(plan, n), [plan, n]);
  const focus = useMemo(() => arcsForChapter(plan, focusChapter), [plan, focusChapter]);

  const build = async () => {
    setBuilding(true);
    setError(null);
    try {
      await buildArcMap(project.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(
        msg === 'INSUFFICIENT_CREDITS' ? 'Not enough credits to build the map.'
          : /load failed|failed to fetch|network/i.test(msg) ? 'The connection dropped before the map could start. Check your signal and tap Build again.'
          : msg || 'Map failed.',
      );
    } finally {
      setBuilding(false);
    }
  };

  const remove = (id: string) => {
    if (!plan) return;
    updateProject(project.id, {
      arcPlan: { ...plan, characters: plan.characters.filter((c) => c.id !== id), artifacts: plan.artifacts.filter((a) => a.id !== id) },
    });
    setExpandedId(null);
  };

  const hide = (text: string, isSpoiler: boolean) =>
    hideSpoilers && isSpoiler ? <span className="blur-[5px] select-none" aria-label="spoiler hidden">{text || 'hidden'}</span> : text;

  if (n < 2) {
    return <div className="rounded-2xl glass p-5 text-sm text-text-secondary">Add at least two chapters to map character arcs and objects.</div>;
  }

  if (!plan) {
    return (
      <div className="rounded-2xl glass p-6 text-center space-y-3">
        <Users size={22} className="mx-auto text-text-tertiary" />
        <h3 className="font-serif text-lg font-semibold">Map your characters and objects</h3>
        <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
          See how each main character changes across the book — what they want, what they need, and the chapters where they're tested,
          crack and finally change — and the journey of every important object, from where it first appears to where it pays off.
          {project.threadPlan ? ' Built on your thread map.' : ' Build the thread map first for the best result.'}
        </p>
        {building ? (
          <BuildProgress progress={progress} />
        ) : (
          <button onClick={build} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-semibold hover:shadow-md transition-all">
            <Users size={14} />
            Build character & object map
          </button>
        )}
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }

  const charLanes: Lane[] = plan.characters.map((c: CharacterArc) => ({
    id: c.id,
    title: c.name,
    sub: `${c.role}${c.shape !== 'positive' ? ` · ${c.shape} arc` : ''}`,
    color: CHAR_COLOR,
    beats: c.beats.map((b) => ({ chapter: b.chapter, shape: ARC_SHAPE[b.type], label: ARC_BEAT_LABEL[b.type], note: b.note, spoiler: b.type === 'crisis' || b.type === 'change' })),
    from: c.beats[0]?.chapter ?? 1,
    to: c.beats[c.beats.length - 1]?.chapter ?? 1,
  }));
  const objLanes: Lane[] = plan.artifacts.map((a: ArtifactJourney) => ({
    id: a.id,
    title: a.name,
    sub: `Ch.${a.introducedIn} → ${a.payoffIn}`,
    color: OBJ_COLOR,
    beats: a.beats.map((b) => ({
      chapter: b.chapter, shape: OBJ_SHAPE[b.type], label: ARTIFACT_BEAT_LABEL[b.type],
      note: `${b.note}${b.holder ? ` (held by ${b.holder})` : ''}`, spoiler: b.type === 'reveal' || b.type === 'payoff',
    })),
    from: a.introducedIn,
    to: a.beats[a.beats.length - 1]?.chapter ?? a.payoffIn,
  }));
  const gridCols = `repeat(${n}, minmax(${COL_MIN}px, 1fr))`;

  const details = (id: string) => {
    const c = plan.characters.find((x) => x.id === id);
    if (c) {
      return [
        ['Wants', c.want, false], ['Needs', c.need, false], ['Flaw', c.flaw, false],
        ['Starts', c.startState, false], ['Ends', c.endState, true],
      ] as Array<[string, string, boolean]>;
    }
    const a = plan.artifacts.find((x) => x.id === id);
    return a ? ([['What it is', a.description, false], ['What it means', a.significance, true]] as Array<[string, string, boolean]>) : [];
  };

  const renderLanes = (title: string, lanes: Lane[]) => !lanes.length ? null : (
    <div className="mt-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">{title}</div>
      {lanes.map((lane) => {
        const isOpen = expandedId === lane.id;
        return (
          <div key={lane.id} className="relative">
            <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: gridCols }}>
              {sorted.map((c) => (
                <div key={c.id} className={cn(focusChapter === c.number ? 'bg-black/[0.05]' : written.has(c.number) ? 'bg-black/[0.025]' : '')} />
              ))}
            </div>
            <button onClick={() => setExpandedId(isOpen ? null : lane.id)} className="relative w-full text-left pt-1.5" aria-expanded={isOpen}>
              <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                <div
                  className="flex items-center gap-1.5 text-[12px] leading-tight text-text-primary truncate pr-2"
                  style={{ gridColumn: `${Math.min(lane.from, Math.max(1, n - 6))} / ${n + 1}` }}
                >
                  <span className="truncate font-medium">{lane.title}</span>
                  <span className="text-text-tertiary flex-shrink-0">{lane.sub}</span>
                </div>
              </div>
              <div className="grid items-center h-5" style={{ gridTemplateColumns: gridCols }}>
                <div className="h-[6px] rounded-full mx-[5px]" style={{ gridColumn: `${lane.from} / ${lane.to + 1}`, gridRow: 1, background: lane.color, opacity: 0.35 }} />
                {lane.beats.map((b, i) => (
                  <span
                    key={i}
                    className="flex justify-center"
                    style={{ gridColumn: `${b.chapter} / ${b.chapter + 1}`, gridRow: 1 }}
                    title={`Ch.${b.chapter} · ${b.label}${b.note && !(hideSpoilers && b.spoiler) ? `: ${b.note}` : ''}`}
                  >
                    <Mark shape={b.shape} color={lane.color} />
                  </span>
                ))}
              </div>
            </button>
            {isOpen && (
              <div className="relative mt-1 mb-2 rounded-xl bg-white shadow-sm border border-black/5 p-3 text-xs space-y-2 sticky left-0 max-w-[min(100%,36rem)]">
                {details(lane.id).filter(([, v]) => v).map(([k, v, sp]) => (
                  <p key={k}><span className="text-text-tertiary">{k}: </span>{hide(v, sp)}</p>
                ))}
                <ol className="space-y-1">
                  {lane.beats.map((b, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="flex items-center gap-1.5 w-32 flex-shrink-0 text-text-tertiary tabular-nums">
                        <Mark shape={b.shape} color={lane.color} /> Ch.{b.chapter} {b.label}
                      </span>
                      <span className="text-text-primary">{hide(b.note, b.spoiler)}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex pt-1">
                  <button onClick={() => remove(lane.id)} className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-text-tertiary hover:text-error hover:bg-error/5">
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const focusTitle = sorted.find((c) => c.number === focusChapter)?.title;

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Users size={15} className="text-text-tertiary" />
        <h3 className="font-semibold text-sm flex-1 min-w-0 truncate">
          Characters & objects <span className="text-text-tertiary font-normal text-xs">· {plan.characters.length} arcs, {plan.artifacts.length} objects</span>
        </h3>
        <button onClick={() => setHideSpoilers(!hideSpoilers)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-white/60">
          {hideSpoilers ? <Eye size={13} /> : <EyeOff size={13} />}
          {hideSpoilers ? 'Show spoilers' : 'Hide spoilers'}
        </button>
        <button
          onClick={build}
          disabled={building}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-white/60 disabled:opacity-60"
          title="Re-plan every arc and object from the current outline, thread map and written chapters"
        >
          {building ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
          {building ? 'Rebuilding…' : 'Rebuild'}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {building && <BuildProgress progress={progress} />}

      {/* Legend: beat shapes per row type */}
      <div className="space-y-1 text-[11px] text-text-secondary">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 font-medium"><span className="w-3 h-[6px] rounded-full" style={{ background: CHAR_COLOR }} />Characters</span>
          {(Object.keys(ARC_SHAPE) as ArcBeatType[]).map((t) => (
            <span key={t} className="flex items-center gap-1 text-text-tertiary"><Mark shape={ARC_SHAPE[t]} color={CHAR_COLOR} />{ARC_BEAT_LABEL[t]}</span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 font-medium"><span className="w-3 h-[6px] rounded-full" style={{ background: OBJ_COLOR }} />Objects</span>
          {(Object.keys(OBJ_SHAPE) as ArtifactBeatType[]).map((t) => (
            <span key={t} className="flex items-center gap-1 text-text-tertiary"><Mark shape={OBJ_SHAPE[t]} color={OBJ_COLOR} />{ARTIFACT_BEAT_LABEL[t]}</span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-1">
        <div style={{ minWidth: n * COL_MIN }}>
          <div className="grid gap-0 mb-1 sticky top-0" style={{ gridTemplateColumns: gridCols }}>
            {sorted.map((c) => (
              <button
                key={c.id}
                onClick={() => setFocusChapter(c.number)}
                className={cn(
                  'h-7 mx-[1px] rounded-md text-[11px] tabular-nums transition-colors',
                  focusChapter === c.number ? 'bg-text-primary text-text-inverse font-semibold'
                    : written.has(c.number) ? 'bg-black/[0.07] text-text-primary font-semibold'
                    : 'text-text-tertiary hover:bg-black/5',
                )}
                title={`Ch.${c.number}: ${c.title}${written.has(c.number) ? ' (written)' : ''}`}
              >
                {c.number}
              </button>
            ))}
          </div>
          {renderLanes('Character arcs', charLanes)}
          {renderLanes('Objects', objLanes)}
        </div>
      </div>

      {/* Focused chapter — text view of what it does with each arc and object */}
      <div className="rounded-xl bg-white/70 border border-black/5 p-3 text-xs space-y-1.5">
        <div className="font-semibold text-text-primary">
          Chapter {focusChapter}: {focusTitle}
          {written.has(focusChapter) && <span className="ml-2 font-normal text-text-tertiary">written</span>}
        </div>
        {focus.arcBeats.map(({ arc, beat }) => (
          <p key={arc.id + beat.type}>
            <span className="font-medium">{arc.name}</span> <span className="text-text-tertiary">{ARC_BEAT_LABEL[beat.type]}</span>
            {beat.note && <span className="text-text-secondary"> — {hide(beat.note, beat.type === 'crisis' || beat.type === 'change')}</span>}
          </p>
        ))}
        {focus.artifactBeats.map(({ artifact, beat }) => (
          <p key={artifact.id + beat.type}>
            <span className="font-medium">{artifact.name}</span> <span className="text-text-tertiary">{ARTIFACT_BEAT_LABEL[beat.type]}</span>
            {beat.note && <span className="text-text-secondary"> — {hide(beat.note, beat.type === 'reveal' || beat.type === 'payoff')}</span>}
            {beat.holder && <span className="text-text-tertiary"> · held by {beat.holder}</span>}
          </p>
        ))}
        {!!focus.arcsInProgress.length && (
          <p className="text-text-secondary">
            <span className="text-text-tertiary">Mid-arc: </span>
            {focus.arcsInProgress.map(({ arc, stage }) => `${arc.name} (last ${ARC_BEAT_LABEL[stage.type]}, Ch.${stage.chapter})`).join(' · ')}
          </p>
        )}
        {!!focus.artifactsInPlay.length && (
          <p className="text-text-secondary">
            <span className="text-text-tertiary">In play: </span>
            {focus.artifactsInPlay.map(({ artifact, holder }) => `${artifact.name}${holder ? ` (${holder})` : ''}`).join(' · ')}
          </p>
        )}
        {!focus.arcBeats.length && !focus.artifactBeats.length && !focus.arcsInProgress.length && !focus.artifactsInPlay.length && (
          <p className="text-text-tertiary">Nothing planned for this chapter.</p>
        )}
      </div>

      {!!warnings.length && (
        <div className="space-y-1">
          {warnings.map((w, i) => (
            <div key={i} className={cn('flex items-start gap-2 text-xs rounded-lg px-2.5 py-1.5', w.level === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-black/[0.03] text-text-secondary')}>
              {w.level === 'warning' ? <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> : <Info size={13} className="mt-0.5 flex-shrink-0" />}
              {w.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
