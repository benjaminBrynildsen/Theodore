// Cold-outreach pipeline + open tracking.
//
// Three concerns live here:
//   1. Pixel endpoint at GET /t/:uuid.gif (mounted on the track.theodore.tools
//      host, but it works on any host so internal testing is easy).
//   2. Admin API under /api/admin/outreach (recipients CRUD, send email,
//      list emails, per-recipient timeline).
//   3. SMTP send via Gmail (nodemailer), with the pixel <img> injected into
//      the HTML body before send.
//
// The send path stamps a row in outreach_emails *before* nodemailer.send so
// the pixel UUID is known when we render the body. If send fails, the row's
// status is flipped to 'failed' rather than deleted — that way the admin UI
// can show the error inline instead of silently dropping the recipient.
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { db } from './db.js';
import { outreachRecipients, outreachEmails, outreachOpens, outreachTemplates } from './schema.js';
import { sql, eq, desc, and } from 'drizzle-orm';
import { requireAdmin } from './admin.js';
import nodemailer from 'nodemailer';

const TRACK_HOST = process.env.TRACK_HOST || 'track.theodore.tools';
const SEND_FROM = process.env.OUTREACH_FROM || 'ben@theodore.tools';
const SEND_FROM_NAME = process.env.OUTREACH_FROM_NAME || 'Ben Brynildsen';
const GMAIL_USER = process.env.GMAIL_USER || SEND_FROM;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';

// 1×1 transparent GIF — embedded so we never have to read from disk.
const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

// Email scanners and link-checkers tend to fetch the pixel within milliseconds
// of delivery. Anything under this threshold is logged but flagged is_bot=true.
const FAST_OPEN_MS = 5000;

// User-agent fragments that scream "scanner / bot" — keep this conservative;
// false positives here mean missed real opens.
const BOT_UA_PATTERNS = [
  /bot/i,
  /spider/i,
  /crawler/i,
  /scanner/i,
  /Mimecast/i,
  /Barracuda/i,
  /ProofPoint/i,
  /MessageLabs/i,
  /Symantec/i,
  /Forcepoint/i,
  /Trend Micro/i,
  /Cisco/i,
  /MS-Office/i,
  /OfficeProtect/i,
  /SafeLinks/i,
];

function classifyOpen(opts: {
  userAgent: string;
  msSinceSend: number;
  senderSelfMatch: boolean;
}): { isBot: boolean; reason: string | null } {
  if (opts.senderSelfMatch) return { isBot: true, reason: 'sender-self-open' };
  if (!opts.userAgent) return { isBot: true, reason: 'no-ua' };
  if (opts.msSinceSend > 0 && opts.msSinceSend < FAST_OPEN_MS) {
    return { isBot: true, reason: 'too-fast' };
  }
  for (const re of BOT_UA_PATTERNS) {
    if (re.test(opts.userAgent)) return { isBot: true, reason: 'scanner-ua' };
  }
  return { isBot: false, reason: null };
}

function clientIp(req: Request): string {
  // Render sits behind Cloudflare → trust cf-connecting-ip first, then
  // x-forwarded-for, then the socket. We don't hash these for the
  // outreach table — the recipient list is small + private-admin-only,
  // and we want IP for "did this open match the recipient's known geo".
  const cf = (req.headers['cf-connecting-ip'] as string | undefined) || '';
  if (cf) return cf;
  const xff = (req.headers['x-forwarded-for'] as string | undefined) || '';
  if (xff) return xff.split(',')[0]?.trim() || '';
  return req.ip || req.socket?.remoteAddress || '';
}

function clientCountry(req: Request): string | null {
  const cf = req.headers['cf-ipcountry'] as string | undefined;
  if (cf && cf.length === 2) return cf;
  return null;
}

function trackBaseUrl(): string {
  return `https://${TRACK_HOST}`;
}

function buildPixelUrl(emailId: string): string {
  return `${trackBaseUrl()}/t/${emailId}.gif`;
}

function injectPixel(html: string, emailId: string): string {
  const img = `<img src="${buildPixelUrl(emailId)}" alt="" width="1" height="1" style="display:none;border:0;outline:none;" />`;
  // Insert just before </body> if present, otherwise append.
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${img}</body>`);
  }
  return html + img;
}

// ========== Pixel Route ==========
// GET /t/:uuid.gif — public. Mounted in server/index.ts on the main app so it
// works on track.theodore.tools (custom domain CNAME → same Render service).
export async function pixelHandler(req: Request, res: Response) {
  // Set headers FIRST so a slow DB doesn't keep mailclients hanging.
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Send pixel immediately, then log async. If logging fails, the open is
  // dropped — better than a stuck connection.
  res.status(200).end(PIXEL_GIF);

  const uuid = (req.params.uuid || '').toLowerCase();
  if (!/^[0-9a-f-]{8,64}$/i.test(uuid)) return;

  try {
    const [email] = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.id, uuid));
    if (!email) return;

    const ip = clientIp(req);
    const ua = (req.headers['user-agent'] as string | undefined) || '';
    const country = clientCountry(req);
    const sentAt = email.sentAt ? new Date(email.sentAt).getTime() : Date.now();
    const msSinceSend = Date.now() - sentAt;

    // "Sender self-open" = the sender previewed their own email in Gmail
    // right after sending. We match by IP if SENDER_OPEN_IP is set; otherwise
    // skip. (Render egress IP rotates so this isn't reliable from the server
    // side — primarily useful when ben opens from his own laptop.)
    const senderIp = process.env.SENDER_OPEN_IP || '';
    const senderSelfMatch = !!senderIp && ip === senderIp;

    const cls = classifyOpen({ userAgent: ua, msSinceSend, senderSelfMatch });

    await db.insert(outreachOpens).values({
      emailId: uuid,
      ip: ip || null,
      userAgent: ua || null,
      country,
      isBot: cls.isBot,
      botReason: cls.reason,
      msSinceSend,
    });

    // First non-bot open flips the email's recipient status to 'opened'
    // (only if currently 'sent' — don't overwrite 'replied' or further states).
    if (!cls.isBot) {
      await db
        .update(outreachRecipients)
        .set({ status: 'opened', updatedAt: new Date() })
        .where(
          and(
            eq(outreachRecipients.id, email.recipientId),
            eq(outreachRecipients.status, 'sent'),
          ),
        );
    }
  } catch (err) {
    // Don't surface errors — pixel was already returned. Just log.
    console.error('[outreach] pixel log failed:', err);
  }
}

// ========== Admin: list/create/update recipients ==========
export async function listRecipients(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await db
      .select()
      .from(outreachRecipients)
      .orderBy(desc(outreachRecipients.updatedAt))
      .limit(500);

    // Attach last-sent + open-count per recipient. One aggregate query per
    // table — fine at <1k recipients; revisit when this grows.
    const sendStats = await db.execute(sql<{
      recipient_id: string;
      sent_count: number;
      last_sent_at: string | null;
    }>`
      select recipient_id,
             count(*)::int as sent_count,
             max(sent_at) as last_sent_at
      from outreach_emails
      group by recipient_id
    `);

    const openStats = await db.execute(sql<{
      recipient_id: string;
      open_count: number;
      last_opened_at: string | null;
    }>`
      select e.recipient_id,
             count(*)::int as open_count,
             max(o.created_at) as last_opened_at
      from outreach_opens o
      join outreach_emails e on e.id = o.email_id
      where o.is_bot = false
      group by e.recipient_id
    `);

    const sendMap = new Map<string, any>();
    for (const r of (sendStats as any).rows || sendStats) {
      sendMap.set(r.recipient_id, r);
    }
    const openMap = new Map<string, any>();
    for (const r of (openStats as any).rows || openStats) {
      openMap.set(r.recipient_id, r);
    }

    const enriched = rows.map((r) => ({
      ...r,
      sentCount: Number(sendMap.get(r.id)?.sent_count || 0),
      lastSentAt: sendMap.get(r.id)?.last_sent_at || null,
      openCount: Number(openMap.get(r.id)?.open_count || 0),
      lastOpenedAt: openMap.get(r.id)?.last_opened_at || null,
    }));

    res.json({ recipients: enriched });
  } catch (e: any) {
    console.error('[outreach] listRecipients error:', e);
    res.status(500).json({ error: e.message || 'Failed to load recipients' });
  }
}

export async function createRecipient(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const id = randomUUID();
    const now = new Date();
    await db.insert(outreachRecipients).values({
      id,
      email,
      name: body.name || null,
      company: body.company || null,
      platform: body.platform || null,
      channelUrl: body.channelUrl || null,
      status: body.status || 'todo',
      notes: body.notes || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    const [row] = await db.select().from(outreachRecipients).where(eq(outreachRecipients.email, email));
    res.json({ recipient: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to create recipient' });
  }
}

export async function updateRecipient(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    const body = req.body || {};
    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const key of ['name', 'company', 'platform', 'channelUrl', 'status', 'notes'] as const) {
      if (key in body) patch[key] = body[key];
    }
    if ('tags' in body && Array.isArray(body.tags)) patch.tags = body.tags;
    await db.update(outreachRecipients).set(patch).where(eq(outreachRecipients.id, id));
    const [row] = await db.select().from(outreachRecipients).where(eq(outreachRecipients.id, id));
    res.json({ recipient: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update recipient' });
  }
}

export async function deleteRecipient(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    await db.delete(outreachRecipients).where(eq(outreachRecipients.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to delete recipient' });
  }
}

// ========== Admin: per-recipient timeline ==========
export async function recipientTimeline(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    const [recipient] = await db.select().from(outreachRecipients).where(eq(outreachRecipients.id, id));
    if (!recipient) return res.status(404).json({ error: 'Not found' });

    const emails = await db
      .select()
      .from(outreachEmails)
      .where(eq(outreachEmails.recipientId, id))
      .orderBy(desc(outreachEmails.sentAt));

    const opens = await db.execute(sql<any>`
      select o.*
      from outreach_opens o
      join outreach_emails e on e.id = o.email_id
      where e.recipient_id = ${id}
      order by o.created_at desc
    `);

    const opensList = (opens as any).rows || opens;
    res.json({ recipient, emails, opens: opensList });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load timeline' });
  }
}

// ========== Admin: send email ==========
let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;
  if (!GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_APP_PASSWORD not set — cannot send outreach mail');
  }
  _transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return _transporter;
}

function htmlToText(html: string): string {
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

// Substitute {{name}}, {{company}}, {{platform}}, {{firstName}} in any string.
// Missing fields fall back to a sensible default (recipient.email or empty).
function substituteVars(s: string, recipient: typeof outreachRecipients.$inferSelect): string {
  const firstName = (recipient.name || '').split(/\s+/)[0] || '';
  const map: Record<string, string> = {
    name: recipient.name || firstName || 'there',
    firstName: firstName || 'there',
    company: recipient.company || '',
    platform: recipient.platform || '',
    email: recipient.email || '',
  };
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    if (key in map) return map[key];
    return _m; // leave unknown variables alone
  });
}

export async function sendEmail(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const body = req.body || {};
    const recipientId = String(body.recipientId || '').trim();
    const templateId = body.templateId ? String(body.templateId) : null;
    let subject = String(body.subject || '').trim();
    let bodyHtml = String(body.bodyHtml || '').trim();
    if (!recipientId) {
      return res.status(400).json({ error: 'recipientId required' });
    }
    const [recipient] = await db.select().from(outreachRecipients).where(eq(outreachRecipients.id, recipientId));
    if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

    // If a templateId is supplied, the template's subject + body are used as
    // a base — explicit subject/bodyHtml in the request body still override
    // (so the user can tweak before sending). The tagSlug is always merged.
    let template: typeof outreachTemplates.$inferSelect | null = null;
    if (templateId) {
      const [t] = await db.select().from(outreachTemplates).where(eq(outreachTemplates.id, templateId));
      if (!t) return res.status(404).json({ error: 'Template not found' });
      template = t;
      if (!subject) subject = t.subject;
      if (!bodyHtml) bodyHtml = t.bodyHtml;
    }

    if (!subject || !bodyHtml) {
      return res.status(400).json({ error: 'subject and bodyHtml required (or pass templateId)' });
    }

    // Variable substitution happens AFTER the template merge so any variables
    // in either the template or the user-edited body get resolved together.
    subject = substituteVars(subject, recipient);
    bodyHtml = substituteVars(bodyHtml, recipient);

    // Allocate the email row first so we have its UUID for the pixel.
    const emailId = randomUUID();
    const fromHeader = `${SEND_FROM_NAME} <${SEND_FROM}>`;
    await db.insert(outreachEmails).values({
      id: emailId,
      recipientId,
      subject,
      bodyHtml,
      bodyText: htmlToText(bodyHtml),
      fromAddress: SEND_FROM,
      toAddress: recipient.email,
      status: 'sent',
    });

    const finalHtml = injectPixel(bodyHtml, emailId);
    const finalText = htmlToText(bodyHtml); // pixel intentionally omitted from text

    let sendError: string | null = null;
    let messageId: string | null = null;
    try {
      const transporter = getTransporter();
      const info = await transporter.sendMail({
        from: fromHeader,
        to: recipient.email,
        subject,
        html: finalHtml,
        text: finalText,
      });
      messageId = info.messageId || null;
    } catch (err: any) {
      sendError = err.message || String(err);
    }

    if (sendError) {
      await db.update(outreachEmails)
        .set({ status: 'failed', errorMessage: sendError })
        .where(eq(outreachEmails.id, emailId));
      return res.status(500).json({ error: sendError });
    }

    await db.update(outreachEmails)
      .set({ threadId: messageId })
      .where(eq(outreachEmails.id, emailId));

    // Merge the template's tagSlug onto the recipient (idempotent — set
    // semantics) so we can later filter pipeline / compute per-template stats.
    const recipientPatch: Record<string, any> = { updatedAt: new Date() };
    if (template?.tagSlug) {
      const existingTags = Array.isArray(recipient.tags) ? recipient.tags : [];
      if (!existingTags.includes(template.tagSlug)) {
        recipientPatch.tags = [...existingTags, template.tagSlug];
      }
    }
    if (recipient.status === 'todo' || recipient.status === 'queued') {
      recipientPatch.status = 'sent';
    }
    if (Object.keys(recipientPatch).length > 1) {
      await db.update(outreachRecipients)
        .set(recipientPatch)
        .where(eq(outreachRecipients.id, recipientId));
    }

    res.json({ emailId, messageId, pixelUrl: buildPixelUrl(emailId), templateApplied: template?.tagSlug || null });
  } catch (e: any) {
    console.error('[outreach] sendEmail error:', e);
    res.status(500).json({ error: e.message || 'Send failed' });
  }
}

// ========== Admin: aggregate stats ==========
export async function outreachStats(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const stats = await db.execute(sql<any>`
      select
        (select count(*)::int from outreach_recipients) as total_recipients,
        (select count(*)::int from outreach_emails) as total_sent,
        (select count(*)::int from outreach_opens where is_bot = false) as total_opens,
        (select count(distinct recipient_id)::int from outreach_emails e
         where exists (select 1 from outreach_opens o where o.email_id = e.id and o.is_bot = false)) as recipients_opened,
        (select count(*)::int from outreach_recipients where status = 'replied') as recipients_replied,
        (select count(*)::int from outreach_recipients where status = 'positive') as recipients_positive
    `);
    const [row] = (stats as any).rows || stats;
    res.json({ stats: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load stats' });
  }
}

// ========== Templates: CRUD ==========
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function listTemplates(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await db.select().from(outreachTemplates).orderBy(desc(outreachTemplates.updatedAt));
    res.json({ templates: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load templates' });
  }
}

export async function createTemplate(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const subject = String(body.subject || '').trim();
    const bodyHtml = String(body.bodyHtml || '').trim();
    let tagSlug = String(body.tagSlug || '').trim();
    if (!name || !subject || !bodyHtml) {
      return res.status(400).json({ error: 'name, subject, bodyHtml required' });
    }
    if (!tagSlug) tagSlug = slugify(name);
    else tagSlug = slugify(tagSlug);
    if (!tagSlug) return res.status(400).json({ error: 'tagSlug must be non-empty after normalization' });

    const id = randomUUID();
    await db.insert(outreachTemplates).values({
      id,
      name,
      subject,
      bodyHtml,
      tagSlug,
      description: body.description || null,
    });
    const [row] = await db.select().from(outreachTemplates).where(eq(outreachTemplates.id, id));
    res.json({ template: row });
  } catch (e: any) {
    // Likely duplicate tagSlug.
    res.status(500).json({ error: e.message || 'Failed to create template' });
  }
}

export async function updateTemplate(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    const body = req.body || {};
    const patch: Record<string, any> = { updatedAt: new Date() };
    for (const key of ['name', 'subject', 'bodyHtml', 'description'] as const) {
      if (key in body) patch[key] = body[key];
    }
    if ('tagSlug' in body && body.tagSlug) patch.tagSlug = slugify(String(body.tagSlug));
    await db.update(outreachTemplates).set(patch).where(eq(outreachTemplates.id, id));
    const [row] = await db.select().from(outreachTemplates).where(eq(outreachTemplates.id, id));
    res.json({ template: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update template' });
  }
}

export async function deleteTemplate(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    await db.delete(outreachTemplates).where(eq(outreachTemplates.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to delete template' });
  }
}

// ========== Templates: per-template stats ==========
// "Sent" = count of outreach_emails whose recipient currently carries the
// template's tagSlug. "Opened" / "Replied" follow the same join, then count
// distinct recipients in each end-state.
export async function templateStats(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const stats = await db.execute(sql<any>`
      with tagged as (
        select t.id as template_id, t.name, t.tag_slug, r.id as recipient_id, r.status
        from outreach_templates t
        join outreach_recipients r on r.tags ? t.tag_slug
      ),
      sends as (
        select t.tag_slug, count(*)::int as sent_count
        from outreach_templates t
        join outreach_recipients r on r.tags ? t.tag_slug
        join outreach_emails e on e.recipient_id = r.id
        group by t.tag_slug
      ),
      opens as (
        select t.tag_slug, count(distinct r.id)::int as recipients_opened
        from outreach_templates t
        join outreach_recipients r on r.tags ? t.tag_slug
        join outreach_emails e on e.recipient_id = r.id
        join outreach_opens o on o.email_id = e.id
        where o.is_bot = false
        group by t.tag_slug
      )
      select
        t.id, t.name, t.tag_slug, t.subject, t.created_at, t.updated_at,
        coalesce((select count(distinct recipient_id)::int from tagged where template_id = t.id), 0) as recipients_total,
        coalesce((select sent_count from sends where tag_slug = t.tag_slug), 0) as sent_count,
        coalesce((select recipients_opened from opens where tag_slug = t.tag_slug), 0) as recipients_opened,
        coalesce((select count(distinct recipient_id)::int from tagged where template_id = t.id and status = 'replied'), 0) as recipients_replied,
        coalesce((select count(distinct recipient_id)::int from tagged where template_id = t.id and status = 'positive'), 0) as recipients_positive
      from outreach_templates t
      order by t.updated_at desc
    `);
    res.json({ templates: (stats as any).rows || stats });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load template stats' });
  }
}
