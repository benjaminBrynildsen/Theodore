// ========== Ad Click Logger ==========
//
// Server-side capture of every paid-traffic landing on /go/ or /go2/.
// Sits before express.static so it fires even when the client never
// executes JS — ad-blocked browsers, bot agents, iOS Private Relay
// abandons, mid-load tab-closes, etc. all get counted here.
//
// Compare counts here against journey_events on the same path to surface
// the fraud/blocked ratio per ad source (X is typically 50%+ bot, Meta
// dedups aggressively the other direction).
//
// Privacy: IP is hashed with the same salt as pageviews + guest tracking.
// UA + referrer are truncated to 200 chars to bound DB row size.

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { adClicks } from './schema.js';
import { sql } from 'drizzle-orm';
import { requireAdmin } from './admin.js';

const SALT = process.env.PAGEVIEW_SALT || process.env.SESSION_SECRET || 'theodore-pv-salt';

// Matches the regex used by the existing pageview tracker so the bot vs
// human classification is consistent across analytics surfaces.
const BOT_RE = /(bot|crawler|spider|slurp|facebookexternalhit|preview|curl|wget|httpclient|headlesschrome|phantomjs|lighthouse|googlebot|bingbot|yandexbot|duckduckbot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot)/i;

// Paths we log clicks on. Anything else is ignored entirely so this
// middleware adds zero overhead to the rest of the app.
const LOGGED_PATHS = new Set(['/go', '/go/', '/go2', '/go2/']);

// Source detection — click-id params identify the ad platform reliably.
// utm_source is a fallback for misconfigured ad URLs.
function detectSource(q: Record<string, any>): { source: string; clickId: string | null } {
  if (q.twclid) return { source: 'x', clickId: String(q.twclid).slice(0, 200) };
  if (q.fbclid) return { source: 'meta', clickId: String(q.fbclid).slice(0, 200) };
  if (q.gclid) return { source: 'google', clickId: String(q.gclid).slice(0, 200) };
  if (q.msclkid) return { source: 'microsoft', clickId: String(q.msclkid).slice(0, 200) };
  if (q.ttclid) return { source: 'tiktok', clickId: String(q.ttclid).slice(0, 200) };
  const utmSource = q.utm_source ? String(q.utm_source).toLowerCase() : '';
  if (utmSource.includes('facebook') || utmSource.includes('meta') || utmSource.includes('instagram')) {
    return { source: 'meta', clickId: null };
  }
  if (utmSource.includes('twitter') || utmSource === 'x') return { source: 'x', clickId: null };
  if (utmSource.includes('google')) return { source: 'google', clickId: null };
  if (utmSource.includes('tiktok')) return { source: 'tiktok', clickId: null };
  if (utmSource) return { source: utmSource.slice(0, 50), clickId: null };
  return { source: 'unknown', clickId: null };
}

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + SALT).digest('hex').slice(0, 32);
}

function clientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string | undefined) || '';
  const first = xff.split(',')[0]?.trim();
  return first || req.ip || req.socket?.remoteAddress || '';
}

function extractGeo(req: Request): { country: string | null; city: string | null } {
  const h = req.headers;
  const country = (h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country'] || h['cloudfront-viewer-country']) as string | undefined;
  const city = (h['cf-ipcity'] || h['x-vercel-ip-city'] || h['cloudfront-viewer-city']) as string | undefined;
  return {
    country: country ? String(country).slice(0, 4) : null,
    city: city ? decodeURIComponent(String(city)).slice(0, 80) : null,
  };
}

// Middleware. Fire-and-forget insert so the request response isn't delayed
// by the DB write. Any error is swallowed — we'd rather lose a click row
// than break the landing page.
export function adClickMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.method !== 'GET') return next();
    const path = req.path || '/';
    if (!LOGGED_PATHS.has(path)) return next();

    const q = req.query || {};
    const hasAdSignal = !!(q.twclid || q.fbclid || q.gclid || q.msclkid || q.ttclid || q.utm_source);
    if (!hasAdSignal) return next();

    const { source, clickId } = detectSource(q as any);
    const ua = String(req.headers['user-agent'] || '').slice(0, 200);
    const isBot = BOT_RE.test(ua);
    const ipHash = hashIp(clientIp(req));
    const geo = extractGeo(req);
    const referrer = String(req.headers['referer'] || req.headers['referrer'] || '').slice(0, 200) || null;

    // Normalize path so '/go' and '/go/' collapse to the same bucket.
    const pathBucket = path.endsWith('/') ? path : path + '/';

    void db.insert(adClicks).values({
      source,
      clickId,
      utmSource: q.utm_source ? String(q.utm_source).slice(0, 100) : null,
      utmMedium: q.utm_medium ? String(q.utm_medium).slice(0, 100) : null,
      utmCampaign: q.utm_campaign ? String(q.utm_campaign).slice(0, 200) : null,
      utmContent: q.utm_content ? String(q.utm_content).slice(0, 200) : null,
      utmTerm: q.utm_term ? String(q.utm_term).slice(0, 200) : null,
      path: pathBucket,
      ipHash,
      country: geo.country,
      city: geo.city,
      userAgent: ua || null,
      referrer,
      isBot,
    }).catch((err) => {
      // Don't propagate — a logging failure should never break the page.
      console.warn('[ad-click] insert failed:', err?.message || err);
    });
  } catch (e: any) {
    console.warn('[ad-click] middleware error:', e?.message || e);
  }
  next();
}

// ========== Admin endpoint ==========
// Returns aggregate counts per source for the standard time windows so the
// dashboard can compare ad-platform-reported clicks to actual landed clicks
// AND surface how many of those clicks ever fired a journey event.

interface SourceStats {
  source: string;
  total: number;
  bots: number;
  humans: number;
  uniqueIps: number;
  withUtm: number;
  journeyMatched: number;        // count where ip_hash also appears in journey_events on the same path within +/- 1h
  journeyMatchRate: number;      // humans only
}

interface WindowStats {
  totalClicks: number;
  totalHumans: number;
  totalBots: number;
  bySource: SourceStats[];
}

export async function getAdClicks(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const windows: Array<{ key: string; intervalSql: any }> = [
      { key: 'today', intervalSql: sql`(NOW() AT TIME ZONE 'UTC')::date` },
      { key: 'd7',    intervalSql: sql`NOW() - INTERVAL '7 days'` },
      { key: 'd30',   intervalSql: sql`NOW() - INTERVAL '30 days'` },
    ];

    const out: Record<string, WindowStats> = {};
    for (const w of windows) {
      // Counts per source.
      const sourceRows = await db.execute(sql`
        WITH window_clicks AS (
          SELECT * FROM ad_clicks
          WHERE created_at >= ${w.intervalSql}
        ),
        journey_landing AS (
          -- Sessions that fired a page_load journey event for /go or /go2
          -- within the same window. Match back to ad_clicks by ip_hash so we
          -- can flag "ad click landed AND journey beacon fired" pairs.
          SELECT DISTINCT je.ip_hash, je.page
          FROM journey_events je
          WHERE je.event = 'page_load'
            AND (je.page = '/go/' OR je.page = '/go2/')
            AND je.created_at >= ${w.intervalSql}
            AND je.ip_hash IS NOT NULL
        )
        SELECT
          c.source,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE c.is_bot)::int AS bots,
          COUNT(*) FILTER (WHERE NOT c.is_bot)::int AS humans,
          COUNT(DISTINCT c.ip_hash)::int AS unique_ips,
          COUNT(*) FILTER (WHERE c.utm_source IS NOT NULL)::int AS with_utm,
          COUNT(*) FILTER (
            WHERE NOT c.is_bot
              AND EXISTS (
                SELECT 1 FROM journey_landing jl
                WHERE jl.ip_hash = c.ip_hash AND jl.page = c.path
              )
          )::int AS journey_matched
        FROM window_clicks c
        GROUP BY c.source
        ORDER BY total DESC
      `);

      const bySource: SourceStats[] = (sourceRows.rows as any[]).map((r) => {
        const humans = Number(r.humans) || 0;
        const matched = Number(r.journey_matched) || 0;
        return {
          source: String(r.source),
          total: Number(r.total) || 0,
          bots: Number(r.bots) || 0,
          humans,
          uniqueIps: Number(r.unique_ips) || 0,
          withUtm: Number(r.with_utm) || 0,
          journeyMatched: matched,
          journeyMatchRate: humans > 0 ? Math.round((matched / humans) * 100) : 0,
        };
      });

      out[w.key] = {
        totalClicks: bySource.reduce((a, b) => a + b.total, 0),
        totalHumans: bySource.reduce((a, b) => a + b.humans, 0),
        totalBots:   bySource.reduce((a, b) => a + b.bots,   0),
        bySource,
      };
    }

    res.json({ windows: out });
  } catch (e: any) {
    console.error('[admin] ad-clicks error:', e?.message || e);
    res.status(500).json({ error: 'Failed to fetch ad click stats' });
  }
}
