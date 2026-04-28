import { db } from './db.js';
import { pushTokens } from './schema.js';
import { eq, inArray } from 'drizzle-orm';

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

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Sends an Expo push notification to one or more user IDs. Looks up every
 * registered token for those users, batches into Expo's 100-message chunks,
 * and prunes tokens that come back as DeviceNotRegistered so dead devices
 * don't pile up.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: { title: string; body: string; data?: Record<string, any> }
): Promise<{ sent: number; pruned: number }> {
  if (userIds.length === 0) return { sent: 0, pruned: 0 };
  const rows = await db
    .select({ token: pushTokens.token })
    .from(pushTokens)
    .where(inArray(pushTokens.userId, userIds));
  const tokens = rows.map((r) => r.token).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, pruned: 0 };

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    sound: 'default',
    channelId: 'default',
  }));

  let sent = 0;
  let pruned = 0;
  const dead: string[] = [];

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
      const tickets = j.data || [];
      tickets.forEach((t, idx) => {
        if (t.status === 'ok') {
          sent += 1;
        } else if (t.details?.error === 'DeviceNotRegistered') {
          dead.push(batch[idx].to);
        }
      });
    } catch (e: any) {
      console.error('[push/send] batch failed:', e?.message || e);
    }
  }

  if (dead.length) {
    try {
      await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
      pruned = dead.length;
    } catch (e: any) {
      console.error('[push/prune] failed:', e?.message || e);
    }
  }

  return { sent, pruned };
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; data?: Record<string, any> }
) {
  return sendPushToUsers([userId], payload);
}
