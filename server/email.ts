// Transactional & announcement email — uses the same Gmail SMTP transport as
// server/outreach.ts. Distinct module so outreach (cold-lead) concerns stay
// separated from user-facing transactional flows.
//
// Categories:
//   - welcome           — sent on first signup
//   - audiobook-ready   — sent when a chapter audio job finishes
//   - announcement      — admin-triggered blasts (e.g. iOS launch)
//   - password-reset    — sent on forgot-password (replaces dev token return)
//
// Opt-out is per-category, stored at user.settings.emailOptOut.{category} = true.
// Welcome and audiobook-ready are transactional — opt-out flips only via the
// per-email unsubscribe link. Announcements honor opt-out by default; admin
// can override with a `force` flag in the send payload.

import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import { db } from './db.js';
import { users, transactionalEmails, emailTemplates } from './schema.js';
import { eq } from 'drizzle-orm';

const SEND_FROM = process.env.OUTREACH_FROM || 'ben@theodore.tools';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Ben from Theodore';
const GMAIL_USER = process.env.GMAIL_USER || SEND_FROM;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const APP_URL = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : 'https://theodore.tools';
const UNSUBSCRIBE_SECRET = process.env.SESSION_SECRET || process.env.PAGEVIEW_SALT || 'theodore-unsubscribe-secret';

export type EmailKind = 'welcome' | 'audiobook-ready' | 'announcement' | 'password-reset';

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  if (!GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_APP_PASSWORD not set — cannot send transactional mail');
  }
  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return _transporter;
}

// ── Unsubscribe tokens ──
// Format: base64url(`${userId}:${kind}`).${hmac}. Unbounded lifetime — users
// should always be able to unsubscribe from a link they received.
export function makeUnsubscribeToken(userId: string, kind: EmailKind): string {
  const payload = `${userId}:${kind}`;
  const sig = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(payload).digest('base64url').slice(0, 24);
  return `${Buffer.from(payload).toString('base64url')}.${sig}`;
}

export function parseUnsubscribeToken(token: string): { userId: string; kind: EmailKind } | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [b64, sig] = token.split('.');
  let payload: string;
  try {
    payload = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(payload).digest('base64url').slice(0, 24);
  if (sig !== expected) return null;
  const [userId, kind] = payload.split(':');
  if (!userId || !kind) return null;
  return { userId, kind: kind as EmailKind };
}

export function unsubscribeUrl(userId: string, kind: EmailKind): string {
  return `${APP_URL}/unsubscribe?t=${encodeURIComponent(makeUnsubscribeToken(userId, kind))}`;
}

// ── Branded HTML wrapper ──
// Plain, readable, no fancy graphics so deliverability stays high. Footer
// always carries the per-recipient unsubscribe link.
export function wrapHtml(opts: {
  bodyHtml: string;
  unsubscribeHref: string;
  preheader?: string;
}): string {
  const safePreheader = (opts.preheader || '').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Theodore</title>
</head>
<body style="margin:0;padding:0;background:#f7f6f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1e;line-height:1.55;">
<div style="display:none;max-height:0;overflow:hidden;color:transparent;">${safePreheader}</div>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f7f6f1;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid rgba(0,0,0,0.06);overflow:hidden;">
      <tr><td style="padding:28px 32px 8px 32px;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-0.01em;color:#1c1c1e;">Theodore</div>
      </td></tr>
      <tr><td style="padding:8px 32px 32px 32px;font-size:15px;color:#1c1c1e;">
        ${opts.bodyHtml}
      </td></tr>
    </table>
    <div style="font-size:12px;color:#8a8a8e;padding:20px 16px 0 16px;max-width:560px;line-height:1.6;">
      You're getting this because you signed up at <a href="${APP_URL}" style="color:#8a8a8e;">theodore.tools</a>.<br>
      <a href="${opts.unsubscribeHref}" style="color:#8a8a8e;">Unsubscribe from these emails</a>.
    </div>
  </td></tr>
</table>
</body></html>`;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Per-user opt-out check ──
function hasOptedOut(settings: any, kind: EmailKind): boolean {
  if (!settings || typeof settings !== 'object') return false;
  const flags = settings.emailOptOut;
  if (!flags || typeof flags !== 'object') return false;
  return Boolean(flags[kind]);
}

// ── Variable substitution ──
export function substituteVars(s: string, vars: Record<string, string>): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => (key in vars ? vars[key] : m));
}

// ── Send a single transactional / announcement email to a user ──
export async function sendToUser(opts: {
  user: { id: string; email: string; name?: string | null; settings?: any };
  kind: EmailKind;
  subject: string;
  bodyHtml: string; // inner body (will be wrapped). Should already have substitutions applied.
  preheader?: string;
  metadata?: Record<string, any>;
  // Force-send even if the user has opted out (admin override; never used by
  // automatic flows).
  force?: boolean;
  // Skip persisting a row to transactional_emails (used by the test path).
  skipLog?: boolean;
}): Promise<{ status: 'sent' | 'skipped-opt-out' | 'failed'; error?: string; id: string }> {
  const id = randomUUID();
  const optedOut = hasOptedOut(opts.user.settings, opts.kind);
  if (optedOut && !opts.force) {
    if (!opts.skipLog) {
      await db.insert(transactionalEmails).values({
        id,
        userId: opts.user.id,
        toAddress: opts.user.email,
        fromAddress: `${FROM_NAME} <${SEND_FROM}>`,
        kind: opts.kind,
        subject: opts.subject,
        bodyHtml: null,
        status: 'skipped-opt-out',
        metadata: opts.metadata || {},
      }).catch((err) => console.warn('[email] log insert failed', err));
    }
    return { status: 'skipped-opt-out', id };
  }

  const unsubHref = unsubscribeUrl(opts.user.id, opts.kind);
  const wrappedHtml = wrapHtml({ bodyHtml: opts.bodyHtml, unsubscribeHref: unsubHref, preheader: opts.preheader });

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `${FROM_NAME} <${SEND_FROM}>`,
      to: opts.user.email,
      subject: opts.subject,
      html: wrappedHtml,
      text: htmlToText(wrappedHtml),
      headers: {
        'List-Unsubscribe': `<${unsubHref}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (!opts.skipLog) {
      await db.insert(transactionalEmails).values({
        id,
        userId: opts.user.id,
        toAddress: opts.user.email,
        fromAddress: `${FROM_NAME} <${SEND_FROM}>`,
        kind: opts.kind,
        subject: opts.subject,
        bodyHtml: wrappedHtml,
        status: 'sent',
        metadata: opts.metadata || {},
      }).catch((err) => console.warn('[email] log insert failed', err));
    }
    return { status: 'sent', id };
  } catch (e: any) {
    console.error('[email] send failed', opts.kind, opts.user.email, e?.message);
    if (!opts.skipLog) {
      await db.insert(transactionalEmails).values({
        id,
        userId: opts.user.id,
        toAddress: opts.user.email,
        fromAddress: `${FROM_NAME} <${SEND_FROM}>`,
        kind: opts.kind,
        subject: opts.subject,
        bodyHtml: wrappedHtml,
        status: 'failed',
        errorMessage: e?.message || 'Unknown error',
        metadata: opts.metadata || {},
      }).catch(() => {});
    }
    return { status: 'failed', error: e?.message || 'Unknown error', id };
  }
}

// ── Template helpers ──
// Templates are stored in the email_templates table; if a row is missing the
// caller falls back to the inline default. Edits flow through the admin tab.
export async function getTemplate(key: string): Promise<{ subject: string; bodyHtml: string } | null> {
  const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1);
  return row ? { subject: row.subject, bodyHtml: row.bodyHtml } : null;
}

// Look up by event attachment — used by the transactional send pipelines so
// the active template for an event can be swapped from the admin tab without
// touching code. Falls back to the seed template keyed by the event name
// (preserving the old `getTemplate('welcome')` behavior for fresh DBs).
export async function getTemplateByEvent(eventKey: string): Promise<{ subject: string; bodyHtml: string } | null> {
  const [row] = await db
    .select()
    .from(emailTemplates)
    .where(eq(emailTemplates.eventKey, eventKey))
    .limit(1);
  if (row) return { subject: row.subject, bodyHtml: row.bodyHtml };
  // Legacy fallback: an old install will have a row keyed by the event name.
  return getTemplate(eventKey);
}

export async function setTemplate(opts: { key: string; subject: string; bodyHtml: string; updatedBy?: string }): Promise<void> {
  const existing = await db.select().from(emailTemplates).where(eq(emailTemplates.key, opts.key)).limit(1);
  if (existing.length) {
    await db.update(emailTemplates)
      .set({ subject: opts.subject, bodyHtml: opts.bodyHtml, updatedAt: new Date(), updatedBy: opts.updatedBy ?? null })
      .where(eq(emailTemplates.key, opts.key));
  } else {
    await db.insert(emailTemplates).values({
      key: opts.key, subject: opts.subject, bodyHtml: opts.bodyHtml, updatedAt: new Date(), updatedBy: opts.updatedBy ?? null,
    });
  }
}

// ── Inline default templates ──
// The admin tab seeds editable copies of these into email_templates. The send
// helpers fall back to these if no row exists yet.
export const DEFAULT_TEMPLATES: Record<'welcome' | 'audiobook-ready', { subject: string; bodyHtml: string }> = {
  welcome: {
    subject: 'Welcome to Theodore',
    bodyHtml: `<p>Hey {{firstName}},</p>
<p>Ben here — I'm the one building Theodore. Just wanted to say thanks for signing up.</p>
<p>If you've never used it before, the fastest way to feel what it does is to <a href="{{appUrl}}" style="color:#1c1c1e;font-weight:600;">just start chatting</a> — describe a story idea in a sentence and Theodore will run with it.</p>
<p>If you hit a wall, hit reply. This email lands in my actual inbox.</p>
<p style="margin-top:28px;">— Ben</p>`,
  },
  'audiobook-ready': {
    subject: 'Your audiobook chapter is ready',
    bodyHtml: `<p>Hey {{firstName}},</p>
<p>The audio for <strong>{{chapterTitle}}</strong> is ready to listen.</p>
<p><a href="{{deepLink}}" style="display:inline-block;padding:10px 18px;background:#1c1c1e;color:#fff;border-radius:10px;text-decoration:none;font-weight:600;">Open in Theodore</a></p>
<p style="margin-top:24px;color:#8a8a8e;font-size:13px;">If the button doesn't work, copy this link: {{deepLink}}</p>`,
  },
};

// ── Convenience: send welcome for a freshly registered user ──
export async function sendWelcome(user: { id: string; email: string; name?: string | null; settings?: any }) {
  const template = (await getTemplateByEvent('welcome')) ?? DEFAULT_TEMPLATES.welcome;
  const firstName = (user.name || '').split(/\s+/)[0] || 'there';
  const vars = { firstName, email: user.email, appUrl: APP_URL };
  return sendToUser({
    user,
    kind: 'welcome',
    subject: substituteVars(template.subject, vars),
    bodyHtml: substituteVars(template.bodyHtml, vars),
    preheader: 'Welcome from Ben — quick hello and a couple of tips.',
  });
}

// ── Convenience: send audiobook-ready ──
export async function sendAudiobookReady(opts: {
  user: { id: string; email: string; name?: string | null; settings?: any };
  chapterTitle: string;
  deepLink: string; // absolute URL
}) {
  const template = (await getTemplateByEvent('audiobook-ready')) ?? DEFAULT_TEMPLATES['audiobook-ready'];
  const firstName = (opts.user.name || '').split(/\s+/)[0] || 'there';
  const vars = {
    firstName,
    email: opts.user.email,
    appUrl: APP_URL,
    chapterTitle: opts.chapterTitle,
    deepLink: opts.deepLink,
  };
  return sendToUser({
    user: opts.user,
    kind: 'audiobook-ready',
    subject: substituteVars(template.subject, vars),
    bodyHtml: substituteVars(template.bodyHtml, vars),
    preheader: `${opts.chapterTitle} is ready to listen.`,
    metadata: { chapterTitle: opts.chapterTitle },
  });
}

// ── Internal helper exposed for admin endpoints ──
export { SEND_FROM, FROM_NAME, APP_URL };
