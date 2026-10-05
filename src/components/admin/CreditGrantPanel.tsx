import { useState } from 'react';
import { Coins, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const QUICK = [1000, 10000, 100000];

/** Admin: add or remove credits for one user (POST /api/admin/users/:id/credits). Logged as admin-grant / admin-debit. */
export function CreditGrantPanel({ userId, email, current, onChanged }: {
  userId: string;
  email: string;
  current: number;
  onChanged: (after: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const value = Math.round(Number(amount.replace(/[,\s]/g, '')));
  const valid = Number.isFinite(value) && value > 0;
  const delta = mode === 'add' ? value : -value;

  const submit = async () => {
    if (!valid || busy) return;
    const verb = mode === 'add' ? `Add ${value.toLocaleString()} credits to` : `Remove ${value.toLocaleString()} credits from`;
    if (!window.confirm(`${verb} ${email}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/credits`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta, reason: reason.trim() || (mode === 'add' ? 'admin grant' : 'admin removal') }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      onChanged(data.after);
      setMessage({ ok: true, text: `Done: ${Number(data.before).toLocaleString()} → ${Number(data.after).toLocaleString()} credits.` });
      setAmount('');
      setReason('');
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-pill rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Coins size={14} className="text-text-tertiary" />
        <span className="text-sm font-semibold flex-1">Credits</span>
        <span className="text-xs text-text-tertiary tabular-nums">{current.toLocaleString()} left</span>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-black/5 w-fit">
        {(['add', 'remove'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn('px-3 py-1 rounded-lg text-xs font-medium capitalize', mode === m ? 'bg-white shadow-sm text-text-primary' : 'text-text-secondary')}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => setAmount(String(q))}
            className={cn('px-2.5 py-1 rounded-lg text-xs border', value === q ? 'bg-text-primary text-text-inverse border-text-primary' : 'bg-white/60 border-black/10 text-text-secondary')}
          >
            {q.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="w-32 px-3 py-2 rounded-lg bg-white/70 border border-black/10 text-sm tabular-nums outline-none focus:border-black/30"
          aria-label="Credit amount"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white/70 border border-black/10 text-sm outline-none focus:border-black/30"
          aria-label="Reason"
        />
      </div>

      <button
        onClick={submit}
        disabled={!valid || busy}
        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-text-primary text-text-inverse disabled:opacity-40 inline-flex items-center justify-center gap-2"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        {valid ? `${mode === 'add' ? 'Add' : 'Remove'} ${value.toLocaleString()} credits` : 'Enter an amount'}
      </button>

      {message && <p className={cn('text-xs', message.ok ? 'text-emerald-700' : 'text-red-600')}>{message.text}</p>}
    </div>
  );
}
