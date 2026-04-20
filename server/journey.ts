// ========== Journey Tracking — Server Side ==========
// Receives batched journey events from the client-side tracker
// (both /go/ static page and React app) and stores them in the DB.

import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { journeyEvents, projects, users } from './schema.js';
import { desc, eq, sql, and } from 'drizzle-orm';
import { requireAdmin } from './admin.js';
import { ensureGuestSessionId } from './guest-session.js';

// Common English stopwords + book/story filler we don't want to match on.
const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','into','about','what','when','where','will','would','could','should','your','their','there','them','they','then','also','just','only','still','some','such','than','over','into','onto','upon','have','been','were','was','are','but','not','any','all','out','has','had','her','him','his','she','one','two','new','old','book','story','novel','tale','chapter','writer','untitled','draft',
]);
function tokenizeTitle(title: string): string[] {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

// Build a PostgreSQL text[] literal string. Drizzle's `${array}` flattens
// arrays into comma-joined scalars, which breaks `= ANY(...)`. Passing a
// single literal string like `{"a","b"}` and casting with `::text[]`
// round-trips correctly.
function pgTextArrayLiteral(arr: string[]): string {
  const parts = arr.map(s => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  return `{${parts.join(',')}}`;
}

const IP_SALT = process.env.IP_HASH_SALT || 'theodore-journey-2026';

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + IP_SALT).digest('hex').slice(0, 12);
}

function getClientIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';
}

// POST /api/journey — receives a batch of events
export async function receiveJourneyEvents(req: Request, res: Response) {
  try {
    const events = req.body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array required' });
    }
    if (events.length > 100) {
      return res.status(400).json({ error: 'max 100 events per batch' });
    }

    const ip = getClientIp(req);
    const ipHash = hashIp(ip);
    const ua = (req.headers['user-agent'] as string) || '';

    // Mint/read the theodore_guest HttpOnly cookie and stamp it onto every
    // event. This is the load-bearing link between pre-signup journey sessions
    // and a user after they sign up: guest_backups.guestSessionId matches
    // events carrying the same cookie, regardless of ip_hash drift.
    const guestSessionId = ensureGuestSessionId(req, res);

    const rows = events.map((e: any) => ({
      sessionId: String(e.sessionId || 'unknown'),
      event: String(e.event || 'unknown'),
      data: { ...(e.data || {}), guest_session_id: guestSessionId },
      ipHash,
      city: e.city ? String(e.city) : null,
      region: e.region ? String(e.region) : null,
      country: e.country ? String(e.country) : null,
      userAgent: ua.slice(0, 300),
      page: e.page ? String(e.page) : null,
    }));

    await db.insert(journeyEvents).values(rows);
    res.json({ ok: true, count: rows.length });
  } catch (err: any) {
    console.error('[journey] insert error:', err?.message || err);
    res.status(500).json({ error: 'Failed to store journey events' });
  }
}

// POST /api/beacon — lightweight endpoint for sendBeacon (plain text body)
export async function receiveBeacon(req: Request, res: Response) {
  try {
    let data: any;
    if (typeof req.body === 'string') {
      data = JSON.parse(req.body);
    } else if (Buffer.isBuffer(req.body)) {
      data = JSON.parse(req.body.toString());
    } else {
      data = req.body;
    }
    // Wrap in events format and delegate
    req.body = { events: Array.isArray(data) ? data : [data] };
    return receiveJourneyEvents(req, res);
  } catch {
    res.status(200).end(); // beacons should not retry
  }
}

// GET /api/admin/journeys — list recent sessions (admin only)
export async function getJourneys(req: Request, res: Response) {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const pageFilter = req.query.page as string | undefined;

    // Get unique sessions with first/last event + event count
    // When page filter is set, only return sessions that have events on that page
    const sessions = await db.execute(sql`
      SELECT
        session_id,
        MIN(created_at)::text || 'Z' AS started_at,
        MAX(created_at)::text || 'Z' AS last_event_at,
        COUNT(*) AS event_count,
        MAX(city) AS city,
        MAX(region) AS region,
        MAX(country) AS country,
        MAX(ip_hash) AS ip_hash,
        ROUND(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))))::int AS duration_seconds,
        ARRAY_AGG(DISTINCT event ORDER BY event) AS event_types,
        BOOL_OR(COALESCE((data->>'is_admin')::boolean, false)) AS is_admin
      FROM journey_events
      WHERE created_at > NOW() - INTERVAL '7 days'
        ${pageFilter ? sql`AND session_id IN (SELECT DISTINCT session_id FROM journey_events WHERE page LIKE ${'%' + pageFilter + '%'})` : sql``}
      GROUP BY session_id
      ORDER BY MIN(created_at) DESC
      LIMIT ${limit}
    `);

    res.json({ sessions: sessions.rows });
  } catch (err: any) {
    console.error('[journey] admin list error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch journeys' });
  }
}

// GET /api/admin/users/:userId/journeys — sessions linked to a user
//
// Linked via three keys, in order of reliability:
//   1. guest_session_id — the theodore_guest cookie, stamped onto every
//      journey event server-side. If the user signed up through the guest
//      flow, guest_backups.guestSessionId for their claim maps straight to
//      those events. Works across signup without ip_hash reliance.
//   2. data.user_id — events recorded after the user signed in (tagged by
//      setJourneyUser in the client).
//   3. ip_hash — last resort; brittle because of historical salt/length
//      drift across modules, but kept for backward-compat with pre-fix rows.
export async function getUserJourneys(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    // Collect all guest_session_ids claimed by this user (primary link).
    const gsRows = await db.execute(sql`
      SELECT guest_session_id FROM guest_backups WHERE claimed_by_user_id = ${userId}
    `);
    const guestSessionIds = (gsRows.rows as { guest_session_id: string }[])
      .map(r => r.guest_session_id)
      .filter(Boolean);

    // Fallback: ip_hashes from events the user is already tagged on, or from
    // their claimed guest_backups row. Matches are looser but surface sessions
    // from before the cookie-stamping fix landed.
    const hashRows = await db.execute(sql`
      SELECT DISTINCT ip_hash FROM (
        SELECT ip_hash FROM journey_events
          WHERE ip_hash IS NOT NULL AND data->>'user_id' = ${userId}
        UNION
        SELECT ip_hash FROM guest_backups
          WHERE ip_hash IS NOT NULL AND claimed_by_user_id = ${userId}
      ) t
    `);
    const ipHashes = (hashRows.rows as { ip_hash: string }[])
      .map(r => r.ip_hash)
      .filter(Boolean);

    // Use sentinel values for empty arrays so PG `= ANY(...)` never
    // returns an error; sentinels match nothing real.
    const gs = guestSessionIds.length ? guestSessionIds : ['__none__'];
    const ih = ipHashes.length ? ipHashes : ['__none__'];
    // Pass arrays as PG text[] literals — drizzle's `${arr}` template
    // flattens arrays to comma-joined scalars, which breaks `= ANY(...)`.
    const gsLit = pgTextArrayLiteral(gs);
    const ihLit = pgTextArrayLiteral(ih);

    const directSessions = await db.execute(sql`
      SELECT
        session_id,
        MIN(created_at)::text || 'Z' AS started_at,
        MAX(created_at)::text || 'Z' AS last_event_at,
        COUNT(*) AS event_count,
        MAX(city) AS city,
        MAX(region) AS region,
        MAX(country) AS country,
        MAX(ip_hash) AS ip_hash,
        ROUND(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))))::int AS duration_seconds,
        ARRAY_AGG(DISTINCT event ORDER BY event) AS event_types,
        BOOL_OR(COALESCE((data->>'is_admin')::boolean, false)) AS is_admin,
        BOOL_OR(data->>'user_id' = ${userId}) AS signed_in,
        BOOL_OR(data->>'guest_session_id' = ANY(${gsLit}::text[])) AS matched_guest_cookie,
        CASE
          WHEN BOOL_OR(data->>'guest_session_id' = ANY(${gsLit}::text[])) THEN 'guest_cookie'
          WHEN BOOL_OR(data->>'user_id' = ${userId}) THEN 'user_id'
          ELSE 'ip_hash'
        END AS match_type
      FROM journey_events
      WHERE (data->>'guest_session_id' = ANY(${gsLit}::text[]))
         OR (data->>'user_id' = ${userId})
         OR (ip_hash = ANY(${ihLit}::text[]))
      GROUP BY session_id
      ORDER BY MIN(created_at) DESC
      LIMIT ${limit}
    `);
    const directRows = directSessions.rows as any[];
    const matchedIds = new Set(directRows.map(r => r.session_id));

    // ---------- Fuzzy fallback ----------
    // For users whose pre-signup events have no guest_session_id stamp and
    // whose ip_hash doesn't line up with guest_backups (the pre-fix case),
    // try to recover a plausible match by:
    //   (a) matching tokens from the user's project titles against prompt
    //       text captured in `prompt_redirect_arrived` / `chat_auto_send`
    //       events in the 24h window before signup;
    //   (b) falling back to any session whose last event landed within 2min
    //       of the user's createdAt as a very loose time-proximity guess.
    // Results are flagged `match_type: 'fuzzy_prompt' | 'fuzzy_time'` so the
    // UI can surface them with lower confidence than direct matches.
    const [userRow] = await db
      .select({ createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId));
    const userProjects = await db
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.userId, userId));

    const tokenSet = new Set<string>();
    for (const p of userProjects) tokenizeTitle(p.title).forEach(t => tokenSet.add(t));
    const tokens = [...tokenSet];

    const fuzzyRows: any[] = [];
    if (userRow) {
      const createdIso = new Date(userRow.createdAt).toISOString();

      // (a) title-token match — strong signal
      if (tokens.length > 0) {
        const likePatterns = tokens.map(t => `%${t}%`);
        const likeLit = pgTextArrayLiteral(likePatterns);
        const r = await db.execute(sql`
          SELECT
            session_id,
            MIN(created_at)::text || 'Z' AS started_at,
            MAX(created_at)::text || 'Z' AS last_event_at,
            COUNT(*) AS event_count,
            MAX(city) AS city,
            MAX(region) AS region,
            MAX(country) AS country,
            MAX(ip_hash) AS ip_hash,
            ROUND(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))))::int AS duration_seconds,
            ARRAY_AGG(DISTINCT event ORDER BY event) AS event_types,
            BOOL_OR(COALESCE((data->>'is_admin')::boolean, false)) AS is_admin,
            false AS signed_in,
            false AS matched_guest_cookie,
            'fuzzy_prompt' AS match_type
          FROM journey_events
          WHERE session_id IN (
            SELECT DISTINCT session_id FROM journey_events
            WHERE event IN ('prompt_redirect_arrived','chat_auto_send')
              AND COALESCE((data->>'is_admin')::boolean, false) = false
              AND LOWER(data->>'prompt') LIKE ANY(${likeLit}::text[])
              AND created_at BETWEEN (${createdIso}::timestamptz - INTERVAL '24 hours')
                                 AND (${createdIso}::timestamptz + INTERVAL '5 minutes')
          )
          GROUP BY session_id
          ORDER BY MIN(created_at) DESC
          LIMIT 20
        `);
        for (const row of r.rows as any[]) {
          if (!matchedIds.has(row.session_id)) {
            fuzzyRows.push(row);
            matchedIds.add(row.session_id);
          }
        }
      }

      // (b) tight time proximity — weak signal, only used to surface
      // candidates when nothing else matched at all.
      if (directRows.length === 0 && fuzzyRows.length === 0) {
        const r = await db.execute(sql`
          SELECT
            session_id,
            MIN(created_at)::text || 'Z' AS started_at,
            MAX(created_at)::text || 'Z' AS last_event_at,
            COUNT(*) AS event_count,
            MAX(city) AS city,
            MAX(region) AS region,
            MAX(country) AS country,
            MAX(ip_hash) AS ip_hash,
            ROUND(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))))::int AS duration_seconds,
            ARRAY_AGG(DISTINCT event ORDER BY event) AS event_types,
            BOOL_OR(COALESCE((data->>'is_admin')::boolean, false)) AS is_admin,
            false AS signed_in,
            false AS matched_guest_cookie,
            'fuzzy_time' AS match_type
          FROM journey_events
          WHERE COALESCE((data->>'is_admin')::boolean, false) = false
          GROUP BY session_id
          HAVING ABS(EXTRACT(EPOCH FROM (MAX(created_at) - ${createdIso}::timestamptz))) < 120
          ORDER BY ABS(EXTRACT(EPOCH FROM (MAX(created_at) - ${createdIso}::timestamptz))) ASC
          LIMIT 5
        `);
        for (const row of r.rows as any[]) {
          if (!matchedIds.has(row.session_id)) {
            fuzzyRows.push(row);
            matchedIds.add(row.session_id);
          }
        }
      }
    }

    const allSessions = [...directRows, ...fuzzyRows].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );

    res.json({ sessions: allSessions, guestSessionIds, ipHashes, fuzzyTokens: tokens });
  } catch (err: any) {
    console.error('[journey] user journeys error:', err?.message || err, err?.stack);
    res.status(500).json({ error: 'Failed to fetch user journeys', detail: err?.message || String(err) });
  }
}

// GET /api/admin/journeys/:sessionId — full event timeline for one session
export async function getJourneyDetail(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const events = await db
      .select()
      .from(journeyEvents)
      .where(eq(journeyEvents.sessionId, sessionId))
      .orderBy(journeyEvents.createdAt);

    if (events.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const first = events[0];
    const last = events[events.length - 1];
    const durationSeconds = Math.round(
      (new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime()) / 1000
    );

    res.json({
      sessionId,
      city: first.city,
      region: first.region,
      country: first.country,
      ipHash: first.ipHash,
      startedAt: first.createdAt,
      durationSeconds,
      eventCount: events.length,
      events: events.map((e) => ({
        event: e.event,
        data: e.data,
        page: e.page,
        timestamp: e.createdAt,
      })),
    });
  } catch (err: any) {
    console.error('[journey] admin detail error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch journey detail' });
  }
}
