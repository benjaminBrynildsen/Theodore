import { db } from './db.js';
import { pushTokens } from './schema.js';
import { inArray } from 'drizzle-orm';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, any>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

export interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface PushSendResult {
  sent: number;
  pruned: number;
  tickets: Array<{ token: string; status: 'ok' | 'error'; id?: string; message?: string; errorCode?: string }>;
}

/**
 * Sends an Expo push to an explicit set of tokens. Batches into Expo's 100-message
 * chunks and prunes tokens that come back as DeviceNotRegistered. Returns per-token
 * tickets so callers (e.g. the admin push tab) can show what landed and what didn't.
 */
export async function sendPushToTokens(
  tokens: string[],
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<PushSendResult> {
  const unique = Array.from(new Set(tokens.filter(Boolean)));
  if (unique.length === 0) return { sent: 0, pruned: 0, tickets: [] };

  const messages: ExpoPushMessage[] = unique.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    sound: 'default',
    channelId: 'default',
  }));

  let sent = 0;
  const dead: string[] = [];
  const tickets: PushSendResult['tickets'] = [];

  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'content-type': 'application/json',
        },
        body: JSON.stringify(batch),
      });
      const j = (await r.json()) as { data?: ExpoPushTicket[] };
      const responseTickets = j.data || [];
      responseTickets.forEach((t, idx) => {
        const token = batch[idx].to;
        if (t.status === 'ok') {
          sent += 1;
          tickets.push({ token, status: 'ok', id: t.id });
        } else {
          const errorCode = t.details?.error;
          tickets.push({ token, status: 'error', message: t.message, errorCode });
          if (errorCode === 'DeviceNotRegistered') dead.push(token);
        }
      });
    } catch (e: any) {
      console.error('[push/send] batch failed:', e?.message || e);
      batch.forEach((m) => tickets.push({ token: m.to, status: 'error', message: e?.message || 'fetch failed' }));
    }
  }

  let pruned = 0;
  if (dead.length) {
    try {
      await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
      pruned = dead.length;
    } catch (e: any) {
      console.error('[push/prune] failed:', e?.message || e);
    }
  }

  return { sent, pruned, tickets };
}

/**
 * Sends an Expo push to one or more user IDs. Looks up every registered token for
 * those users and dispatches via {@link sendPushToTokens}.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<PushSendResult> {
  if (userIds.length === 0) return { sent: 0, pruned: 0, tickets: [] };
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  const tokens = rows.map((r) => r.token).filter(Boolean);
  return sendPushToTokens(tokens, payload);
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, any> }
) {
  return sendPushToUsers([userId], payload);
}
