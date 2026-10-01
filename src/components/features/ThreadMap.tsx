import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, GitBranch, Info, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { useStore } from '../../store';
import { buildThreadMap, pendingThreadMap, resumeThreadMapIfPending, subscribeThreadMapProgress, type ThreadMapProgress } from '../../lib/thread-planner';
import {
  TIER_LABELS,
  analyzeThreadPlan,
  retimeThread,
  threadStatus,
  threadsForChapter,
  type StoryThread,
  type ThreadBeat,
  type ThreadTier,
} from '../../lib/story-threads';
import { cn } from '../../lib/utils';
import type { Chapter, Project } from '../../types';

// Fixed categorical order (validated all-pairs against the app surface #f2f2f7):
// slot 1 blue = major, slot 2 orange = subplot, slot 3 aqua = hook,
// slot 7 violet = series (slot 4 yellow failed against orange).
// Orange/aqua sit under 3:1 contrast, so every bar carries a text label
// and the chapter panel gives a text view of the same data. Series bars also
// carry a shape cue (they run off the edge with an arrow), not color alone.
const TIER_COLOR: Record<ThreadTier, string> = {
  major: '#2a78d6',
  subplot: '#eb6834',
  hook: '#1baf7a',
  series: '#4a3aa7',
};
const TIERS: ThreadTier[] = ['series', 'major', 'subplot', 'hook'];
const COL_MIN = 30; // px per chapter column

const BEAT_LABEL: Record<ThreadBeat['type'], string> = {
  open: 'opens', hint: 'hint', advance: 'advances', reveal: 'reveal', close: 'closes',
};

function Marker({ type, color }: { type: ThreadBeat['type']; color: string }) {
  const ring = `0 0 0 2px var(--color-bg, #f2f2f7)`; // surface ring where marks overlap the bar
  if (type === 'reveal') {
    return <span className="block w-[11px] h-[11px] rotate-45 rounded-[2px]" style={{ background: color, boxShadow: ring }} />;
  }
  if (type === 'hint') {
    return <span className="block w-[10px] h-[10px] rounded-full bg-white" style={{ border: `2px solid ${color}`, boxShadow: ring }} />;
  }
  if (type === 'advance') {
    return <span className="block w-[8px] h-[8px] rounded-full" style={{ background: color, boxShadow: ring }} />;
  }
  if (type === 'close') {
    return <span className="block w-[11px] h-[11px] rounded-[3px]" style={{ background: color, boxShadow: ring }} />;
  }
  return <span className="block w-[11px] h-[11px] rounded-full" style={{ background: color, boxShadow: ring }} />;
}

function BuildProgress({ progress }: { progress: ThreadMapProgress | null }) {
  const secs = Math.round((progress?.elapsedMs || 0) / 1000);
  const label = !progress || progress.phase === 'reading'
    ? `Reading your outline and planning the threads… ${secs}s`
    : progress.phase === 'saving'
    ? 'Saving the map…'
    : `${progress.threadsFound} of ~${progress.threadsExpected} threads mapped · ${secs}s`;
  return (
    <div className="w-full max-w-md mx-auto space-y-1.5" role="status" aria-live="polite">
      <div className="h-1.5 rounded-full bg-black/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-text-primary transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(4, progress?.pct ?? 4)}%` }}
        />
      </div>
      <p className="text-[11px] text-text-tertiary text-center tabular-nums">{label}</p>
      {(!progress || progress.phase === 'reading') && secs > 20 && (
        <p className="text-[11px] text-text-tertiary text-center">Usually 1–2 minutes. You can keep working — the map appears here when it's ready.</p>
      )}
    </div>
  );
}

const STATUS_STYLE = {
  planned: 'bg-black/5 text-text-tertiary',
  open: 'bg-amber-100 text-amber-800',
  resolved: 'bg-green-100 text-green-700',
  continues: 'bg-violet-100 text-violet-700',
} as const;

interface Props {
  project: Project;
  chapters: Chapter[];
}

export function ThreadMap({ project, chapters }: Props) {
  const updateProject = useStore((s) => s.updateProject);
  const [building, setBuilding] = useState(() => !!pendingThreadMap(project.id));
  const [error, setError] = useState<string | null>(null);
  const [hideSpoilers, setHideSpoilers] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sorted = useMemo(() => [...chapters].sort((a, b) => a.number - b.number), [chapters]);
  const n = sorted.length;
  const written = useMemo(() => new Set(sorted.filter((c) => c.prose?.trim()).map((c) => c.number)), [sorted]);
  const nextUnwritten = sorted.find((c) => !c.prose?.trim())?.number ?? 1;
  const [focusChapter, setFocusChapter] = useState<number>(nextUnwritten);

  const [progress, setProgress] = useState<ThreadMapProgress | null>(null);
  useEffect(() => subscribeThreadMapProgress(project.id, setProgress), [project.id]);

  // A build may already be running (started during project creation), or a
  // server-side job may have been left running when the page was reloaded.
  useEffect(() => {
    const pending = pendingThreadMap(project.id) || resumeThreadMapIfPending(project.id);
    if (!pending) return;
    setBuilding(true);
    let alive = true;
    pending
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Thread map failed.'); })
      .finally(() => { if (alive) setBuilding(false); });
    return () => { alive = false; };
  }, [project.id]);

  const plan = project.threadPlan || null;
  const warnings = useMemo(() => analyzeThreadPlan(plan, n), [plan, n]);
  const focus = useMemo(() => threadsForChapter(plan, focusChapter), [plan, focusChapter]);

  const build = async () => {
    setBuilding(true);
    setError(null);
    try {
      await buildThreadMap(project.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(
        msg === 'INSUFFICIENT_CREDITS' ? 'Not enough credits to build the thread map.'
          : /load failed|failed to fetch|network/i.test(msg) ? 'The connection dropped before the map could start. Check your signal and tap Build again.'
          : msg || 'Thread map failed.',
      );
    } finally {
      setBuilding(false);
    }
  };

  const saveThreads = (threads: StoryThread[]) => {
    if (!plan) return;
    updateProject(project.id, { threadPlan: { ...plan, threads } });
  };

  const spoiler = (t: StoryThread, text: string) =>
    hideSpoilers && (t.kind === 'twist' || t.tier === 'major' || t.continues) ? (
      <span className="blur-[5px] select-none" aria-label="spoiler hidden">{text || 'hidden'}</span>
    ) : text;

  if (n < 2) {
    return (
      <div className="rounded-2xl glass p-5 text-sm text-text-secondary">
        Add at least two chapters to build a thread map.
      </div>
    );
  }

  // ---------- Empty state ----------
  if (!plan) {
    return (
      <div className="rounded-2xl glass p-6 text-center space-y-3">
        <GitBranch size={22} className="mx-auto text-text-tertiary" />
        <h3 className="font-serif text-lg font-semibold">Map the threads of your book</h3>
        <p className="text-sm text-text-secondary max-w-md mx-auto leading-relaxed">
          See every plot line, subplot, hook and twist — where each one opens, where its clues are planted, and where it pays off.
          Each chapter is then written to follow the map.
        </p>
        {building ? (
          <BuildProgress progress={progress} />
        ) : (
          <button
            onClick={build}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-text-primary text-text-inverse text-sm font-semibold hover:shadow-md transition-all"
          >
            <GitBranch size={14} />
            Build thread map
          </button>
        )}
        {error && <p className="text-xs text-error">{error}</p>}
      </div>
    );
  }

  const gridCols = `repeat(${n}, minmax(${COL_MIN}px, 1fr))`;
  const counts = TIERS.map((tier) => plan.threads.filter((t) => t.tier === tier).length);

  return (
    <div className="rounded-2xl glass p-4 sm:p-5 space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <GitBranch size={15} className="text-text-tertiary" />
        <h3 className="font-semibold text-sm flex-1 min-w-0 truncate">
          Threads <span className="text-text-tertiary font-normal text-xs">· {plan.threads.length} across {n} ch.</span>
        </h3>
        <button
          onClick={() => setHideSpoilers(!hideSpoilers)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-white/60"
        >
          {hideSpoilers ? <Eye size={13} /> : <EyeOff size={13} />}
          {hideSpoilers ? 'Show spoilers' : 'Hide spoilers'}
        </button>
        <button
          onClick={build}
          disabled={building}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-white/60 disabled:opacity-60"
          title="Re-plan every thread from the current outline and written chapters"
        >
          {building ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
          {building ? 'Rebuilding…' : 'Rebuild'}
        </button>
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
      {building && <BuildProgress progress={progress} />}

      {/* Legend: tiers (color + name) and beat shapes — identity is never color alone */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-text-secondary">
        {TIERS.map((tier, i) => (
          <span key={tier} className="flex items-center gap-1.5">
            <span className="w-3 h-[6px] rounded-full" style={{ background: TIER_COLOR[tier] }} />
            {TIER_LABELS[tier]} ({counts[i]})
          </span>
        ))}
        <span className="flex items-center gap-3 text-text-tertiary">
          {(['open', 'hint', 'reveal', 'close'] as const).map((b) => (
            <span key={b} className="flex items-center gap-1"><Marker type={b} color="#6b6b70" />{BEAT_LABEL[b]}</span>
          ))}
        </span>
      </div>

      {/* Timeline */}
      <div className="overflow-x-auto -mx-4 sm:-mx-5 px-4 sm:px-5 pb-1">
        <div style={{ minWidth: n * COL_MIN }}>
          {/* Chapter header — tap a chapter to see what it does with each thread */}
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

          {TIERS.map((tier) => {
            const threads = plan.threads.filter((t) => t.tier === tier).sort((a, b) => a.opensIn - b.opensIn || a.closesIn - b.closesIn);
            if (!threads.length) return null;
            const color = TIER_COLOR[tier];
            return (
              <div key={tier} className="mt-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary mb-1">{TIER_LABELS[tier]}</div>
                {threads.map((t) => {
                  const status = threadStatus(t, sorted);
                  const isOpen = expandedId === t.id;
                  return (
                    <div key={t.id} className="relative">
                      {/* Written-chapter shading + focus column, behind the row */}
                      <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: gridCols }}>
                        {sorted.map((c) => (
                          <div
                            key={c.id}
                            className={cn(
                              focusChapter === c.number ? 'bg-black/[0.05]' : written.has(c.number) ? 'bg-black/[0.025]' : '',
                            )}
                          />
                        ))}
                      </div>
                      <button
                        onClick={() => setExpandedId(isOpen ? null : t.id)}
                        className="relative w-full text-left pt-1.5"
                        aria-expanded={isOpen}
                      >
                        {/* Label above the bar, starting at its open column */}
                        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                          <div
                            className="flex items-center gap-1.5 text-[12px] leading-tight text-text-primary truncate pr-2"
                            style={{ gridColumn: `${Math.min(t.opensIn, Math.max(1, n - 6))} / ${n + 1}` }}
                          >
                            <span className="truncate font-medium">{t.kind === 'twist' && hideSpoilers ? 'Twist' : t.title}</span>
                            <span className="text-text-tertiary tabular-nums flex-shrink-0">{t.continues ? `Ch.${t.opensIn} → next book` : `Ch.${t.opensIn}–${t.closesIn}`}</span>
                            <span className={cn('px-1.5 rounded text-[10px] flex-shrink-0', STATUS_STYLE[status])}>{status}</span>
                          </div>
                        </div>
                        {/* Bar + beat markers on one grid row */}
                        <div className="grid items-center h-5" style={{ gridTemplateColumns: gridCols }}>
                          {t.continues ? (
                            // Series thread: runs off the end of the book with an arrow.
                            <div
                              className="relative h-[6px] rounded-l-full ml-[5px]"
                              style={{ gridColumn: `${t.opensIn} / ${n + 1}`, gridRow: 1, background: color }}
                            >
                              <span
                                className="absolute -right-[1px] top-1/2 -translate-y-1/2 w-0 h-0"
                                style={{ borderTop: '7px solid transparent', borderBottom: '7px solid transparent', borderLeft: `9px solid ${color}` }}
                                aria-hidden
                              />
                            </div>
                          ) : (
                            <div
                              className="h-[6px] rounded-full mx-[5px]"
                              style={{ gridColumn: `${t.opensIn} / ${t.closesIn + 1}`, gridRow: 1, background: color, opacity: status === 'resolved' ? 0.55 : 1 }}
                            />
                          )}
                          {t.beats.map((b, i) => (
                            <span
                              key={i}
                              className="flex justify-center"
                              style={{ gridColumn: `${b.chapter} / ${b.chapter + 1}`, gridRow: 1 }}
                              title={`Ch.${b.chapter} · ${BEAT_LABEL[b.type]}${b.note ? `: ${b.note}` : ''}`}
                            >
                              <Marker type={b.type} color={color} />
                            </span>
                          ))}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="relative mt-1 mb-2 rounded-xl bg-white shadow-sm border border-black/5 p-3 text-xs space-y-2 sticky left-0 max-w-[min(100%,36rem)]">
                          {t.question && <p><span className="text-text-tertiary">Question: </span>{t.question}</p>}
                          {t.resolution && <p><span className="text-text-tertiary">{t.continues ? 'Where it’s heading: ' : 'Pays off: '}</span>{spoiler(t, t.resolution)}</p>}
                          {!!t.characters.length && <p><span className="text-text-tertiary">Who: </span>{t.characters.join(', ')}</p>}
                          <ol className="space-y-1">
                            {t.beats.map((b, i) => (
                              <li key={i} className="flex gap-2">
                                <span className="flex items-center gap-1.5 w-24 flex-shrink-0 text-text-tertiary tabular-nums">
                                  <Marker type={b.type} color={color} /> Ch.{b.chapter} {BEAT_LABEL[b.type]}
                                </span>
                                <span className="text-text-primary">{b.type === 'reveal' || b.type === 'close' ? spoiler(t, b.note) : b.note}</span>
                              </li>
                            ))}
                          </ol>
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <label className="flex items-center gap-1 text-text-tertiary">
                              Opens
                              <select
                                value={t.opensIn}
                                onChange={(e) => saveThreads(plan.threads.map((x) => (x.id === t.id ? retimeThread(x, Number(e.target.value), x.closesIn, n) : x)))}
                                className="bg-white border border-black/10 rounded-md px-1 py-0.5 text-text-primary"
                              >
                                {sorted.map((c) => <option key={c.id} value={c.number}>Ch.{c.number}</option>)}
                              </select>
                            </label>
                            {t.continues ? (
                              <span className="text-text-tertiary">Stays open — continues into the next book</span>
                            ) : (
                            <label className="flex items-center gap-1 text-text-tertiary">
                              Closes
                              <select
                                value={t.closesIn}
                                onChange={(e) => saveThreads(plan.threads.map((x) => (x.id === t.id ? retimeThread(x, x.opensIn, Number(e.target.value), n) : x)))}
                                className="bg-white border border-black/10 rounded-md px-1 py-0.5 text-text-primary"
                              >
                                {sorted.map((c) => <option key={c.id} value={c.number}>Ch.{c.number}</option>)}
                              </select>
                            </label>
                            )}
                            <button
                              onClick={() => { saveThreads(plan.threads.filter((x) => x.id !== t.id)); setExpandedId(null); }}
                              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-text-tertiary hover:text-error hover:bg-error/5"
                            >
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
          })}
        </div>
      </div>

      {/* Focused chapter — the text view of what this chapter does with each thread */}
      <div className="rounded-xl bg-white/70 border border-black/5 p-3 text-xs space-y-1.5">
        <div className="font-semibold text-text-primary">
          Chapter {focusChapter}: {sorted.find((c) => c.number === focusChapter)?.title}
          {written.has(focusChapter) && <span className="ml-2 font-normal text-text-tertiary">written</span>}
        </div>
        {[
          ['Opens', focus.opening.map((t) => ({ t, note: t.question }))],
          ['Hints', focus.hinting.map((h) => ({ t: h.thread, note: h.note }))],
          ['Advances', focus.advancing.map((v) => ({ t: v.thread, note: v.note }))],
          ['Reveals', focus.revealing.map((r) => ({ t: r.thread, note: r.note }))],
          ['Closes', focus.closing.map((t) => ({ t, note: t.resolution }))],
        ].map(([label, items]) => (items as Array<{ t: StoryThread; note: string }>).length ? (
          <div key={label as string} className="flex gap-2">
            <span className="w-16 flex-shrink-0 text-text-tertiary">{label as string}</span>
            <ul className="space-y-0.5">
              {(items as Array<{ t: StoryThread; note: string }>).map(({ t, note }) => (
                <li key={t.id + (label as string)}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ background: TIER_COLOR[t.tier] }} />
                  <span className="font-medium">{t.kind === 'twist' && hideSpoilers ? 'Twist' : t.title}</span>
                  {note && <span className="text-text-secondary"> — {label === 'Reveals' || label === 'Closes' ? spoiler(t, note) : note}</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : null)}
        {!!focus.carrying.length && (
          <div className="flex gap-2">
            <span className="w-16 flex-shrink-0 text-text-tertiary">Keep open</span>
            <span className="text-text-secondary">{focus.carrying.map((t) => `${t.kind === 'twist' && hideSpoilers ? 'Twist' : t.title} (${t.continues ? 'next book' : `Ch.${t.closesIn}`})`).join(' · ')}</span>
          </div>
        )}
        {!focus.opening.length && !focus.closing.length && !focus.hinting.length && !focus.advancing.length && !focus.revealing.length && !focus.carrying.length && (
          <p className="text-text-tertiary">No thread activity planned for this chapter.</p>
        )}
      </div>

      {/* Health checks */}
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
