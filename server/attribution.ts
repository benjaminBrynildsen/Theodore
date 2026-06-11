// Ad attribution cookie — when a visitor lands with utm_* params or an ad
// click id (twclid/fbclid/gclid/...), middleware stamps an HttpOnly cookie.
// At signup, the auth endpoints read the cookie and stamp the utm/ad columns
// on the users row so the admin Conversions tab can show which campaign each
// signup came from. Last-touch: a newer tagged visit overwrites the cookie,
// matching how X/Meta ad dashboards attribute conversions.

import type { Request, Response, NextFunction } from 'express';

const ATTRIB_COOKIE = 'theodore_attrib';
const ATTRIB_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export interface AttributionPayload {
  src?: string;   // utm_source
  med?: string;   // utm_medium
  cam?: string;   // utm_campaign
  con?: string;   // utm_content
  ter?: string;   // utm_term
  plat?: string;  // ad platform derived from click id (x, meta, google, ...)
  cid?: string;   // raw click id (twclid/fbclid/gclid/msclkid/ttclid)
  path?: string;  // landing path
  ts: number;     // ms epoch when captured
}

// Same click-id → platform mapping as server/ad-clicks.ts detectSource().
const CLICK_ID_PARAMS: Array<[param: string, platform: string]> = [
  ['twclid', 'x'],
  ['fbclid', 'meta'],
  ['gclid', 'google'],
  ['msclkid', 'microsoft'],
  ['ttclid', 'tiktok'],
];

function platformFromUtmSource(utmSource: string): string | undefined {
  const s = utmSource.toLowerCase();
  if (s.includes('facebook') || s.includes('meta') || s.includes('instagram')) return 'meta';
  if (s.includes('twitter') || s === 'x') return 'x';
  if (s.includes('google')) return 'google';
  if (s.includes('tiktok')) return 'tiktok';
  return undefined;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (!rawKey) continue;
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.join('=') || '');
    } catch {
      // Malformed percent-encoding — skip this cookie rather than throw.
    }
  }
  return out;
}

function cookieHeader(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production';
  const attrs = [
    `${ATTRIB_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

function appendSetCookie(res: Response, value: string) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) { res.setHeader('Set-Cookie', value); return; }
  if (Array.isArray(existing)) { res.setHeader('Set-Cookie', [...existing.map(String), value]); return; }
  res.setHeader('Set-Cookie', [String(existing), value]);
}

export function readAttribution(req: Request): AttributionPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[ATTRIB_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) return null;
    if (!Number.isFinite(parsed.ts)) return null;
    const str = (v: unknown, max: number) =>
      typeof v === 'string' && v ? v.slice(0, max) : undefined;
    return {
      src: str(parsed.src, 128),
      med: str(parsed.med, 128),
      cam: str(parsed.cam, 200),
      con: str(parsed.con, 200),
      ter: str(parsed.ter, 200),
      plat: str(parsed.plat, 50),
      cid: str(parsed.cid, 300),
      path: str(parsed.path, 200),
      ts: Number(parsed.ts),
    };
  } catch {
    return null;
  }
}

export function clearAttribution(res: Response): void {
  appendSetCookie(res, cookieHeader('', 0));
}

// Middleware — runs on top-level HTML navigations (registered next to the
// pageview middleware). Writes the cookie only when the URL actually carries
// attribution params, so untagged traffic adds zero overhead.
export function attributionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method !== 'GET') return next();
    const q = (req.query || {}) as Record<string, string | undefined>;

    let clickId: string | undefined;
    let platform: string | undefined;
    for (const [param, plat] of CLICK_ID_PARAMS) {
      if (q[param]) { clickId = String(q[param]).slice(0, 300); platform = plat; break; }
    }
    const utmSource = q.utm_source ? String(q.utm_source).slice(0, 128) : undefined;
    if (!clickId && !utmSource) return next();
    if (!platform && utmSource) platform = platformFromUtmSource(utmSource);

    const payload: AttributionPayload = {
      src: utmSource,
      med: q.utm_medium ? String(q.utm_medium).slice(0, 128) : undefined,
      cam: q.utm_campaign ? String(q.utm_campaign).slice(0, 200) : undefined,
      con: q.utm_content ? String(q.utm_content).slice(0, 200) : undefined,
      ter: q.utm_term ? String(q.utm_term).slice(0, 200) : undefined,
      plat: platform,
      cid: clickId,
      path: (req.path || '/').slice(0, 200),
      ts: Date.now(),
    };
    // Strip undefined keys so the cookie stays compact.
    const compact = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
    const value = JSON.stringify(compact);
    if (value.length <= 1536) appendSetCookie(res, cookieHeader(value, ATTRIB_TTL_SECONDS));
  } catch (err) {
    // Never let attribution tracking break a page render.
    console.warn('[attribution] middleware error:', (err as Error)?.message);
  }
  return next();
}

/**
 * Map a read cookie payload onto the users-table column values for insert.
 * Returns {} when there's no attribution so untagged signups never reference
 * the utm columns at all — if the pre-deploy db:push were ever skipped
 * (it runs with `|| true`), regular signups keep working.
 */
export function attributionColumns(attrib: AttributionPayload | null) {
  if (!attrib) return {};
  return {
    utmSource: attrib.src || null,
    utmMedium: attrib.med || null,
    utmCampaign: attrib.cam || null,
    utmContent: attrib.con || null,
    utmTerm: attrib.ter || null,
    adPlatform: attrib.plat || null,
    adClickId: attrib.cid || null,
  };
}
