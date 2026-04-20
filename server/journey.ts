// ========== Journey Tracking — Server Side ==========
// Receives batched journey events from the client-side tracker
// (both /go/ static page and React app) and stores them in the DB.

import { Request, Response } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { journeyEvents } from './schema.js';
import { desc, eq, sql, and } from 'drizzle-orm';
import { requireAdmin } from './admin.js';

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

    const rows = events.map((e: any) => ({
      sessionId: String(e.sessionId || 'unknown'),
      event: String(e.event || 'unknown'),
      data: e.data || null,
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
// Links are discovered two ways:
//   1. journey_events with data->>'user_id' = userId (tagged once user signs in)
//   2. guest_backups with claimed_by_user_id = userId (historical signups via guest flow)
// We collect ip_hashes from both, then return every session that shares any of
// those ip_hashes — surfacing pre-signup anonymous visits from the same device.
export async function getUserJourneys(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

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

    if (ipHashes.length === 0) {
      return res.json({ sessions: [], ipHashes: [] });
    }

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
        BOOL_OR(COALESCE((data->>'is_admin')::boolean, false)) AS is_admin,
        BOOL_OR(data->>'user_id' = ${userId}) AS signed_in
      FROM journey_events
      WHERE ip_hash = ANY(${ipHashes})
      GROUP BY session_id
      ORDER BY MIN(created_at) DESC
      LIMIT ${limit}
    `);

    res.json({ sessions: sessions.rows, ipHashes });
  } catch (err: any) {
    console.error('[journey] user journeys error:', err?.message || err);
    res.status(500).json({ error: 'Failed to fetch user journeys' });
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
