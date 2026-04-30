import { useEffect, useMemo, useState } from 'react';
import { Bell, Send, RefreshCw, Smartphone, CheckCircle2, AlertCircle, Users as UsersIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

const API = '/api/admin';

interface TokenRow {
  token: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string;
  userId: string;
  email: string | null;
  name: string | null;
  plan: string | null;
}

interface SendResult {
  sent: number;
  pruned: number;
  tickets: Array<{ token: string; status: 'ok' | 'error'; id?: string; message?: string; errorCode?: string }>;
  note?: string;
}

type TargetMode = 'all' | 'users' | 'tokens';

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function PushTab() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dataJson, setDataJson] = useState('');
  const [targetMode, setTargetMode] = useState<TargetMode>('all');
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const loadTokens = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/push/tokens`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      setTokens(j.tokens || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load tokens');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTokens(); }, []);

  const userGroups = useMemo(() => {
    const m = new Map<string, { userId: string; email: string | null; name: string | null; plan: string | null; tokens: TokenRow[] }>();
    for (const t of tokens) {
      const key = t.userId;
      if (!m.has(key)) m.set(key, { userId: t.userId, email: t.email, name: t.name, plan: t.plan, tokens: [] });
      m.get(key)!.tokens.push(t);
    }
    return Array.from(m.values());
  }, [tokens]);

  const targetCount = useMemo(() => {
    if (targetMode === 'all') return tokens.length;
    if (targetMode === 'users') {
      return tokens.filter((t) => selectedUserIds.has(t.userId)).length;
    }
    return selectedTokens.size;
  }, [targetMode, tokens, selectedUserIds, selectedTokens]);

  const toggleToken = (token: string) => {
    const next = new Set(selectedTokens);
    if (next.has(token)) next.delete(token); else next.add(token);
    setSelectedTokens(next);
  };
  const toggleUser = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    setSelectedUserIds(next);
  };

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      setError('Title and body are required');
      return;
    }
    let parsedData: Record<string, any> | undefined;
    if (dataJson.trim()) {
      try {
        parsedData = JSON.parse(dataJson);
      } catch {
        setError('Data is not valid JSON');
        return;
      }
    }
    let target: any;
    if (targetMode === 'all') target = { all: true };
    else if (targetMode === 'users') target = { userIds: Array.from(selectedUserIds) };
    else target = { tokens: Array.from(selectedTokens) };

    if (targetMode !== 'all' && targetCount === 0) {
      setError('Select at least one target');
      return;
    }
    if (targetMode === 'all' && tokens.length > 5) {
      const ok = window.confirm(`Send to all ${tokens.length} registered devices?`);
      if (!ok) return;
    }

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`${API}/push/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), data: parsedData, target }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `${r.status}`);
      setResult(j);
      // Refresh tokens after send so pruned dead tokens disappear from the list.
      if (j.pruned > 0) loadTokens();
    } catch (e: any) {
      setError(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 py-5 space-y-6">
      <div className="flex items-center gap-2">
        <Bell size={18} />
        <h2 className="text-base font-serif font-semibold">Push Notifications</h2>
        <span className="text-xs text-text-tertiary ml-auto">{tokens.length} tokens registered</span>
        <button
          onClick={loadTokens}
          className="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-black/5 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Compose */}
      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Compose</div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A new chapter is ready"
            maxLength={120}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:border-text-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Your audiobook just finished generating — tap to listen."
            rows={3}
            maxLength={300}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:border-text-primary resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">
            Data <span className="text-text-tertiary font-normal">(optional JSON, delivered as <code className="text-[10px] bg-black/5 px-1 rounded">notification.data</code>)</span>
          </label>
          <textarea
            value={dataJson}
            onChange={(e) => setDataJson(e.target.value)}
            placeholder='{"deeplink": "/project/abc/chapter/1"}'
            rows={2}
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm font-mono focus:outline-none focus:border-text-primary resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-text-secondary mb-2">Target</label>
          <div className="flex gap-1.5 mb-3">
            {(['all', 'users', 'tokens'] as TargetMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setTargetMode(m)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  targetMode === m ? 'bg-text-primary text-white' : 'bg-black/5 text-text-secondary hover:bg-black/10'
                )}
              >
                {m === 'all' ? `All (${tokens.length})` : m === 'users' ? 'By user' : 'By token'}
              </button>
            ))}
          </div>

          {targetMode === 'users' && (
            <div className="rounded-lg border border-black/10 max-h-56 overflow-y-auto">
              {userGroups.length === 0 ? (
                <div className="px-3 py-4 text-xs text-text-tertiary text-center">No users with registered devices</div>
              ) : userGroups.map((u) => (
                <label key={u.userId} className="flex items-center gap-2 px-3 py-2 border-b border-black/5 last:border-b-0 cursor-pointer hover:bg-black/5">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(u.userId)}
                    onChange={() => toggleUser(u.userId)}
                  />
                  <UsersIcon size={13} className="text-text-tertiary" />
                  <span className="text-sm text-text-primary truncate">{u.email || u.userId}</span>
                  {u.name && <span className="text-xs text-text-tertiary truncate">— {u.name}</span>}
                  <span className="ml-auto text-[10px] text-text-tertiary">{u.tokens.length} {u.tokens.length === 1 ? 'device' : 'devices'}</span>
                </label>
              ))}
            </div>
          )}

          {targetMode === 'tokens' && (
            <div className="rounded-lg border border-black/10 max-h-56 overflow-y-auto">
              {tokens.length === 0 ? (
                <div className="px-3 py-4 text-xs text-text-tertiary text-center">No registered tokens</div>
              ) : tokens.map((t) => (
                <label key={t.token} className="flex items-center gap-2 px-3 py-2 border-b border-black/5 last:border-b-0 cursor-pointer hover:bg-black/5">
                  <input
                    type="checkbox"
                    checked={selectedTokens.has(t.token)}
                    onChange={() => toggleToken(t.token)}
                  />
                  <Smartphone size={13} className="text-text-tertiary" />
                  <span className="text-sm text-text-primary truncate">{t.email || t.userId}</span>
                  <span className="text-[10px] text-text-tertiary">{t.platform}</span>
                  <span className="ml-auto text-[10px] text-text-tertiary">{formatRelative(t.lastSeenAt)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={send}
            disabled={sending || !title.trim() || !body.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-text-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Send size={14} />
            {sending ? 'Sending…' : `Send to ${targetCount} ${targetCount === 1 ? 'device' : 'devices'}`}
          </button>
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Result</div>
            <span className="text-xs text-text-tertiary">
              {result.sent} sent · {result.tickets.length - result.sent} failed · {result.pruned} pruned
            </span>
          </div>
          {result.note && <div className="text-xs text-text-tertiary">{result.note}</div>}
          {result.tickets.length > 0 && (
            <div className="rounded-lg border border-black/10 max-h-64 overflow-y-auto">
              {result.tickets.map((t, i) => {
                const owner = tokens.find((x) => x.token === t.token);
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-black/5 last:border-b-0 text-xs">
                    {t.status === 'ok' ? (
                      <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle size={13} className="text-rose-600 shrink-0" />
                    )}
                    <span className="text-text-primary truncate">{owner?.email || t.token.slice(0, 24) + '…'}</span>
                    {t.status === 'error' && (
                      <span className="ml-auto text-rose-600 truncate">
                        {t.errorCode || t.message || 'unknown error'}
                      </span>
                    )}
                    {t.status === 'ok' && t.id && (
                      <span className="ml-auto text-text-tertiary font-mono text-[10px] truncate">{t.id}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tokens list */}
      <div className="rounded-xl border border-black/10 bg-white">
        <div className="px-4 py-3 border-b border-black/10 flex items-center gap-2">
          <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Registered devices</div>
          <span className="text-xs text-text-tertiary ml-auto">{tokens.length}</span>
        </div>
        {loading && tokens.length === 0 ? (
          <div className="px-4 py-6 text-xs text-text-tertiary text-center">Loading…</div>
        ) : tokens.length === 0 ? (
          <div className="px-4 py-6 text-xs text-text-tertiary text-center">No registered devices yet.</div>
        ) : (
          <div className="divide-y divide-black/5">
            {tokens.map((t) => (
              <div key={t.token} className="px-4 py-2.5 flex items-center gap-2 text-xs">
                <Smartphone size={13} className="text-text-tertiary shrink-0" />
                <span className="text-text-primary truncate">{t.email || t.userId}</span>
                {t.name && <span className="text-text-tertiary truncate">— {t.name}</span>}
                <span className="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-black/5">{t.platform}</span>
                <span className="ml-auto text-text-tertiary">last seen {formatRelative(t.lastSeenAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
