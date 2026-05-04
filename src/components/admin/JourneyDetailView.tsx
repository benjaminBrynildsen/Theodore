import { Fragment, useMemo } from 'react';
import {
  ArrowLeft, MapPin, Clock, Activity, Sparkles, AlertTriangle,
  MousePointer2, Eye, X, LogIn, CreditCard, Headphones, Wand2, MessageSquare,
  Layers, ArrowRight, ChevronRight, ChevronLeft, ChevronDown,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type JourneyEvent = {
  event: string;
  data?: Record<string, unknown> | null;
  page?: string | null;
  timestamp: string | Date;
};

export type JourneyDetail = {
  sessionId: string;
  city: string | null;
  region: string | null;
  country: string | null;
  ipHash: string | null;
  startedAt: string;
  durationSeconds: number;
  eventCount: number;
  events: JourneyEvent[];
};

// ── Event categorization ──
// Each event name maps to a category that drives icon + color. We pattern-
// match on substrings so new event names with familiar verbs (e.g.
// "creator_video_play") inherit sensible defaults without needing every
// name listed.
type Category = 'conversion' | 'cta' | 'modal' | 'audio' | 'error' | 'nav' | 'default';

const CATEGORY_ORDER: Category[] = ['conversion', 'cta', 'audio', 'modal', 'error', 'nav', 'default'];

function categorize(eventName: string): Category {
  const e = eventName.toLowerCase();
  if (e.includes('signup') || e.includes('register') || e === 'auth_success' || e.includes('subscribe') || e.includes('payment') || e.includes('checkout_redirect')) return 'conversion';
  if (e.includes('error') || e.includes('cap_') || e === 'exit' || e.includes('failed')) return 'error';
  if (e.includes('audio') || e.includes('listen') || e.includes('play') || e.includes('tts')) return 'audio';
  if (e.includes('modal') || e.includes('shown') || e.includes('dismiss') || e.includes('view_content')) return 'modal';
  if (e.includes('click') || e.includes('submit') || e.includes('send') || e.includes('generate') || e.includes('start')) return 'cta';
  if (e === 'pageview' || e.includes('redirect') || e.includes('page_view') || e.includes('arrived')) return 'nav';
  return 'default';
}

const CATEGORY_META: Record<Category, { label: string; bg: string; ring: string; text: string; dot: string; Icon: typeof Activity }> = {
  conversion: { label: 'Conversion', bg: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', Icon: LogIn },
  cta:        { label: 'Click',      bg: 'bg-blue-50',    ring: 'ring-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500',    Icon: MousePointer2 },
  audio:      { label: 'Audio',      bg: 'bg-purple-50',  ring: 'ring-purple-200',  text: 'text-purple-700',  dot: 'bg-purple-500',  Icon: Headphones },
  modal:      { label: 'UI shown',   bg: 'bg-amber-50',   ring: 'ring-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',   Icon: Eye },
  error:      { label: 'Error',      bg: 'bg-red-50',     ring: 'ring-red-200',     text: 'text-red-700',     dot: 'bg-red-500',     Icon: AlertTriangle },
  nav:        { label: 'Nav',        bg: 'bg-slate-50',   ring: 'ring-slate-200',   text: 'text-slate-600',   dot: 'bg-slate-400',   Icon: ArrowRight },
  default:    { label: 'Event',      bg: 'bg-black/5',    ring: 'ring-black/10',    text: 'text-text-secondary', dot: 'bg-black/30',  Icon: Activity },
};

function eventIcon(name: string): typeof Activity {
  const e = name.toLowerCase();
  if (e.includes('chat') || e.includes('chat_send') || e.includes('chat_auto')) return MessageSquare;
  if (e.includes('generate')) return Wand2;
  if (e.includes('signup') || e.includes('register')) return LogIn;
  if (e.includes('checkout') || e.includes('subscribe') || e.includes('payment')) return CreditCard;
  if (e.includes('audio') || e.includes('listen') || e.includes('play')) return Headphones;
  if (e.includes('shown') || e.includes('view_content')) return Eye;
  if (e.includes('dismiss')) return X;
  if (e.includes('first') || e.includes('sparkle')) return Sparkles;
  return CATEGORY_META[categorize(name)].Icon;
}

// ── Page coloring ──
// Hash the page string into a deterministic hue so multiple pages get
// distinguishable bands without us needing an explicit color table.
function pageColor(page: string | null | undefined): { bg: string; text: string; hex: string } {
  const p = String(page || 'unknown');
  // Stable lightweight hash → hue 0-360
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return {
    bg: '',
    text: '',
    hex: `hsl(${hue} 60% 45%)`,
  };
}

function shortPageLabel(page: string | null | undefined): string {
  const p = String(page || '/');
  if (p === '/' || !p) return 'Workspace';
  if (p === '/go/' || p === '/go') return 'Go landing';
  if (p.startsWith('/creators')) return 'Creators page';
  if (p === '/admin') return 'Admin';
  return p;
}

function humanize(eventName: string): string {
  return eventName
    .replace(/_/g, ' ')
    .replace(/\b(\w)/g, (_, c) => c.toUpperCase())
    .replace(/Tts/g, 'TTS');
}

function formatGap(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return '<1s';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

// Group consecutive events that share the same page into one "page run". Each
// run becomes a card. A new page = a new run, so back-and-forth navigation
// produces multiple cards (which is what we want — the user really did re-
// enter that view).
function buildPageRuns(events: JourneyEvent[]): { page: string; entered: number; events: JourneyEvent[] }[] {
  if (events.length === 0) return [];
  const runs: { page: string; entered: number; events: JourneyEvent[] }[] = [];
  let current: { page: string; entered: number; events: JourneyEvent[] } | null = null;
  for (const e of events) {
    const p = String(e.page || '/');
    const t = new Date(e.timestamp).getTime();
    if (!current || current.page !== p) {
      current = { page: p, entered: t, events: [e] };
      runs.push(current);
    } else {
      current.events.push(e);
    }
  }
  return runs;
}

// Pull out high-signal moments for the highlights bar. We grab the first
// occurrence of each "remarkable" thing so the bar reads as a story rather
// than a count of duplicates.
function buildHighlights(events: JourneyEvent[]): { label: string; at: string; category: Category }[] {
  const seen = new Set<string>();
  const out: { label: string; at: string; category: Category }[] = [];
  for (const e of events) {
    const cat = categorize(e.event);
    if (cat === 'default' || cat === 'nav') continue;
    if (seen.has(e.event)) continue;
    seen.add(e.event);
    out.push({ label: humanize(e.event), at: typeof e.timestamp === 'string' ? e.timestamp : new Date(e.timestamp).toISOString(), category: cat });
    if (out.length >= 6) break;
  }
  return out;
}

// Detect abandonment: if there's a long quiet stretch (>2min) between an event
// and the next, that gap is interesting. Used to flag "where did they bail?"
function detectAbandonment(events: JourneyEvent[]): { afterIdx: number; gapMs: number } | null {
  if (events.length < 2) return null;
  let worst: { afterIdx: number; gapMs: number } | null = null;
  for (let i = 1; i < events.length; i++) {
    const gap = new Date(events[i].timestamp).getTime() - new Date(events[i - 1].timestamp).getTime();
    if (gap > 120_000 && (!worst || gap > worst.gapMs)) worst = { afterIdx: i - 1, gapMs: gap };
  }
  return worst;
}

// Pick the most informative single line from an event's data — the "what"
// behind the "did". This is what fills the card subtitle so the user sees
// "clicked Sign Up" instead of just "Click".
function primaryDescriptor(e: JourneyEvent): { label: string; value: string } | null {
  const d = (e.data || {}) as Record<string, unknown>;
  const get = (k: string): string | null => {
    const v = d[k];
    if (typeof v !== 'string') return null;
    const s = v.trim();
    return s ? s : null;
  };
  const elem = get('element');
  if (elem) return { label: 'Clicked', value: elem.length > 80 ? elem.slice(0, 80) + '…' : elem };
  const prompt = get('prompt');
  if (prompt) return { label: 'Prompt', value: `"${prompt.length > 70 ? prompt.slice(0, 70) + '…' : prompt}"` };
  const ch = get('chapter_id');
  if (ch) return { label: 'Chapter', value: ch.length > 12 ? ch.slice(0, 12) + '…' : ch };
  const src = get('source');
  if (src) return { label: 'Source', value: src };
  const state = get('state');
  if (state) return { label: 'State', value: state.replace(/_/g, ' ') };
  const variant = get('variant');
  if (variant) return { label: 'Variant', value: variant };
  const creator = get('creator');
  if (creator) return { label: 'Creator', value: creator };
  const slug = get('slug');
  if (slug) return { label: 'Slug', value: slug };
  // Fall back to first non-empty string field — better than nothing.
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === 'string' && v.trim() && k !== 'tag' && k !== 'url' && k !== 'referrer') {
      return { label: k, value: String(v).slice(0, 60) };
    }
  }
  return null;
}

// ── Component ──
export function JourneyDetailView({
  detail,
  onBack,
  backLabel,
}: {
  detail: JourneyDetail;
  onBack: () => void;
  backLabel?: string;
}) {
  const startMs = new Date(detail.startedAt).getTime();
  const totalMs = detail.durationSeconds * 1000 || 1;

  const pageRuns = useMemo(() => buildPageRuns(detail.events), [detail.events]);
  const highlights = useMemo(() => buildHighlights(detail.events), [detail.events]);
  const abandonment = useMemo(() => detectAbandonment(detail.events), [detail.events]);

  // Build the timeline ribbon segments — each page run gets a width
  // proportional to the time it spans. Use the start of the next run (or
  // session end) as the segment's end so we don't have gaps.
  const ribbon = useMemo(() => {
    return pageRuns.map((run, i) => {
      const next = pageRuns[i + 1];
      const endMs = next ? next.entered : startMs + totalMs;
      const startPct = Math.max(0, ((run.entered - startMs) / totalMs) * 100);
      const widthPct = Math.max(2, ((endMs - run.entered) / totalMs) * 100);
      return { ...run, startPct, widthPct, endMs };
    });
  }, [pageRuns, startMs, totalMs]);

  // Counts per category for the legend.
  const categoryCounts = useMemo(() => {
    const counts: Record<Category, number> = { conversion: 0, cta: 0, modal: 0, audio: 0, error: 0, nav: 0, default: 0 };
    for (const e of detail.events) counts[categorize(e.event)]++;
    return counts;
  }, [detail.events]);

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={14} /> {backLabel || 'Back'}
      </button>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <StatCard
          icon={<MapPin size={12} />}
          label="Location"
          value={[detail.city, detail.region, detail.country].filter(Boolean).join(', ') || 'Unknown'}
        />
        <StatCard icon={<Clock size={12} />} label="Duration" value={formatDuration(detail.durationSeconds)} />
        <StatCard icon={<Activity size={12} />} label="Events" value={String(detail.eventCount)} />
        <StatCard icon={<Layers size={12} />} label="Pages" value={String(pageRuns.length)} />
      </div>

      {/* Timeline ribbon */}
      <div className="rounded-2xl border border-black/5 bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-text-tertiary">Timeline</div>
          <div className="text-[11px] text-text-tertiary">{new Date(detail.startedAt).toLocaleString()}</div>
        </div>
        <div className="relative h-10 rounded-xl overflow-hidden bg-black/[0.04]">
          {ribbon.map((seg, i) => {
            const c = pageColor(seg.page);
            return (
              <a
                key={i}
                href={`#page-${i}`}
                className="absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-medium text-white truncate hover:opacity-90 transition-opacity"
                style={{
                  left: `${seg.startPct}%`,
                  width: `${seg.widthPct}%`,
                  background: c.hex,
                }}
                title={`${shortPageLabel(seg.page)} — ${seg.events.length} events`}
              >
                <span className="px-1 truncate">{shortPageLabel(seg.page)}</span>
              </a>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-text-tertiary">
          {CATEGORY_ORDER.filter((c) => categoryCounts[c] > 0).map((c) => {
            const meta = CATEGORY_META[c];
            return (
              <div key={c} className="inline-flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', meta.dot)} />
                <span className="text-text-secondary">{meta.label}</span>
                <span className="text-text-tertiary">{categoryCounts[c]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="rounded-2xl border border-black/5 bg-white p-4 mb-4">
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold text-text-tertiary mb-2">Highlights</div>
          <div className="flex flex-wrap gap-2">
            {highlights.map((h, i) => {
              const meta = CATEGORY_META[h.category];
              const Icon = meta.Icon;
              return (
                <div
                  key={i}
                  className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ring-1 text-xs', meta.bg, meta.ring, meta.text)}
                >
                  <Icon size={11} />
                  <span className="font-medium">{h.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-page cards */}
      <div className="space-y-3">
        {pageRuns.map((run, idx) => {
          const c = pageColor(run.page);
          const next = pageRuns[idx + 1];
          const endMs = next ? next.entered : startMs + totalMs;
          const runDuration = Math.max(0, Math.round((endMs - run.entered) / 1000));
          const enteredAt = new Date(run.entered);
          const fromStart = Math.round((run.entered - startMs) / 1000);
          return (
            <div id={`page-${idx}`} key={idx} className="rounded-2xl border border-black/5 bg-white overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-2.5 border-b border-black/5"
                style={{ background: `linear-gradient(90deg, ${c.hex}11, transparent)` }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: c.hex }} />
                  <div className="text-sm font-semibold text-text-primary">{shortPageLabel(run.page)}</div>
                  <div className="text-[10px] text-text-tertiary font-mono">{run.page}</div>
                </div>
                <div className="text-[11px] text-text-tertiary">
                  +{fromStart}s · stayed {formatDuration(runDuration)} · {run.events.length} events
                  <span className="hidden sm:inline"> · {enteredAt.toLocaleTimeString()}</span>
                </div>
              </div>

              <SnakeGrid run={run} runEnteredMs={run.entered} allEvents={detail.events} abandonment={abandonment} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Snake grid of event cards ──
// Mobile: vertical stack with down-arrows. Desktop: 4-wide rows that
// alternate direction (left-to-right, then right-to-left, then LTR…) so the
// reader's eye follows a continuous path instead of jumping back to the left
// at each wrap.
const COLS_DESKTOP = 4;

function SnakeGrid({
  run,
  runEnteredMs,
  allEvents,
  abandonment,
}: {
  run: { page: string; entered: number; events: JourneyEvent[] };
  runEnteredMs: number;
  allEvents: JourneyEvent[];
  abandonment: { afterIdx: number; gapMs: number } | null;
}) {
  const events = run.events;
  const rows = useMemo(() => {
    const out: JourneyEvent[][] = [];
    for (let i = 0; i < events.length; i += COLS_DESKTOP) out.push(events.slice(i, i + COLS_DESKTOP));
    return out;
  }, [events]);

  return (
    <div className="px-3 py-3">
      {/* Mobile — single column with down-arrow between cards. */}
      <div className="md:hidden flex flex-col gap-2">
        {events.map((e, i) => {
          const prevTs = i === 0 ? new Date(runEnteredMs) : new Date(events[i - 1].timestamp);
          const gap = new Date(e.timestamp).getTime() - prevTs.getTime();
          const globalIdx = allEvents.indexOf(e);
          const isAbandonStart = abandonment !== null && globalIdx === abandonment.afterIdx;
          return (
            <Fragment key={i}>
              <EventCard event={e} gapMs={gap} isFirstInRun={i === 0} />
              {isAbandonStart && abandonment && (
                <PauseBanner gapMs={abandonment.gapMs} />
              )}
              {i < events.length - 1 && (
                <ChevronDown size={14} className="text-text-tertiary mx-auto" />
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Desktop — snake of rows. */}
      <div className="hidden md:flex flex-col gap-2">
        {rows.map((row, rowIdx) => {
          const reverse = rowIdx % 2 === 1;
          const isLastRow = rowIdx === rows.length - 1;
          // Down-arrow lives at the visual "end" of each row — same side the
          // snake will resume from on the next row, since rows alternate.
          const downArrowSide = reverse ? 'justify-start' : 'justify-end';
          // Detect abandonment border within this row (rendered after the
          // event whose globalIdx matches abandonment.afterIdx).
          return (
            <Fragment key={rowIdx}>
              <div className={cn('flex items-stretch gap-2', reverse && 'flex-row-reverse')}>
                {row.map((e, i) => {
                  const globalI = rowIdx * COLS_DESKTOP + i;
                  const prevTs = globalI === 0
                    ? new Date(runEnteredMs)
                    : new Date(events[globalI - 1].timestamp);
                  const gap = new Date(e.timestamp).getTime() - prevTs.getTime();
                  const isLastInRow = i === row.length - 1;
                  return (
                    <Fragment key={i}>
                      <EventCard
                        event={e}
                        gapMs={gap}
                        isFirstInRun={globalI === 0}
                        className="flex-1 min-w-0 basis-0"
                      />
                      {!isLastInRow && (
                        reverse
                          ? <ChevronLeft size={14} className="self-center text-text-tertiary shrink-0" />
                          : <ChevronRight size={14} className="self-center text-text-tertiary shrink-0" />
                      )}
                    </Fragment>
                  );
                })}
              </div>

              {!isLastRow && (
                <div className={cn('flex', downArrowSide, 'pr-3 pl-3')}>
                  <ChevronDown size={14} className="text-text-tertiary" />
                </div>
              )}

              {/* Abandonment banner if the worst long-pause starts in this row */}
              {(() => {
                if (!abandonment) return null;
                const startIdx = rowIdx * COLS_DESKTOP;
                const endIdx = startIdx + row.length - 1;
                const inRow = abandonment.afterIdx >= startIdx && abandonment.afterIdx <= endIdx;
                if (!inRow) return null;
                // Only render once, after the row that contains the gap-start.
                const eventInRow = events[abandonment.afterIdx - startIdx];
                const globalEventIdx = allEvents.indexOf(eventInRow);
                if (globalEventIdx !== abandonment.afterIdx) return null;
                return <PauseBanner gapMs={abandonment.gapMs} />;
              })()}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({
  event,
  gapMs,
  isFirstInRun,
  className,
}: {
  event: JourneyEvent;
  gapMs: number;
  isFirstInRun: boolean;
  className?: string;
}) {
  const cat = categorize(event.event);
  const meta = CATEGORY_META[cat];
  const Icon = eventIcon(event.event);
  const desc = primaryDescriptor(event);
  const ts = new Date(event.timestamp);
  return (
    <div
      className={cn(
        'rounded-xl border border-black/5 bg-white pl-3 pr-2.5 py-2 flex flex-col min-w-0 hover:shadow-sm transition-shadow border-l-2',
        // Colored left edge keyed to category. Tailwind classes only — we
        // can't use template hsl() here without arbitrary values.
        cat === 'conversion' && 'border-l-emerald-500',
        cat === 'cta' && 'border-l-blue-500',
        cat === 'audio' && 'border-l-purple-500',
        cat === 'modal' && 'border-l-amber-500',
        cat === 'error' && 'border-l-red-500',
        cat === 'nav' && 'border-l-slate-400',
        cat === 'default' && 'border-l-black/20',
        className,
      )}
    >
      <div className="flex items-start gap-1.5 mb-1">
        <span className={cn('shrink-0 w-5 h-5 rounded-full flex items-center justify-center', meta.bg, meta.text)}>
          <Icon size={11} />
        </span>
        <div className="flex-1 min-w-0">
          <div className={cn('text-[12px] font-semibold leading-tight truncate', meta.text)}>
            {humanize(event.event)}
          </div>
        </div>
      </div>
      {desc && (
        <div className="text-[11px] text-text-secondary leading-snug mb-1.5" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          <span className="text-text-tertiary">{desc.label}: </span>
          <span className="text-text-primary">{desc.value}</span>
        </div>
      )}
      <div className="mt-auto flex items-center justify-between gap-1 text-[10px] text-text-tertiary tabular-nums">
        <span>{ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        {isFirstInRun ? (
          <span>on entry</span>
        ) : gapMs > 5000 ? (
          <span>+{formatGap(gapMs)}</span>
        ) : null}
      </div>
    </div>
  );
}

function PauseBanner({ gapMs }: { gapMs: number }) {
  return (
    <div className="my-1 mx-1 px-3 py-2 rounded-lg bg-red-50/70 border border-red-100 flex items-center gap-2 text-[11px] text-red-700">
      <AlertTriangle size={12} />
      <span><strong>Long pause</strong> — {formatGap(gapMs)} of inactivity. Possible drop-off here.</span>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium text-text-primary truncate">{value}</div>
    </div>
  );
}
