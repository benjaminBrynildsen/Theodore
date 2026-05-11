import { useEffect, useState } from 'react';
import { RefreshCw, Share2, TrendingUp, Users as UsersIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface BySharer {
  sharerId: string;
  sharerEmail: string | null;
  sharerName: string | null;
  totalReferred: number;
  paidReferred: number;
  slugs: string[];
  latestReferralAt: string | null;
}

interface ReferredUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  stripeSubscriptionStatus: string | null;
  referredByUserId: string | null;
  referredViaSlug: string | null;
  referredAt: string | null;
  createdAt: string;
  sharerEmail: string | null;
}

interface ReferralsResponse {
  totalReferred: number;
  totalPaidReferred: number;
  bySharer: BySharer[];
  referredUsers: ReferredUser[];
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function planBadge(plan: string, stripe: string | null) {
  const paid = plan && plan !== 'free';
  if (paid) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-emerald-100 text-emerald-700">
        {plan}{stripe === 'active' ? '' : ` · ${stripe || 'inactive'}`}
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-black/5 text-text-tertiary">
      free
    </span>
  );
}

export function ReferralsTab() {
  const [data, setData] = useState<ReferralsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/admin/referrals', { credentials: 'include' });
      if (!r.ok) {
        setError(`Failed to load (${r.status})`);
        return;
      }
      const j: ReferralsResponse = await r.json();
      setData(j);
    } catch (e: any) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  if (loading && !data) {
    return <div className="p-8 text-sm text-text-tertiary">Loading referrals…</div>;
  }
  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-rose-700">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-text-secondary hover:text-text-primary underline">Retry</button>
      </div>
    );
  }
  if (!data) return null;

  const conversionPct = data.totalReferred > 0
    ? Math.round((data.totalPaidReferred / data.totalReferred) * 100)
    : 0;

  return (
    <div className="px-4 sm:px-6 py-4 space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-tertiary">
            <Share2 size={12} /> Total referred signups
          </div>
          <div className="mt-2 text-2xl font-serif font-semibold tabular-nums">{data.totalReferred}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-tertiary">
            <TrendingUp size={12} /> Paid referrals
          </div>
          <div className="mt-2 text-2xl font-serif font-semibold tabular-nums">{data.totalPaidReferred}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-text-tertiary">
            <UsersIcon size={12} /> Conversion rate
          </div>
          <div className="mt-2 text-2xl font-serif font-semibold tabular-nums">
            {conversionPct}<span className="text-base text-text-tertiary">%</span>
          </div>
        </div>
      </div>

      {/* Refresh control */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary">Top sharers</h2>
        <button
          onClick={load}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* By-sharer table */}
      {data.bySharer.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-8 text-center">
          <Share2 size={20} className="mx-auto text-text-tertiary mb-2" />
          <p className="text-sm text-text-tertiary">No attributed signups yet.</p>
          <p className="text-xs text-text-tertiary mt-1">
            When a user shares a book with <code className="px-1 rounded bg-black/5">?ref=</code> in the URL and someone signs up, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-black/5 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Sharer</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Referred</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Paid</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Conv.</th>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Books</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Latest</th>
              </tr>
            </thead>
            <tbody>
              {data.bySharer.map((s) => {
                const conv = s.totalReferred > 0 ? Math.round((s.paidReferred / s.totalReferred) * 100) : 0;
                return (
                  <tr key={s.sharerId} className="border-t border-black/5 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <div className="font-medium truncate max-w-[18ch] sm:max-w-none">{s.sharerName || s.sharerEmail || s.sharerId}</div>
                      {s.sharerEmail && s.sharerName && (
                        <div className="text-xs text-text-tertiary truncate max-w-[24ch] sm:max-w-none">{s.sharerEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{s.totalReferred}</td>
                    <td className={cn('px-4 py-3 text-right tabular-nums', s.paidReferred > 0 ? 'text-emerald-700 font-semibold' : 'text-text-tertiary')}>
                      {s.paidReferred}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary">{conv}%</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[22ch] sm:max-w-[30ch]">
                        {s.slugs.slice(0, 3).map((slug) => (
                          <a
                            key={slug}
                            href={`/library/b/${encodeURIComponent(slug)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-1.5 py-0.5 rounded text-[10px] bg-black/5 hover:bg-black/10 text-text-secondary truncate max-w-[18ch]"
                            title={slug}
                          >
                            {slug}
                          </a>
                        ))}
                        {s.slugs.length > 3 && (
                          <span className="px-1.5 py-0.5 text-[10px] text-text-tertiary">+{s.slugs.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-text-tertiary tabular-nums">{timeAgo(s.latestReferralAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent referred users */}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-text-tertiary mt-4">Referred users (newest first)</h2>
      {data.referredUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/10 bg-white/40 p-6 text-center text-sm text-text-tertiary">
          No referred users yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-black/5 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">User</th>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Plan</th>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Referred by</th>
                <th className="text-left font-medium px-4 py-2.5 text-xs uppercase tracking-wider">From book</th>
                <th className="text-right font-medium px-4 py-2.5 text-xs uppercase tracking-wider">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {data.referredUsers.slice(0, 50).map((u) => (
                <tr key={u.id} className="border-t border-black/5 hover:bg-black/[0.015]">
                  <td className="px-4 py-3">
                    <div className="font-medium truncate max-w-[20ch] sm:max-w-none">{u.name || u.email}</div>
                    {u.name && <div className="text-xs text-text-tertiary truncate max-w-[24ch] sm:max-w-none">{u.email}</div>}
                  </td>
                  <td className="px-4 py-3">{planBadge(u.plan, u.stripeSubscriptionStatus)}</td>
                  <td className="px-4 py-3 text-text-secondary truncate max-w-[20ch] sm:max-w-[28ch]" title={u.sharerEmail || u.referredByUserId || ''}>
                    {u.sharerEmail || <span className="text-text-tertiary italic">{u.referredByUserId?.slice(0, 12)}…</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.referredViaSlug ? (
                      <a
                        href={`/library/b/${encodeURIComponent(u.referredViaSlug)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-text-secondary hover:text-text-primary underline truncate max-w-[20ch] inline-block align-middle"
                        title={u.referredViaSlug}
                      >
                        {u.referredViaSlug}
                      </a>
                    ) : (
                      <span className="text-xs text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-text-tertiary tabular-nums">{timeAgo(u.referredAt || u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
