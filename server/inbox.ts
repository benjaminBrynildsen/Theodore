// IMAP reply poller for the cold-outreach pipeline.
//
// Connects to Gmail over IMAPS every POLL_MS, scans UNSEEN messages in INBOX,
// and persists any that look like replies to outreach we've sent. Two match
// paths:
//   1. From: header matches a known outreach_recipient.email → that recipient.
//   2. In-Reply-To / References match outreach_emails.threadId (the RFC2822
//      Message-ID we stored on send) → that email's recipient.
//
// We intentionally do NOT mark unrelated UNSEEN as Seen — only matched replies.
// That way Ben's normal inbox is untouched. Matched replies are flagged Seen
// so they don't keep getting re-pulled, and we set the recipient's status to
// 'replied' (only if currently 'sent' or 'opened' — won't trample 'positive').
//
// Dedup: outreach_replies.gmail_message_id is unique. ON CONFLICT DO NOTHING.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { randomUUID } from 'crypto';
import { db } from './db.js';
import { outreachRecipients, outreachEmails, outreachReplies } from './schema.js';
import { sql, eq, and, or, inArray } from 'drizzle-orm';

const POLL_MS = Number(process.env.IMAP_POLL_MS) || 90_000;
const IMAP_HOST = process.env.IMAP_HOST || 'imap.gmail.com';
const IMAP_PORT = Number(process.env.IMAP_PORT) || 993;

function imapCreds(): { user: string; pass: string } | null {
  const user = process.env.IMAP_USER || process.env.GMAIL_USER || process.env.OUTREACH_FROM;
  const pass = process.env.IMAP_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, pass };
}

function stripBrackets(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim().replace(/^<+|>+$/g, '');
}

function snippetOf(text: string | null | undefined, max = 280): string {
  if (!text) return '';
  const cleaned = text
    .replace(/^>.*$/gm, '')           // drop quoted lines (replies to ours)
    .replace(/On .*wrote:$/gim, '')   // drop "On X, Y wrote:" header
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? cleaned.slice(0, max) + '…' : cleaned;
}

let _polling = false;
let _timer: NodeJS.Timeout | null = null;

export async function pollOnce(opts: { verbose?: boolean } = {}): Promise<{
  scanned: number;
  matched: number;
  inserted: number;
}> {
  const creds = imapCreds();
  if (!creds) {
    if (opts.verbose) console.warn('[inbox] no IMAP creds configured, skipping poll');
    return { scanned: 0, matched: 0, inserted: 0 };
  }
  if (_polling) {
    if (opts.verbose) console.log('[inbox] already polling, skipping');
    return { scanned: 0, matched: 0, inserted: 0 };
  }
  _polling = true;

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: creds.user, pass: creds.pass },
    logger: false,
  });

  let scanned = 0;
  let matched = 0;
  let inserted = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Pull recipients into memory once — small set, cheap.
      const recipients = await db
        .select({ id: outreachRecipients.id, email: outreachRecipients.email })
        .from(outreachRecipients);
      const recipMap = new Map<string, string>();
      for (const r of recipients) recipMap.set(r.email.toLowerCase(), r.id);
      if (recipMap.size === 0) {
        return { scanned: 0, matched: 0, inserted: 0 };
      }

      // Search for unseen messages from any of our recipients. Gmail's IMAP
      // accepts an OR-tree of FROM clauses; imapflow builds that automatically
      // when given { from: 'a@b' } repeated via { or: [...] }.
      const orClauses = Array.from(recipMap.keys()).map((addr) => ({ from: addr }));
      const searchCriteria: any = orClauses.length === 1
        ? { seen: false, ...orClauses[0] }
        : { seen: false, or: orClauses };

      const uids: number[] = (await client.search(searchCriteria, { uid: true })) || [];
      scanned = uids.length;

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(
            String(uid),
            { source: true, envelope: true, internalDate: true, uid: true },
            { uid: true },
          );
          if (!msg || !msg.source) continue;

          const parsed = await simpleParser(msg.source as Buffer);

          const fromObj = (Array.isArray(parsed.from?.value) && parsed.from!.value[0]) || null;
          const fromAddrRaw = (fromObj?.address || '').toLowerCase();
          const fromName = fromObj?.name || null;
          const subject = parsed.subject || '';
          const messageId = stripBrackets(parsed.messageId);
          const inReplyTo = stripBrackets(parsed.inReplyTo);

          let refList: string[] = [];
          if (parsed.references) {
            refList = Array.isArray(parsed.references) ? parsed.references : [parsed.references];
            refList = refList.map(stripBrackets).filter(Boolean);
          }

          // Try path 1: sender is a known recipient.
          let recipientId: string | null = recipMap.get(fromAddrRaw) || null;

          // Try path 2: In-Reply-To / References match an outreach we sent.
          let emailId: string | null = null;
          const candidateMids = [inReplyTo, ...refList].filter(Boolean);
          if (candidateMids.length > 0) {
            // threadId on outreach_emails was stored as `info.messageId` from
            // nodemailer (with angle brackets); we strip on both sides for match.
            const stripped = candidateMids.map((m) => `<${m}>`);
            const allCands = Array.from(new Set([...candidateMids, ...stripped]));
            const matches = await db
              .select({ id: outreachEmails.id, recipientId: outreachEmails.recipientId, threadId: outreachEmails.threadId })
              .from(outreachEmails)
              .where(inArray(outreachEmails.threadId, allCands));
            if (matches.length > 0) {
              emailId = matches[0].id;
              if (!recipientId) recipientId = matches[0].recipientId;
            }
          }

          if (!recipientId) continue; // not an outreach reply — skip without marking seen
          matched++;

          const bodyText: string = parsed.text || '';
          const bodyHtml: string | null = (parsed.html as string) || null;

          // Insert (idempotent on gmail_message_id). If the row already exists
          // (e.g. earlier poll), the conflict clause swallows it.
          const insertResult = await db
            .insert(outreachReplies)
            .values({
              id: randomUUID(),
              recipientId,
              emailId,
              gmailMessageId: messageId || null,
              gmailUid: Number(uid) || null,
              fromAddress: fromAddrRaw || null,
              fromName,
              subject,
              snippet: snippetOf(bodyText),
              bodyText,
              bodyHtml,
              isRead: false,
              receivedAt: parsed.date ? new Date(parsed.date) : (msg.internalDate ? new Date(msg.internalDate) : new Date()),
            })
            .onConflictDoNothing({ target: outreachReplies.gmailMessageId })
            .returning({ id: outreachReplies.id });

          if (insertResult.length > 0) inserted++;

          // Bump recipient status to 'replied' only when the prior state was
          // 'sent' or 'opened' — don't overwrite manual 'positive'/'negative'.
          await db
            .update(outreachRecipients)
            .set({ status: 'replied', updatedAt: new Date() })
            .where(
              and(
                eq(outreachRecipients.id, recipientId),
                or(
                  eq(outreachRecipients.status, 'sent'),
                  eq(outreachRecipients.status, 'opened'),
                  eq(outreachRecipients.status, 'todo'),
                  eq(outreachRecipients.status, 'queued'),
                ),
              ),
            );

          // Mark the IMAP message as Seen so we don't reprocess on next poll.
          // Failures here are non-fatal — the gmail_message_id unique constraint
          // also prevents re-insertion.
          try {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          } catch (e) {
            console.warn('[inbox] could not flag uid', uid, 'as seen:', e);
          }
        } catch (e) {
          console.warn('[inbox] message process error (uid', uid, '):', e);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err: any) {
    console.error('[inbox] poll failed:', err?.message || err);
  } finally {
    try { await client.logout(); } catch {}
    _polling = false;
  }

  if (opts.verbose || matched > 0) {
    console.log(`[inbox] scanned=${scanned} matched=${matched} inserted=${inserted}`);
  }
  return { scanned, matched, inserted };
}

export function startInboxPoller(): void {
  const creds = imapCreds();
  if (!creds) {
    console.log('[inbox] IMAP_USER / IMAP_APP_PASSWORD (or GMAIL_USER / GMAIL_APP_PASSWORD) not set — reply polling disabled');
    return;
  }
  console.log(`[inbox] reply poller started (every ${Math.round(POLL_MS / 1000)}s)`);
  // Kick off one immediate scan, then schedule.
  void pollOnce().catch(() => {});
  _timer = setInterval(() => { void pollOnce().catch(() => {}); }, POLL_MS);
}

export function stopInboxPoller(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

// ============== Admin endpoints ==============
import type { Request, Response } from 'express';
import { requireAdmin } from './admin.js';
import { desc } from 'drizzle-orm';

export async function listReplies(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await db
      .select()
      .from(outreachReplies)
      .orderBy(desc(outreachReplies.receivedAt))
      .limit(limit);

    // Attach recipient name/email for the listing UI.
    const ids = Array.from(new Set(rows.map((r) => r.recipientId).filter(Boolean))) as string[];
    const recips = ids.length
      ? await db.select().from(outreachRecipients).where(inArray(outreachRecipients.id, ids))
      : [];
    const rmap = new Map(recips.map((r) => [r.id, r]));

    const enriched = rows.map((r) => ({
      ...r,
      recipient: r.recipientId ? rmap.get(r.recipientId) || null : null,
    }));
    res.json({ replies: enriched });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load replies' });
  }
}

export async function recipientReplies(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    const rows = await db
      .select()
      .from(outreachReplies)
      .where(eq(outreachReplies.recipientId, id))
      .orderBy(desc(outreachReplies.receivedAt));
    res.json({ replies: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load replies' });
  }
}

export async function markReplyRead(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = String(req.params.id);
    const isRead = req.body?.isRead !== false;
    await db.update(outreachReplies).set({ isRead }).where(eq(outreachReplies.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to update reply' });
  }
}

export async function pollNow(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const result = await pollOnce({ verbose: true });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Poll failed' });
  }
}

export async function unreadReplyCount(_req: Request, res: Response) {
  if (!(await requireAdmin(_req, res))) return;
  try {
    const r = await db.execute(sql<any>`select count(*)::int as c from outreach_replies where is_read = false`);
    const row = (r as any).rows?.[0] || (r as any)[0] || { c: 0 };
    res.json({ unread: Number(row.c || 0) });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed to load unread count' });
  }
}
