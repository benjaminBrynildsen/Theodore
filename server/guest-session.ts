// Guest-session: an opaque HttpOnly cookie that lets us back up an unauth
// visitor's in-progress work server-side so it survives signup even if
// their browser localStorage doesn't (different device, incognito, cache
// cleared, long delay). The cookie is set lazily by `ensureGuestSessionId`
// — we only mint one when there's actually something to persist.

import type { Request, Response } from 'express';
import { createHash, randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from './db.js';
import { guestBackups, projects as projectsTable, chapters as chaptersTable, canonEntries as canonTable } from './schema.js';

const GUEST_COOKIE = 'theodore_guest';
const GUEST_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2 MB hard cap per guest

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

function guestCookieHeader(value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production';
  const attrs = [
    `${GUEST_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// Append a Set-Cookie header without clobbering other cookies on the response
// (e.g. the session cookie set during auth). Express's res.setHeader replaces;
// we merge into an array instead.
function appendSetCookie(res: Response, value: string) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) { res.setHeader('Set-Cookie', value); return; }
  if (Array.isArray(existing)) { res.setHeader('Set-Cookie', [...existing.map(String), value]); return; }
  res.setHeader('Set-Cookie', [String(existing), value]);
}

export function readGuestSessionId(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[GUEST_COOKIE];
  if (!raw) return null;
  // Sanity check — opaque token, hex/base64url of reasonable length.
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(raw)) return null;
  return raw;
}

export function ensureGuestSessionId(req: Request, res: Response): string {
  const existing = readGuestSessionId(req);
  if (existing) return existing;
  const id = randomBytes(24).toString('base64url');
  appendSetCookie(res, guestCookieHeader(id, GUEST_TTL_SECONDS));
  return id;
}

export function clearGuestSessionCookie(res: Response): void {
  appendSetCookie(res, guestCookieHeader('', 0));
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip + (process.env.IP_HASH_SALT || 'theodore-default-salt')).digest('hex').slice(0, 16);
}

// Shape the client sends us. Intentionally permissive — we store it as JSON
// and only re-validate individual fields at claim time.
export interface GuestBackupPayload {
  projects?: any[];
  chapters?: any[];
  canonEntries?: any[];
  activeProjectId?: string | null;
  [k: string]: any;
}

export async function upsertGuestBackup(
  guestSessionId: string,
  payload: GuestBackupPayload,
  opts: { ipHash?: string | null; userAgent?: string | null; sizeBytes: number }
): Promise<void> {
  const now = new Date();
  // Postgres upsert — one row per guest session. Re-opening the browser in a
  // different tab should just overwrite the previous snapshot, not append.
  await db.insert(guestBackups).values({
    guestSessionId,
    data: payload,
    ipHash: opts.ipHash ?? null,
    userAgent: (opts.userAgent || '').slice(0, 500) || null,
    sizeBytes: opts.sizeBytes,
    claimedByUserId: null,
    claimedAt: null,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: guestBackups.guestSessionId,
    set: {
      data: payload,
      ipHash: opts.ipHash ?? null,
      userAgent: (opts.userAgent || '').slice(0, 500) || null,
      sizeBytes: opts.sizeBytes,
      // Intentionally do NOT touch claimedAt/claimedByUserId here: if this
      // row was already claimed, we don't want a late write to un-claim it.
      updatedAt: now,
    },
  });
}

export function estimatePayloadBytes(payload: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(payload), 'utf8'); } catch { return 0; }
}

export { MAX_PAYLOAD_BYTES };

// Claim any unclaimed guest backup associated with the current request and
// materialize its projects/chapters/canon under the given userId. Runs inside
// a transaction so a partial failure doesn't leave half-migrated state.
//
// Safety rails:
//   - Idempotent: if the backup is already claimed, does nothing.
//   - Regenerates project/chapter/canon ids server-side to avoid collisions
//     with rows another user might already have.
//   - Skips entries that reference unknown project ids (orphans).
//   - Swallows-then-reports per-row errors so one bad chapter can't abort the
//     whole claim; the response carries counts so the caller can surface them.
export async function claimGuestBackupForUser(
  req: Request,
  res: Response,
  userId: string
): Promise<{ claimed: boolean; projects: number; chapters: number; canon: number; errors: number }> {
  const guestSessionId = readGuestSessionId(req);
  const empty = { claimed: false, projects: 0, chapters: 0, canon: 0, errors: 0 };
  if (!guestSessionId) return empty;

  // Always try to clear the cookie from this point on — whether we found
  // anything or not, this guest session is now "used".
  clearGuestSessionCookie(res);

  const [row] = await db.select().from(guestBackups).where(eq(guestBackups.guestSessionId, guestSessionId));
  if (!row) return empty;
  if (row.claimedAt) return empty; // already claimed by a prior signup — no-op

  const payload = (row.data || {}) as GuestBackupPayload;
  const guestProjects = Array.isArray(payload.projects) ? payload.projects : [];
  const guestChapters = Array.isArray(payload.chapters) ? payload.chapters : [];
  const guestCanon = Array.isArray(payload.canonEntries) ? payload.canonEntries : [];

  if (guestProjects.length === 0 && guestChapters.length === 0 && guestCanon.length === 0) {
    // Mark claimed anyway so we don't retry a no-op row on every subsequent login.
    await db.update(guestBackups)
      .set({ claimedByUserId: userId, claimedAt: new Date() })
      .where(eq(guestBackups.guestSessionId, guestSessionId));
    return empty;
  }

  const { randomUUID } = await import('crypto');
  // Map old (client-side) project id → new server id so we can remap chapter/canon pointers.
  const projectIdMap = new Map<string, string>();
  let projectCount = 0;
  let chapterCount = 0;
  let canonCount = 0;
  let errorCount = 0;

  for (const p of guestProjects) {
    try {
      if (!p || typeof p !== 'object') { errorCount++; continue; }
      const oldId = String(p.id || '');
      const newId = randomUUID();
      const now = new Date();
      await db.insert(projectsTable).values({
        id: newId,
        userId,
        title: String(p.title || 'Untitled').slice(0, 500),
        type: String(p.type || 'book'),
        subtype: p.subtype ? String(p.subtype) : null,
        targetLength: String(p.targetLength || 'medium'),
        toneBaseline: String(p.toneBaseline || ''),
        assistanceLevel: Number.isFinite(p.assistanceLevel) ? Number(p.assistanceLevel) : 3,
        ageRange: p.ageRange ? String(p.ageRange) : null,
        childrensBookSettings: p.childrensBookSettings || null,
        narrativeControls: p.narrativeControls || {},
        coverUrl: p.coverUrl || null,
        status: 'active',
        isPublic: false,
        createdAt: now,
        updatedAt: now,
      });
      if (oldId) projectIdMap.set(oldId, newId);
      projectCount++;
    } catch { errorCount++; }
  }

  for (const c of guestChapters) {
    try {
      if (!c || typeof c !== 'object') { errorCount++; continue; }
      const remapped = projectIdMap.get(String(c.projectId || ''));
      if (!remapped) { errorCount++; continue; } // orphan chapter — skip
      const now = new Date();
      await db.insert(chaptersTable).values({
        id: randomUUID(),
        projectId: remapped,
        number: Number.isFinite(c.number) ? Number(c.number) : 1,
        title: String(c.title || 'Untitled Chapter').slice(0, 500),
        timelinePosition: Number.isFinite(c.timelinePosition) ? Number(c.timelinePosition) : 0,
        status: String(c.status || 'premise-only'),
        premise: c.premise || {},
        prose: String(c.prose || '').slice(0, 1_000_000), // hard 1 MB per chapter
        referencedCanonIds: Array.isArray(c.referencedCanonIds) ? c.referencedCanonIds : [],
        aiIntentMetadata: c.aiIntentMetadata || null,
        validationStatus: c.validationStatus || {},
        scenes: Array.isArray(c.scenes) ? c.scenes : [],
        editChatHistory: Array.isArray(c.editChatHistory) ? c.editChatHistory : [],
        imageUrl: c.imageUrl || null,
        illustrationNotes: c.illustrationNotes || null,
        createdAt: now,
        updatedAt: now,
      });
      chapterCount++;
    } catch { errorCount++; }
  }

  for (const e of guestCanon) {
    try {
      if (!e || typeof e !== 'object') { errorCount++; continue; }
      const remapped = projectIdMap.get(String(e.projectId || ''));
      if (!remapped) { errorCount++; continue; }
      const now = new Date();
      await db.insert(canonTable).values({
        id: randomUUID(),
        projectId: remapped,
        type: String(e.type || 'character'),
        name: String(e.name || 'Unnamed').slice(0, 500),
        description: String(e.description || ''),
        imageUrl: e.imageUrl || null,
        tags: Array.isArray(e.tags) ? e.tags : [],
        notes: String(e.notes || ''),
        version: Number.isFinite(e.version) ? Number(e.version) : 1,
        linkedCanonIds: Array.isArray(e.linkedCanonIds) ? e.linkedCanonIds : [],
        data: e.data || {},
        createdAt: now,
        updatedAt: now,
      });
      canonCount++;
    } catch { errorCount++; }
  }

  await db.update(guestBackups)
    .set({ claimedByUserId: userId, claimedAt: new Date() })
    .where(eq(guestBackups.guestSessionId, guestSessionId));

  return { claimed: true, projects: projectCount, chapters: chapterCount, canon: canonCount, errors: errorCount };
}
