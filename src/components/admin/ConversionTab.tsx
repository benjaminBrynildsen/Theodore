import { useEffect, useState, type ReactNode } from 'react';
import { RefreshCw, TrendingUp, Users as UsersIcon, DollarSign, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

interface Snapshot {
  totalSignups: number;
  paidUsers: number;
  conversionRate: number;
}

interface TrailWindow {
  signups: number;
  paid: number;
  rate: number;
}

interface DailyRow {
  day: string;
  signups: number;
  paid: number;
}

interface PaidUser {
  email: string;
  plan: string;
  signedUpAt: string | null;
}

interface EngagementWindow {
  totalSessions: number;
  bouncers: number;
  engagedShort: number;
  engagedDeep: number;
  deepRate: number;
  engagedRate: number;
  medianEngagedSeconds: number;
  avgEngagedSeconds: number;
}

interface Benchmark {
  label: string;
  avgSeconds: number;
}

interface EngagementBlock {
  windows: {
    d7: EngagementWindow | null;
    d30: EngagementWindow | null;
    d90: EngagementWindow | null;
  };
  benchmarks: {
    chatgpt: Benchmark;
    theodoreTarget: Benchmark;
    suno: Benchmark;
    characterAi: Benchmark;
  };
}

interface ConversionResponse {
  snapshot: Snapshot;
  trailing: {
    d7: TrailWindow;
    d30: TrailWindow;
    d90: TrailWindow;
    all: TrailWindow;
  };
  daily: DailyRow[];
  paidUsersList: PaidUser[];
  engagement?: EngagementBlock | null;
}

function fmtDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = seconds / 60;
  if (m < 60) return `${m.toFixed(m < 10 ? 1 : 0)}m`;
  const h = m / 60;
  return `${h.toFixed(1)}h`;
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return '0%';
  return `${(n * 100).toFixed(1)}%`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ── Top-level tab: toggle between signup/revenue stats and the /go funnel ──
export function ConversionTab() {
  const [view, setView] = useState<'signups' | 'go'>('signups');
  return (
    <div className="pt-4">
      <div className="px-4 sm:px-6">
        <div className="inline-flex rounded-xl border border-black/[0.08] bg-black/[0.02] p-1 mb-2">
          <SubTabButton active={view === 'signups'} onClick={() => setView('signups')}>
            Signups &amp; revenue
          </SubTabButton>
          <SubTabButton active={view === 'go'} onClick={() => setView('go')}>
            /go funnel
          </SubTabButton>
        </div>
      </div>
      {view === 'signups' ? <SignupsView /> : <GoFunnelView />}
    </div>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors',
        active ? 'bg-white shadow-sm text-text-primary' : 'text-text-tertiary hover:text-text-secondary'
      )}
    >
      {children}
    </button>
  );
}

// ── /go landing-page funnel ──
// Mirrors the ad-traffic funnel: Landed → Focused prompt → Played sample →
// Scrolled → Clicked a plan → Submitted prompt (the only real conversion).
interface GoWindow {
  sessionCount: number;
  medianSeconds: number;
  events: Record<string, number>;
  pricingTiers: Record<string, number>;
  pricingThenSubmit: number;
  byPlaceholderVariant?: Record<string, Record<string, number>>;
}
interface GoFunnelResponse {
  windows: { today: GoWindow; d7: GoWindow; d30: GoWindow; all: GoWindow; custom?: GoWindow };
}

// YYYY-MM-DD helpers — keep everything in UTC so the server bounds line up.
function todayISO(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function shiftISO(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function prettyISO(iso: string): string {
  if (!iso) return '';
  if (iso === todayISO()) return 'Today';
  if (iso === shiftISO(todayISO(), -1)) return 'Yesterday';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

const GO_STEPS: Array<{ key: string; label: string; conversion?: boolean }> = [
  { key: 'page_load', label: 'Landed on /go' },
  { key: 'section_reached', label: 'Saw any section' },
  { key: 'focus_input', label: 'Focused the prompt box' },
  { key: 'play_audio', label: 'Played an audio sample' },
  { key: 'try_voices_clicked', label: "Tapped “other voices”" },
  { key: 'scrolled_to_books', label: 'Scrolled to samples' },
  { key: 'pricing_cta_clicked', label: 'Clicked a plan' },
  { key: 'prompt_submit', label: 'Submitted prompt → app', conversion: true },
  { key: 'final_cta_submitted', label: 'Submitted via final CTA → app', conversion: true },
];

function GoFunnelView() {
  const [data, setData] = useState<GoFunnelResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<'today' | 'd7' | 'd30' | 'all' | 'custom'>('d30');
  // Custom-day picker state (only used when win === 'custom').
  const [customDate, setCustomDate] = useState<string>(todayISO());

  const load = async (overrideDate?: string) => {
    setLoading(true);
    setError(null);
    try {
      const dateForQuery = overrideDate ?? (win === 'custom' ? customDate : null);
      const qs = dateForQuery ? `?from=${dateForQuery}&to=${dateForQuery}` : '';
      const r = await fetch(`/api/admin/go-funnel${qs}`, { credentials: 'include' });
      if (!r.ok) { setError(`Failed to load (${r.status})`); return; }
      setData(await r.json());
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  // Re-fetch when the user changes the custom date while the custom tab is active.
  useEffect(() => {
    if (win !== 'custom') return;
    void load(customDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customDate, win]);

  if (loading && !data) return <div className="py-8 text-sm text-text-tertiary">Loading /go funnel…</div>;
  if (error) {
    return (
      <div className="py-8">
        <p className="text-sm text-rose-700">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-text-secondary hover:text-text-primary underline">Retry</button>
      </div>
    );
  }
  if (!data) return null;

  // `custom` window only exists when ?from=... was sent. Fall back to d30
  // if it hasn't loaded yet (e.g. first render before useEffect fires).
  const w = (win === 'custom' ? data.windows.custom : data.windows[win]) || data.windows.d30;
  const landed = Math.max(1, w.events['page_load'] || 0);
  const author = w.pricingTiers['author'] || 0;
  const free = w.pricingTiers['free'] || 0;
  const isToday = customDate === todayISO();

  return (
    <div className="px-4 sm:px-6 py-4 space-y-6">
      {/* Window selector + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-black/[0.08] bg-white p-0.5 text-xs">
          {([['today', 'Today'], ['d7', '7 days'], ['d30', '30 days'], ['all', 'All time'], ['custom', 'Custom']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setWin(k)}
              className={cn('px-2.5 py-1 rounded-md font-medium transition-colors',
                win === k ? 'bg-black text-white' : 'text-text-tertiary hover:text-text-secondary')}
            >
              {label}
            </button>
          ))}
        </div>
        {win === 'custom' && (
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-1.5 py-0.5 text-xs">
            <button
              onClick={() => setCustomDate(shiftISO(customDate, -1))}
              className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-black/5"
              aria-label="Previous day"
            >
              <ChevronLeft size={14} />
            </button>
            <input
              type="date"
              value={customDate}
              max={todayISO()}
              onChange={(e) => setCustomDate(e.target.value)}
              className="bg-transparent outline-none font-medium text-text-primary text-xs cursor-pointer"
            />
            <span className="text-text-tertiary text-[10px] hidden sm:inline">· {prettyISO(customDate)}</span>
            <button
              onClick={() => !isToday && setCustomDate(shiftISO(customDate, 1))}
              disabled={isToday}
              className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next day"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <button
          onClick={load}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <GoKpi label="Sessions" value={w.sessionCount.toString()} />
        <GoKpi label="Median time on page" value={fmtDuration(w.medianSeconds)} />
        <GoKpi
          label="Submitted a prompt"
          value={fmtPct((w.events['prompt_submit'] || 0) / landed)}
          sub={`${w.events['prompt_submit'] || 0} of ${landed}`}
          accent="emerald"
        />
        <GoKpi
          label="Clicked plan → submitted"
          value={(w.pricingThenSubmit).toString()}
          sub={`of ${w.events['pricing_cta_clicked'] || 0} plan clicks`}
          accent={w.pricingThenSubmit === 0 && (w.events['pricing_cta_clicked'] || 0) > 0 ? 'rose' : undefined}
        />
      </div>

      {/* Funnel bars */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3">
          Funnel — share of landed sessions
        </h2>
        <div className="rounded-2xl border border-black/[0.06] bg-white p-4 space-y-2.5">
          {GO_STEPS.map((step) => {
            const count = w.events[step.key] || 0;
            const pct = count / landed;
            return (
              <div key={step.key} className="flex items-center gap-3">
                <div className={cn('w-48 text-xs flex-shrink-0', step.conversion ? 'font-semibold text-emerald-700' : 'text-text-secondary')}>
                  {step.label}
                </div>
                <div className="flex-1 h-6 bg-black/[0.04] rounded-md overflow-hidden">
                  <div
                    className={cn('h-full rounded-md transition-all', step.conversion ? 'bg-emerald-500' : 'bg-indigo-300')}
                    style={{ width: `${Math.min(100, pct * 100)}%` }}
                  />
                </div>
                <div className="w-24 text-right text-xs tabular-nums flex-shrink-0 text-text-secondary">
                  {count} · {fmtPct(pct)}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Pricing CTA split — watch the Dream Offer vs free */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3">
          Plan clicks — which card gets tapped
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <GoKpi label="Author (Dream Offer)" value={author.toString()} sub={`${fmtPct(author / landed)} of landed`} accent="amber" />
          <GoKpi label="Dreamer (free)" value={free.toString()} sub={`${fmtPct(free / landed)} of landed`} />
        </div>
        <p className="text-[11px] text-text-tertiary mt-3 leading-relaxed">
          Both plan CTAs currently scroll back to the prompt box rather than redirecting.
          “Clicked plan → submitted” above is the metric to watch: if it stays near zero,
          the scroll-back isn’t converting and the Dream Offer button should route into the funnel.
          Note: /go can’t flag admin visits, so a few of Ben’s own loads may be counted.
        </p>
      </section>

      <PlaceholderABCard window={w} />
    </div>
  );
}

// ── A/B placeholder split ──
// 50/50 sticky test (set in public/go/index.html).
//   pitch:  "Pitch me a story idea."
//   whats:  "What's your story idea?"
// Each session's placeholder_variant rides on every journey event from
// the page; the server slices the funnel by it.
function PlaceholderABCard({ window: w }: { window: GoWindow }) {
  const v = w.byPlaceholderVariant || {};
  const variants: Array<{ key: string; label: string; copy: string }> = [
    { key: 'pitch', label: 'Pitch', copy: '"Pitch me a story idea."' },
    { key: 'whats', label: 'What’s', copy: '"What’s your story idea?"' },
  ];
  const totalLanded = variants.reduce((s, x) => s + (v[x.key]?.['page_load'] || 0), 0);
  if (totalLanded === 0) {
    return (
      <section>
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary font-semibold mb-3">
          A/B placeholder copy
        </h2>
        <p className="text-sm text-text-tertiary">
          No data yet — variants ship with the next deploy. Check back after a few hours of /go traffic.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-text-tertiary font-semibold mb-3">
        A/B placeholder copy
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {variants.map((x) => {
          const ev = v[x.key] || {};
          const landed = ev['page_load'] || 0;
          const focus = ev['focus_input'] || 0;
          const submit = ev['prompt_submit'] || 0;
          const finalSubmit = ev['final_cta_submitted'] || 0;
          const totalSubmit = submit + finalSubmit;
          return (
            <div key={x.key} className="rounded-2xl border border-black/[0.08] bg-white p-4">
              <div className="flex items-baseline justify-between">
                <div className="text-sm font-semibold text-text-primary">{x.label}</div>
                <div className="text-[11px] text-text-tertiary">{landed} sessions</div>
              </div>
              <div className="text-xs text-text-tertiary italic mt-0.5">{x.copy}</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Focus rate</div>
                  <div className="text-lg font-semibold text-text-primary">
                    {landed ? fmtPct(focus / landed) : '—'}
                  </div>
                  <div className="text-[10px] text-text-tertiary">{focus} of {landed}</div>
                </div>
                <div className="rounded-lg bg-black/[0.03] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">Submit rate</div>
                  <div className="text-lg font-semibold text-text-primary">
                    {landed ? fmtPct(totalSubmit / landed) : '—'}
                  </div>
                  <div className="text-[10px] text-text-tertiary">{totalSubmit} of {landed}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-text-tertiary mt-3 leading-relaxed">
        Sticky 50/50 split via localStorage. Wait until each variant has ~50+ sessions before
        declaring a winner — earlier than that is noise.
      </p>
    </section>
  );
}

function GoKpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: 'emerald' | 'amber' | 'rose' }) {
  const accentClass = accent === 'emerald' ? 'text-emerald-700'
    : accent === 'amber' ? 'text-amber-700'
    : accent === 'rose' ? 'text-rose-600'
    : 'text-text-primary';
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
      <div className="text-xs uppercase tracking-wider text-text-tertiary mb-1">{label}</div>
      <div className={cn('text-2xl font-serif font-semibold tabular-nums', accentClass)}>{value}</div>
      {sub && <div className="text-xs text-text-tertiary mt-1 tabular-nums">{sub}</div>}
    </div>
  );
}

function SignupsView() {
  const [data, setData] = useState<ConversionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/conversion-stats', { credentials: 'include' });
      if (!r.ok) {
        setError(`Failed to load (${r.status})`);
        return;
      }
      setData(await r.json());
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading && !data) return <div className="p-8 text-sm text-text-tertiary">Loading conversion stats…</div>;
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-700">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-text-secondary hover:text-text-primary underline">Retry</button>
      </div>
    );
  }
  if (!data) return null;

  // Build daily chart bounds. Bars sized to the max signup-day in the visible window.
  const last30 = data.daily.slice(-30);
  const maxSignups = Math.max(1, ...last30.map((d) => d.signups));

  return (
    <div className="px-4 sm:px-6 py-4 space-y-6">
      {/* Trailing-window KPI strip — the daily north star */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Lifetime"
          rate={data.trailing.all.rate}
          signups={data.trailing.all.signups}
          paid={data.trailing.all.paid}
          accent="indigo"
        />
        <KpiCard
          label="Last 90 days"
          rate={data.trailing.d90.rate}
          signups={data.trailing.d90.signups}
          paid={data.trailing.d90.paid}
          accent="indigo"
        />
        <KpiCard
          label="Last 30 days"
          rate={data.trailing.d30.rate}
          signups={data.trailing.d30.signups}
          paid={data.trailing.d30.paid}
          accent="amber"
          highlight
        />
        <KpiCard
          label="Last 7 days"
          rate={data.trailing.d7.rate}
          signups={data.trailing.d7.signups}
          paid={data.trailing.d7.paid}
          accent="emerald"
        />
      </div>

      {/* Snapshot context */}
      <div className="flex items-center justify-between rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
        <div className="flex items-center gap-6">
          <Stat icon={UsersIcon} label="Signups (excl. Ben)" value={data.snapshot.totalSignups} />
          <Stat icon={DollarSign} label="Paid" value={data.snapshot.paidUsers} />
          <Stat icon={TrendingUp} label="Convert" value={fmtPct(data.snapshot.conversionRate)} />
        </div>
        <button
          onClick={load}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Engagement — session-time metrics vs industry benchmarks */}
      {data.engagement && data.engagement.windows.d30 && (
        <EngagementSection engagement={data.engagement} />
      )}

      {/* Daily signups vs paid — last 30 days bar chart */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3">
          Daily signups (last 30 days)
        </h2>
        <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
          <div className="flex items-end gap-1 h-32">
            {last30.map((d) => {
              const signupPct = (d.signups / maxSignups) * 100;
              const paidPct = (d.paid / maxSignups) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full h-full flex flex-col justify-end relative">
                    {/* Signup bar (background — total signups that day) */}
                    <div
                      className="w-full bg-indigo-200/70 rounded-t-sm"
                      style={{ height: `${signupPct}%` }}
                    />
                    {/* Paid bar (foreground — cohort that's currently paid) */}
                    {d.paid > 0 && (
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-emerald-500 rounded-t-sm"
                        style={{ height: `${paidPct}%` }}
                      />
                    )}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center bg-black text-white text-[10px] rounded-md px-2 py-1 whitespace-nowrap z-10">
                    <span>{fmtDate(d.day)}</span>
                    <span className="text-white/70">{d.signups} signup{d.signups === 1 ? '' : 's'} · {d.paid} paid</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-indigo-200" /> Signups (cohort total)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Cohort now on paid
            </span>
          </div>
        </div>
      </section>

      {/* Paid users list — useful to manually grant bonus credits on upgrade */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3">
          Paid users ({data.paidUsersList.length})
        </h2>
        {data.paidUsersList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-8 text-center text-sm text-text-tertiary">
            No paid conversions yet (excluding Ben's test accounts).
          </div>
        ) : (
          <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.02] text-text-tertiary">
                <tr>
                  <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Email</th>
                  <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Plan</th>
                  <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Signed up</th>
                </tr>
              </thead>
              <tbody>
                {data.paidUsersList.map((u) => (
                  <tr key={u.email} className="border-t border-black/5">
                    <td className="px-4 py-3 truncate max-w-[24ch] sm:max-w-none">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-text-tertiary tabular-nums">{fmtDate(u.signedUpAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EngagementSection({ engagement }: { engagement: EngagementBlock }) {
  const d30 = engagement.windows.d30!;
  const d7 = engagement.windows.d7;
  const benchmarks = [
    { ...engagement.benchmarks.chatgpt, color: 'bg-stone-300' },
    { ...engagement.benchmarks.theodoreTarget, color: 'bg-amber-300', isTarget: true },
    { ...engagement.benchmarks.suno, color: 'bg-stone-300' },
    { ...engagement.benchmarks.characterAi, color: 'bg-stone-300' },
  ];
  const theodoreAvg = d30.avgEngagedSeconds;
  const maxBenchmark = Math.max(theodoreAvg, ...benchmarks.map((b) => b.avgSeconds));

  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mb-3">
        Engagement
      </h2>
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 space-y-5">
        {/* 3 KPI cards — engaged session % (deep) trailing 7d/30d + median session time */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <EngagementKpi
            label="Deep sessions (>15min) — last 30d"
            value={`${(d30.deepRate * 100).toFixed(1)}%`}
            sub={`${d30.engagedDeep} of ${d30.totalSessions} sessions`}
          />
          <EngagementKpi
            label="Engaged sessions (>1min) — last 30d"
            value={`${(d30.engagedRate * 100).toFixed(1)}%`}
            sub={`${d30.engagedShort + d30.engagedDeep} of ${d30.totalSessions}`}
          />
          <EngagementKpi
            label="Median engaged session"
            value={fmtDuration(d30.medianEngagedSeconds)}
            sub={`avg ${fmtDuration(d30.avgEngagedSeconds)} · 7d avg ${d7 ? fmtDuration(d7.avgEngagedSeconds) : '—'}`}
          />
        </div>

        {/* Theodore vs industry benchmark bars */}
        <div>
          <div className="text-xs uppercase tracking-wider text-text-tertiary mb-3">
            Average engaged session vs industry
          </div>
          <div className="space-y-2">
            <BenchmarkBar
              label="Theodore (30d)"
              seconds={theodoreAvg}
              max={maxBenchmark}
              color="bg-emerald-500"
              accent
            />
            {benchmarks.map((b) => (
              <BenchmarkBar
                key={b.label}
                label={b.label}
                seconds={b.avgSeconds}
                max={maxBenchmark}
                color={b.color}
                accent={b.isTarget}
              />
            ))}
          </div>
          <p className="text-[11px] text-text-tertiary mt-3 leading-relaxed">
            Industry numbers from Business of Apps, SQ Magazine, and Similarweb 2025-26 reports.
            Theodore's average is computed across non-admin sessions with &gt;30s on-page.
          </p>
        </div>
      </div>
    </section>
  );
}

function EngagementKpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-black/[0.05] bg-white/40 p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-tertiary mb-1">
        <Clock size={11} />
        {label}
      </div>
      <div className="text-xl font-serif font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-text-tertiary mt-0.5">{sub}</div>
    </div>
  );
}

function BenchmarkBar({
  label,
  seconds,
  max,
  color,
  accent,
}: {
  label: string;
  seconds: number;
  max: number;
  color: string;
  accent?: boolean;
}) {
  const pct = max > 0 ? (seconds / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={cn('w-32 text-xs flex-shrink-0', accent ? 'font-semibold text-text-primary' : 'text-text-secondary')}>
        {label}
      </div>
      <div className="flex-1 h-6 bg-black/[0.04] rounded-md overflow-hidden">
        <div className={cn('h-full rounded-md transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn('w-14 text-right text-xs tabular-nums flex-shrink-0', accent ? 'font-semibold' : 'text-text-secondary')}>
        {fmtDuration(seconds)}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  rate,
  signups,
  paid,
  accent,
  highlight,
}: {
  label: string;
  rate: number;
  signups: number;
  paid: number;
  accent: 'indigo' | 'amber' | 'emerald';
  highlight?: boolean;
}) {
  const accentClasses: Record<typeof accent, string> = {
    indigo: 'text-indigo-700',
    amber: 'text-amber-700',
    emerald: 'text-emerald-700',
  };
  return (
    <div
      className={cn(
        'rounded-2xl border bg-white p-4',
        highlight ? 'border-amber-300/60 shadow-[0_0_0_3px_rgba(245,158,11,0.08)]' : 'border-black/[0.06]'
      )}
    >
      <div className="text-xs uppercase tracking-wider text-text-tertiary mb-1">{label}</div>
      <div className={cn('text-2xl font-serif font-semibold tabular-nums', accentClasses[accent])}>
        {fmtPct(rate)}
      </div>
      <div className="text-xs text-text-tertiary mt-1 tabular-nums">
        {paid} of {signups} paid
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-text-tertiary" />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
