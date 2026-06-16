import { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

type Drop = {
  id: number; week: string; seatCap: number; seatsClaimed: number;
  status: string; priceCents: number; opensAt: string | null;
};
type Overview = { leads: number; paid: number; pending: number; refunded: number; drops: Drop[] };
type Grant = {
  id: number; userId: string; type: string; status: string;
  shippingAddress: any; createdAt: string; email: string | null; name: string | null;
};

const fmt$ = (c: number) => `$${Math.round(c / 100)}`;

export function FoundingTab() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, f] = await Promise.all([
        fetch('/api/admin/founding/overview', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/admin/founding/fulfillment', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setOv(o); setGrants(f.grants || []);
    } catch { setMsg('Failed to load.'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const post = async (url: string, body: any) => {
    const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  };

  const createDrop = async () => {
    setBusy('create'); setMsg(null);
    const { ok, data } = await post('/api/admin/founding/drops', { seatCap: 10, priceCents: 9900 });
    setMsg(ok ? `Created drop ${data.drop?.week}.` : (data.error || 'Failed.'));
    setBusy(null); load();
  };

  const goLive = async (dropId: number, leads: number) => {
    if (!confirm(`Flip drop live and email all ${leads} waitlist leads the buy link?`)) return;
    setBusy(`live-${dropId}`); setMsg(null);
    const { ok, data } = await post('/api/admin/founding/drops/live', { dropId, blast: true });
    setMsg(ok ? `Live. Emailed ${data.notified} leads (${data.failed} failed).` : (data.error || 'Failed.'));
    setBusy(null); load();
  };

  const closeDrop = async (dropId: number) => {
    setBusy(`close-${dropId}`);
    await post('/api/admin/founding/drops/close', { dropId });
    setBusy(null); load();
  };

  const setGrant = async (id: number, status: string) => {
    setBusy(`grant-${id}`);
    await post('/api/admin/founding/fulfillment', { id, status });
    setBusy(null); load();
  };

  if (loading && !ov) return <div className="p-6 text-sm text-text-tertiary">Loading…</div>;

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-serif font-semibold">Founding launch</h2>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {msg && <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900">{msg}</div>}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Waitlist', value: ov?.leads ?? 0 },
          { label: 'Seats sold', value: ov?.paid ?? 0 },
          { label: 'Pending', value: ov?.pending ?? 0 },
          { label: 'Refunded (over-cap)', value: ov?.refunded ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-black/10 bg-white p-4">
            <div className="text-2xl font-serif">{s.value}</div>
            <div className="text-xs text-text-tertiary mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Drops */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Weekly drops</h3>
          <button onClick={createDrop} disabled={busy === 'create'} className="rounded-lg bg-black text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-60">
            {busy === 'create' ? 'Creating…' : '+ New drop (10 seats, $99)'}
          </button>
        </div>
        <div className="space-y-2">
          {(ov?.drops || []).map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-black/10 bg-white px-4 py-3 text-sm">
              <div>
                <span className="font-medium">{d.week}</span>
                <span className="text-text-tertiary ml-2">{d.seatsClaimed}/{d.seatCap} seats · {fmt$(d.priceCents)}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${d.status === 'live' ? 'bg-emerald-100 text-emerald-700' : d.status === 'soldout' ? 'bg-red-100 text-red-700' : 'bg-black/5 text-text-tertiary'}`}>{d.status}</span>
              </div>
              <div className="flex gap-2">
                {d.status !== 'live' && d.status !== 'soldout' && (
                  <button onClick={() => goLive(d.id, ov?.leads ?? 0)} disabled={busy === `live-${d.id}`} className="rounded-lg bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-60">
                    {busy === `live-${d.id}` ? 'Going live…' : 'Go live + blast'}
                  </button>
                )}
                {d.status === 'live' && (
                  <button onClick={() => closeDrop(d.id)} disabled={busy === `close-${d.id}`} className="rounded-lg border border-black/15 text-xs font-semibold px-3 py-1.5">Close</button>
                )}
              </div>
            </div>
          ))}
          {!ov?.drops?.length && <p className="text-sm text-text-tertiary">No drops yet. Create one to open seats.</p>}
        </div>
      </div>

      {/* Fulfillment */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Printed-book fulfillment ({grants.length})</h3>
        <div className="space-y-2">
          {grants.map((g) => {
            const addr = g.shippingAddress?.address || g.shippingAddress;
            return (
              <div key={g.id} className="rounded-lg border border-black/10 bg-white px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{g.name || g.email || g.userId}</span>
                    <span className="text-text-tertiary ml-2">{g.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-black/5 text-text-tertiary">{g.status}</span>
                    {g.status !== 'shipped' && g.status !== 'fulfilled' && (
                      <button onClick={() => setGrant(g.id, 'shipped')} disabled={busy === `grant-${g.id}`} className="rounded-lg bg-black text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-60">Mark shipped</button>
                    )}
                  </div>
                </div>
                {addr && (
                  <div className="text-xs text-text-tertiary mt-1">
                    {[addr.line1, addr.line2, addr.city, addr.state, addr.postal_code, addr.country].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
          {!grants.length && <p className="text-sm text-text-tertiary">No fulfillment entitlements yet.</p>}
        </div>
      </div>
    </div>
  );
}
