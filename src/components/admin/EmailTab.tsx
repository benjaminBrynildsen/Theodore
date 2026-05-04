import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Mail, RefreshCw, AlertCircle, CheckCircle2, Save, Eye, Users as UsersIcon, Apple, FileText, Smartphone, Monitor } from 'lucide-react';

const API = '/api/admin';

type TargetMode = 'all' | 'iosOptIns' | 'specific';
type Section = 'compose' | 'welcome' | 'audiobook-ready' | 'history';

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

const SECTIONS: { id: Section; label: string; icon: typeof Mail }[] = [
  { id: 'compose', label: 'Compose blast', icon: Send },
  { id: 'welcome', label: 'Welcome template', icon: FileText },
  { id: 'audiobook-ready', label: 'Audiobook template', icon: FileText },
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
        Welcome emails fire on signup. Audiobook emails fire when chapter audio finishes. Use “Compose blast” for one-off announcements (e.g. iOS launch).
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
      {section === 'welcome' && <TemplateEditor templateKey="welcome" />}
      {section === 'audiobook-ready' && <TemplateEditor templateKey="audiobook-ready" />}
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
  const [specificEmails, setSpecificEmails] = useState('');
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
      const ids = await resolveEmailsToIds(specificEmails);
      if (!ids.length) { setError('No matching users for those emails.'); return; }
      payloadTarget = { userIds: ids };
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

  return (
    <div className="space-y-4">
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
          <TargetButton active={target === 'specific'} onClick={() => setTarget('specific')} icon={<Mail size={12} />} label="Specific emails" />
        </div>
        {target === 'specific' && (
          <textarea
            value={specificEmails}
            onChange={(e) => setSpecificEmails(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            rows={3}
            className="mt-2 w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm font-mono"
          />
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

async function resolveEmailsToIds(raw: string): Promise<string[]> {
  const emails = raw.split(/[,\s\n]+/).map((e) => e.trim()).filter(Boolean);
  if (!emails.length) return [];
  // Use the existing admin /users endpoint with a contains filter? Simpler:
  // fetch all users (capped) and filter client-side. For now, accept the cost.
  try {
    const r = await fetch(`${API}/users?limit=10000`, { credentials: 'include' });
    if (!r.ok) return [];
    const j = await r.json();
    const set = new Set(emails.map((e) => e.toLowerCase()));
    return (j.users || []).filter((u: any) => set.has(String(u.email).toLowerCase())).map((u: any) => u.id);
  } catch {
    return [];
  }
}

// ── Template editor (welcome / audiobook-ready) ──
function TemplateEditor({ templateKey }: { templateKey: 'welcome' | 'audiobook-ready' }) {
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/email/templates/${templateKey}`, { credentials: 'include' });
      if (!r.ok) throw new Error(`${r.status}`);
      const j = await r.json();
      setSubject(j.subject);
      setBodyHtml(j.bodyHtml);
      setIsDefault(j.isDefault);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [templateKey]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`${API}/email/templates/${templateKey}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, bodyHtml }),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      setSavedAt(Date.now());
      setIsDefault(false);
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-text-tertiary text-sm">Loading…</div>;

  const vars = templateKey === 'welcome'
    ? '{{firstName}}, {{email}}, {{appUrl}}'
    : '{{firstName}}, {{email}}, {{appUrl}}, {{chapterTitle}}, {{deepLink}}';

  return (
    <div className="space-y-4">
      <div className="text-xs text-text-tertiary">
        Variables: <code className="text-text-primary">{vars}</code>
        {isDefault && <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold">Default — not yet customized</span>}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Field label="Subject">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm"
            />
          </Field>

          <Field label="Body HTML">
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={20}
              className="w-full px-3 py-2 rounded-lg bg-white border border-black/10 text-sm font-mono"
            />
          </Field>
        </div>

        <PreviewPane
          subject={subject}
          bodyHtml={bodyHtml}
          extraVars={templateKey === 'audiobook-ready' ? ['chapterTitle', 'deepLink'] : []}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          {savedAt && `Saved ${new Date(savedAt).toLocaleTimeString()}`}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-text-primary text-white text-sm font-semibold inline-flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? 'Saving…' : 'Save template'}
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
<style>body{margin:0;padding:0;background:#f7f6f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e;line-height:1.55;font-size:15px;}</style>
</head><body>
<div style="padding:18px 16px 8px;font-size:11px;color:#8a8a8e;max-width:592px;margin:0 auto;">
  <div><span style="color:#48484a;">From:</span> ${safe(opts.fromLine)}</div>
  <div><span style="color:#48484a;">Subject:</span> <span style="color:#1c1c1e;font-weight:600;">${safe(opts.subject)}</span></div>
</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f7f6f1;">
  <tr><td align="center" style="padding:8px 16px 32px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid rgba(0,0,0,0.06);overflow:hidden;">
      <tr><td style="padding:28px 32px 8px 32px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-0.01em;color:#1c1c1e;">Theodore</div>
      </td></tr>
      <tr><td style="padding:8px 32px 32px 32px;font-size:15px;color:#1c1c1e;">
        ${opts.bodyHtml}
      </td></tr>
    </table>
    <div style="font-size:12px;color:#8a8a8e;padding:20px 16px 0 16px;max-width:560px;line-height:1.6;">
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
