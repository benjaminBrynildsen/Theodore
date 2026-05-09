// Open tracking for transactional / announcement emails (Welcome,
// Audiobook Ready, blasts). Mirrors server/outreach.ts pixel handling,
// but writes to transactional_opens instead of outreach_opens and flips
// transactional_emails.firstOpenedAt on the first non-bot open.
//
// Mounted in server/index.ts as:
//   app.get('/te/:uuid.gif', transactionalPixelHandler)
// The route is intentionally public; the pixel UUID is the email id, which
// is unguessable per-recipient.

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { transactionalEmails, transactionalOpens } from './schema.js';

const PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

const FAST_OPEN_MS = 5000;

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

export async function transactionalPixelHandler(req: Request, res: Response) {
  // Headers + body returned FIRST so the mail client never hangs on a slow DB.
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).end(PIXEL_GIF);

  // Strip the .gif suffix (route param includes it). Email IDs are UUIDs.
  const raw = String(req.params.uuid || '').replace(/\.gif$/i, '').toLowerCase();
  if (!/^[0-9a-f-]{8,64}$/i.test(raw)) return;

  try {
    const [email] = await db
      .select()
      .from(transactionalEmails)
      .where(eq(transactionalEmails.id, raw));
    if (!email) return;

    const ip = clientIp(req);
    const ua = (req.headers['user-agent'] as string | undefined) || '';
    const country = clientCountry(req);
    const sentAt = email.sentAt ? new Date(email.sentAt).getTime() : Date.now();
    const msSinceSend = Date.now() - sentAt;

    const senderIp = process.env.SENDER_OPEN_IP || '';
    const senderSelfMatch = !!senderIp && ip === senderIp;

    const cls = classifyOpen({ userAgent: ua, msSinceSend, senderSelfMatch });

    await db.insert(transactionalOpens).values({
      emailId: raw,
      ip: ip || null,
      userAgent: ua || null,
      country,
      isBot: cls.isBot,
      botReason: cls.reason,
      msSinceSend,
    });

    // First non-bot open flips firstOpenedAt — only if not already set, so
    // re-opens don't keep moving the timestamp.
    if (!cls.isBot && !email.firstOpenedAt) {
      await db
        .update(transactionalEmails)
        .set({ firstOpenedAt: new Date() })
        .where(eq(transactionalEmails.id, raw));
    }
  } catch (err) {
    console.error('[transactional] pixel log failed:', err);
  }
}
