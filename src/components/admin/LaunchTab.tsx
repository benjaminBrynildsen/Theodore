import { useEffect, useMemo, useState } from 'react';
import { Apple, RefreshCw, Mail, Copy, CheckCircle2, AlertCircle, Bell, X } from 'lucide-react';

const API = '/api/admin';

type Status = 'opted-in' | 'dismissed';
type Filter = 'all' | Status;

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  plan: string | null;
  status: Status;
  seenAt: string | null;
  optedInAt: string | null;
  createdAt: string;
}

interface Response {
  recipients: Recipient[];
  total: number;
  optedInCount: number;
  dismissedCount: number;
}

export function LaunchTab() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/ios-launch-recipients`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const j: Response = await r.json();
      setData(j);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.recipients;
    return data.recipients.filter((r) => r.status === filter);
  }, [data, filter]);

  const optedInEmails = useMemo(
    () => (data?.recipients || []).filter((r) => r.status === 'opted-in').map((r) => r.email).filter(Boolean),
    [data],
  );

  const copyOptInEmails = async () => {
    if (!optedInEmails.length) return;
    try {
      await navigator.clipboard.writeText(optedInEmails.join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — your browser blocked clipboard access');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Apple size={16} className="text-text-tertiary" />
        <h2 className="text-base font-serif font-semibold">iOS Launch — Recipients</h2>
      </div>
      <p className="text-xs text-text-tertiary mb-5">
        Every user who has been shown the iOS launch announcement modal, plus whether they opted in.
      </p>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Shown" count={data?.total ?? null} active={filter === 'all'} onClick={() => setFilter('all')} icon={null} />
        <Stat label="Opted in" count={data?.optedInCount ?? null} active={filter === 'opted-in'} onClick={() => setFilter('opted-in')} icon={<Bell size={12} className="text-emerald-600" />} />
        <Stat label="Dismissed" count={data?.dismissedCount ?? null} active={filter === 'dismissed'} onClick={() => setFilter('dismissed')} icon={<X size={12} className="text-text-tertiary" />} />
      </div>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-semibold text-text-primary inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <button
          onClick={copyOptInEmails}
          disabled={!optedInEmails.length}
          className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-semibold text-text-primary inline-flex items-center gap-1.5 transition-colors disabled:opacity-40"
          title="Copy email addresses of users who clicked Notify Me"
        >
          {copied ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
          {copied ? 'Copied' : `Copy ${optedInEmails.length} opt-in email${optedInEmails.length === 1 ? '' : 's'}`}
        </button>
        <div className="ml-auto text-xs text-text-tertiary">
          {filtered.length} shown
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 inline-flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="py-12 text-center text-text-tertiary text-sm">Loading…</div>
      )}

      {data && filtered.length === 0 && (
        <div className="py-12 text-center text-text-tertiary text-sm">
          {filter === 'all'
            ? 'Nobody has seen the modal yet.'
            : filter === 'opted-in'
              ? 'No one has clicked Notify Me yet.'
              : 'Nobody has dismissed without opting in yet.'}
        </div>
      )}

      {data && filtered.length > 0 && (
        <div className="rounded-xl border border-black/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-xs text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-3 py-2">Email</th>
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Name</th>
                <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Plan</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
                <th className="text-left font-medium px-3 py-2">Seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2 font-mono text-xs text-text-primary">
                    <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Mail size={12} className="text-text-tertiary" />
                      {r.email}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-text-secondary hidden sm:table-cell">{r.name || '—'}</td>
                  <td className="px-3 py-2 text-text-secondary capitalize hidden md:table-cell">{r.plan || '—'}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2 text-text-tertiary text-xs">{formatTime(r.seenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, count, active, onClick, icon }: {
  label: string; count: number | null; active: boolean; onClick: () => void; icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border px-3 py-3 transition-colors ${
        active
          ? 'border-text-primary bg-black/[0.04]'
          : 'border-black/5 bg-white hover:bg-black/[0.02]'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-text-tertiary mb-1">
        {icon}{label}
      </div>
      <div className="text-2xl font-serif font-bold text-text-primary">
        {count === null ? '—' : count}
      </div>
    </button>
  );
}

function StatusPill({ status }: { status: Status }) {
  if (status === 'opted-in') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
        <Bell size={10} />
        Opted in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/5 text-text-tertiary text-[11px] font-semibold">
      Dismissed
    </span>
  );
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}
