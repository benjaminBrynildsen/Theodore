import { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, Users as UsersIcon, DollarSign } from 'lucide-react';
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

export function ConversionTab() {
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
