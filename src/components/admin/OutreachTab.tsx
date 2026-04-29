import { useEffect, useState, useMemo } from 'react';
import { Mail, Send, Eye, ChevronRight, Plus, Trash2, ExternalLink, Search, X, FileText, Edit2, Tag } from 'lucide-react';
import { cn } from '../../lib/utils';

const API = '/api/admin';

type Status =
  | 'todo'
  | 'queued'
  | 'sent'
  | 'opened'
  | 'replied'
  | 'positive'
  | 'negative'
  | 'paused'
  | 'bounced';

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  platform: string | null;
  channelUrl: string | null;
  status: Status;
  notes: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
  sentCount: number;
  openCount: number;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
}

interface OutreachEmail {
  id: string;
  recipientId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  status: string;
  errorMessage: string | null;
  sentAt: string;
  fromAddress: string;
  toAddress: string;
}

interface OutreachReply {
  id: string;
  recipientId: string | null;
  emailId: string | null;
  fromAddress: string | null;
  fromName: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean;
  receivedAt: string | null;
  createdAt: string;
  recipient?: Recipient | null;
}

interface OpenEvent {
  id: number;
  email_id: string;
  ip: string | null;
  user_agent: string | null;
  country: string | null;
  is_bot: boolean;
  bot_reason: string | null;
  ms_since_send: number | null;
  created_at: string;
}

interface OverallStats {
  total_recipients: number;
  total_sent: number;
  total_opens: number;
  recipients_opened: number;
  recipients_replied: number;
  recipients_positive: number;
}

interface Template {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  tagSlug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplateStat {
  id: string;
  name: string;
  tag_slug: string;
  subject: string;
  recipients_total: number;
  sent_count: number;
  recipients_opened: number;
  recipients_replied: number;
  recipients_positive: number;
}

const STATUS_ORDER: Status[] = ['todo', 'queued', 'sent', 'opened', 'replied', 'positive', 'negative', 'paused', 'bounced'];

const STATUS_LABELS: Record<Status, string> = {
  todo: 'To Send',
  queued: 'Queued',
  sent: 'Sent',
  opened: 'Opened',
  replied: 'Replied',
  positive: 'Positive',
  negative: 'Pass',
  paused: 'Paused',
  bounced: 'Bounced',
};

const STATUS_COLORS: Record<Status, string> = {
  todo: 'bg-gray-100 text-gray-700',
  queued: 'bg-amber-100 text-amber-800',
  sent: 'bg-blue-100 text-blue-700',
  opened: 'bg-indigo-100 text-indigo-700',
  replied: 'bg-purple-100 text-purple-700',
  positive: 'bg-emerald-100 text-emerald-700',
  negative: 'bg-rose-100 text-rose-700',
  paused: 'bg-yellow-100 text-yellow-800',
  bounced: 'bg-red-100 text-red-700',
};

async function jget<T>(path: string): Promise<T> {
  const r = await fetch(`${API}${path}`, { credentials: 'include' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function jpost<T>(path: string, body: any, method: 'POST' | 'PATCH' | 'DELETE' = 'POST'): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: method === 'DELETE' ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `${r.status}`);
  }
  return r.json();
}

export function OutreachTab() {
  const [mode, setMode] = useState<'pipeline' | 'compose' | 'templates'>('pipeline');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [unreadReplies, setUnreadReplies] = useState<number>(0);
  const [polling, setPolling] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openTimelineFor, setOpenTimelineFor] = useState<Recipient | null>(null);
  const [composeFor, setComposeFor] = useState<Recipient | null>(null);
  const [composePresetTemplateId, setComposePresetTemplateId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, s, t, u] = await Promise.all([
        jget<{ recipients: Recipient[] }>('/outreach/recipients'),
        jget<{ stats: OverallStats }>('/outreach/stats'),
        jget<{ templates: Template[] }>('/outreach/templates'),
        jget<{ unread: number }>('/outreach/replies/unread').catch(() => ({ unread: 0 })),
      ]);
      setRecipients(r.recipients);
      setStats(s.stats);
      setTemplates(t.templates);
      setUnreadReplies(u.unread || 0);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // All distinct tags currently in use (for the filter dropdown).
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipients) {
      for (const tag of r.tags || []) set.add(tag);
    }
    return Array.from(set).sort();
  }, [recipients]);

  const filtered = useMemo(() => {
    return recipients.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (tagFilter !== 'all' && !(r.tags || []).includes(tagFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.email} ${r.name || ''} ${r.company || ''} ${r.platform || ''} ${(r.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [recipients, search, statusFilter, tagFilter]);

  const grouped = useMemo(() => {
    const m = new Map<Status, Recipient[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const r of filtered) {
      m.get(r.status as Status)?.push(r);
    }
    return m;
  }, [filtered]);

  const updateStatus = async (id: string, status: Status) => {
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await jpost(`/outreach/recipients/${id}`, { status }, 'PATCH');
    } catch (e: any) {
      setError(e.message);
      load();
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {error && (
        <div className="glass-pill rounded-xl p-3 text-sm text-error">{error}</div>
      )}

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          <Stat label="Recipients" value={stats.total_recipients} />
          <Stat label="Sent" value={stats.total_sent} />
          <Stat label="Opens" value={stats.total_opens} />
          <Stat label="Opened" value={`${stats.recipients_opened}/${stats.total_recipients}`} />
          <Stat label="Replied" value={stats.recipients_replied} />
          <Stat label="Positive" value={stats.recipients_positive} />
        </div>
      )}

      {/* Mode toggle + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass-pill rounded-full p-1 flex">
          {(['pipeline', 'compose', 'templates'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setComposeFor(null); setComposePresetTemplateId(null); }}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                mode === m ? 'bg-text-primary text-white' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {m === 'pipeline' ? 'Pipeline' : m === 'compose' ? 'Compose' : 'Templates'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="glass-pill rounded-full px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
        >
          <Plus size={12} /> Add recipient
        </button>
        <button
          onClick={load}
          className="glass-pill rounded-full px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <button
          onClick={async () => {
            setPolling(true);
            try {
              const r = await jpost<{ scanned: number; matched: number; inserted: number }>('/outreach/inbox/poll', {});
              await load();
              if (r.inserted > 0) setError(null);
              else setError(`Inbox checked — ${r.scanned} unseen, ${r.inserted} new replies`);
            } catch (e: any) { setError(e.message); }
            setPolling(false);
          }}
          className="glass-pill rounded-full px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
          title="Poll Gmail INBOX for new replies"
        >
          <Mail size={11} /> {polling ? 'Polling…' : 'Check inbox'}
          {unreadReplies > 0 && (
            <span className="ml-1 px-1.5 rounded-full bg-purple-600 text-white text-[10px] font-semibold">{unreadReplies}</span>
          )}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <div className="glass-pill rounded-full px-3 py-1 flex items-center gap-2">
            <Search size={12} className="text-text-tertiary" />
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-xs outline-none w-32 sm:w-48"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Status | 'all')}
            className="glass-pill rounded-full px-3 py-1 text-xs bg-transparent"
          >
            <option value="all">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="glass-pill rounded-full px-3 py-1 text-xs bg-transparent"
            >
              <option value="all">All tags</option>
              {allTags.map((t) => (
                <option key={t} value={t}>#{t}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {mode === 'pipeline' && (
        <div className="space-y-4">
          {STATUS_ORDER.map((status) => {
            const list = grouped.get(status) || [];
            if (list.length === 0 && statusFilter === 'all') return null;
            return (
              <div key={status} className="glass-pill rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider', STATUS_COLORS[status])}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="text-xs text-text-tertiary">{list.length}</span>
                </div>
                <div className="space-y-1">
                  {list.map((r) => (
                    <PipelineRow
                      key={r.id}
                      recipient={r}
                      onStatusChange={(s) => updateStatus(r.id, s)}
                      onCompose={() => { setComposeFor(r); setMode('compose'); }}
                      onTimeline={() => setOpenTimelineFor(r)}
                    />
                  ))}
                  {list.length === 0 && (
                    <div className="text-xs text-text-tertiary py-2">No recipients in this stage.</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'compose' && (
        <ComposeView
          recipients={recipients}
          templates={templates}
          presetRecipient={composeFor}
          presetTemplateId={composePresetTemplateId}
          onSent={() => { setComposeFor(null); setComposePresetTemplateId(null); load(); setMode('pipeline'); }}
          onCancel={() => { setComposeFor(null); setComposePresetTemplateId(null); setMode('pipeline'); }}
        />
      )}

      {mode === 'templates' && (
        <TemplatesView
          templates={templates}
          onChange={load}
          onCompose={(t) => { setComposePresetTemplateId(t.id); setMode('compose'); }}
        />
      )}

      {showAdd && (
        <AddRecipientModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }}
        />
      )}

      {openTimelineFor && (
        <TimelineModal
          recipient={openTimelineFor}
          onClose={() => setOpenTimelineFor(null)}
          onCompose={(r) => { setOpenTimelineFor(null); setComposeFor(r); setMode('compose'); }}
          onDelete={async (r) => {
            if (!confirm(`Delete ${r.email}? This wipes their email + open history.`)) return;
            try {
              await jpost(`/outreach/recipients/${r.id}`, {}, 'DELETE');
              setOpenTimelineFor(null);
              load();
            } catch (e: any) { setError(e.message); }
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-pill rounded-xl p-3">
      <div className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

function PipelineRow({
  recipient,
  onStatusChange,
  onCompose,
  onTimeline,
}: {
  recipient: Recipient;
  onStatusChange: (s: Status) => void;
  onCompose: () => void;
  onTimeline: () => void;
}) {
  const r = recipient;
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-black/5 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-primary truncate">
            {r.name || r.email}
          </span>
          {r.platform && (
            <span className="text-[10px] text-text-tertiary uppercase">{r.platform}</span>
          )}
        </div>
        <div className="text-xs text-text-tertiary truncate flex items-center gap-2">
          <span className="truncate">
            {r.email}
            {r.company && ` · ${r.company}`}
          </span>
          {r.channelUrl && (
            <a href={r.channelUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-text-secondary hover:underline">
              <ExternalLink size={10} />
            </a>
          )}
          {(r.tags || []).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium">
              <Tag size={9} /> {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-3 text-xs text-text-tertiary">
        {r.sentCount > 0 && <span><Send size={11} className="inline mr-1" />{r.sentCount}</span>}
        {r.openCount > 0 && <span className="text-indigo-600"><Eye size={11} className="inline mr-1" />{r.openCount}</span>}
      </div>
      <select
        value={r.status}
        onChange={(e) => onStatusChange(e.target.value as Status)}
        className={cn('text-[11px] font-semibold rounded-full px-2 py-1 border-0 cursor-pointer', STATUS_COLORS[r.status as Status])}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>
      <button onClick={onCompose} className="text-text-tertiary hover:text-text-primary p-1" title="Compose email">
        <Mail size={14} />
      </button>
      <button onClick={onTimeline} className="text-text-tertiary hover:text-text-primary p-1" title="Timeline">
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

function AddRecipientModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [platform, setPlatform] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      await jpost('/outreach/recipients', { email, name, company, platform, channelUrl, notes });
      onAdded();
    } catch (e: any) {
      setErr(e.message || 'Failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-serif font-semibold">Add recipient</h3>
          <button onClick={onClose}><X size={16} className="text-text-tertiary" /></button>
        </div>
        <div className="space-y-2">
          <input className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm" placeholder="email *" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm" placeholder="company / channel" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm" placeholder="platform (youtube, x, podcast, …)" value={platform} onChange={(e) => setPlatform(e.target.value)} />
          <input className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm" placeholder="channel URL" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
          <textarea className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm" placeholder="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {err && <div className="text-xs text-error mt-2">{err}</div>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 px-3 py-2 rounded-lg text-sm border border-black/10">Cancel</button>
          <button onClick={submit} disabled={!email || saving} className="flex-1 px-3 py-2 rounded-lg text-sm bg-text-primary text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ComposeView({
  recipients,
  templates,
  presetRecipient,
  presetTemplateId,
  onSent,
  onCancel,
}: {
  recipients: Recipient[];
  templates: Template[];
  presetRecipient: Recipient | null;
  presetTemplateId: string | null;
  onSent: () => void;
  onCancel: () => void;
}) {
  const [recipientId, setRecipientId] = useState(presetRecipient?.id || '');
  const [templateId, setTemplateId] = useState<string>(presetTemplateId || '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const recipient = recipients.find((r) => r.id === recipientId) || null;

  // When a template is picked, prefill subject + body. Once typed-over, the
  // user's edits are preserved unless they pick a different template.
  const applyTemplate = (id: string) => {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(htmlToPlainText(t.bodyHtml));
  };

  // If preset template was passed in (clicked "Use template" from Templates view),
  // apply it once on mount.
  useEffect(() => {
    if (presetTemplateId) applyTemplate(presetTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    if (!recipientId || !subject.trim() || !body.trim()) {
      setErr('Recipient, subject, and body are required.');
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const html = plaintextToHtml(body, recipient);
      await jpost('/outreach/send', {
        recipientId,
        subject,
        bodyHtml: html,
        templateId: templateId || undefined,
      });
      onSent();
    } catch (e: any) {
      setErr(e.message || 'Send failed');
    }
    setSending(false);
  };

  return (
    <div className="glass-pill rounded-2xl p-5 max-w-3xl mx-auto space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-serif font-semibold">Compose outreach email</h3>
        <button onClick={onCancel} className="text-xs text-text-tertiary hover:text-text-primary">Cancel</button>
      </div>

      <div>
        <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">To</label>
        <select
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1"
        >
          <option value="">— select recipient —</option>
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name ? `${r.name} <${r.email}>` : r.email}
              {r.platform ? ` · ${r.platform}` : ''}
              {' · '}
              {STATUS_LABELS[r.status as Status]}
            </option>
          ))}
        </select>
      </div>

      {templates.length > 0 && (
        <div>
          <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
            Template (optional — auto-tags recipient)
          </label>
          <select
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1"
          >
            <option value="">— no template —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · #{t.tagSlug}
              </option>
            ))}
          </select>
          <div className="text-[11px] text-text-tertiary mt-1">
            Variables: <code>{'{{name}}'}</code> · <code>{'{{firstName}}'}</code> · <code>{'{{company}}'}</code> · <code>{'{{platform}}'}</code> — substituted at send.
          </div>
        </div>
      )}

      <div>
        <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Theodore for [Channel] — partnership idea"
          className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1"
        />
      </div>

      <div>
        <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
          Body (plain text — paragraphs preserved, links auto-detected)
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Hi ${recipient?.name || '[name]'},\n\n…\n\nBen`}
          rows={14}
          className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1 font-mono"
        />
        <div className="text-[11px] text-text-tertiary mt-1">
          A 1×1 tracking pixel is auto-injected. From: ben@theodore.tools.
        </div>
      </div>

      {err && <div className="text-xs text-error">{err}</div>}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm border border-black/10">
          Cancel
        </button>
        <button
          onClick={send}
          disabled={sending || !recipientId || !subject.trim() || !body.trim()}
          className="px-4 py-2 rounded-lg text-sm bg-text-primary text-white disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Send size={14} /> {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function htmlToPlainText(html: string): string {
  // Reverse of plaintextToHtml — best-effort. Strips tags but preserves
  // paragraph breaks. Good enough for a template editor.
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plaintextToHtml(text: string, _recipient: Recipient | null): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  // Auto-link plain URLs.
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    (m) => `<a href="${m}">${m}</a>`,
  );
  const paragraphs = linked
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n');
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;">${paragraphs}</body></html>`;
}

function TemplatesView({
  templates,
  onChange,
  onCompose,
}: {
  templates: Template[];
  onChange: () => void;
  onCompose: (t: Template) => void;
}) {
  const [stats, setStats] = useState<TemplateStat[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const data = await jget<{ templates: TemplateStat[] }>('/outreach/templates/stats');
      setStats(data.templates);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => { loadStats(); }, [templates.length]);

  const remove = async (id: string) => {
    if (!confirm('Delete this template? Existing recipients keep their tag.')) return;
    try {
      await jpost(`/outreach/templates/${id}`, {}, 'DELETE');
      onChange();
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="space-y-3">
      {err && <div className="glass-pill rounded-xl p-3 text-sm text-error">{err}</div>}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-serif font-semibold">Templates</h3>
        <button
          onClick={() => setCreating(true)}
          className="glass-pill rounded-full px-3 py-1 text-xs font-medium text-text-secondary hover:text-text-primary inline-flex items-center gap-1"
        >
          <Plus size={12} /> New template
        </button>
      </div>

      {templates.length === 0 && (
        <div className="glass-pill rounded-2xl p-6 text-sm text-text-tertiary text-center">
          No templates yet. Create one to start tagging outreach by template.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {templates.map((t) => {
          const s = stats.find((x) => x.id === t.id);
          const openRate = s && s.sent_count > 0
            ? Math.round((s.recipients_opened / s.recipients_total) * 100)
            : 0;
          return (
            <div key={t.id} className="glass-pill rounded-2xl p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary">{t.name}</div>
                  <div className="text-[11px] text-text-tertiary">
                    Tag: <span className="font-mono">#{t.tagSlug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onCompose(t)} className="text-text-tertiary hover:text-text-primary p-1" title="Use in compose">
                    <Send size={13} />
                  </button>
                  <button onClick={() => setEditing(t)} className="text-text-tertiary hover:text-text-primary p-1" title="Edit">
                    <Edit2 size={13} />
                  </button>
                  <button onClick={() => remove(t.id)} className="text-text-tertiary hover:text-rose-600 p-1" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div className="text-xs text-text-secondary line-clamp-2">{t.subject}</div>
              {s && (
                <div className="grid grid-cols-4 gap-2 mt-1 text-[11px]">
                  <TStat label="Recipients" value={s.recipients_total} />
                  <TStat label="Sent" value={s.sent_count} />
                  <TStat label="Opened" value={`${s.recipients_opened} (${openRate}%)`} />
                  <TStat label="Replied" value={s.recipients_replied} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(creating || editing) && (
        <TemplateEditor
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); onChange(); }}
        />
      )}
    </div>
  );
}

function TStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-black/[0.03] rounded px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="text-xs font-semibold text-text-primary tabular-nums">{value}</div>
    </div>
  );
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: Template | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [subject, setSubject] = useState(template?.subject || '');
  const [body, setBody] = useState(template ? htmlToPlainText(template.bodyHtml) : '');
  const [tagSlug, setTagSlug] = useState(template?.tagSlug || '');
  const [description, setDescription] = useState(template?.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setErr('Name, subject, and body are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const bodyHtml = plaintextToHtml(body, null);
      const payload = { name, subject, bodyHtml, tagSlug: tagSlug || undefined, description };
      if (template) {
        await jpost(`/outreach/templates/${template.id}`, payload, 'PATCH');
      } else {
        await jpost('/outreach/templates', payload);
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Failed');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-black/5 px-5 py-3 flex items-center justify-between">
          <h3 className="text-base font-serif font-semibold inline-flex items-center gap-2">
            <FileText size={16} /> {template ? 'Edit template' : 'New template'}
          </h3>
          <button onClick={onClose}><X size={16} className="text-text-tertiary" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Tech YouTube — intro v1"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
              Tag slug {!template && '(auto-generated from name if blank)'}
            </label>
            <input
              value={tagSlug}
              onChange={(e) => setTagSlug(e.target.value)}
              placeholder="intro-v1"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1 font-mono"
            />
            <div className="text-[11px] text-text-tertiary mt-1">
              Recipients sent this template auto-get tagged with <span className="font-mono">#{tagSlug || 'auto'}</span>.
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Theodore for {{company}} — partnership idea"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">
              Body (variables: {'{{name}}'}, {'{{firstName}}'}, {'{{company}}'}, {'{{platform}}'})
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={14}
              placeholder={`Hi {{firstName}},\n\nLove what you're doing at {{company}}…\n\nBen`}
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1 font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Description (internal note)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this template for?"
              className="w-full px-3 py-2 rounded-lg border border-black/10 text-sm mt-1"
            />
          </div>
          {err && <div className="text-xs text-error">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-black/10">Cancel</button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-text-primary text-white disabled:opacity-50">
              {saving ? 'Saving…' : template ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineModal({
  recipient,
  onClose,
  onCompose,
  onDelete,
}: {
  recipient: Recipient;
  onClose: () => void;
  onCompose: (r: Recipient) => void;
  onDelete: (r: Recipient) => void;
}) {
  const [data, setData] = useState<{ recipient: Recipient; emails: OutreachEmail[]; opens: OpenEvent[] } | null>(null);
  const [replies, setReplies] = useState<OutreachReply[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    jget<{ recipient: Recipient; emails: OutreachEmail[]; opens: OpenEvent[] }>(
      `/outreach/recipients/${recipient.id}/timeline`,
    )
      .then(setData)
      .catch((e) => setErr(e.message));
    jget<{ replies: OutreachReply[] }>(`/outreach/recipients/${recipient.id}/replies`)
      .then((r) => setReplies(r.replies))
      .catch(() => {/* replies may not exist yet — silent */});
  }, [recipient.id]);

  const opensByEmail = useMemo(() => {
    const m = new Map<string, OpenEvent[]>();
    if (!data) return m;
    for (const o of data.opens) {
      const list = m.get(o.email_id) || [];
      list.push(o);
      m.set(o.email_id, list);
    }
    return m;
  }, [data]);

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-black/5 px-5 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-base font-serif font-semibold truncate">{recipient.name || recipient.email}</div>
            <div className="text-xs text-text-tertiary truncate">{recipient.email}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onCompose(recipient)} className="text-xs px-2 py-1 rounded-lg bg-text-primary text-white inline-flex items-center gap-1">
              <Mail size={12} /> New
            </button>
            <button onClick={() => onDelete(recipient)} className="text-xs p-1 rounded-lg text-rose-600 hover:bg-rose-50">
              <Trash2 size={14} />
            </button>
            <button onClick={onClose} className="p-1"><X size={14} className="text-text-tertiary" /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          {err && <div className="text-xs text-error">{err}</div>}
          {!data && !err && <div className="text-sm text-text-tertiary">Loading…</div>}

          {replies.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">
                Replies ({replies.length})
              </div>
              {replies.map((r) => (
                <div key={r.id} className="border border-purple-200 bg-purple-50/40 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-sm font-semibold truncate">
                      {r.subject || '(no subject)'}
                    </div>
                    <div className="text-[11px] text-text-tertiary shrink-0">
                      {r.receivedAt ? new Date(r.receivedAt).toLocaleString() : ''}
                    </div>
                  </div>
                  <div className="text-[11px] text-text-tertiary mb-2">
                    From {r.fromName ? `${r.fromName} <${r.fromAddress}>` : r.fromAddress}
                  </div>
                  <div className="text-xs text-text-secondary whitespace-pre-wrap">
                    {r.bodyText || r.snippet || '(empty body)'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data && data.emails.length === 0 && (
            <div className="text-sm text-text-tertiary">No emails sent yet.</div>
          )}
          {data?.emails.map((e) => {
            const opens = opensByEmail.get(e.id) || [];
            const realOpens = opens.filter((o) => !o.is_bot);
            const botOpens = opens.filter((o) => o.is_bot);
            return (
              <div key={e.id} className="border border-black/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{e.subject}</div>
                    <div className="text-[11px] text-text-tertiary">
                      Sent {new Date(e.sentAt).toLocaleString()} · to {e.toAddress}
                      {e.status !== 'sent' && (
                        <span className="ml-2 text-rose-600">{e.status}: {e.errorMessage || ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary shrink-0">
                    <Eye size={11} className="inline mr-1" />
                    {realOpens.length}
                    {botOpens.length > 0 && (
                      <span className="text-text-tertiary"> ({botOpens.length} bot)</span>
                    )}
                  </div>
                </div>
                {realOpens.length > 0 && (
                  <details className="mt-2">
                    <summary className="text-[11px] text-text-tertiary cursor-pointer">Open events</summary>
                    <div className="mt-2 space-y-1">
                      {realOpens.map((o) => (
                        <div key={o.id} className="text-[11px] text-text-secondary">
                          {new Date(o.created_at).toLocaleString()}
                          {o.country && ` · ${o.country}`}
                          {o.user_agent && ` · ${o.user_agent.slice(0, 60)}`}
                        </div>
                      ))}
                      {botOpens.map((o) => (
                        <div key={o.id} className="text-[11px] text-text-tertiary line-through">
                          {new Date(o.created_at).toLocaleString()} · bot ({o.bot_reason})
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <details className="mt-2">
                  <summary className="text-[11px] text-text-tertiary cursor-pointer">Body</summary>
                  <div className="mt-2 text-xs text-text-secondary whitespace-pre-wrap">
                    {e.bodyText || ''}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
