// Meta Conversions API (CAPI) — server-side event tracking.
// Sends events directly to Meta's servers, bypassing ad blockers and iOS
// tracking prevention. This catches the ~30-40% of events the browser pixel misses.
//
// Events sent here should match the browser pixel events (with the same
// event_id when possible) so Meta can deduplicate them.

import crypto from 'crypto';

const PIXEL_ID = process.env.META_PIXEL_ID || '1302784575092189';
const CAPI_TOKEN = process.env.META_CAPI_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
const API_VERSION = 'v25.0';
const ENDPOINT = `https://graph.facebook.com/${API_VERSION}/${PIXEL_ID}/events`;

interface UserData {
  email?: string;
  ip?: string;
  userAgent?: string;
  fbc?: string;   // _fbc cookie (click ID)
  fbp?: string;   // _fbp cookie (browser ID)
}

interface EventParams {
  eventName: string;
  eventId?: string;
  sourceUrl?: string;
  userData: UserData;
  customData?: Record<string, unknown>;
}

function hashSha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

function buildUserData(ud: UserData) {
  const data: Record<string, string> = {};
  if (ud.email) data.em = hashSha256(ud.email);
  if (ud.ip) data.client_ip_address = ud.ip;
  if (ud.userAgent) data.client_user_agent = ud.userAgent;
  if (ud.fbc) data.fbc = ud.fbc;
  if (ud.fbp) data.fbp = ud.fbp;
  return data;
}

export async function sendEvent(params: EventParams): Promise<void> {
  if (!CAPI_TOKEN) {
    console.warn('[meta-capi] No access token configured — skipping event:', params.eventName);
    return;
  }

  const event: Record<string, unknown> = {
    event_name: params.eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: buildUserData(params.userData),
  };

  if (params.eventId) event.event_id = params.eventId;
  if (params.sourceUrl) event.event_source_url = params.sourceUrl;
  if (params.customData) event.custom_data = params.customData;

  try {
    const body = JSON.stringify({
      data: [event],
      access_token: CAPI_TOKEN,
    });
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const result = await res.json();
    if (result.error) {
      console.error('[meta-capi] Error:', params.eventName, result.error.message);
    }
  } catch (err) {
    console.error('[meta-capi] Network error:', params.eventName, err);
  }
}

// ── Convenience helpers for specific events ──

export function trackRegistration(req: { ip?: string; headers: Record<string, string | string[] | undefined>; body?: { email?: string } }) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const ua = (req.headers['user-agent'] as string) || '';
  const email = req.body?.email || '';
  sendEvent({
    eventName: 'CompleteRegistration',
    eventId: `reg_${Date.now()}`,
    userData: { email, ip, userAgent: ua },
    customData: { status: true },
  });
}

export function trackSubscription(req: { ip?: string; headers: Record<string, string | string[] | undefined> }, email: string, value: number, currency = 'USD') {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const ua = (req.headers['user-agent'] as string) || '';
  sendEvent({
    eventName: 'Subscribe',
    eventId: `sub_${Date.now()}`,
    userData: { email, ip, userAgent: ua },
    customData: { value, currency },
  });
  sendEvent({
    eventName: 'Purchase',
    eventId: `pur_${Date.now()}`,
    userData: { email, ip, userAgent: ua },
    customData: { value, currency },
  });
}

export function trackCheckoutInitiated(req: { ip?: string; headers: Record<string, string | string[] | undefined> }, email: string) {
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
  const ua = (req.headers['user-agent'] as string) || '';
  sendEvent({
    eventName: 'InitiateCheckout',
    eventId: `chk_${Date.now()}`,
    userData: { email, ip, userAgent: ua },
  });
}
