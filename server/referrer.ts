// Referrer cookie — when a guest lands on /library/b/:slug?ref=<userId>,
// the client calls /api/referrer/capture which sets this HttpOnly cookie.
// At signup, /api/auth/register and /api/auth/google read the cookie and
// stamp users.referredByUserId so we can attribute conversions back to the
// original sharer. Cookie is cleared on successful claim.

import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { users } from './schema.js';

const REFERRER_COOKIE = 'theodore_referrer';
const REFERRER_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days

export interface ReferrerPayload {
  ref: string;       // sharer's user id
  slug: string;      // book slug they landed on
  ts: number;        // ms epoch when captured
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (!rawKey) continue;
    out[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.join('=') || '');
  }
  return out;
}

function cookieHeader(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production';
  const attrs = [
    `${REFERRER_COOKIE}=${encodeURIComponent(value)}`,
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

export function readReferrer(req: Request): ReferrerPayload | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[REFERRER_COOKIE];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || !parsed) return null;
    const ref = typeof parsed.ref === 'string' ? parsed.ref : null;
    const slug = typeof parsed.slug === 'string' ? parsed.slug : null;
    const ts = Number.isFinite(parsed.ts) ? Number(parsed.ts) : null;
    if (!ref || !slug || !ts) return null;
    // Sanity bounds
    if (ref.length > 200 || slug.length > 200) return null;
    return { ref, slug, ts };
  } catch {
    return null;
  }
}

export function writeReferrer(res: Response, payload: ReferrerPayload): void {
  const value = JSON.stringify(payload);
  // Guard against absurdly large cookie payloads
  if (value.length > 1024) return;
  appendSetCookie(res, cookieHeader(value, REFERRER_TTL_SECONDS));
}

export function clearReferrer(res: Response): void {
  appendSetCookie(res, cookieHeader('', 0));
}

/**
 * Validate that the ref is a real user id we recognize. We intentionally do NOT
 * leak existence info to the caller — endpoints respond ok either way, but if
 * the ref is bogus we just don't write the cookie.
 */
export async function refResolvesToRealUser(ref: string): Promise<boolean> {
  if (!ref || typeof ref !== 'string' || ref.length > 200) return false;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.id, ref)).limit(1);
  return !!row;
}
