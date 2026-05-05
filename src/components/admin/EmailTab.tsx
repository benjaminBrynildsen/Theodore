import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Mail, RefreshCw, AlertCircle, CheckCircle2, Save, Eye, Users as UsersIcon, Apple, FileText, Smartphone, Monitor, X, Search, Plus, Trash2, Zap, ChevronLeft } from 'lucide-react';

const API = '/api/admin';

type TargetMode = 'all' | 'iosOptIns' | 'specific';
type Section = 'compose' | 'templates' | 'history';

interface SendResult {
  sent: number;
  optedOut: number;
  failed: number;
  total: number;
}

interface HistoryRow {
  id: string;
  userId: string | null;
  toAddress: string;
  kind: string;
  subject: string;
  status: string;
  errorMessage: string | null;
  sentAt: string;
}

interface EmailEvent {
  key: string;
  label: string;
  description: string;
}

interface TemplateRow {
  key: string;
  name: string;
  eventKey: string | null;
  subject: string;
  bodyHtml: string;
  updatedAt: string | null;
  updatedBy: string | null;
  isDefault: boolean;
}

const SECTIONS: { id: Section; label: string; icon: typeof Mail }[] = [
  { id: 'compose', label: 'Compose blast', icon: Send },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'history', label: 'Send history', icon: Mail },
];

export function EmailTab() {
  const [section, setSection] = useState<Section>('compose');

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={16} className="text-text-tertiary" />
        <h2 className="text-base font-serif font-semibold">Email</h2>
      </div>
      <p className="text-xs text-text-tertiary mb-5">
        Templates can attach to a transactional event (e.g. signup) or stay manual-only for blasts. Use “Compose blast” for one-off announcements.
      </p>

      {/* Section nav */}
      <div className="flex gap-1 mb-5 overflow-x-auto -mx-1 px-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              section === id
                ? 'bg-text-primary text-white'
                : 'bg-black/5 text-text-secondary hover:bg-black/10'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {section === 'compose' && <ComposeBlast />}
      {section === 'templates' && <TemplatesSection />}
      {section === 'history' && <History />}
    </div>
  );
}

// ── Compose blast (announcements) ──
function ComposeBlast() {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(
    `<p>Hey {{firstName}},</p>\n<p></p>\n<p>— Ben</p>`,
  );
  const [target, setTarget] = useState<TargetMode>('iosOptIns');
  const [selectedUsers, setSelectedUsers] = useState<PickerUser[]>([]);
  const [force, setForce] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  const send = async () => {
    if (!subject.trim() || !bodyHtml.trim()) {
      setError('Subject and body are required');
      return;
    }
    setError(null);
    setResult(null);

    let payloadTarget: any;
    if (target === 'all') {
      payloadTarget = { all: true };
      const ok = window.confirm('Send to ALL signed-up users? Including ones who never opted in?');
      if (!ok) return;
    } else if (target === 'iosOptIns') {
      payloadTarget = { iosOptIns: true };
    } else {
      if (!selectedUsers.length) { setError('Pick at least one user.'); return; }
      payloadTarget = { userIds: selectedUsers.map((u) => u.id) };
    }

    setSending(true);
    try {
      const r = await fetch(`${API}/email/send`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml, kind: 'announcement', target: payloadTarget, force }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `${r.status}`);
      setResult({ sent: j.sent, optedOut: j.optedOut, failed: j.failed, total: j.total });
    } catch (e: any) {
      setError(e?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail.includes('@')) { setTestStatus('Enter a valid email'); return; }
    if (!subject.trim() || !bodyHtml.trim()) { setTestStatus('Subject + body required'); return; }
    setTestStatus('Sending…');
    try {
      const r = await fetch(`${API}/email/test`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml, toEmail: testEmail, kind: 'announcement' }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `${r.status}`);
      setTestStatus(j.status === 'sent' ? `Sent to ${testEmail}` : `${j.status}: ${j.error || ''}`);
    } catch (e: any) {
      setTestStatus(e?.message || 'Send failed');
    }
  };

  const loadTemplate = (t: TemplateRow) => {
    setSubject(t.subject);
    setBodyHtml(t.bodyHtml);
    setError(null);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <TemplateLoadBar onLoad={loadTemplate} />

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Theodore is live on iOS!"
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm"
            />
          </Field>

          <Field label="Body HTML — supports {{firstName}}, {{email}}, {{appUrl}}">
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={16}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm font-mono"
            />
          </Field>
        </div>

        <PreviewPane subject={subject} bodyHtml={bodyHtml} />
      </div>

      <Field label="Send to">
        <div className="flex flex-col sm:flex-row gap-2">
          <TargetButton active={target === 'iosOptIns'} onClick={() => setTarget('iosOptIns')} icon={<Apple size={12} />} label="iOS opt-ins" />
          <TargetButton active={target === 'all'} onClick={() => setTarget('all')} icon={<UsersIcon size={12} />} label="All users" />
          <TargetButton active={target === 'specific'} onClick={() => setTarget('specific')} icon={<Mail size={12} />} label="Specific users" />
        </div>
        {target === 'specific' && (
          <div className="mt-2">
            <UserPicker selected={selectedUsers} onChange={setSelectedUsers} />
          </div>
        )}
      </Field>

      <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
        Force-send to users who have opted out (use sparingly)
      </label>

      <div className="flex flex-col gap-2 p-3 rounded-xl border border-black/5 bg-black/[0.02]">
        <div className="text-[10px] uppercase tracking-wider text-text-tertiary font-semibold">Test send</div>
        <div className="flex gap-2">
          <input
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 px-3 py-2 rounded-lg bg-white border border-black/10 text-sm"
          />
          <button
            onClick={sendTest}
            className="px-4 py-2 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-semibold text-text-primary inline-flex items-center gap-1.5"
          >
            <Eye size={12} />
            Send test
          </button>
        </div>
        {testStatus && <div className="text-xs text-text-tertiary">{testStatus}</div>}
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="text-xs text-text-tertiary">
          Recipients honor per-category opt-out unless forced.
        </div>
        <button
          onClick={send}
          disabled={sending}
          className="px-5 py-2.5 rounded-lg bg-text-primary text-white text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          <Send size={14} />
          {sending ? 'Sending…' : 'Send blast'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 inline-flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50">
          <div className="flex items-center gap-2 mb-1 text-emerald-700 font-semibold text-sm">
            <CheckCircle2 size={14} />
            Done — {result.sent} sent / {result.optedOut} opted-out / {result.failed} failed (of {result.total})
          </div>
        </div>
      )}
    </div>
  );
}

interface PickerUser {
  id: string;
  email: string;
  name: string | null;
}

// Searchable multi-select for picking specific users to email. Loads the full
// user list once (cap 10k) and filters client-side — fine until we outgrow
// it, at which point this should switch to a server-side search endpoint.
function UserPicker({
  selected,
  onChange,
}: {
  selected: PickerUser[];
  onChange: (next: PickerUser[]) => void;
}) {
  const [users, setUsers] = useState<PickerUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const r = await fetch(`${API}/users?limit=10000`, { credentials: 'include' });
        if (!r.ok) throw new Error(`${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        const list: PickerUser[] = (j.users || []).map((u: any) => ({
          id: u.id, email: u.email, name: u.name ?? null,
        }));
        setUsers(list);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Failed to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Click-outside to close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectedIds = useMemo(() => new Set(selected.map((u) => u.id)), [selected]);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? users.filter((u) =>
          u.email.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q),
        )
      : users;
    return list.slice(0, 100);
  }, [users, query]);

  const toggle = (u: PickerUser) => {
    if (selectedIds.has(u.id)) onChange(selected.filter((s) => s.id !== u.id));
    else onChange([...selected, u]);
  };

  const remove = (id: string) => onChange(selected.filter((s) => s.id !== id));

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="min-h-[42px] w-full px-2 py-1.5 rounded-lg bg-white border border-black/10 text-sm flex flex-wrap gap-1.5 items-center cursor-text"
        onClick={() => setOpen(true)}
      >
        {selected.map((u) => (
          <span
            key={u.id}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-black/5 text-xs"
          >
            <span className="text-text-primary">{u.name || u.email}</span>
            {u.name && <span className="text-text-tertiary">·</span>}
            {u.name && <span className="text-text-tertiary">{u.email}</span>}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(u.id); }}
              className="ml-0.5 p-0.5 rounded hover:bg-black/10"
              title="Remove"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <div className="flex-1 min-w-[160px] inline-flex items-center gap-1.5 px-1">
          <Search size={12} className="text-text-tertiary shrink-0" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected.length ? 'Add another…' : 'Search by name or email…'}
            className="flex-1 bg-transparent outline-none text-sm py-1"
          />
        </div>
      </div>

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-lg bg-white border border-black/10 shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-text-tertiary">Loading users…</div>}
          {loadError && <div className="px-3 py-2 text-xs text-red-700">{loadError}</div>}
          {!loading && !loadError && filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">No matches.</div>
          )}
          {filtered.map((u) => {
            const isSel = selectedIds.has(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-black/5 ${isSel ? 'bg-emerald-50/60' : ''}`}
              >
                <input type="checkbox" readOnly checked={isSel} className="pointer-events-none" />
                <span className="flex-1 truncate">
                  <span className="text-text-primary">{u.name || '—'}</span>
                  <span className="text-text-tertiary"> · {u.email}</span>
                </span>
              </button>
            );
          })}
          {users && users.length > filtered.length && !query && (
            <div className="px-3 py-1.5 text-[10px] text-text-tertiary border-t border-black/5">
              Showing first {filtered.length} of {users.length}. Type to narrow.
            </div>
          )}
        </div>
      )}

      <div className="mt-1.5 text-[11px] text-text-tertiary">
        {selected.length} user{selected.length === 1 ? '' : 's'} selected
        {users && ` · ${users.length} total`}
      </div>
    </div>
  );
}

// ── Template loader (Compose blast helper) ──
// Lets the admin populate the compose form from a saved template instead of
// hand-typing subject + body. Pulls the same list used by the templates tab.
function TemplateLoadBar({ onLoad }: { onLoad: (t: TemplateRow) => void }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || templates) return;
    setLoading(true);
    fetch(`${API}/email/templates`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setTemplates(j.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, [open, templates]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-semibold inline-flex items-center gap-1.5"
      >
        <FileText size={12} />
        Load template
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg bg-white border border-black/10 shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-text-tertiary">Loading…</div>}
          {!loading && templates && templates.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-tertiary">No templates yet.</div>
          )}
          {templates?.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { onLoad(t); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-black/5 border-b border-black/5 last:border-b-0"
            >
              <div className="text-text-primary font-medium truncate">{t.name}</div>
              <div className="text-text-tertiary text-[10px] truncate">
                {t.eventKey ? <EventBadgeInline eventKey={t.eventKey} /> : <span>Manual only</span>}
                <span className="ml-1">· {t.subject}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EventBadgeInline({ eventKey }: { eventKey: string }) {
  const label = eventKey === 'welcome' ? 'On signup' : eventKey === 'audiobook-ready' ? 'On audiobook ready' : eventKey;
  return <span className="text-emerald-700">{label}</span>;
}

// ── Templates section (list + editor) ──
function TemplatesSection() {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/email/templates`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      setTemplates(j.templates || []);
      setEvents(j.events || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="py-12 text-center text-text-tertiary text-sm">Loading…</div>;
  if (error) return <div className="p-3 rounded-lg bg-red-50 text-sm text-red-700">{error}</div>;

  if (creating) {
    return (
      <TemplateEditor
        mode="create"
        events={events}
        existing={null}
        onCancel={() => setCreating(false)}
        onSaved={() => { setCreating(false); load(); }}
      />
    );
  }
  if (editingKey) {
    const t = templates?.find((x) => x.key === editingKey) || null;
    return (
      <TemplateEditor
        mode="edit"
        events={events}
        existing={t}
        onCancel={() => setEditingKey(null)}
        onSaved={() => { setEditingKey(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          {templates?.length || 0} templates · {events.length} events available
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-text-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
        >
          <Plus size={12} />
          New template
        </button>
      </div>

      <div className="rounded-xl border border-black/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.02] text-text-tertiary text-xs">
            <tr>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2">Event</th>
              <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Subject</th>
              <th className="text-left font-medium px-3 py-2">Updated</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {templates?.map((t) => (
              <tr key={t.key} className="border-t border-black/5 hover:bg-black/[0.02]">
                <td className="px-3 py-2">
                  <div className="font-medium text-text-primary">{t.name}</div>
                  {t.isDefault && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold mt-0.5">Not customized</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <EventBadge eventKey={t.eventKey} events={events} />
                </td>
                <td className="px-3 py-2 text-text-secondary truncate max-w-[260px] hidden md:table-cell">{t.subject}</td>
                <td className="px-3 py-2 text-xs text-text-tertiary">
                  {t.updatedAt ? formatTime(t.updatedAt) : '—'}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() => setEditingKey(t.key)}
                    className="px-2 py-1 rounded text-xs font-semibold text-text-secondary hover:bg-black/5"
                  >
                    {t.isDefault ? 'Customize' : 'Edit'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventBadge({ eventKey, events }: { eventKey: string | null; events: EmailEvent[] }) {
  if (!eventKey) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-black/5 text-text-tertiary text-[10px] font-semibold">
        Manual only
      </span>
    );
  }
  const ev = events.find((e) => e.key === eventKey);
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
      <Zap size={10} />
      {ev?.label || eventKey}
    </span>
  );
}

// ── Template editor (create + edit) ──
function TemplateEditor({
  mode,
  events,
  existing,
  onCancel,
  onSaved,
}: {
  mode: 'create' | 'edit';
  events: EmailEvent[];
  existing: TemplateRow | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [eventKey, setEventKey] = useState<string>(existing?.eventKey || '');
  const [subject, setSubject] = useState(existing?.subject || '');
  const [bodyHtml, setBodyHtml] = useState(existing?.bodyHtml || `<p>Hey {{firstName}},</p>\n<p></p>\n<p>— Ben</p>`);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = existing ? existing.key.startsWith('custom:') : false;

  const save = async () => {
    setError(null);
    if (!subject.trim()) { setError('Subject required'); return; }
    if (!bodyHtml.trim()) { setError('Body required'); return; }
    if (mode === 'create' && !name.trim() && !eventKey) {
      setError('Give the template a name or attach it to an event.');
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        subject,
        bodyHtml,
        name: name.trim() || null,
        eventKey: eventKey || null,
      });
      const r = mode === 'create'
        ? await fetch(`${API}/email/templates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body,
          })
        : await fetch(`${API}/email/templates/${encodeURIComponent(existing!.key)}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `${r.status}`);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!window.confirm(`Delete "${existing.name}"? This can't be undone.`)) return;
    setDeleting(true);
    try {
      const r = await fetch(`${API}/email/templates/${encodeURIComponent(existing.key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`${r.status}`);
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
      setDeleting(false);
    }
  };

  const extraVars = eventKey === 'audiobook-ready' ? ['chapterTitle', 'deepLink'] : [];
  const varsHelp = eventKey === 'audiobook-ready'
    ? '{{firstName}}, {{email}}, {{appUrl}}, {{chapterTitle}}, {{deepLink}}'
    : '{{firstName}}, {{email}}, {{appUrl}}';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="px-2 py-1 rounded text-xs font-semibold text-text-secondary hover:bg-black/5 inline-flex items-center gap-1"
        >
          <ChevronLeft size={12} />
          Back
        </button>
        <div className="text-xs text-text-tertiary">
          {mode === 'create' ? 'New template' : `Editing: ${existing?.name}`}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="iOS launch announcement"
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm"
            />
          </Field>

          <Field label="Trigger event">
            <select
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm"
            >
              <option value="">Manual only — no automatic trigger</option>
              {events.map((ev) => (
                <option key={ev.key} value={ev.key}>{ev.label} — {ev.description}</option>
              ))}
            </select>
            {eventKey && (
              <div className="mt-1 text-[11px] text-text-tertiary">
                Saving will detach this event from any other template that currently has it.
              </div>
            )}
          </Field>

          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm"
            />
          </Field>

          <Field label={`Body HTML — supports ${varsHelp}`}>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={18}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm font-mono"
            />
          </Field>
        </div>

        <PreviewPane subject={subject} bodyHtml={bodyHtml} extraVars={extraVars} />
      </div>

      <div className="flex items-center justify-between pt-2">
        <div>
          {mode === 'edit' && isCustom && (
            <button
              onClick={remove}
              disabled={deleting}
              className="px-3 py-2 rounded-lg text-xs font-semibold text-red-700 hover:bg-red-50 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Trash2 size={12} />
              {deleting ? 'Deleting…' : 'Delete template'}
            </button>
          )}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-text-primary text-white text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save template'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-700 inline-flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

// ── Send history ──
function History() {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/email/history`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      setRows(j.emails || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === 'all') return rows;
    return rows.filter((r) => r.kind === filter);
  }, [rows, filter]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-black/5 hover:bg-black/10 text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-1.5 rounded-lg bg-black/5 text-xs font-semibold"
        >
          <option value="all">All kinds</option>
          <option value="welcome">Welcome</option>
          <option value="audiobook-ready">Audiobook</option>
          <option value="announcement">Announcement</option>
          <option value="password-reset">Password reset</option>
        </select>
        <div className="ml-auto text-xs text-text-tertiary">{filtered.length} rows</div>
      </div>

      {error && <div className="p-3 mb-3 rounded-lg bg-red-50 text-sm text-red-700">{error}</div>}

      {!rows && !error && <div className="py-12 text-center text-text-tertiary text-sm">Loading…</div>}

      {rows && filtered.length === 0 && (
        <div className="py-12 text-center text-text-tertiary text-sm">No emails sent yet.</div>
      )}

      {rows && filtered.length > 0 && (
        <div className="rounded-xl border border-black/5 overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-black/[0.02] text-text-tertiary">
              <tr>
                <th className="text-left font-medium px-3 py-2">When</th>
                <th className="text-left font-medium px-3 py-2">Kind</th>
                <th className="text-left font-medium px-3 py-2">To</th>
                <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Subject</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-black/5 hover:bg-black/[0.02]">
                  <td className="px-3 py-2 text-text-tertiary">{formatTime(r.sentAt)}</td>
                  <td className="px-3 py-2 capitalize">{r.kind.replace('-', ' ')}</td>
                  <td className="px-3 py-2 font-mono">{r.toAddress}</td>
                  <td className="px-3 py-2 text-text-secondary truncate max-w-[260px] hidden md:table-cell">{r.subject}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={r.status} />
                    {r.errorMessage && <div className="text-[10px] text-red-700 mt-0.5">{r.errorMessage}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Live preview ──
// Mirrors server/email.ts wrapHtml() shell so what you see is what subscribers
// see. Substitutes {{vars}} with sample values (the user can override them
// inline below the preview). Renders in an iframe so the host page's CSS
// can't leak into the rendered email.
function EmailPreview({
  subject,
  bodyHtml,
  variables,
  device,
}: {
  subject: string;
  bodyHtml: string;
  variables: Record<string, string>;
  device: 'desktop' | 'mobile';
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const rendered = useMemo(() => {
    const subbedSubject = substitute(subject, variables);
    const subbedBody = substitute(bodyHtml, variables);
    return wrapPreviewHtml({
      subject: subbedSubject,
      bodyHtml: subbedBody,
      fromLine: 'Ben from Theodore <ben@theodore.tools>',
    });
  }, [subject, bodyHtml, variables]);

  // Use srcdoc so CSP and same-origin issues don't trip us up.
  return (
    <div className={`mx-auto rounded-2xl bg-[#f7f6f1] border border-black/10 overflow-hidden ${device === 'mobile' ? 'max-w-[380px]' : 'max-w-full'}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white/60 border-b border-black/5 text-[11px] text-text-tertiary">
        <div className="truncate">
          <span className="text-text-primary font-semibold">{substitute(subject, variables) || '(no subject)'}</span>
        </div>
        <div className="shrink-0">Inbox preview</div>
      </div>
      <iframe
        ref={iframeRef}
        title="Email preview"
        srcDoc={rendered}
        className="w-full block"
        style={{ height: device === 'mobile' ? '640px' : '720px', border: 0, background: '#f7f6f1' }}
        sandbox=""
      />
    </div>
  );
}

function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (key in vars ? vars[key] : m));
}

// Mirrors server/email.ts wrapHtml() — keep these visually consistent so the
// admin preview matches what subscribers receive. If you tweak the server
// shell, mirror the change here.
function wrapPreviewHtml(opts: { subject: string; bodyHtml: string; fromLine: string }): string {
  const safe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f7f6f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e;line-height:1.55;font-size:15px;}
  .card{width:100%;max-width:560px;background:#ffffff;border-radius:16px;border:1px solid rgba(0,0,0,0.06);overflow:hidden;}
  .card-pad{padding:28px 32px 8px 32px;}
  .card-body{padding:8px 32px 32px 32px;font-size:15px;color:#1c1c1e;}
  .footer{font-size:12px;color:#8a8a8e;padding:20px 16px 0 16px;width:100%;max-width:560px;line-height:1.6;box-sizing:border-box;}
  .meta{padding:18px 16px 8px;font-size:11px;color:#8a8a8e;width:100%;max-width:592px;margin:0 auto;box-sizing:border-box;}
  @media (max-width: 480px){
    .card-pad{padding:22px 18px 6px;}
    .card-body{padding:6px 18px 22px;}
  }
</style>
</head><body>
<div class="meta">
  <div><span style="color:#48484a;">From:</span> ${safe(opts.fromLine)}</div>
  <div><span style="color:#48484a;">Subject:</span> <span style="color:#1c1c1e;font-weight:600;">${safe(opts.subject)}</span></div>
</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f7f6f1;">
  <tr><td align="center" style="padding:8px 16px 32px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" class="card">
      <tr><td class="card-pad">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-0.01em;color:#1c1c1e;">Theodore</div>
      </td></tr>
      <tr><td class="card-body">
        ${opts.bodyHtml}
      </td></tr>
    </table>
    <div class="footer">
      You're getting this because you signed up at <a href="https://theodore.tools" style="color:#8a8a8e;">theodore.tools</a>.<br>
      <a href="#" style="color:#8a8a8e;">Unsubscribe from these emails</a>.
    </div>
  </td></tr>
</table>
</body></html>`;
}

// Sample variables shared by both compose + template editor previews so what
// you see is realistic. Editable in the preview controls.
const DEFAULT_PREVIEW_VARS = {
  firstName: 'Alex',
  email: 'alex@example.com',
  appUrl: 'https://theodore.tools',
  chapterTitle: 'Chapter 3 — The Glass Hour',
  deepLink: 'https://theodore.tools/?project=demo',
};

function PreviewPane({
  subject,
  bodyHtml,
  extraVars,
}: {
  subject: string;
  bodyHtml: string;
  extraVars?: string[];
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [vars, setVars] = useState<Record<string, string>>({ ...DEFAULT_PREVIEW_VARS });

  // Keys to expose as user-editable inputs. Always includes firstName/email
  // since every template uses them; extras come from the caller.
  const editableKeys = useMemo(() => {
    const base = ['firstName', 'email'];
    return Array.from(new Set([...base, ...(extraVars || [])]));
  }, [extraVars]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-text-tertiary">Live preview</div>
        <div className="flex items-center gap-1 rounded-lg bg-black/5 p-0.5">
          <button
            onClick={() => setDevice('desktop')}
            className={`px-2 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${device === 'desktop' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
            title="Desktop preview"
          >
            <Monitor size={11} /> Desktop
          </button>
          <button
            onClick={() => setDevice('mobile')}
            className={`px-2 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${device === 'mobile' ? 'bg-white text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary'}`}
            title="Mobile preview"
          >
            <Smartphone size={11} /> Mobile
          </button>
        </div>
      </div>

      {/* Variable controls so the preview shows realistic data */}
      <div className="flex flex-wrap gap-2 items-center text-[11px] text-text-tertiary">
        <span>Variables:</span>
        {editableKeys.map((k) => (
          <label key={k} className="inline-flex items-center gap-1">
            <span className="font-mono text-text-secondary">{`{{${k}}}`}</span>
            <input
              value={vars[k] ?? ''}
              onChange={(e) => setVars((prev) => ({ ...prev, [k]: e.target.value }))}
              className="w-32 px-1.5 py-0.5 rounded bg-white border border-black/10 text-text-primary"
            />
          </label>
        ))}
      </div>

      <EmailPreview subject={subject} bodyHtml={bodyHtml} variables={vars} device={device} />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    sent: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
    failed: { bg: 'bg-red-50', text: 'text-red-700' },
    'skipped-opt-out': { bg: 'bg-amber-50', text: 'text-amber-700' },
  };
  const s = map[status] || { bg: 'bg-black/5', text: 'text-text-tertiary' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
      {status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-text-tertiary mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function TargetButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
        active ? 'bg-text-primary text-white' : 'bg-black/5 text-text-secondary hover:bg-black/10'
      }`}
    >
      {icon}
      {label}
    </button>
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
