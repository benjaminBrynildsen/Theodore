import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { sessions, users } from './schema.js';
import { FREE_TIER_CREDITS, FREE_TIER_RESET_INTERVAL_MS, FOUNDING_CREDITS, FOUNDING_MONTHS } from './billing.js';

const SESSION_COOKIE = 'theodore_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const HANDOFF_TTL_MS = 1000 * 60 * 5; // 5 minutes

type DbUser = typeof users.$inferSelect;
type DbSession = typeof sessions.$inferSelect;

export interface AuthContext {
  user: DbUser;
  session: DbSession;
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const parsed: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawVal] = part.trim().split('=');
    if (!rawKey) continue;
    parsed[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.join('=') || '');
  }
  return parsed;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionCookieHeader(token: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production';
  const attrs = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// Append rather than overwrite — signup endpoints clear the attribution and
// referrer cookies on the same response, and a plain setHeader would stomp
// those Set-Cookie headers (which silently broke clearReferrer for months).
function appendSetCookie(res: Response, value: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) { res.setHeader('Set-Cookie', value); return; }
  if (Array.isArray(existing)) { res.setHeader('Set-Cookie', [...existing.map(String), value]); return; }
  res.setHeader('Set-Cookie', [String(existing), value]);
}

export function setSessionCookie(res: Response, token: string): void {
  appendSetCookie(res, sessionCookieHeader(token, Math.floor(SESSION_TTL_MS / 1000)));
}

export function clearSessionCookie(res: Response): void {
  appendSetCookie(res, sessionCookieHeader('', 0));
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = String(storedHash || '').split(':');
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(actual, expected);
}

export function toSafeUser(user: DbUser) {
  const normalizedPlan = user.plan === 'byok' ? 'free' : user.plan;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    plan: normalizedPlan,
    creditsRemaining: user.creditsRemaining,
    creditsTotal: user.creditsTotal,
    lastCreditResetAt: user.lastCreditResetAt,
    stripeCustomerId: user.stripeCustomerId,
    stripeSubscriptionId: user.stripeSubscriptionId,
    stripeSubscriptionStatus: user.stripeSubscriptionStatus,
    stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd,
    stripeCancelAtPeriodEnd: user.stripeCancelAtPeriodEnd,
    stripePriceTier: user.stripePriceTier,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    emailVerifiedAt: user.emailVerifiedAt,
    // One-shot in-app notice. Admin sets this via /api/admin/set-pending-notice
    // and the mobile/web client clears it via /api/users/me/dismiss-notice.
    pendingNotice: ((user.settings as any)?.pendingNotice as
      | { title: string; body: string; ctaText?: string; ctaPath?: string; setAt?: string }
      | undefined) ?? null,
    iosLaunchSeen: Boolean((user.settings as any)?.iosLaunchSeen),
    iosLaunchOptInAt: ((user.settings as any)?.iosLaunchOptInAt as string | undefined) ?? null,
    appStoreLaunchSeen: Boolean((user.settings as any)?.appStoreLaunchSeen),
    emailOptOut: ((user.settings as any)?.emailOptOut as Record<string, boolean> | undefined) ?? {},
    // Founding lifecycle — lets the client show a "your access ended, rejoin"
    // wall when status flips to 'expired'.
    foundingStatus: user.foundingStatus ?? null,
    foundingExpiresAt: user.foundingExpiresAt ?? null,
  };
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

// Founding users pay once for 3 months of Author access — there's no recurring
// invoice, so the monthly credit refill and the final expiry are applied lazily
// here on every auth resolve (same pattern as maybeResetFreeCredits, no cron).
async function maybeRefreshFounding(user: DbUser): Promise<DbUser> {
  if (user.foundingStatus !== 'active') return user;
  const now = new Date();

  // Expiry: 3 months elapsed → lock to 'expired' (NOT free — free signup is
  // killed). Credit gates (creditsRemaining <= 0) then block generation while
  // the user keeps read access to their library.
  if (user.foundingExpiresAt && now >= user.foundingExpiresAt) {
    const patch = { foundingStatus: 'expired', plan: 'expired', creditsRemaining: 0, creditsTotal: 0, updatedAt: now };
    await db.update(users).set(patch).where(eq(users.id, user.id));
    return { ...user, ...patch };
  }

  // Monthly refill: advance through every elapsed window in one pass so a
  // dormant user who skips a month still catches up on next visit. Capped at
  // FOUNDING_MONTHS grants total (month 1 was granted at purchase).
  let periodEnd = user.foundingPeriodEnd;
  let periodsUsed = user.foundingPeriodsUsed ?? 0;
  let credits = user.creditsRemaining ?? 0;
  let changed = false;
  while (periodEnd && now >= periodEnd && periodsUsed < FOUNDING_MONTHS) {
    credits = Math.max(FOUNDING_CREDITS, credits); // preserve any unspent balance
    periodEnd = addMonths(periodEnd, 1);
    periodsUsed += 1;
    changed = true;
  }
  if (!changed) return user;
  const patch = {
    creditsRemaining: credits,
    creditsTotal: FOUNDING_CREDITS,
    foundingPeriodEnd: periodEnd,
    foundingPeriodsUsed: periodsUsed,
    lastCreditResetAt: now,
    updatedAt: now,
  };
  await db.update(users).set(patch).where(eq(users.id, user.id));
  return { ...user, ...patch };
}

// Free users get FREE_TIER_CREDITS refreshed on a rolling 30-day window, no
// rollover. The check is lazy (runs on each auth resolve) — no cron needed.
// First time this runs for any pre-existing user (lastCreditResetAt=null) we
// always grant, so legacy 100-credit accounts pick up the new 1000 allowance
// on their next request without needing a one-time backfill.
async function maybeResetFreeCredits(user: DbUser): Promise<DbUser> {
  if (user.plan !== 'free' && user.plan !== 'byok') return user;
  const now = new Date();
  const last = user.lastCreditResetAt;
  const shouldReset = !last || (now.getTime() - last.getTime()) >= FREE_TIER_RESET_INTERVAL_MS;
  if (!shouldReset) return user;
  // One-time boost credits live in creditsRemaining. Preserve any unspent
  // balance above the monthly allotment so a paid top-up survives the refill
  // (refill tops UP to the allotment; it never lowers a boosted balance).
  const refilled = Math.max(FREE_TIER_CREDITS, user.creditsRemaining ?? 0);
  await db.update(users).set({
    creditsRemaining: refilled,
    creditsTotal: FREE_TIER_CREDITS,
    lastCreditResetAt: now,
    updatedAt: now,
  }).where(eq(users.id, user.id));
  return { ...user, creditsRemaining: refilled, creditsTotal: FREE_TIER_CREDITS, lastCreditResetAt: now, updatedAt: now };
}

export async function createSession(userId: string, req: Request, res: Response): Promise<string> {
  const rawToken = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const ipAddress = req.ip || req.socket?.remoteAddress || null;
  const userAgent = req.get('user-agent') || null;

  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash,
    ipAddress,
    userAgent,
    expiresAt,
    lastUsedAt: new Date(),
  });
  setSessionCookie(res, rawToken);
  // Also return token in header for mobile clients (React Native can't use HttpOnly cookies)
  res.setHeader('X-Session-Token', rawToken);
  return rawToken;
}

/**
 * Mints a short-lived (5 min) session token used to hand off authentication
 * from the mobile app to the web. The mobile app sends the user to
 * /handoff?t=<token>, the redeem endpoint rotates this into a full-length
 * cookie session and deletes the handoff row.
 */
export async function createHandoffToken(userId: string): Promise<string> {
  const rawToken = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash,
    ipAddress: null,
    userAgent: 'handoff',
    expiresAt,
    lastUsedAt: new Date(),
  });
  return rawToken;
}

export async function consumeHandoffToken(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
  if (!session) return null;
  await db.delete(sessions).where(eq(sessions.id, session.id));
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session.userId;
}

async function resolveAuthContext(req: Request): Promise<AuthContext | null> {
  const cookies = parseCookies(req.headers.cookie);
  let rawToken = cookies[SESSION_COOKIE];
  // Also support Bearer token auth for mobile clients
  if (!rawToken) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7);
    }
  }
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);

  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }

  const [rawUser] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!rawUser) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  let user = await maybeResetFreeCredits(rawUser);
  user = await maybeRefreshFounding(user);

  void db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, session.id));
  return { user, session };
}

export async function getAuth(req: Request): Promise<AuthContext | null> {
  return resolveAuthContext(req);
}

export async function requireAuth(req: Request, res: Response): Promise<AuthContext | null> {
  const auth = await resolveAuthContext(req);
  if (!auth) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return auth;
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const rawToken = cookies[SESSION_COOKIE];
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
  }
  clearSessionCookie(res);
}

export async function clearAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const normalized = normalizeEmail(email);
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  return user || null;
}

export async function getUserByResetToken(resetToken: string): Promise<DbUser | null> {
  const tokenHash = hashToken(resetToken);
  const [user] = await db.select().from(users).where(eq(users.passwordResetTokenHash, tokenHash));
  return user || null;
}

export async function setResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
  await db.update(users).set({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: expiresAt,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
  return token;
}

export async function clearResetToken(userId: string): Promise<void> {
  await db.update(users).set({
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
}
