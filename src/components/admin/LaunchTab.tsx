import { useEffect, useMemo, useState } from 'react';
import { Apple, RefreshCw, Mail, Copy, CheckCircle2, AlertCircle } from 'lucide-react';

const API = '/api/admin';

interface OptInRow {
  id: string;
  email: string;
  name: string | null;
  plan: string | null;
  optedInAt: string;
  createdAt: string;
}

export function LaunchTab() {
  const [rows, setRows] = useState<OptInRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/ios-launch-optins`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      setRows(j.optIns || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load opt-ins');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const emails = useMemo(() => (rows || []).map((r) => r.email).filter(Boolean), [rows]);

  const copyEmails = async () => {
    if (!emails.length) return;
    try {
      await navigator.clipboard.writeText(emails.join(', '));
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
        <h2 className="text-base font-serif font-semibold">iOS Launch Waitlist</h2>
      </div>
      <p className="text-xs text-text-tertiary mb-5">
        Users who clicked “Notify me when it’s live” on the iOS launch announcement modal.
      </p>

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
          onClick={copyEmails}
          disabled={!emails.length}
          className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-semibold text-text-primary inline-flex items-center gap-1.5 transition-colors disabled:opacity-40"
        >
          {copied ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
          {copied ? 'Copied' : `Copy ${emails.length} email${emails.length === 1 ? '' : 's'}`}
        </button>
        <div className="ml-auto text-xs text-text-tertiary">
          {rows ? `${rows.length} opted in` : '—'}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 inline-flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!rows && !error && (
        <div className="py-12 text-center text-text-tertiary text-sm">Loading…</div>
      )}

      {rows && rows.length === 0 && (
        <div className="py-12 text-center text-text-tertiary text-sm">
          No opt-ins yet — the modal hasn’t collected anyone. Check back after launch.
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="rounded-xl border border-black/5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.02] text-xs text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-3 py-2">Email</th>
                <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Name</th>
                <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Plan</th>
                <th className="text-left font-medium px-3 py-2">Opted in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2 font-mono text-xs text-text-primary">
                    <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 hover:underline">
                      <Mail size={12} className="text-text-tertiary" />
                      {r.email}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-text-secondary hidden sm:table-cell">{r.name || '—'}</td>
                  <td className="px-3 py-2 text-text-secondary capitalize hidden md:table-cell">{r.plan || '—'}</td>
                  <td className="px-3 py-2 text-text-tertiary text-xs">{formatTime(r.optedInAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}
