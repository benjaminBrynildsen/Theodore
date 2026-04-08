// Pageview tracking middleware + admin aggregates.
//
// Design goals:
//   - Zero impact on hot paths: only fire-and-forget inserts, only on
//     top-level HTML requests (not API, assets, uploads, favicon).
//   - Privacy-first: hash IP with a server-side salt, never store raw IP.
//   - Bot-resistant: skip obvious crawler UAs so numbers reflect humans.
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { pageViews } from './schema.js';
import { sql, desc, count } from 'drizzle-orm';
import { requireAdmin } from './admin.js';

const SALT = process.env.PAGEVIEW_SALT || process.env.SESSION_SECRET || 'theodore-pv-salt';

const BOT_RE = /(bot|crawler|spider|slurp|facebookexternalhit|preview|curl|wget|httpclient|headlesschrome|phantomjs|lighthouse)/i;

const SKIP_PREFIXES = [
  '/api/',
  '/assets/',
  '/uploads/',
  '/static/',
  '/favicon',
  '/robots.txt',
  '/sitemap',
  '/apple-touch-icon',
];

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + SALT).digest('hex').slice(0, 32);
}

function hostFrom(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function pageViewMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.method !== 'GET') return next();
    const p = req.path || '/';
    if (SKIP_PREFIXES.some((prefix) => p.startsWith(prefix))) return next();
    // Only HTML navigations — skip JSON/XHR/fetch that slipped through
    const accept = req.headers.accept || '';
    if (accept && !accept.includes('text/html') && !accept.includes('*/*')) return next();

    const ua = (req.headers['user-agent'] || '').toString();
    if (!ua || BOT_RE.test(ua)) return next();

    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim())
      || req.ip
      || req.socket?.remoteAddress
      || 'unknown';

    const referrer = (req.headers.referer || req.headers.referrer || '').toString() || null;
    const country = (req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || null) as string | null;

    const q = (req.query || {}) as Record<string, string | undefined>;
    const row = {
      path: p.slice(0, 512),
      referrer: referrer ? referrer.slice(0, 512) : null,
      referrerHost: hostFrom(referrer || undefined),
      userAgent: ua.slice(0, 512),
      ipHash: hashIp(ip),
      country: country ? country.toString().slice(0, 4) : null,
      utmSource: q.utm_source ? String(q.utm_source).slice(0, 128) : null,
      utmMedium: q.utm_medium ? String(q.utm_medium).slice(0, 128) : null,
      utmCampaign: q.utm_campaign ? String(q.utm_campaign).slice(0, 128) : null,
      userId: (req as any).user?.id || null,
    };

    // Fire-and-forget — do not await, do not block the response.
    void db.insert(pageViews).values(row).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[pageviews] insert failed:', err?.message || err);
    });
  } catch (err) {
    // Never let analytics crash a page render
    // eslint-disable-next-line no-console
    console.warn('[pageviews] middleware error:', (err as Error)?.message);
  }
  return next();
}

// ========== Admin aggregates ==========
export async function getTrafficStats(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const now = Date.now();
    const day = new Date(now - 24 * 60 * 60 * 1000);
    const week = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [[{ value: total }], [{ value: last24h }], [{ value: last7d }], [{ value: last30d }]] = await Promise.all([
      db.select({ value: count() }).from(pageViews),
      db.select({ value: count() }).from(pageViews).where(sql`${pageViews.createdAt} > ${day}`),
      db.select({ value: count() }).from(pageViews).where(sql`${pageViews.createdAt} > ${week}`),
      db.select({ value: count() }).from(pageViews).where(sql`${pageViews.createdAt} > ${month}`),
    ]);

    // Unique visitors (distinct ipHash) — same windows
    const uniq = async (since?: Date) => {
      const rows = since
        ? await db
            .select({ value: sql<number>`COUNT(DISTINCT ${pageViews.ipHash})` })
            .from(pageViews)
            .where(sql`${pageViews.createdAt} > ${since}`)
        : await db
            .select({ value: sql<number>`COUNT(DISTINCT ${pageViews.ipHash})` })
            .from(pageViews);
      return Number(rows[0]?.value || 0);
    };
    const [uniqTotal, uniq24h, uniq7d, uniq30d] = await Promise.all([
      uniq(), uniq(day), uniq(week), uniq(month),
    ]);

    // Top referrers (last 30d)
    const topReferrers = await db
      .select({ host: pageViews.referrerHost, value: count() })
      .from(pageViews)
      .where(sql`${pageViews.createdAt} > ${month} AND ${pageViews.referrerHost} IS NOT NULL`)
      .groupBy(pageViews.referrerHost)
      .orderBy(desc(count()))
      .limit(10);

    // Top countries (last 30d)
    const topCountries = await db
      .select({ country: pageViews.country, value: count() })
      .from(pageViews)
      .where(sql`${pageViews.createdAt} > ${month} AND ${pageViews.country} IS NOT NULL`)
      .groupBy(pageViews.country)
      .orderBy(desc(count()))
      .limit(10);

    // Top paths (last 30d)
    const topPaths = await db
      .select({ path: pageViews.path, value: count() })
      .from(pageViews)
      .where(sql`${pageViews.createdAt} > ${month}`)
      .groupBy(pageViews.path)
      .orderBy(desc(count()))
      .limit(10);

    // UTM campaign breakdown (last 30d) — great for Facebook ads
    const topCampaigns = await db
      .select({
        source: pageViews.utmSource,
        medium: pageViews.utmMedium,
        campaign: pageViews.utmCampaign,
        value: count(),
      })
      .from(pageViews)
      .where(sql`${pageViews.createdAt} > ${month} AND ${pageViews.utmSource} IS NOT NULL`)
      .groupBy(pageViews.utmSource, pageViews.utmMedium, pageViews.utmCampaign)
      .orderBy(desc(count()))
      .limit(10);

    // Daily counts for the last 14 days (simple sparkline)
    const daily = await db.execute(sql`
      SELECT date_trunc('day', created_at) AS day,
             COUNT(*)::int AS views,
             COUNT(DISTINCT ip_hash)::int AS visitors
      FROM page_views
      WHERE created_at > NOW() - INTERVAL '14 days'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    res.json({
      views: { total: Number(total), last24h: Number(last24h), last7d: Number(last7d), last30d: Number(last30d) },
      visitors: { total: uniqTotal, last24h: uniq24h, last7d: uniq7d, last30d: uniq30d },
      topReferrers: topReferrers.map((r) => ({ host: r.host || 'direct', count: Number(r.value) })),
      topCountries: topCountries.map((r) => ({ country: r.country || '??', count: Number(r.value) })),
      topPaths: topPaths.map((r) => ({ path: r.path, count: Number(r.value) })),
      topCampaigns: topCampaigns.map((r) => ({
        source: r.source,
        medium: r.medium,
        campaign: r.campaign,
        count: Number(r.value),
      })),
      daily: (daily.rows || []).map((r: any) => ({
        day: r.day,
        views: Number(r.views),
        visitors: Number(r.visitors),
      })),
    });
  } catch (err: any) {
    console.error('[admin] getTrafficStats error:', err);
    res.status(500).json({ error: err?.message || 'Failed to load traffic stats' });
  }
}
