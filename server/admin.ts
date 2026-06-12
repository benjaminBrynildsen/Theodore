// Admin API — dashboard endpoints for platform analytics
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from './db.js';
import { users, projects, chapters, canonEntries, creditTransactions, audioGenerations, guestEvents, pushTokens, transactionalEmails, emailTemplates } from './schema.js';
import { sql, eq, desc, count, sum, gt, and, inArray, isNotNull, ne } from 'drizzle-orm';
import { getAuth } from './auth.js';
import { sendPushToTokens } from './push.js';
import { sendToUser, getTemplate, setTemplate, DEFAULT_TEMPLATES, substituteVars, type EmailKind, APP_URL } from './email.js';
import { getStripeClient } from './billing.js';
import { payloadFromUrl, attributionFromRecentTraffic, attributionColumns } from './attribution.js';

// Must match the hashing in server/index.ts so the admin's own IP
// resolves to the same prefix shown in the guest activity feed.
const GUEST_SALT = process.env.PAGEVIEW_SALT || process.env.SESSION_SECRET || 'theodore-guest-salt';
function hashIpForAdmin(ip: string): string {
  return crypto.createHash('sha256').update(ip + GUEST_SALT).digest('hex').slice(0, 32);
}
// Must match the logic in server/index.ts exactly or the hashes won't
// match between guest events and admin dashboard captures.
function requestClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

// Admin user IDs — only these accounts can access admin endpoints
const ADMIN_EMAILS = new Set([
  'benbrynildsen5757@gmail.com',
  'ben@germaniabrewhaus.com',
]);

const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'theodore-claude-admin-2026';

export async function requireAdmin(req: Request, res: Response): Promise<{ user: any } | null> {
  // Allow API key auth for programmatic access (Claude, scripts, etc.)
  const apiKey = req.headers['x-admin-key'] as string;
  if (apiKey && apiKey === ADMIN_API_KEY) {
    return { user: { id: 'api-admin', email: 'claude@admin', name: 'Claude Admin' } };
  }

  const auth = await getAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  if (!ADMIN_EMAILS.has(auth.user.email)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return auth;
}

// ========== Overview Stats ==========
export async function getOverview(_req: Request, res: Response) {
  try {
    const admin = await requireAdmin(_req, res);
    if (!admin) return;

    // Total users
    const [{ value: totalUsers }] = await db.select({ value: count() }).from(users);

    // Users by plan
    const planBreakdown = await db
      .select({ plan: users.plan, count: count() })
      .from(users)
      .groupBy(users.plan);

    // Total projects
    const [{ value: totalProjects }] = await db.select({ value: count() }).from(projects);

    // Total chapters
    const [{ value: totalChapters }] = await db.select({ value: count() }).from(chapters);

    // Total credits consumed — positive rows only so admin grants/debits
    // don't skew the number.
    const [{ value: totalCreditsUsed }] = await db
      .select({ value: sum(creditTransactions.creditsUsed) })
      .from(creditTransactions)
      .where(gt(creditTransactions.creditsUsed, 0));

    // Credits by action
    const creditsByAction = await db
      .select({
        action: creditTransactions.action,
        total: sum(creditTransactions.creditsUsed),
        count: count(),
      })
      .from(creditTransactions)
      .groupBy(creditTransactions.action)
      .orderBy(desc(sum(creditTransactions.creditsUsed)));

    // Signups in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [{ value: recentSignups }] = await db
      .select({ value: count() })
      .from(users)
      .where(sql`${users.createdAt} > ${sevenDaysAgo}`);

    // Signups in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [{ value: monthlySignups }] = await db
      .select({ value: count() })
      .from(users)
      .where(sql`${users.createdAt} > ${thirtyDaysAgo}`);

    // MRR calculation. Publisher tier was missing here, so the dashboard
    // under-reported MRR by $200/mo per publisher subscriber (caught
    // 2026-06-07). Keep in sync with TIER_PRICES_USD in src/types/credits.ts.
    //
    // Admin accounts are excluded — Ben's account is on the publisher plan
    // for testing but doesn't actually pay, so counting it inflates MRR
    // by $200/mo. planBreakdown (the UI tier counts) keeps everyone so the
    // user totals still match; only the MRR sum filters admins out.
    const pricingMap: Record<string, number> = { writer: 10, author: 30, studio: 99, publisher: 200 };
    const adminEmailList = Array.from(ADMIN_EMAILS);
    const mrrPlanRows = await db
      .select({ plan: users.plan, count: count() })
      .from(users)
      .where(sql`${users.email} NOT IN (${sql.join(adminEmailList.map((e) => sql`${e}`), sql`, `)})`)
      .groupBy(users.plan);
    const mrr = mrrPlanRows.reduce((acc, { plan, count: c }) => {
      return acc + (pricingMap[plan] || 0) * (Number(c) || 0);
    }, 0);

    // ========== Boost (one-time top-up) revenue ==========
    // Boost packs use Stripe's mode='payment' which doesn't create invoices,
    // so they're invisible to the totalRevenue invoices.list pass above.
    // Source of truth is credit_transactions WHERE action='credit-boost' —
    // each row's metadata.amountUsd is the price paid for the pack.
    //
    // Admin accounts are excluded so Ben's $5 test purchase from 2026-06-06
    // doesn't pad the customer-revenue number on the dashboard.
    let boostRevenue = 0;
    let boostCount = 0;
    let boostUserCount = 0;
    try {
      const boostRows = await db.execute(sql`
        SELECT
          COALESCE(SUM((ct.metadata->>'amountUsd')::numeric), 0)::float AS revenue,
          COUNT(*)::int AS purchases,
          COUNT(DISTINCT ct.user_id)::int AS users
        FROM credit_transactions ct
        JOIN users u ON u.id = ct.user_id
        WHERE ct.action = 'credit-boost'
          AND u.email NOT IN (${sql.join(adminEmailList.map((e) => sql`${e}`), sql`, `)})
      `);
      const r = (boostRows.rows?.[0] || {}) as any;
      boostRevenue = Math.round((Number(r.revenue) || 0) * 100) / 100;
      boostCount = Number(r.purchases) || 0;
      boostUserCount = Number(r.users) || 0;
    } catch (e: any) {
      console.warn('[Admin] boost revenue query failed:', e?.message || e);
    }

    // Audio generations count
    const [{ value: totalAudioGens }] = await db.select({ value: count() }).from(audioGenerations);

    // ========== Total Lifetime Revenue (Stripe) ==========
    // Sum of every paid invoice ever. Catches churned subscribers too —
    // MRR only counts active. Wrapped in try/catch so a Stripe outage
    // can't break the overview response; UI shows '—' when null.
    let totalRevenue: number | null = null;
    let invoicesPaid: number | null = null;
    try {
      const stripe = await getStripeClient();
      if (stripe) {
        let totalCents = 0;
        let invCount = 0;
        let startingAfter: string | undefined = undefined;
        // Cap pagination at 20 pages = 2000 invoices for safety.
        for (let i = 0; i < 20; i++) {
          const page: any = await stripe.invoices.list({
            status: 'paid',
            limit: 100,
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          });
          for (const inv of page.data || []) {
            totalCents += inv.amount_paid || 0;
            invCount += 1;
          }
          if (!page.has_more || !page.data?.length) break;
          startingAfter = page.data[page.data.length - 1].id;
        }
        totalRevenue = Math.round(totalCents / 100 * 100) / 100; // cents → USD, 2dp
        invoicesPaid = invCount;
      }
    } catch (e: any) {
      console.warn('[Admin] failed to fetch total revenue from Stripe:', e?.message || e);
    }

    // ========== Monthly Usage & Cost ==========
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Get all transactions this month with metadata
    const monthlyTx = await db
      .select({
        action: creditTransactions.action,
        creditsUsed: creditTransactions.creditsUsed,
        model: creditTransactions.model,
        metadata: creditTransactions.metadata,
      })
      .from(creditTransactions)
      .where(sql`${creditTransactions.createdAt} >= ${monthStart}`);

    // Aggregate by action
    const actionAgg: Record<string, { credits: number; count: number; inputTokens: number; outputTokens: number; audioSegments: number; audioDuration: number }> = {};
    for (const tx of monthlyTx) {
      const a = tx.action || 'unknown';
      if (!actionAgg[a]) actionAgg[a] = { credits: 0, count: 0, inputTokens: 0, outputTokens: 0, audioSegments: 0, audioDuration: 0 };
      actionAgg[a].credits += tx.creditsUsed || 0;
      actionAgg[a].count += 1;
      const meta = tx.metadata as Record<string, any> || {};
      actionAgg[a].inputTokens += meta.inputTokens || 0;
      actionAgg[a].outputTokens += meta.outputTokens || 0;
      actionAgg[a].audioSegments += meta.segments || 0;
      actionAgg[a].audioDuration += meta.durationEstimate || 0;
    }

    // Cost estimation per action type (based on PRICING-MODEL.md)
    const costPerCredit: Record<string, number> = {
      'generate-chapter': 0.0012,
      'generate-stream': 0.0012,
      'scaffold-chapters': 0.001,
      'plan-project': 0.001,
      'generate-audio': 0.0005,
      'generate-music': 0.0017,
      'generate-sfx': 0.00175,
      'generate-image': 0.0016,
    };
    const defaultCostPerCredit = 0.001;

    let monthlyCostEstimate = 0;
    const costBreakdown: { action: string; credits: number; count: number; inputTokens: number; outputTokens: number; audioDuration: number; estimatedCost: number }[] = [];
    for (const [action, agg] of Object.entries(actionAgg)) {
      const rate = costPerCredit[action] || defaultCostPerCredit;
      const cost = agg.credits * rate;
      monthlyCostEstimate += cost;
      costBreakdown.push({
        action,
        credits: agg.credits,
        count: agg.count,
        inputTokens: agg.inputTokens,
        outputTokens: agg.outputTokens,
        audioDuration: agg.audioDuration,
        estimatedCost: Math.round(cost * 100) / 100,
      });
    }

    // Totals
    const totalMonthlyCredits = Object.values(actionAgg).reduce((a, b) => a + b.credits, 0);
    const totalInputTokens = Object.values(actionAgg).reduce((a, b) => a + b.inputTokens, 0);
    const totalOutputTokens = Object.values(actionAgg).reduce((a, b) => a + b.outputTokens, 0);
    const totalAudioDuration = Object.values(actionAgg).reduce((a, b) => a + b.audioDuration, 0);

    // Provider-level cost aggregation
    // ElevenLabs: audio credits = chars/1000 * 100 (premium) or chars/1000 * 20 (budget/openai)
    // So ElevenLabs chars ≈ credits * 10 for premium TTS
    const elevenLabsActions = new Set(['generate-audio', 'generate-music', 'generate-sfx']);
    const openaiTextActions = new Set(['generate-chapter', 'generate-stream', 'scaffold-chapters', 'plan-project']);

    let elevenLabsCharsEstimate = 0;
    let openaiInputTokens = 0;
    let openaiOutputTokens = 0;
    let openaiTTSChars = 0;

    for (const tx of monthlyTx) {
      const meta = tx.metadata as Record<string, any> || {};
      if (elevenLabsActions.has(tx.action || '')) {
        const isOpenAITTS = (tx.model || '').startsWith('openai') || (tx.model || '').startsWith('gpt');
        if (isOpenAITTS) {
          // Budget TTS: use charCount from metadata, or estimate from credits (credits = chars/1000*20)
          const chars = meta.charCount || (tx.creditsUsed || 0) * 50;
          openaiTTSChars += chars;
        } else if (tx.action === 'generate-sfx') {
          // SFX don't use characters — cost is per-generation
          // ElevenLabs SFX: ~$0.07 per generation, tracked separately
          elevenLabsCharsEstimate += 0; // no chars, cost handled below
        } else {
          // ElevenLabs TTS: use charCount from metadata if available
          // Fallback: estimate from durationEstimate (14 chars/sec) or credits
          const chars = meta.charCount
            || (meta.durationEstimate ? meta.durationEstimate * 14 : 0)
            || (tx.creditsUsed || 0) * 10;
          elevenLabsCharsEstimate += chars;
        }
      }
      if (openaiTextActions.has(tx.action || '')) {
        openaiInputTokens += meta.inputTokens || 0;
        openaiOutputTokens += meta.outputTokens || 0;
      }
    }

    // Count SFX and music generations for flat-rate costing
    const sfxCount = monthlyTx.filter(tx => tx.action === 'generate-sfx').length;
    const musicCount = monthlyTx.filter(tx => tx.action === 'generate-music').length;

    // Actual provider costs
    // ElevenLabs Scale: $99/mo for 2M chars = $0.0000495/char; overage = $0.00012/char
    // Use blended rate assuming within plan limits for now
    const elevenLabsCostPerChar = 0.0000495;
    const elevenLabsTTSCost = elevenLabsCharsEstimate * elevenLabsCostPerChar;
    const elevenLabsSFXCost = sfxCount * 0.07;  // ~$0.07 per SFX generation
    const elevenLabsMusicCost = musicCount * 0.33; // ~$0.33 per music generation
    const elevenLabsCost = Math.round((elevenLabsTTSCost + elevenLabsSFXCost + elevenLabsMusicCost) * 100) / 100;
    // OpenAI text: GPT-4.1 = $2/MTok in, $8/MTok out
    const openaiTextCost = Math.round(((openaiInputTokens * 2 / 1_000_000) + (openaiOutputTokens * 8 / 1_000_000)) * 100) / 100;
    // OpenAI budget TTS: ~$0.015/1K chars (gpt-4o-mini-tts)
    const openaiTTSCost = Math.round((openaiTTSChars / 1000) * 0.015 * 100) / 100;

    const providerCosts = {
      elevenlabs: { chars: elevenLabsCharsEstimate, sfxCount, musicCount, cost: elevenLabsCost },
      openaiText: { inputTokens: openaiInputTokens, outputTokens: openaiOutputTokens, cost: openaiTextCost },
      openaiTTS: { chars: openaiTTSChars, cost: openaiTTSCost },
    };
    const totalProviderCost = Math.round((elevenLabsCost + openaiTextCost + openaiTTSCost) * 100) / 100;
    const totalMonthlyCost = totalProviderCost;

    // ===== Activation funnel =====
    // How far do users actually get after signing up?
    //   1. Signed up             → row in users
    //   2. Opened Imagine chat   → at least one 'plan-project' credit txn
    //   3. Created a project     → row in projects
    //   4. Wrote a chapter       → row in chapters (scaffolded or AI-generated)
    //   5. Generated AI content  → any 'generate' / 'generate-stream' txn
    const [[{ value: usersOpenedChat }], [{ value: usersWithProject }], [{ value: usersWithChapter }], [{ value: usersGenerated }]] = await Promise.all([
      db.select({ value: sql<number>`COUNT(DISTINCT ${creditTransactions.userId})` })
        .from(creditTransactions)
        .where(sql`${creditTransactions.action} IN ('plan-project', 'scaffold-chapters')`),
      db.select({ value: sql<number>`COUNT(DISTINCT ${projects.userId})` }).from(projects),
      db.select({ value: sql<number>`COUNT(DISTINCT ${projects.userId})` })
        .from(chapters)
        .innerJoin(projects, eq(chapters.projectId, projects.id)),
      db.select({ value: sql<number>`COUNT(DISTINCT ${creditTransactions.userId})` })
        .from(creditTransactions)
        .where(sql`${creditTransactions.action} IN ('generate', 'generate-stream')`),
    ]);

    // Guest visitors who hit the Imagine chat without signing up
    const [{ value: guestVisitors }] = await db
      .select({ value: sql<number>`COUNT(DISTINCT ${guestEvents.ipHash})` })
      .from(guestEvents);

    const funnel = {
      signedUp: Number(totalUsers),
      guestsUsedChat: Number(guestVisitors) || 0,
      openedImagineChat: Number(usersOpenedChat) || 0,
      createdProject: Number(usersWithProject) || 0,
      wroteChapter: Number(usersWithChapter) || 0,
      generatedAi: Number(usersGenerated) || 0,
    };

    res.json({
      totalUsers,
      totalProjects,
      totalChapters,
      funnel,
      totalCreditsUsed: Number(totalCreditsUsed) || 0,
      totalAudioGens,
      recentSignups,
      monthlySignups,
      mrr,
      totalRevenue,
      invoicesPaid,
      boostRevenue,
      boostCount,
      boostUserCount,
      planBreakdown: planBreakdown.map(p => ({ plan: p.plan, count: p.count })),
      creditsByAction: creditsByAction.map(c => ({
        action: c.action,
        totalCredits: Number(c.total) || 0,
        count: c.count,
      })),
      costs: {
        totalMonthlyCost,
        profit: Math.round((mrr - totalMonthlyCost) * 100) / 100,
        margin: mrr > 0 ? Math.round(((mrr - totalMonthlyCost) / mrr) * 100) : 0,
        providers: providerCosts,
        totalProviderCost,
        breakdown: costBreakdown,
        usage: {
          totalCredits: totalMonthlyCredits,
          totalInputTokens,
          totalOutputTokens,
          totalAudioDurationSec: totalAudioDuration,
        },
      },
    });
  } catch (e: any) {
    console.error('[Admin] overview error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Users List ==========
export async function getUsers(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const sort = (req.query.sort as string) || 'recent';

    let orderBy: any;
    switch (sort) {
      case 'credits':
        orderBy = desc(users.creditsRemaining);
        break;
      case 'plan':
        orderBy = desc(users.plan);
        break;
      default:
        orderBy = desc(users.createdAt);
    }

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        plan: users.plan,
        creditsRemaining: users.creditsRemaining,
        creditsTotal: users.creditsTotal,
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Per-user platforms — derived from journey_events.platform, keyed by the
    // user_id stored in data jsonb. Only includes 'web' / 'ios' / 'android';
    // returned as a deduped string array so the admin UI can render tags.
    const userIds = rows.map((r) => r.id);
    const platformMap = new Map<string, string[]>();
    if (userIds.length > 0) {
      // Build a PG text[] literal — `${jsArray}` via Drizzle's sql template
      // doesn't always get the cast right (caused 500s on /admin/users when
      // PG couldn't infer the array element type). The literal pattern
      // matches the audio-gen-bounce endpoint and other admin queries.
      const userIdsLit = `{${userIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',')}}`;
      const platformRows = await db.execute(sql`
        SELECT data->>'user_id' AS user_id,
               array_agg(DISTINCT platform) AS platforms
        FROM journey_events
        WHERE data->>'user_id' = ANY(${userIdsLit}::text[])
          AND platform IN ('web', 'ios', 'android')
        GROUP BY data->>'user_id'
      `);
      for (const row of platformRows.rows as Array<{ user_id: string; platforms: string[] }>) {
        platformMap.set(row.user_id, row.platforms || []);
      }
    }

    // Per-user boost flag — true if the user has ever purchased a credit
    // boost (credit_transactions.action='credit-boost'). Surfaced as a
    // "BOOSTED" tag in the admin Users tab so they're easy to spot.
    const boostMap = new Map<string, { count: number; amountUsd: number }>();
    if (userIds.length > 0) {
      const userIdsLit = `{${userIds.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',')}}`;
      const boostRows = await db.execute(sql`
        SELECT user_id,
               COUNT(*)::int AS purchases,
               COALESCE(SUM((metadata->>'amountUsd')::numeric), 0)::float AS spent
        FROM credit_transactions
        WHERE action = 'credit-boost'
          AND user_id = ANY(${userIdsLit}::text[])
        GROUP BY user_id
      `);
      for (const row of boostRows.rows as Array<{ user_id: string; purchases: number; spent: number }>) {
        boostMap.set(row.user_id, { count: row.purchases, amountUsd: row.spent });
      }
    }

    const rowsWithPlatforms = rows.map((r) => {
      const boost = boostMap.get(r.id);
      return {
        ...r,
        platforms: platformMap.get(r.id) || [],
        boostCount: boost?.count || 0,
        boostSpentUsd: boost?.amountUsd || 0,
      };
    });

    const [{ value: total }] = await db.select({ value: count() }).from(users);

    res.json({ users: rowsWithPlatforms, total, limit, offset });
  } catch (e: any) {
    console.error('[Admin] users error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== User Detail ==========
export async function getUserDetail(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const userId = req.params.userId;
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        plan: users.plan,
        creditsRemaining: users.creditsRemaining,
        creditsTotal: users.creditsTotal,
        stripeCustomerId: users.stripeCustomerId,
        stripeSubscriptionId: users.stripeSubscriptionId,
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
        stripeCancelAtPeriodEnd: users.stripeCancelAtPeriodEnd,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return res.status(404).json({ error: 'User not found' });

    // User's projects
    const userProjects = await db
      .select({
        id: projects.id,
        title: projects.title,
        type: projects.type,
        status: projects.status,
        createdAt: projects.createdAt,
        isPublic: projects.isPublic,
        slug: projects.slug,
        listens: projects.listens,
      })
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt));

    // User's recent transactions
    const recentTx = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(50);

    // Total credits used — exclude admin grant/debit rows.
    const [{ value: totalUsed }] = await db
      .select({ value: sum(creditTransactions.creditsUsed) })
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.userId, userId),
        gt(creditTransactions.creditsUsed, 0),
      ));

    const platformRows = await db.execute(sql`
      SELECT array_agg(DISTINCT platform) AS platforms
      FROM journey_events
      WHERE data->>'user_id' = ${userId}
        AND platform IN ('web', 'ios', 'android')
    `);
    const platforms: string[] = (platformRows.rows[0] as any)?.platforms || [];

    // Boost stats for the user detail panel — # of top-up purchases + total
    // USD spent. Sourced from credit_transactions metadata.amountUsd.
    const boostStatsRows = await db.execute(sql`
      SELECT COUNT(*)::int AS purchases,
             COALESCE(SUM((metadata->>'amountUsd')::numeric), 0)::float AS spent
      FROM credit_transactions
      WHERE user_id = ${userId} AND action = 'credit-boost'
    `);
    const boostStats = (boostStatsRows.rows?.[0] || {}) as any;
    const boostCount = Number(boostStats.purchases) || 0;
    const boostSpentUsd = Math.round((Number(boostStats.spent) || 0) * 100) / 100;

    res.json({
      user: { ...user, platforms, boostCount, boostSpentUsd },
      projects: userProjects,
      recentTransactions: recentTx,
      totalCreditsUsed: Number(totalUsed) || 0,
    });
  } catch (e: any) {
    console.error('[Admin] user detail error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Delete User (cascade) ==========
// DELETE /api/admin/users/:userId?confirm=true
//
// Destructive. Deletes the user row; FKs cascade to sessions, projects,
// chapters, canon entries, credit_transactions, audio_generations, and
// support_requests. sfx_library.userId is set null (shared assets preserved).
// Guest event rows are anonymous and left intact.
//
// Safety rails:
//   - requires ?confirm=true query param (guards accidental DELETEs)
//   - refuses to delete ADMIN_EMAILS accounts
//   - returns per-table counts so the caller can audit
export async function clearChapterScenes(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const chapterId = req.params.chapterId;
    const [chapter] = await db
      .select({ id: chapters.id, projectId: chapters.projectId, number: chapters.number, scenes: chapters.scenes })
      .from(chapters)
      .where(eq(chapters.id, chapterId));
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

    const before = (chapter.scenes as any[] || []).length;
    await db.update(chapters).set({ scenes: [], updatedAt: new Date() }).where(eq(chapters.id, chapterId));

    console.log(`[Admin] cleared ${before} scenes on chapter ${chapterId} by ${admin.user.email}`);
    res.json({ ok: true, chapterId, scenesCleared: before });
  } catch (e: any) {
    console.error('[Admin] clear scenes error:', e);
    res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}

export async function adjustUserCredits(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const userId = req.params.userId;
    const delta = Number((req.body as any)?.delta);
    const reason = String((req.body as any)?.reason || 'admin adjustment');
    if (!Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'delta must be a non-zero number' });
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, creditsRemaining: users.creditsRemaining })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    const before = user.creditsRemaining || 0;
    const after = Math.max(0, before + delta);

    await db.update(users).set({ creditsRemaining: after }).where(eq(users.id, userId));
    await db.insert(creditTransactions).values({
      userId,
      action: delta > 0 ? 'admin-grant' : 'admin-debit',
      creditsUsed: -delta,
      model: '',
      metadata: { reason, adjustedBy: admin.user.email, before, after },
    });

    res.json({ ok: true, userId, email: user.email, delta, before, after, reason });
  } catch (e: any) {
    console.error('[Admin] adjust credits error:', e);
    res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.query.confirm !== 'true') {
      return res.status(400).json({ error: 'Missing confirm=true query param' });
    }

    const userId = req.params.userId;
    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (ADMIN_EMAILS.has(user.email)) {
      return res.status(403).json({ error: 'Refusing to delete admin account', email: user.email });
    }

    // Snapshot cascade counts before delete (for audit response)
    const [[{ value: projectCount }], [{ value: chapterCount }], [{ value: txCount }], [{ value: audioCount }]] = await Promise.all([
      db.select({ value: count() }).from(projects).where(eq(projects.userId, userId)),
      db.select({ value: count() }).from(chapters)
        .where(sql`${chapters.projectId} IN (SELECT id FROM projects WHERE user_id = ${userId})`),
      db.select({ value: count() }).from(creditTransactions).where(eq(creditTransactions.userId, userId)),
      db.select({ value: count() }).from(audioGenerations).where(eq(audioGenerations.userId, userId)),
    ]);

    await db.delete(users).where(eq(users.id, userId));

    const deleted = {
      user: { id: user.id, email: user.email },
      cascaded: {
        projects: Number(projectCount) || 0,
        chapters: Number(chapterCount) || 0,
        creditTransactions: Number(txCount) || 0,
        audioGenerations: Number(audioCount) || 0,
      },
      deletedBy: admin.user.email,
      at: new Date().toISOString(),
    };
    console.log('[Admin] user deleted:', JSON.stringify(deleted));
    res.json({ ok: true, ...deleted });
  } catch (e: any) {
    console.error('[Admin] delete user error:', e);
    res.status(500).json({ error: 'Internal server error', message: e?.message });
  }
}

// ========== Recent Activity Feed ==========
export async function getActivity(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const authedRows = await db
      .select({
        id: creditTransactions.id,
        userId: creditTransactions.userId,
        action: creditTransactions.action,
        creditsUsed: creditTransactions.creditsUsed,
        model: creditTransactions.model,
        chapterId: creditTransactions.chapterId,
        metadata: creditTransactions.metadata,
        createdAt: creditTransactions.createdAt,
        userName: users.name,
        userEmail: users.email,
        userPlan: users.plan,
      })
      .from(creditTransactions)
      .leftJoin(users, eq(creditTransactions.userId, users.id))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(limit);

    // Fold in guest (signed-out) activity — these users don't have accounts
    // so they're invisible in credit_transactions. Show them as anonymous
    // rows tagged with isGuest:true and a stable ipHash-prefix label.
    const guestRows = await db
      .select({
        id: guestEvents.id,
        ipHash: guestEvents.ipHash,
        event: guestEvents.event,
        action: guestEvents.action,
        model: guestEvents.model,
        country: guestEvents.country,
        guestMetadata: guestEvents.metadata,
        createdAt: guestEvents.createdAt,
      })
      .from(guestEvents)
      .orderBy(desc(guestEvents.createdAt))
      .limit(limit);

    const guestAsActivity = guestRows.map((g) => ({
      id: -g.id, // negative to avoid key collision with credit_transactions ids
      userId: null as string | null,
      action: g.action || g.event,
      creditsUsed: 0,
      model: g.model || null,
      chapterId: null as string | null,
      metadata: null,
      createdAt: g.createdAt,
      userName: `Guest · ${(g.ipHash || '').slice(0, 6)}`,
      userEmail: null as string | null,
      userPlan: 'guest' as string,
      isGuest: true as const,
      country: g.country || null,
      ipHashPrefix: (g.ipHash || '').slice(0, 6),
      guestMetadata: g.guestMetadata || null,
    }));

    const merged = [
      ...authedRows.map((r) => ({ ...r, isGuest: false as const })),
      ...guestAsActivity,
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    // Accumulate every IP the admin has ever loaded the dashboard from.
    // Stored server-side in the admin user's settings.knownAdminIps so
    // ALL devices share the same "You" list — the whole point of opening
    // the dashboard from each device.
    const adminIp = requestClientIp(req);
    const adminIpHash = hashIpForAdmin(adminIp).slice(0, 6);
    const adminSettings = ((admin.user.settings || {}) as Record<string, any>);
    const knownIps: string[] = Array.isArray(adminSettings.knownAdminIps)
      ? adminSettings.knownAdminIps
      : [];
    if (!knownIps.includes(adminIpHash)) {
      knownIps.push(adminIpHash);
      await db.update(users).set({
        settings: sql`COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({ knownAdminIps: knownIps })}::jsonb`,
      }).where(eq(users.id, admin.user.id));
    }

    res.json({ activity: merged, adminIpHash, knownAdminIps: knownIps });
  } catch (e: any) {
    console.error('[Admin] activity error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Daily Stats (last 30 days) ==========
export async function getDailyStats(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Signups per day
    const signups = await db.execute(sql`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM users
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY day
    `);

    // Credits used per day — ignore admin grant/debit rows (negative creditsUsed).
    const creditsPerDay = await db.execute(sql`
      SELECT DATE(created_at) as day, SUM(credits_used) as total, COUNT(*) as count
      FROM credit_transactions
      WHERE created_at > NOW() - INTERVAL '30 days'
        AND credits_used > 0
      GROUP BY DATE(created_at)
      ORDER BY day
    `);

    res.json({
      signups: (signups.rows || signups) as any[],
      creditsPerDay: (creditsPerDay.rows || creditsPerDay) as any[],
    });
  } catch (e: any) {
    console.error('[Admin] daily stats error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Push Notifications ==========
// Lists every registered Expo push token joined with its owner so the admin
// UI can show "who would actually receive this." Sorted newest-active first.
export async function listPushTokens(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const rows = await db
      .select({
        token: pushTokens.token,
        platform: pushTokens.platform,
        createdAt: pushTokens.createdAt,
        lastSeenAt: pushTokens.lastSeenAt,
        userId: pushTokens.userId,
        email: users.email,
        name: users.name,
        plan: users.plan,
      })
      .from(pushTokens)
      .leftJoin(users, eq(users.id, pushTokens.userId))
      .orderBy(desc(pushTokens.lastSeenAt));

    res.json({ tokens: rows, total: rows.length });
  } catch (e: any) {
    console.error('[Admin] list push tokens error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Composes and dispatches a push from the admin UI. Body shape:
//   { title, body, data?, target: { all?: true } | { userIds: string[] } | { tokens: string[] } }
// Returns full ticket details so the UI can render per-device success/failure.
export async function sendAdminPush(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { title, body, data, target } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'body is required' });
    }
    if (!target || typeof target !== 'object') {
      return res.status(400).json({ error: 'target is required' });
    }

    let tokens: string[] = [];
    if (target.all === true) {
      const rows = await db.select({ token: pushTokens.token }).from(pushTokens);
      tokens = rows.map((r) => r.token);
    } else if (Array.isArray(target.userIds) && target.userIds.length > 0) {
      const rows = await db
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(inArray(pushTokens.userId, target.userIds));
      tokens = rows.map((r) => r.token);
    } else if (Array.isArray(target.tokens) && target.tokens.length > 0) {
      tokens = target.tokens.filter((t: unknown) => typeof t === 'string' && t.length > 0);
    } else {
      return res.status(400).json({ error: 'target must specify all, userIds, or tokens' });
    }

    if (tokens.length === 0) {
      return res.json({ sent: 0, pruned: 0, tickets: [], note: 'No matching tokens.' });
    }

    // Template personalization — {{bookTitle}} and {{projectId}} expand to each
    // recipient's most recent active project. Tokens belonging to users with no
    // project are dropped (no hook to anchor the message on).
    const rawTitle = title.trim();
    const rawBody = body.trim();
    const dataObj = data && typeof data === 'object' ? data : undefined;
    const dataStr = dataObj ? JSON.stringify(dataObj) : '';
    const needsPersonalization = /\{\{(bookTitle|projectId)\}\}/.test(`${rawTitle}\n${rawBody}\n${dataStr}`);

    let perToken: Map<string, { title?: string; body?: string; data?: Record<string, any> } | null> | undefined;
    let droppedNoProject = 0;

    if (needsPersonalization) {
      const ownerRows = await db
        .select({ token: pushTokens.token, userId: pushTokens.userId })
        .from(pushTokens)
        .where(inArray(pushTokens.token, tokens));
      const userIdToTokens = new Map<string, string[]>();
      for (const row of ownerRows) {
        const arr = userIdToTokens.get(row.userId) || [];
        arr.push(row.token);
        userIdToTokens.set(row.userId, arr);
      }
      const userIds = Array.from(userIdToTokens.keys());

      // Most recent active project per user — sorted by createdAt desc, dedup
      // by userId. status='active' filters out deleted/archived books.
      const projectRows = userIds.length === 0 ? [] : await db
        .select({ id: projects.id, title: projects.title, userId: projects.userId, createdAt: projects.createdAt })
        .from(projects)
        .where(and(inArray(projects.userId, userIds), eq(projects.status, 'active')))
        .orderBy(desc(projects.createdAt));
      const projectByUser = new Map<string, { id: string; title: string }>();
      for (const p of projectRows) {
        if (!projectByUser.has(p.userId)) projectByUser.set(p.userId, { id: p.id, title: p.title });
      }

      perToken = new Map();
      const substitute = (s: string, vars: Record<string, string>) =>
        s.replace(/\{\{(bookTitle|projectId)\}\}/g, (_m, k) => vars[k] ?? '');

      for (const [userId, userTokens] of userIdToTokens.entries()) {
        const proj = projectByUser.get(userId);
        if (!proj) {
          // No book → drop these tokens. Marking with `null` signals
          // sendPushToTokens to skip them entirely.
          droppedNoProject += userTokens.length;
          for (const t of userTokens) perToken.set(t, null);
          continue;
        }
        const vars = { bookTitle: proj.title || 'your book', projectId: proj.id };
        const personalizedData = dataObj
          ? JSON.parse(substitute(JSON.stringify(dataObj), vars))
          : undefined;
        const override = {
          title: substitute(rawTitle, vars),
          body: substitute(rawBody, vars),
          data: personalizedData,
        };
        for (const t of userTokens) perToken.set(t, override);
      }
    }

    const result = await sendPushToTokens(
      tokens,
      { title: rawTitle, body: rawBody, data: dataObj },
      perToken,
    );

    if (droppedNoProject > 0) {
      const baseNote = result.note ? `${result.note} · ` : '';
      result.note = `${baseNote}${droppedNoProject} skipped (no project to reference)`;
    }
    res.json(result);
  } catch (e: any) {
    console.error('[Admin] send push error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// ========== Disk Verification ==========
// Cross-checks every DB-referenced file against the filesystem. If any audio
// or cover row points to a missing file, that's evidence of accidental data
// loss. Use this after running cleanupDisk to confirm nothing user-facing
// was wrongly removed.
export async function verifyUploads(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const fileExists = (relUrl: string | null): boolean => {
      if (!relUrl) return false;
      // /uploads/audio/foo.mp3 → audio/foo.mp3 (preserve subdir so we look in the right place)
      const m = relUrl.match(/\/uploads\/(.+)$/);
      if (!m) return false;
      return fs.existsSync(path.join(uploadsRoot, m[1]));
    };
    const isOurDisk = (url: string | null) => !!url && url.startsWith('/uploads/');

    const audioRows = await db
      .select({
        id: audioGenerations.id,
        url: audioGenerations.audioUrl,
        isActive: audioGenerations.isActive,
        chapterId: audioGenerations.chapterId,
        version: audioGenerations.version,
        userId: audioGenerations.userId,
      })
      .from(audioGenerations);

    const audioMissing: any[] = [];
    let audioPresent = 0;
    for (const r of audioRows) {
      if (fileExists(r.url)) audioPresent += 1;
      else audioMissing.push({ id: r.id, url: r.url, isActive: r.isActive, chapterId: r.chapterId, version: r.version, userId: r.userId });
    }

    // Helper: scan a list of {id, url, ...} rows and split into present/missing/external.
    const scan = <T extends { url: string | null }>(rows: T[]) => {
      const missing: T[] = [];
      let present = 0;
      let externalOrNull = 0;
      for (const r of rows) {
        if (!isOurDisk(r.url)) { externalOrNull += 1; continue; }
        if (fileExists(r.url)) present += 1;
        else missing.push(r);
      }
      return { totalRows: rows.length, present, externalOrNull, missing: missing.length, missingSample: missing.slice(0, 20) };
    };

    const projectRows = await db
      .select({ id: projects.id, title: projects.title, url: projects.coverUrl, userId: projects.userId })
      .from(projects);

    const chapterRows = await db
      .select({ id: chapters.id, projectId: chapters.projectId, url: chapters.imageUrl })
      .from(chapters);

    const canonRows = await db
      .select({ id: canonEntries.id, projectId: canonEntries.projectId, name: canonEntries.name, type: canonEntries.type, url: canonEntries.imageUrl })
      .from(canonEntries);

    res.json({
      audio: {
        totalRows: audioRows.length,
        present: audioPresent,
        missing: audioMissing.length,
        missingSample: audioMissing.slice(0, 20),
      },
      projectCovers: scan(projectRows),
      chapterImages: scan(chapterRows),
      canonImages: scan(canonRows),
    });
  } catch (e: any) {
    console.error("[Admin] verifyUploads error:", e);
    res.status(500).json({ error: e?.message || "Internal server error" });
  }
}

// ========== Pending Notice (in-app announcement) ==========
// Stashes a one-shot notice into users.settings.pendingNotice. Mobile/web
// clients read it via /api/auth/me, render a modal on next bootstrap, and
// call POST /api/users/me/dismiss-notice when the user taps OK.
export async function setPendingNotice(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { userIds, notice } = req.body || {};
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'userIds[] required' });
    }
    if (!notice || typeof notice.title !== 'string' || typeof notice.body !== 'string') {
      return res.status(400).json({ error: 'notice { title, body, ctaText?, ctaPath? } required' });
    }
    const noticeRow = {
      title: String(notice.title).slice(0, 200),
      body: String(notice.body).slice(0, 1000),
      ctaText: notice.ctaText ? String(notice.ctaText).slice(0, 60) : undefined,
      ctaPath: notice.ctaPath ? String(notice.ctaPath).slice(0, 200) : undefined,
      setAt: new Date().toISOString(),
    };

    let updated = 0;
    const failed: string[] = [];
    for (const uid of userIds) {
      try {
        const [u] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, uid));
        if (!u) { failed.push(uid); continue; }
        const newSettings = { ...(u.settings as Record<string, any> || {}), pendingNotice: noticeRow };
        await db.update(users).set({ settings: newSettings }).where(eq(users.id, uid));
        updated += 1;
      } catch (e) {
        failed.push(uid);
      }
    }
    res.json({ updated, failed, notice: noticeRow });
  } catch (e: any) {
    console.error('[Admin] setPendingNotice error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// ========== User Cover Health ==========
// Per-user breakdown: how many of their projects still have a valid cover
// vs. dropped to placeholder after the disk-cleanup incident. A "valid" cover
// is anything that resolves: a data: URI, an external URL, or a file we
// still have on disk.
export async function userCoverHealth(_req: Request, res: Response) {
  try {
    const admin = await requireAdmin(_req, res);
    if (!admin) return;

    const uploadsRoot = path.resolve(process.cwd(), 'uploads');
    const urlWorks = (url: string | null): boolean => {
      if (!url) return false;
      if (url.startsWith('data:')) return true;
      if (url.startsWith('http://') || url.startsWith('https://')) return true;
      if (url.startsWith('/uploads/')) {
        const m = url.match(/^\/uploads\/(.+)$/);
        if (!m) return false;
        return fs.existsSync(path.join(uploadsRoot, m[1]));
      }
      return false;
    };

    const rows = await db
      .select({
        userId: projects.userId,
        coverUrl: projects.coverUrl,
        userEmail: users.email,
        userName: users.name,
      })
      .from(projects)
      .leftJoin(users, eq(users.id, projects.userId));

    const byUser = new Map<string, { userId: string; email: string | null; name: string | null; total: number; withCover: number; nullCover: number }>();
    for (const r of rows) {
      const key = r.userId;
      let entry = byUser.get(key);
      if (!entry) {
        entry = { userId: key, email: r.userEmail, name: r.userName, total: 0, withCover: 0, nullCover: 0 };
        byUser.set(key, entry);
      }
      entry.total += 1;
      if (urlWorks(r.coverUrl)) entry.withCover += 1;
      else entry.nullCover += 1;
    }

    const breakdown = Array.from(byUser.values()).sort((a, b) => b.total - a.total);
    const totals = breakdown.reduce(
      (acc, u) => ({
        users: acc.users + 1,
        projects: acc.projects + u.total,
        withCover: acc.withCover + u.withCover,
        nullCover: acc.nullCover + u.nullCover,
      }),
      { users: 0, projects: 0, withCover: 0, nullCover: 0 },
    );

    res.json({ totals, breakdown });
  } catch (e: any) {
    console.error('[Admin] userCoverHealth error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// ========== Backfill Broken Images ==========
// Repairs DB rows whose imageUrl points to a now-missing file (collateral
// damage from the 2026-04-30 cleanupDisk bug that wiped /uploads/generated/).
// Strategy:
//   - project.coverUrl missing  → replace with first surviving chapter image
//                                  in that project; null out if none survive.
//   - chapter.imageUrl missing  → replace with project.coverUrl (if valid),
//                                  else first sibling chapter image, else null.
//   - canon.imageUrl missing    → null out (no sensible substitute).
// Always returns the full change plan; only writes when dryRun=false.
export async function backfillBrokenImages(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const dryRun = req.body?.dryRun !== false;

    const uploadsRoot = path.resolve(process.cwd(), "uploads");
    const onDisk = (url: string | null): boolean => {
      if (!url) return false;
      const m = url.match(/^\/uploads\/(.+)$/);
      if (!m) return false;
      return fs.existsSync(path.join(uploadsRoot, m[1]));
    };
    // A URL "works" if it's a data: URI, an external https URL, or a file we still have.
    const urlWorks = (url: string | null): boolean => {
      if (!url) return false;
      if (url.startsWith('data:')) return true;
      if (url.startsWith('http://') || url.startsWith('https://')) return true;
      if (url.startsWith('/uploads/')) return onDisk(url);
      return false;
    };

    type Change = { table: string; id: string; oldUrl: string | null; newUrl: string | null; reason: string };
    const changes: Change[] = [];

    // Pull everything once so we can pick fallbacks without re-querying per row.
    const allProjects = await db
      .select({ id: projects.id, title: projects.title, coverUrl: projects.coverUrl })
      .from(projects);
    const allChapters = await db
      .select({ id: chapters.id, projectId: chapters.projectId, imageUrl: chapters.imageUrl })
      .from(chapters);
    const allCanon = await db
      .select({ id: canonEntries.id, imageUrl: canonEntries.imageUrl })
      .from(canonEntries);

    // Index chapters by project for fallback lookups
    const chaptersByProject = new Map<string, { id: string; imageUrl: string | null }[]>();
    for (const c of allChapters) {
      const arr = chaptersByProject.get(c.projectId) || [];
      arr.push({ id: c.id, imageUrl: c.imageUrl });
      chaptersByProject.set(c.projectId, arr);
    }

    // 1) Project covers
    for (const p of allProjects) {
      if (!p.coverUrl) continue;
      if (urlWorks(p.coverUrl)) continue;
      // Look for any chapter in this project with a working image
      const siblings = chaptersByProject.get(p.id) || [];
      const fallback = siblings.find((c) => urlWorks(c.imageUrl))?.imageUrl ?? null;
      changes.push({
        table: 'projects',
        id: p.id,
        oldUrl: p.coverUrl,
        newUrl: fallback,
        reason: fallback ? `recovered from chapter image in same project` : `no surviving image in project — set null (placeholder)`,
      });
    }

    // 2) Chapter images
    for (const c of allChapters) {
      if (!c.imageUrl) continue;
      if (urlWorks(c.imageUrl)) continue;
      // Try project cover, then a sibling chapter image
      const proj = allProjects.find((p) => p.id === c.projectId);
      const projCover = proj?.coverUrl;
      let fallback: string | null = null;
      if (urlWorks(projCover)) fallback = projCover ?? null;
      else {
        const siblings = chaptersByProject.get(c.projectId) || [];
        fallback = siblings.find((s) => s.id !== c.id && urlWorks(s.imageUrl))?.imageUrl ?? null;
      }
      changes.push({
        table: 'chapters',
        id: c.id,
        oldUrl: c.imageUrl,
        newUrl: fallback,
        reason: fallback ? `recovered from project cover or sibling chapter` : `no surviving image — set null (placeholder)`,
      });
    }

    // 3) Canon images — null out (per-entity images, no useful fallback)
    for (const e of allCanon) {
      if (!e.imageUrl) continue;
      if (urlWorks(e.imageUrl)) continue;
      changes.push({
        table: 'canon_entries',
        id: e.id,
        oldUrl: e.imageUrl,
        newUrl: null,
        reason: 'canon image missing — set null (placeholder)',
      });
    }

    let written = 0;
    if (!dryRun) {
      for (const ch of changes) {
        try {
          if (ch.table === 'projects') {
            await db.update(projects).set({ coverUrl: ch.newUrl }).where(eq(projects.id, ch.id));
          } else if (ch.table === 'chapters') {
            await db.update(chapters).set({ imageUrl: ch.newUrl }).where(eq(chapters.id, ch.id));
          } else if (ch.table === 'canon_entries') {
            await db.update(canonEntries).set({ imageUrl: ch.newUrl }).where(eq(canonEntries.id, ch.id));
          }
          written += 1;
        } catch (e: any) {
          console.error('[backfill] update failed for', ch.table, ch.id, e?.message || e);
        }
      }
    }

    const summary = {
      projects: changes.filter((c) => c.table === 'projects').length,
      chapters: changes.filter((c) => c.table === 'chapters').length,
      canon: changes.filter((c) => c.table === 'canon_entries').length,
      recovered: changes.filter((c) => c.newUrl !== null).length,
      nulled: changes.filter((c) => c.newUrl === null).length,
    };

    res.json({
      dryRun,
      summary,
      written,
      changes: dryRun ? changes : changes.slice(0, 50), // full plan in dry run; sample on execute (response size)
    });
  } catch (e: any) {
    console.error('[Admin] backfillBrokenImages error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// ========== Disk Cleanup ==========
// Removes orphaned/scratch files from the persistent uploads directory so the
// Render disk does not fill up. Triggered manually after monitoring shows
// usage approaching the disk cap. ENOSPC errors on /api/upload/cover or TTS
// writes are the canary that this needs to run.
export async function cleanupDisk(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const dryRun = req.body?.dryRun !== false; // default to dry-run for safety
    const dropInactive = req.body?.dropInactive === true; // also remove inactive audio versions
    // categories: scope cleanup to a subset of dirs. Default = all three.
    // Use this for phased rollout: start with ['generated'] (zero risk), then
    // add ['covers'], then ['audio'] after each phase confirms safe.
    const requestedCats: string[] = Array.isArray(req.body?.categories)
      ? req.body.categories
      : ['audio', 'covers', 'generated'];
    const cats = new Set(requestedCats.filter((c) => ['audio', 'covers', 'generated'].includes(c)));
    const uploadsRoot = path.resolve(process.cwd(), "uploads");

    const report: Record<string, { scanned: number; toDelete: number; bytes: number; sample: string[] }> = {};
    const recordTarget = (key: string, fp: string, size: number) => {
      const r = (report[key] ||= { scanned: 0, toDelete: 0, bytes: 0, sample: [] });
      r.toDelete += 1;
      r.bytes += size;
      if (r.sample.length < 5) r.sample.push(fp.replace(uploadsRoot, ""));
    };

    const walk = (dir: string): { path: string; size: number }[] => {
      const out: { path: string; size: number }[] = [];
      try {
        for (const f of fs.readdirSync(dir)) {
          const fp = path.join(dir, f);
          const st = fs.statSync(fp);
          if (st.isDirectory()) out.push(...walk(fp));
          else out.push({ path: fp, size: st.size });
        }
      } catch {}
      return out;
    };

    // Build the keep-set from DB. Filenames in DB are stored as URLs like
    // /uploads/audio/{...}.mp3 — we key off the basename so any path-prefix
    // change still matches.
    const audioRows = await db
      .select({ url: audioGenerations.audioUrl, isActive: audioGenerations.isActive })
      .from(audioGenerations);
    const audioKeep = new Set<string>();
    const audioInactive = new Set<string>();
    for (const r of audioRows) {
      const base = path.basename(r.url || "");
      if (!base) continue;
      if (r.isActive || !dropInactive) audioKeep.add(base);
      else audioInactive.add(base);
    }

    // Image keep-set: union of every URL in projects.coverUrl,
    // chapters.imageUrl, canonEntries.imageUrl. Files in BOTH /uploads/covers/
    // and /uploads/generated/ may be referenced from any of these — the
    // generated dir was historically wrongly assumed to be debug-only.
    const projectRowsForKeep = await db.select({ url: projects.coverUrl }).from(projects);
    const chapterRowsForKeep = await db.select({ url: chapters.imageUrl }).from(chapters);
    const canonRowsForKeep = await db.select({ url: canonEntries.imageUrl }).from(canonEntries);
    const imageKeep = new Set<string>();
    for (const rows of [projectRowsForKeep, chapterRowsForKeep, canonRowsForKeep]) {
      for (const r of rows) {
        const base = path.basename(r.url || "");
        if (base) imageKeep.add(base);
      }
    }

    const audioFiles = cats.has('audio') ? walk(path.join(uploadsRoot, "audio")) : [];
    const coverFiles = cats.has('covers') ? walk(path.join(uploadsRoot, "covers")) : [];
    const generatedFiles = cats.has('generated') ? walk(path.join(uploadsRoot, "generated")) : []; // grok-debug scratch — always safe to drop

    if (cats.has('audio')) report.audio = { scanned: audioFiles.length, toDelete: 0, bytes: 0, sample: [] };
    if (cats.has('covers')) report.covers = { scanned: coverFiles.length, toDelete: 0, bytes: 0, sample: [] };
    if (cats.has('generated')) report.generated = { scanned: generatedFiles.length, toDelete: 0, bytes: 0, sample: [] };

    const targets: { path: string; size: number }[] = [];

    for (const f of audioFiles) {
      const base = path.basename(f.path);
      // Skip files modified within the last hour to avoid races with in-flight TTS writes.
      try {
        const st = fs.statSync(f.path);
        if (Date.now() - st.mtimeMs < 60 * 60 * 1000) continue;
      } catch { continue; }
      const orphan = !audioKeep.has(base) && !audioInactive.has(base);
      const inactive = dropInactive && audioInactive.has(base);
      if (orphan || inactive) {
        targets.push(f);
        recordTarget("audio", f.path, f.size);
      }
    }

    for (const f of coverFiles) {
      const base = path.basename(f.path);
      try {
        const st = fs.statSync(f.path);
        if (Date.now() - st.mtimeMs < 60 * 60 * 1000) continue;
      } catch { continue; }
      if (!imageKeep.has(base)) {
        targets.push(f);
        recordTarget("covers", f.path, f.size);
      }
    }

    for (const f of generatedFiles) {
      // /generated/ holds production cover/chapter/canon images, NOT debug
      // scratch — image-gen.ts writes here. Must consult imageKeep, never
      // delete unconditionally. (We learned this the hard way; see git log.)
      const base = path.basename(f.path);
      try {
        const st = fs.statSync(f.path);
        if (Date.now() - st.mtimeMs < 60 * 60 * 1000) continue;
      } catch { continue; }
      if (!imageKeep.has(base)) {
        targets.push(f);
        recordTarget("generated", f.path, f.size);
      }
    }

    let deleted = 0;
    let bytesFreed = 0;
    let manifestPath: string | null = null;
    if (!dryRun) {
      // Always write a deletion manifest to disk BEFORE unlinking, in a
      // location the cleanup itself never scans. If something goes wrong we
      // have a permanent record of every path we removed.
      const manifestDir = path.join(uploadsRoot, '.cleanup-manifests');
      if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      manifestPath = path.join(manifestDir, `${ts}.json`);
      try {
        fs.writeFileSync(manifestPath, JSON.stringify({
          timestamp: new Date().toISOString(),
          dropInactive,
          categories: Array.from(cats),
          targets: targets.map((t) => ({
            path: t.path.replace(uploadsRoot, ''),
            size: t.size,
            basename: path.basename(t.path),
          })),
        }, null, 2));
      } catch (e: any) {
        // If we can't write the manifest, refuse to delete. ENOSPC is the
        // exact reason this endpoint exists; failing safe is the right call.
        return res.status(500).json({
          error: 'Could not write deletion manifest — refusing to delete without an audit trail',
          detail: e?.message,
        });
      }
      for (const t of targets) {
        try {
          fs.unlinkSync(t.path);
          deleted += 1;
          bytesFreed += t.size;
        } catch {}
      }
    }

    res.json({
      dryRun,
      dropInactive,
      manifestPath,
      report,
      totals: {
        candidatesToDelete: targets.length,
        candidateBytes: targets.reduce((a, b) => a + b.size, 0),
        deleted,
        bytesFreed,
      },
    });
  } catch (e: any) {
    console.error("[Admin] cleanupDisk error:", e);
    res.status(500).json({ error: e?.message || "Internal server error" });
  }
}

// iOS launch recipients — every user who has been shown the modal, plus
// whether they opted in. Sort newest-seen first.
export async function listIosLaunchRecipients(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        plan: users.plan,
        settings: users.settings,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(sql`${users.settings} ? 'iosLaunchSeen' OR ${users.settings} ? 'iosLaunchOptInAt'`);

    const recipients = rows
      .map((r) => {
        const s = (r.settings as any) || {};
        const optedInAt = (s.iosLaunchOptInAt as string | undefined) ?? null;
        // Pre-tracking rows may have only iosLaunchSeen=true with no
        // iosLaunchSeenAt — fall back to opt-in time, then to updatedAt.
        const seenAt =
          (s.iosLaunchSeenAt as string | undefined) ??
          optedInAt ??
          (r.updatedAt ? new Date(r.updatedAt).toISOString() : null);
        return {
          id: r.id,
          email: r.email,
          name: r.name,
          plan: r.plan,
          status: optedInAt ? ('opted-in' as const) : ('dismissed' as const),
          seenAt,
          optedInAt,
          createdAt: r.createdAt,
        };
      })
      .sort((a, b) => {
        const ax = a.seenAt || '';
        const bx = b.seenAt || '';
        return ax < bx ? 1 : -1;
      });

    const optedInCount = recipients.filter((r) => r.status === 'opted-in').length;
    res.json({
      recipients,
      total: recipients.length,
      optedInCount,
      dismissedCount: recipients.length - optedInCount,
    });
  } catch (e: any) {
    console.error('[Admin] list ios launch recipients error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Email (welcome / audiobook-ready / announcements) ==========
// Compose & send a transactional or announcement email to a target audience.
// Body shape:
//   {
//     subject: string;
//     bodyHtml: string;                  // inner body, gets wrapped + var-substituted
//     kind: 'announcement' | ...;        // affects per-category opt-out enforcement
//     target:
//       | { all: true }                  // every active user with an email
//       | { iosOptIns: true }            // users who clicked Notify Me on the iOS launch modal
//       | { userIds: string[] };
//     force?: boolean;                   // bypass opt-out (admin override)
//   }
// Sends are sequential with a small delay so we don't trip Gmail's per-second
// rate limit. Returns counts + per-recipient status.
export async function sendBulkEmail(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { subject, bodyHtml, kind, target, force } = req.body || {};
    if (typeof subject !== 'string' || !subject.trim()) return res.status(400).json({ error: 'subject required' });
    if (typeof bodyHtml !== 'string' || !bodyHtml.trim()) return res.status(400).json({ error: 'bodyHtml required' });
    if (!target || typeof target !== 'object') return res.status(400).json({ error: 'target required' });
    const allowedKinds: EmailKind[] = ['announcement', 'welcome', 'audiobook-ready'];
    const sendKind: EmailKind = allowedKinds.includes(kind) ? kind : 'announcement';

    let recipients: { id: string; email: string; name: string | null; settings: any }[] = [];
    if (target.all === true) {
      recipients = await db
        .select({ id: users.id, email: users.email, name: users.name, settings: users.settings })
        .from(users);
    } else if (target.iosOptIns === true) {
      const rows = await db
        .select({ id: users.id, email: users.email, name: users.name, settings: users.settings })
        .from(users)
        .where(sql`${users.settings} ? 'iosLaunchOptInAt'`);
      recipients = rows;
    } else if (Array.isArray(target.userIds) && target.userIds.length > 0) {
      const rows = await db
        .select({ id: users.id, email: users.email, name: users.name, settings: users.settings })
        .from(users)
        .where(inArray(users.id, target.userIds));
      recipients = rows;
    } else {
      return res.status(400).json({ error: 'target must specify all, iosOptIns, or userIds' });
    }

    // De-dup defensively in case targets overlap.
    const seen = new Set<string>();
    recipients = recipients.filter((r) => {
      if (!r.email || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (recipients.length === 0) return res.status(400).json({ error: 'No recipients matched.' });

    // Hard cap so an accidental "all" can't blast 50k emails before someone
    // notices. Bumpable via env if Theodore actually grows past this.
    const MAX = Number(process.env.EMAIL_BULK_MAX || 5000);
    if (recipients.length > MAX) return res.status(400).json({ error: `Too many recipients (${recipients.length} > ${MAX}). Bump EMAIL_BULK_MAX to override.` });

    let sent = 0, optedOut = 0, failed = 0;
    const results: Array<{ email: string; status: string; error?: string }> = [];
    for (const r of recipients) {
      const firstName = (r.name || '').split(/\s+/)[0] || 'there';
      const personalized = substituteVars(bodyHtml, {
        firstName, email: r.email, appUrl: APP_URL,
      });
      const personalizedSubject = substituteVars(subject, {
        firstName, email: r.email, appUrl: APP_URL,
      });
      const out = await sendToUser({
        user: r,
        kind: sendKind,
        subject: personalizedSubject,
        bodyHtml: personalized,
        force: Boolean(force),
        metadata: { admin: admin.user.email, target: target.all ? 'all' : target.iosOptIns ? 'iosOptIns' : 'userIds' },
      });
      if (out.status === 'sent') sent++;
      else if (out.status === 'skipped-opt-out') optedOut++;
      else failed++;
      results.push({ email: r.email, status: out.status, error: out.error });
      // Gmail SMTP allows ~100/sec but we don't need that fast. 80ms gap → 12/sec.
      await new Promise((resolve) => setTimeout(resolve, 80));
    }

    res.json({ sent, optedOut, failed, total: recipients.length, results });
  } catch (e: any) {
    console.error('[Admin] send bulk email error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// Recent transactional emails — newest first.
export async function listEmailHistory(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const rows = await db
      .select({
        id: transactionalEmails.id,
        userId: transactionalEmails.userId,
        toAddress: transactionalEmails.toAddress,
        kind: transactionalEmails.kind,
        subject: transactionalEmails.subject,
        status: transactionalEmails.status,
        errorMessage: transactionalEmails.errorMessage,
        sentAt: transactionalEmails.sentAt,
        firstOpenedAt: transactionalEmails.firstOpenedAt,
      })
      .from(transactionalEmails)
      .orderBy(desc(transactionalEmails.sentAt))
      .limit(limit);
    res.json({ emails: rows, total: rows.length });
  } catch (e: any) {
    console.error('[Admin] email history error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Available transactional events. Adding a new event also requires a server
// send pipeline (see email.ts) — the admin UI only lets you attach a template
// to an event that exists here.
const EMAIL_EVENTS = [
  { key: 'welcome', label: 'On signup', description: 'Fires when a user signs up' },
  { key: 'audiobook-ready', label: 'On audiobook ready', description: 'Fires when chapter audio finishes' },
] as const;
type EmailEventKey = (typeof EMAIL_EVENTS)[number]['key'];
const EVENT_KEYS: EmailEventKey[] = EMAIL_EVENTS.map((e) => e.key);

// Default name for a system-event template when the row hasn't set one.
function defaultNameForEvent(eventKey: EmailEventKey): string {
  const ev = EMAIL_EVENTS.find((e) => e.key === eventKey);
  return ev ? `${ev.label} email` : eventKey;
}

// List all templates + a virtual "default" entry for any event that has no
// row attached yet, so the UI can show every event whether or not it's been
// customized. The virtual entries carry the seed body from DEFAULT_TEMPLATES.
export async function listEmailTemplates(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    // Legacy backfill: pre-event_key installs stored system templates with the
    // event name as the row key and no event_key. Migrate those once so they
    // show up correctly in the UI and the new lookup-by-event path works.
    for (const ev of EMAIL_EVENTS) {
      await db
        .update(emailTemplates)
        .set({ eventKey: ev.key })
        .where(and(eq(emailTemplates.key, ev.key), sql`${emailTemplates.eventKey} IS NULL`));
    }
    const rows = await db.select().from(emailTemplates).orderBy(desc(emailTemplates.updatedAt));
    const stored = rows.map((r) => ({
      key: r.key,
      name: r.name || defaultNameForEvent(r.eventKey as EmailEventKey) || 'Untitled template',
      eventKey: r.eventKey,
      subject: r.subject,
      bodyHtml: r.bodyHtml,
      updatedAt: r.updatedAt,
      updatedBy: r.updatedBy,
      isDefault: false,
    }));
    // Synthesize defaults for any unattached events so the UI shows them.
    const attachedEvents = new Set(rows.map((r) => r.eventKey).filter(Boolean));
    const defaults = EMAIL_EVENTS
      .filter((ev) => !attachedEvents.has(ev.key))
      // Legacy: an old install may have a row keyed by the event name with no
      // event_key set. Treat that as the active row for the event.
      .filter((ev) => !rows.some((r) => r.key === ev.key))
      .map((ev) => ({
        key: ev.key,
        name: defaultNameForEvent(ev.key),
        eventKey: ev.key,
        subject: DEFAULT_TEMPLATES[ev.key].subject,
        bodyHtml: DEFAULT_TEMPLATES[ev.key].bodyHtml,
        updatedAt: null as any,
        updatedBy: null,
        isDefault: true,
      }));
    res.json({
      templates: [...stored, ...defaults],
      events: EMAIL_EVENTS,
    });
  } catch (e: any) {
    console.error('[Admin] list email templates error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get a single template by key. Falls back to the seed default for the two
// system events so a fresh DB still serves something sensible.
export async function getEmailTemplate(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const key = String(req.params.key || '');
    const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1);
    if (row) {
      return res.json({
        key: row.key,
        name: row.name || (row.eventKey ? defaultNameForEvent(row.eventKey as EmailEventKey) : 'Untitled template'),
        eventKey: row.eventKey,
        subject: row.subject,
        bodyHtml: row.bodyHtml,
        isDefault: false,
      });
    }
    // No row — fall back to the inline default if `key` matches an event.
    if ((EVENT_KEYS as readonly string[]).includes(key)) {
      const fallback = DEFAULT_TEMPLATES[key as EmailEventKey];
      return res.json({
        key,
        name: defaultNameForEvent(key as EmailEventKey),
        eventKey: key,
        subject: fallback.subject,
        bodyHtml: fallback.bodyHtml,
        isDefault: true,
      });
    }
    res.status(404).json({ error: 'Template not found' });
  } catch (e: any) {
    console.error('[Admin] get email template error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create or update a template. If `eventKey` is set, detach any other
// template currently attached to that event so we keep the one-template-per-
// event invariant. Setting `eventKey` to null leaves the template as a
// manual-only draft (loadable from Compose blast).
export async function saveEmailTemplate(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const key = String(req.params.key || '');
    const { subject, bodyHtml, name, eventKey } = req.body || {};
    if (typeof subject !== 'string' || !subject.trim()) return res.status(400).json({ error: 'subject required' });
    if (typeof bodyHtml !== 'string' || !bodyHtml.trim()) return res.status(400).json({ error: 'bodyHtml required' });
    const normalizedEvent: string | null = (() => {
      if (eventKey === undefined) return undefined as any; // leave existing value untouched
      if (eventKey === null || eventKey === '') return null;
      if (!(EVENT_KEYS as readonly string[]).includes(String(eventKey))) {
        throw Object.assign(new Error('Unknown eventKey'), { httpStatus: 400 });
      }
      return String(eventKey);
    })();
    const trimmedName: string | null = (() => {
      if (name === undefined) return undefined as any;
      if (typeof name !== 'string') return null;
      const t = name.trim();
      return t.length ? t.slice(0, 120) : null;
    })();

    // If we're claiming an event, detach it from any other template first.
    if (normalizedEvent) {
      await db
        .update(emailTemplates)
        .set({ eventKey: null, updatedAt: new Date(), updatedBy: admin.user.email })
        .where(and(eq(emailTemplates.eventKey, normalizedEvent), ne(emailTemplates.key, key)));
    }

    const [existing] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1);
    if (existing) {
      const patch: any = { subject, bodyHtml, updatedAt: new Date(), updatedBy: admin.user.email };
      if (normalizedEvent !== undefined) patch.eventKey = normalizedEvent;
      if (trimmedName !== undefined) patch.name = trimmedName;
      await db.update(emailTemplates).set(patch).where(eq(emailTemplates.key, key));
    } else {
      await db.insert(emailTemplates).values({
        key,
        name: trimmedName ?? null,
        eventKey: normalizedEvent ?? null,
        subject,
        bodyHtml,
        updatedAt: new Date(),
        updatedBy: admin.user.email,
      });
    }
    res.json({ ok: true });
  } catch (e: any) {
    if (e?.httpStatus) return res.status(e.httpStatus).json({ error: e.message });
    console.error('[Admin] save email template error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Create a new custom template. Generates a random key so callers don't have
// to worry about uniqueness; same detach-on-event-claim logic as save.
export async function createEmailTemplate(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { name, eventKey, subject, bodyHtml } = req.body || {};
    if (typeof subject !== 'string' || !subject.trim()) return res.status(400).json({ error: 'subject required' });
    if (typeof bodyHtml !== 'string' || !bodyHtml.trim()) return res.status(400).json({ error: 'bodyHtml required' });
    const trimmedName: string | null = typeof name === 'string' && name.trim() ? name.trim().slice(0, 120) : null;
    let normalizedEvent: string | null = null;
    if (eventKey != null && eventKey !== '') {
      if (!(EVENT_KEYS as readonly string[]).includes(String(eventKey))) {
        return res.status(400).json({ error: 'Unknown eventKey' });
      }
      normalizedEvent = String(eventKey);
    }
    if (!trimmedName && !normalizedEvent) return res.status(400).json({ error: 'name required for manual-only templates' });

    const slug = (trimmedName || 'template')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'template';
    const key = `custom:${slug}-${Math.random().toString(36).slice(2, 8)}`;

    if (normalizedEvent) {
      await db
        .update(emailTemplates)
        .set({ eventKey: null, updatedAt: new Date(), updatedBy: admin.user.email })
        .where(eq(emailTemplates.eventKey, normalizedEvent));
    }

    await db.insert(emailTemplates).values({
      key,
      name: trimmedName,
      eventKey: normalizedEvent,
      subject,
      bodyHtml,
      updatedAt: new Date(),
      updatedBy: admin.user.email,
    });
    res.json({ ok: true, key });
  } catch (e: any) {
    console.error('[Admin] create email template error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete a template. Only custom templates can be deleted — system events
// fall back to the inline default if no row exists, so deleting a system row
// is also fine (it'll re-seed on next save). We block deleting the *only*
// row attached to an event to avoid an "active template just disappeared"
// surprise; admin can detach (set eventKey=null) first if they really want.
export async function deleteEmailTemplate(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const key = String(req.params.key || '');
    const [row] = await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).limit(1);
    if (!row) return res.status(404).json({ error: 'Template not found' });
    await db.delete(emailTemplates).where(eq(emailTemplates.key, key));
    res.json({ ok: true });
  } catch (e: any) {
    console.error('[Admin] delete email template error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Send a single email to one address — used by the admin tab's "Send test" button.
export async function sendTestEmail(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { subject, bodyHtml, toEmail, kind } = req.body || {};
    if (typeof subject !== 'string' || !subject.trim()) return res.status(400).json({ error: 'subject required' });
    if (typeof bodyHtml !== 'string' || !bodyHtml.trim()) return res.status(400).json({ error: 'bodyHtml required' });
    if (typeof toEmail !== 'string' || !toEmail.includes('@')) return res.status(400).json({ error: 'toEmail required' });
    const allowedKinds: EmailKind[] = ['announcement', 'welcome', 'audiobook-ready'];
    const sendKind: EmailKind = allowedKinds.includes(kind) ? kind : 'announcement';

    const [target] = await db.select().from(users).where(eq(users.email, String(toEmail).toLowerCase().trim())).limit(1);
    const fakeUser = target
      ? { id: target.id, email: target.email, name: target.name, settings: target.settings }
      : { id: 'test-recipient', email: toEmail, name: null, settings: {} };

    const firstName = (fakeUser.name || '').split(/\s+/)[0] || 'there';
    const out = await sendToUser({
      user: fakeUser,
      kind: sendKind,
      subject: substituteVars(subject, { firstName, email: fakeUser.email, appUrl: APP_URL }),
      bodyHtml: substituteVars(bodyHtml, { firstName, email: fakeUser.email, appUrl: APP_URL, chapterTitle: '(test) Chapter 1', deepLink: `${APP_URL}/?test=1` }),
      force: true,
      metadata: { test: true, admin: admin.user.email },
    });
    res.json({ status: out.status, error: out.error });
  } catch (e: any) {
    console.error('[Admin] send test email error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// Clears the iOS-launch flags from a user's settings so the modal pops again.
// Body: { email } (defaults to the authenticated admin's own account).
export async function resetIosLaunchForUser(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const targetEmail = typeof req.body?.email === 'string' && req.body.email
      ? String(req.body.email).toLowerCase().trim()
      : (admin.user.email as string | undefined);
    if (!targetEmail) return res.status(400).json({ error: 'email required' });

    const [target] = await db.select().from(users).where(eq(users.email, targetEmail)).limit(1);
    if (!target) return res.status(404).json({ error: `No user with email ${targetEmail}` });

    const cur = (target.settings as Record<string, any>) || {};
    const { iosLaunchSeen: _a, iosLaunchSeenAt: _b, iosLaunchOptInAt: _c, ...rest } = cur;
    await db.update(users).set({ settings: rest, updatedAt: new Date() }).where(eq(users.id, target.id));
    res.json({ ok: true, email: target.email });
  } catch (e: any) {
    console.error('[Admin] reset ios launch error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Copy Grader (Hormozi 12+1 rubric) ==========
// POST /api/admin/grade-copy   { headline: string, primary?: string }
// Returns rule-by-rule grading + rewrites. Internal admin tool only.

const COPY_GRADER_SYSTEM = `You are a senior direct-response copy strategist trained on Alex Hormozi's "12 internal hacks for ad copy" framework. Your job: grade an ad headline (and optional body) against the framework, then suggest sharper rewrites.

PRODUCT CONTEXT — Theodore (theodore.tools)
A writing app that turns one sentence into a complete audiobook. It writes the novel AND narrates it in one tool. Unique edge: ChatGPT writes paragraphs, ElevenLabs narrates audio — Theodore is the only tool that does both end-to-end. The current best-performing creative is an audio-player image; copy variants A/B against it. Audience: indie authors and AI-tool users. Free trial.

THE RUBRIC — 13 rules, split into TWO categories:

**CORE RULES** (always check — every headline should clear these): 1, 6, 11, 12. A headline that fails these is broken regardless of angle.

**ANGLE RULES** (a great headline picks 2-3 of these and nails them — NOT all-of-the-above): 2, 3, 5, 7, 13. Mark unused angles as applies:false. A polarizing headline doesn't *also* need to be funny + status-flexing + a damaging-admission. Picking too many angles dilutes the punch.

**CONDITIONAL** (situation-specific): 4 (reason-why), 8 (urgency — usually applies:false for Theodore, no real scarcity), 9 (authority — only if real numbers used), 10 (PS — body-only).

A great headline = clean on all 4 core rules + scored 3 on its 2-3 chosen angle rules. That's the path to 90+. Don't penalize for unused angles — only penalize when a chosen angle is weak or when a core rule is missed.

1. HEADLINE FIRST — Curiosity, "different", or sexy. Not generic. Steals from non-adjacent industries when novel. The Hormozi hook formula is **Proof + Promise + Plan**: a great hook hints at all three (something specific you've done, the outcome you'll deliver, and a sense of how). Headlines with promise alone (no proof, no plan) are the weakest variant. Length: ≤27 chars displays in full on mobile feed (best); 28-40 may truncate on some placements; 40+ likely truncates in feed. Don't hard-fail over 40, but flag the truncation risk if it's the headline's main weakness.
2. SAY WHAT ONLY YOU CAN SAY — Specific to Theodore's unique edge (writes + narrates). Generic AI-writer claims fail this. Apply the "best in a puddle" test — narrow superlatives beat broad ones. "Best AI writer" is generic; "the only tool that writes AND narrates" is a puddle Theodore actually owns. Show only what you can show; say only what you can say.
3. CALL OUT WHO (AND WHO NOT) — Polarizes. Lets the right person feel "this is for me."
4. REASON WHY — Includes "because" or an implicit reason for the next step.
5. DAMAGING ADMISSION — "X but Y" so Y lands harder. Headlines rarely do this fully — flag if attempted.
6. SHOW THE MOMENT — Concrete, sensory. "Headphones in. Your novel narrated." beats "easy audiobooks".
7. STATUS — Ties benefit to social envy (spouse, writer-friend, peer).
8. URGENCY/SCARCITY — Only if legitimate. Penalize fake scarcity. (Theodore has none real right now — flag if used.)
9. IMPLIED AUTHORITY — Real numbers/credentials. Penalize fabricated authority.
10. PS LINE — N/A for headline alone, applies to body if provided.
11. CLEAR CTA — Often the headline implies the next step.
12. THIRD GRADE READING — Short sentences, simple words, strong verbs. Reading level test.
13. HUMOR — Bonus. Only if natural; never forced.

**Overall score guidance:**
- 0-49: broken (fails a core rule, or no clear angle)
- 50-69: serviceable but generic (clears core rules, weak on angles)
- 70-84: good — clean on core rules + 1-2 angles landed reasonably
- 85-92: very strong — core rules clean + 2-3 angles each scoring 3
- 93-100: rare. Reserve for headlines that would make a senior copywriter say "damn." Don't hand out 90+ to a merely competent headline.

Score on the merit of the chosen angles, not the rules left out. A polarizing-only headline that nails Rule 3 and is clean on core rules deserves 85+; don't dock it for skipping humor and damaging-admission.

AWARENESS LEVEL (Schwartz's 5 stages — alongside the 13 rules)
Every headline implicitly targets ONE of these audience states:
- "unaware" — doesn't know the problem exists. Hook with curiosity ("This audiobook didn't exist 60 seconds ago"). Cold-traffic friendly.
- "problem" — feels the pain, doesn't know solutions. Lead with the pain ("That novel rotting in Google Docs?"). Cold-traffic friendly.
- "solution" — knows solutions exist, comparing options. Hook on category ("Most AI writing tools quit at chapter 2").
- "product" — knows of products, comparing specifics. Hook on feature/edge ("ChatGPT + ElevenLabs in one tool").
- "most" — already a Theodore prospect. Hook with offer ("New: SFX in your audiobook"). Cold-traffic DEATH — they don't know who you are.

Theodore's audio-player Meta ads serve mostly **unaware → problem-aware** cold traffic. A "product" or "most" headline on cold traffic is a major mismatch — flag this in awareness_note.

OUTPUT — strict JSON only, no prose outside the JSON, no markdown code fences:
{
  "overall": <0-100 integer>,
  "verdict": "<one short sentence — would you ship this?>",
  "char_count": <integer length of headline>,
  "char_warning": "<empty if ≤27; '<N chars — may truncate on mobile feed' if 28-40; '<N chars — will likely truncate in feed' if >40. Never call 40 a hard limit.>",
  "awareness_level": "<one of: unaware | problem | solution | product | most>",
  "awareness_note": "<≤20 words — does this awareness level match Theodore's typical cold Meta-ad audience? If 'product' or 'most', flag the mismatch.>",
  "hook_formula": {
    "proof": <0-3 — does the headline hint at proof (specific number, social proof, demonstrable claim)?>,
    "promise": <0-3 — does it convey the outcome/transformation?>,
    "plan": <0-3 — does it suggest the *how*, the next step, or a credible mechanism?>
  },
  "rules": [
    { "n": 1, "name": "Headline first", "applies": true, "score": <0-3>, "note": "<≤15 words>" }
  ],
  "strengths": ["<rule + why, ≤15 words>"],
  "weaknesses": ["<rule + how to fix, ≤15 words>"],
  "rewrites": ["<headline ≤40 chars>", "<headline ≤40 chars>", "<headline ≤40 chars>"]
}

Score scale: 0=absent, 1=weak, 2=okay, 3=strong. Up to 3 strengths and 3 weaknesses. Always provide exactly 3 rewrite headlines.`;

export async function gradeCopy(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { headline, primary } = (req.body || {}) as { headline?: string; primary?: string };
    const trimmed = typeof headline === 'string' ? headline.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'headline required' });
      return;
    }
    if (trimmed.length > 200) {
      res.status(400).json({ error: 'headline too long (max 200 chars)' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
      return;
    }

    const userMessage = primary && typeof primary === 'string' && primary.trim()
      ? `HEADLINE: """${trimmed}"""\n\nPRIMARY TEXT: """${primary.slice(0, 2000)}"""`
      : `HEADLINE: """${trimmed}"""`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 1500,
        temperature: 0.4,
        system: COPY_GRADER_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[Admin] grade-copy upstream error:', r.status, body.slice(0, 500));
      let detail = body.slice(0, 300);
      try { const j = JSON.parse(body); detail = j?.error?.message || detail; } catch { /* ignore */ }
      res.status(502).json({ error: `Anthropic API ${r.status}: ${detail}` });
      return;
    }

    const json = (await r.json()) as any;
    const text = json?.content?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: 'Empty response from grader' });
      return;
    }

    let parsed: any;
    try {
      const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleaned);
    } catch (e: any) {
      console.error('[Admin] grade-copy JSON parse error:', e?.message, 'raw:', String(text).slice(0, 300));
      res.status(502).json({ error: 'Grader returned invalid JSON', raw: String(text).slice(0, 500) });
      return;
    }

    res.json(parsed);
  } catch (e: any) {
    console.error('[Admin] grade-copy error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/projects/:projectId/chapters
// Read-only chapter list (with full prose) for a project. Used for ops
// tasks like grabbing source prose for landing-page demo audio.
export async function dumpProjectChapters(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const projectId = String(req.params.projectId || '');
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const rows = await db
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId));
    const slim = rows
      .map((r: any) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        prose: r.prose || '',
        wordCount: (r.prose || '').trim().split(/\s+/).filter(Boolean).length,
      }))
      .sort((a, b) => (a.number || 0) - (b.number || 0));
    res.json({
      projectId,
      title: project?.title || null,
      coverUrl: project?.coverUrl || null,
      total: slim.length,
      chapters: slim,
    });
  } catch (e: any) {
    console.error('[Admin] dump-chapters error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// GET /api/admin/projects/:projectId/canon
// Read-only canon dump for a project. Used to debug character voice
// assignment (which characters made the top-4 cut, which fell back to
// narrator, what role/gender values are on each entry).
export async function dumpProjectCanon(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const projectId = String(req.params.projectId || '');
    const rows = await db
      .select()
      .from(canonEntries)
      .where(eq(canonEntries.projectId, projectId));
    const slim = rows.map((r: any) => {
      const data = (r.data || {}) as Record<string, any>;
      const character = data.character || data; // some schemas nest, some don't
      return {
        id: r.id,
        type: r.type,
        name: r.name,
        role: character.role || data.role || null,
        gender: character.gender || data.gender || null,
        mainCharacter: character.mainCharacter ?? data.mainCharacter ?? null,
      };
    });
    res.json({ projectId, total: rows.length, characters: slim.filter((c) => c.type === 'character') });
  } catch (e: any) {
    console.error('[Admin] dump-canon error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// POST /api/admin/chapters/:chapterId/attribute  ?force=1
// Runs the strict Opus voice-attribution pass on a chapter and caches the
// result. Used for ad-hoc QA before relying on it in audio generation.
// Same code path the auto-attribution uses during TTS (see runTTSJob).
// See docs/VOICE-ATTRIBUTION.md for the contract.
export async function attributeChapterEndpoint(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const chapterId = String(req.params.chapterId || '');
    const force = req.query.force === '1' || req.query.force === 'true';

    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }

    // Force=1 wipes the cache so the helper has to re-run.
    if (force) {
      await db.update(chapters).set({ voiceAttribution: null, updatedAt: new Date() }).where(eq(chapters.id, chapterId));
    }

    const { ensureChapterAttribution } = await import('./voice-attribution-cache.js');
    const r = await ensureChapterAttribution(chapterId);

    if (r.source === 'failed') {
      res.status(500).json({ error: r.error || 'attribution failed' });
      return;
    }

    // Read the cached payload back so the response includes metadata
    // (attempts, model, tokens, etc.) — ensureChapterAttribution writes it.
    const [refreshed] = await db.select({ voiceAttribution: chapters.voiceAttribution }).from(chapters).where(eq(chapters.id, chapterId)).limit(1);
    const cached = refreshed?.voiceAttribution as Record<string, any> | null;
    res.json({ ...(cached || { segments: r.segments, status: r.status }), cached: r.source === 'cached', chapterId });
  } catch (e: any) {
    console.error('[Admin] attribute-chapter error:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// POST /api/admin/concept-to-headlines  { concept: string, n?: number }
// Generates N starter headlines from a concept using diverse Hormozi angles.
const CONCEPT_HEADLINES_SYSTEM = `You are a senior direct-response copywriter trained on Alex Hormozi's "12 internal hacks" framework. Generate ad headlines from a product concept.

PRODUCT CONTEXT — Theodore (theodore.tools)
A writing app that turns one sentence into a complete audiobook. Writes the novel AND narrates it in one tool. Unique edge: ChatGPT writes paragraphs, ElevenLabs narrates audio — Theodore is the only tool that does both end-to-end. Audience: indie authors and AI-tool users. Free trial.

GENERATE N HEADLINES that pull on DIFFERENT Hormozi angles — don't repeat angles:
- curiosity / "different" / sexy hook
- "say what only you can say" — unique edge ("best in a puddle" specificity)
- polarize (who / who not)
- show the moment (concrete, sensory)
- status (spouse, peer, writer-friend)
- damaging admission ("X but Y")
- 3rd-grade staccato (short sentences, simple words)
- borrowed-industry hook (steal-from-elsewhere)
- humor (only if natural)

ALSO span Schwartz awareness levels — at least 2 hitting "unaware" (curiosity-led), at least 2 hitting "problem-aware" (pain-led). Theodore's Meta ads run on cold traffic; headlines pitched at "product-aware" or "most-aware" audiences flop there. Include 0-1 of those only if the concept explicitly calls for retargeting or warm audiences.

Apply the **Proof + Promise + Plan** formula where possible — the strongest hooks hint at all three (something specific you've done, the outcome, and the credible "how").

CONSTRAINTS for every headline:
- Aim for ≤27 chars (displays in full on mobile feed); ≤40 acceptable; over 40 only if the hook is *significantly* better
- Don't make up false authority numbers
- Don't fake urgency/scarcity
- Specific over generic — show, don't tell

OUTPUT — strict JSON only, no prose, no code fences:
{ "headlines": ["<headline 1>", "<headline 2>", ...exactly N strings] }`;

export async function conceptToHeadlines(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { concept, n } = (req.body || {}) as { concept?: string; n?: number };
    const trimmed = typeof concept === 'string' ? concept.trim() : '';
    if (!trimmed) {
      res.status(400).json({ error: 'concept required' });
      return;
    }
    if (trimmed.length > 1000) {
      res.status(400).json({ error: 'concept too long (max 1000 chars)' });
      return;
    }
    const count = Math.min(10, Math.max(1, Number.isFinite(n) ? Number(n) : 5));

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: 'ANTHROPIC_API_KEY missing' });
      return;
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 800,
        temperature: 0.9,
        system: CONCEPT_HEADLINES_SYSTEM,
        messages: [{ role: 'user', content: `CONCEPT: """${trimmed}"""\n\nGenerate exactly ${count} headlines.` }],
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[Admin] concept-to-headlines upstream error:', r.status, body.slice(0, 500));
      let detail = body.slice(0, 300);
      try { const j = JSON.parse(body); detail = j?.error?.message || detail; } catch { /* ignore */ }
      res.status(502).json({ error: `Anthropic API ${r.status}: ${detail}` });
      return;
    }

    const json = (await r.json()) as any;
    const text = json?.content?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: 'Empty response' });
      return;
    }

    let parsed: any;
    try {
      const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      res.status(502).json({ error: 'Generator returned invalid JSON', raw: String(text).slice(0, 500) });
      return;
    }

    const headlines: string[] = Array.isArray(parsed?.headlines)
      ? parsed.headlines.filter((h: any) => typeof h === 'string' && h.trim()).map((h: string) => h.trim())
      : [];
    if (!headlines.length) {
      res.status(502).json({ error: 'No headlines returned' });
      return;
    }

    res.json({ headlines });
  } catch (e: any) {
    console.error('[Admin] concept-to-headlines error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Share-referral analytics ==========
// Returns:
//   - referredUsers: flat list of users who signed up via a share link
//   - bySharer: aggregated per-sharer conversion stats (total referred, paid, free, slugs)
export async function getReferrals(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const referred = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        plan: users.plan,
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
        referredByUserId: users.referredByUserId,
        referredViaSlug: users.referredViaSlug,
        referredAt: users.referredAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(isNotNull(users.referredByUserId))
      .orderBy(desc(users.createdAt));

    // Sharer info for joining email/name
    const sharerIds = Array.from(new Set(referred.map((r) => r.referredByUserId).filter((x): x is string => !!x)));
    const sharerRows = sharerIds.length
      ? await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(inArray(users.id, sharerIds))
      : [];
    const sharerById = new Map(sharerRows.map((s) => [s.id, s]));

    // Aggregate per sharer
    const aggMap = new Map<string, {
      sharerId: string;
      sharerEmail: string | null;
      sharerName: string | null;
      totalReferred: number;
      paidReferred: number;
      slugs: Set<string>;
      latestReferralAt: Date | null;
    }>();
    for (const r of referred) {
      if (!r.referredByUserId) continue;
      let row = aggMap.get(r.referredByUserId);
      if (!row) {
        const s = sharerById.get(r.referredByUserId);
        row = {
          sharerId: r.referredByUserId,
          sharerEmail: s?.email || null,
          sharerName: s?.name || null,
          totalReferred: 0,
          paidReferred: 0,
          slugs: new Set<string>(),
          latestReferralAt: null,
        };
        aggMap.set(r.referredByUserId, row);
      }
      row.totalReferred += 1;
      if (r.plan && r.plan !== 'free') row.paidReferred += 1;
      if (r.referredViaSlug) row.slugs.add(r.referredViaSlug);
      const at = r.referredAt || r.createdAt;
      if (at && (!row.latestReferralAt || at > row.latestReferralAt)) row.latestReferralAt = at;
    }

    const bySharer = Array.from(aggMap.values())
      .map((r) => ({
        sharerId: r.sharerId,
        sharerEmail: r.sharerEmail,
        sharerName: r.sharerName,
        totalReferred: r.totalReferred,
        paidReferred: r.paidReferred,
        slugs: Array.from(r.slugs),
        latestReferralAt: r.latestReferralAt,
      }))
      .sort((a, b) => b.totalReferred - a.totalReferred);

    res.json({
      totalReferred: referred.length,
      totalPaidReferred: referred.filter((r) => r.plan && r.plan !== 'free').length,
      bySharer,
      referredUsers: referred.map((r) => ({
        ...r,
        sharerEmail: r.referredByUserId ? sharerById.get(r.referredByUserId)?.email || null : null,
      })),
    });
  } catch (e: any) {
    console.error('[Admin] referrals error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Free → Paid Conversion Analytics ==========
// Daily signup-vs-paid cohort + trailing-window conversion rates. The point
// of this endpoint is to make "paid subs" the daily north star metric, not
// signups — so the admin dashboard can finally answer "what's our conversion
// rate this week?" without manual SQL.
//
// "Converted" here means: plan != 'free' AND stripeSubscriptionStatus =
// 'active'. Ben's own test accounts are excluded so the rate isn't inflated
// by self-tests (those convert at 100% which is meaningless).
//
// Conversion bucketing is cohort-based, not time-of-upgrade based: we group
// users by their signup date and check who is *currently* paid. That answers
// "of users who signed up in week N, what fraction have converted to paid?"
// rather than "when did they upgrade?" — the latter would need a plan-change
// audit log we don't have yet.
const BEN_OWN_EMAILS = [
  'benbrynildsen5757@gmail.com',
  'ben@germaniabrewhaus.com',
  'test@ben.com',
  'wolfgangbrynildsen@gmail.com',
  'ben@wilhelmcoldbrew.com',
];

export async function getConversionStats(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Pull every (non-Ben) user with the columns we need. This is bounded by
    // the user table — currently ~80, expected to grow into the thousands but
    // not millions. If/when it gets unwieldy we move the bucketing into SQL.
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        plan: users.plan,
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
        createdAt: users.createdAt,
        utmSource: users.utmSource,
        utmCampaign: users.utmCampaign,
        utmContent: users.utmContent,
        adPlatform: users.adPlatform,
      })
      .from(users);

    const real = rows.filter((u) => !BEN_OWN_EMAILS.includes(u.email));
    const isPaid = (u: typeof real[number]) =>
      !!u.plan && u.plan !== 'free' && u.stripeSubscriptionStatus === 'active';

    // ── Snapshot (lifetime) ──
    const totalSignups = real.length;
    const paidUsers = real.filter(isPaid);
    const conversionRate = totalSignups > 0 ? paidUsers.length / totalSignups : 0;

    // ── Daily timeseries: signups + cohort-paid per day (last 60 days) ──
    const dayMap = new Map<string, { day: string; signups: number; paid: number }>();
    // Seed the last 60 days with zeros so the chart isn't sparse
    const today = new Date();
    for (let i = 60; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { day: key, signups: 0, paid: 0 });
    }
    for (const u of real) {
      if (!u.createdAt) continue;
      const key = (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt as any))
        .toISOString()
        .slice(0, 10);
      const row = dayMap.get(key);
      if (!row) continue; // older than the 60-day window
      row.signups += 1;
      if (isPaid(u)) row.paid += 1;
    }
    const daily = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));

    // ── Trailing windows ──
    const now = Date.now();
    const trailingFrom = (days: number) => {
      const cutoff = now - days * 86400000;
      const cohort = real.filter((u) => {
        if (!u.createdAt) return false;
        const t = (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt as any)).getTime();
        return t >= cutoff;
      });
      const cohortPaid = cohort.filter(isPaid).length;
      return {
        signups: cohort.length,
        paid: cohortPaid,
        rate: cohort.length > 0 ? cohortPaid / cohort.length : 0,
      };
    };

    // ── Attribution breakdown: signups + paid grouped by ad source/campaign ──
    // Source = ad platform from click id (twclid→x, fbclid→meta, ...) falling
    // back to utm_source; campaign/content come from utm params. Untagged
    // signups bucket under "organic". Stamped at signup via theodore_attrib
    // cookie — users created before the cookie shipped all show as organic.
    const sourceOf = (u: typeof real[number]) => u.adPlatform || u.utmSource || null;
    const attributionWindow = (days: number | null) => {
      const cutoff = days ? now - days * 86400000 : 0;
      const buckets = new Map<string, {
        source: string; campaign: string | null; content: string | null;
        signups: number; paid: number;
      }>();
      for (const u of real) {
        if (!u.createdAt) continue;
        const t = (u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt as any)).getTime();
        if (t < cutoff) continue;
        const source = sourceOf(u) || 'organic';
        const campaign = u.utmCampaign || null;
        const content = u.utmContent || null;
        const key = `${source}|${campaign || ''}|${content || ''}`;
        let b = buckets.get(key);
        if (!b) { b = { source, campaign, content, signups: 0, paid: 0 }; buckets.set(key, b); }
        b.signups += 1;
        if (isPaid(u)) b.paid += 1;
      }
      return Array.from(buckets.values())
        .map((b) => ({ ...b, rate: b.signups > 0 ? b.paid / b.signups : 0 }))
        .sort((a, b) => b.signups - a.signups);
    };
    const bySource = {
      d7: attributionWindow(7),
      d30: attributionWindow(30),
      all: attributionWindow(null),
    };

    // ── Engagement (session-time stats from journey_events) ──
    // Computed in a separate try/catch so a failure here can't break the
    // primary conversion response. The query mirrors the existing journey-list
    // pattern (group by session_id, derive duration from min/max created_at).
    // Bouncers are sessions with duration <60s; engaged are 60s+. The
    // 15min+ rate is the headline metric to compare against Suno (20-27 min
    // avg) and Character.AI (17-25 min avg).
    let engagement: unknown = null;
    try {
      const sessionStats = await db.execute(sql`
        WITH sessions AS (
          SELECT
            session_id,
            window_label,
            EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::int AS duration_s,
            BOOL_OR(COALESCE((data->>'is_admin')::boolean, false)) AS is_admin
          FROM (
            SELECT *, '7d' AS window_label FROM journey_events
              WHERE created_at > NOW() - INTERVAL '7 days'
            UNION ALL
            SELECT *, '30d' AS window_label FROM journey_events
              WHERE created_at > NOW() - INTERVAL '30 days'
            UNION ALL
            SELECT *, '90d' AS window_label FROM journey_events
              WHERE created_at > NOW() - INTERVAL '90 days'
          ) je
          GROUP BY session_id, window_label
        )
        SELECT
          window_label,
          COUNT(*) AS total_sessions,
          COUNT(*) FILTER (WHERE duration_s >= 900) AS over_15min,
          COUNT(*) FILTER (WHERE duration_s >= 60 AND duration_s < 900) AS engaged,
          COUNT(*) FILTER (WHERE duration_s < 60) AS bouncers,
          COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_s) FILTER (WHERE duration_s >= 30), 0)::int AS median_s,
          COALESCE(AVG(duration_s) FILTER (WHERE duration_s >= 30), 0)::int AS avg_engaged_s
        FROM sessions
        WHERE NOT is_admin
        GROUP BY window_label
      `);

      const byWindow: Record<string, any> = {};
      for (const r of sessionStats.rows as any[]) {
        const total = Number(r.total_sessions) || 0;
        const over15 = Number(r.over_15min) || 0;
        const engaged = Number(r.engaged) || 0;
        const bouncers = Number(r.bouncers) || 0;
        byWindow[r.window_label] = {
          totalSessions: total,
          bouncers,
          engagedShort: engaged, // 60s-15min
          engagedDeep: over15,    // 15min+
          deepRate: total > 0 ? over15 / total : 0,
          engagedRate: total > 0 ? (engaged + over15) / total : 0,
          medianEngagedSeconds: Number(r.median_s) || 0,
          avgEngagedSeconds: Number(r.avg_engaged_s) || 0,
        };
      }
      // Industry benchmarks for the UI to display alongside ours. Numbers
      // from public sources (Business of Apps, SQ Magazine, Similarweb 2025-26).
      // Stable enough that hardcoding is fine — refresh quarterly if it drifts.
      engagement = {
        windows: {
          d7: byWindow.d7 || null,
          d30: byWindow.d30 || null,
          d90: byWindow.d90 || null,
        },
        benchmarks: {
          chatgpt: { label: 'ChatGPT', avgSeconds: 540 },        // ~9 min
          theodoreTarget: { label: 'Goal', avgSeconds: 900 },    // 15 min
          suno: { label: 'Suno', avgSeconds: 1380 },             // ~23 min
          characterAi: { label: 'Character.AI', avgSeconds: 1260 }, // ~21 min
        },
      };
    } catch (e: any) {
      console.warn('[Admin] conversion-stats engagement query failed:', e?.message || e);
      engagement = null; // fall through, primary response unaffected
    }

    res.json({
      snapshot: {
        totalSignups,
        paidUsers: paidUsers.length,
        conversionRate,
      },
      trailing: {
        d7: trailingFrom(7),
        d30: trailingFrom(30),
        d90: trailingFrom(90),
        all: { signups: totalSignups, paid: paidUsers.length, rate: conversionRate },
      },
      daily,
      bySource,
      paidUsersList: paidUsers
        .map((u) => ({
          email: u.email,
          plan: u.plan,
          signedUpAt: u.createdAt,
          source: sourceOf(u),
          campaign: u.utmCampaign || null,
        }))
        .sort((a, b) => (b.signedUpAt && a.signedUpAt ? +new Date(b.signedUpAt as any) - +new Date(a.signedUpAt as any) : 0)),
      engagement,
    });
  } catch (e: any) {
    console.error('[Admin] conversion-stats error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== /go landing funnel ==========
// Per-event session funnel for the static /go ad landing page, plus the
// pricing-CTA tier split and the pricing→submit overlap Ben cares about.
// Pure read-only aggregation over journey_events where page = '/go/'.
//
// NOTE on admin filtering: the static /go page doesn't set data->>'is_admin'
// (that's a React-app concept), so we can't cleanly exclude internal visits
// here. In practice /go is the paid-ad landing page and traffic is ~all
// external, so contamination is negligible — but a few of Ben's own loads
// may be counted. Don't read these as gospel at tiny N.
export async function getGoFunnel(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // "today" = since midnight UTC (calendar day on the server's clock,
    // which is what users expect from a dashboard). Other windows are
    // rolling N-day from now. Each window is a [from, to) half-open
    // interval so we can support both rolling windows (to = now) and
    // fixed calendar ranges (to = specific day end).
    const now = new Date();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const windows: Array<{ key: string; from: Date; to: Date }> = [
      { key: 'today', from: todayStart, to: now },
      { key: 'd7', from: new Date(Date.now() - 7 * 86400000), to: now },
      { key: 'd30', from: new Date(Date.now() - 30 * 86400000), to: now },
      { key: 'all', from: new Date(Date.now() - 36500 * 86400000), to: now },
    ];

    // Custom date range via ?from=YYYY-MM-DD&to=YYYY-MM-DD. Both
    // inclusive on the day boundary in UTC. If only `from` is provided,
    // window is that single calendar day. Lets the UI step through
    // individual days with arrow buttons.
    const fromParam = typeof req.query.from === 'string' ? req.query.from : null;
    const toParam = typeof req.query.to === 'string' ? req.query.to : null;
    if (fromParam) {
      const f = new Date(`${fromParam}T00:00:00Z`);
      const tStr = toParam || fromParam;
      const t = new Date(`${tStr}T00:00:00Z`);
      t.setUTCDate(t.getUTCDate() + 1); // exclusive upper bound = end of selected day
      if (!isNaN(f.getTime()) && !isNaN(t.getTime())) {
        windows.push({ key: 'custom', from: f, to: t });
      }
    }

    const out: Record<string, any> = {};
    for (const w of windows) {
      const fromDate = w.from;
      const toDate = w.to;

      // Dev/internal sessions are excluded everywhere below. A session
      // is "dev" if ANY of its events has data->>'is_dev' = 'true'.
      // Flag is set by the /go page when visited with ?devex=1 (sticky
      // via localStorage), so Ben's iterative testing doesn't inflate
      // the funnel numbers.
      const devFilter = sql`session_id NOT IN (
        SELECT DISTINCT session_id FROM journey_events
        WHERE page = '/go/' AND data->>'is_dev' = 'true'
      )`;

      // Distinct sessions per event
      const evRows = await db.execute(sql`
        SELECT event, COUNT(DISTINCT session_id)::int AS sessions
        FROM journey_events
        WHERE page = '/go/' AND created_at >= ${fromDate} AND created_at < ${toDate}
          AND ${devFilter}
        GROUP BY event
      `);
      const events: Record<string, number> = {};
      for (const r of evRows.rows as any[]) events[r.event] = Number(r.sessions) || 0;

      // Pricing CTA clicks split by tier (free vs author = Dream Offer)
      const tierRows = await db.execute(sql`
        SELECT COALESCE(data->>'tier', 'unknown') AS tier, COUNT(DISTINCT session_id)::int AS sessions
        FROM journey_events
        WHERE page = '/go/' AND event = 'pricing_cta_clicked' AND created_at >= ${fromDate} AND created_at < ${toDate}
          AND ${devFilter}
        GROUP BY data->>'tier'
      `);
      const pricingTiers: Record<string, number> = {};
      for (const r of tierRows.rows as any[]) pricingTiers[r.tier] = Number(r.sessions) || 0;

      // Total sessions + median time on page
      const durRows = await db.execute(sql`
        WITH s AS (
          SELECT session_id,
                 EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at)))::int AS dur
          FROM journey_events
          WHERE page = '/go/' AND created_at >= ${fromDate} AND created_at < ${toDate}
            AND ${devFilter}
          GROUP BY session_id
        )
        SELECT COUNT(*)::int AS total,
               COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dur), 0)::int AS median_s
        FROM s
      `);
      const durRow = (durRows.rows as any[])[0] || {};

      // Sessions that clicked a plan AND then submitted a prompt (the metric
      // Ben asked about — does the scroll-back-to-prompt actually convert?)
      const overlapRows = await db.execute(sql`
        SELECT COUNT(*)::int AS n FROM (
          SELECT session_id
          FROM journey_events
          WHERE page = '/go/' AND created_at >= ${fromDate} AND created_at < ${toDate}
            AND event IN ('pricing_cta_clicked', 'prompt_submit')
            AND ${devFilter}
          GROUP BY session_id
          HAVING COUNT(DISTINCT event) = 2
        ) t
      `);
      const pricingThenSubmit = Number((overlapRows.rows as any[])[0]?.n) || 0;

      // Signups attributable to /go. The signup_completed event fires on
      // the SPA (page = '/'), NOT on /go itself, because the user is
      // redirected after submitting the prompt and a new session_id is
      // created.
      //
      // Attribution signals, in order of reliability:
      //   1. data->>'from_go' = 'true' — explicit flag set in /go's submit
      //      handler via localStorage, read at signup time (post-2026-06-08).
      //   2. data->>'referrer' contains '/go' — survives same-origin navs.
      //   3. data->>'entry_url' contains '?prompt=' — present on the
      //      /go → / redirect URL, lost when the SPA consumes the param.
      //   4. data->>'entry_url' contains 'utm_source=' — paid traffic, and
      //      /go is the workhorse ad target, so a UTM-tagged signup is
      //      almost certainly from /go even if referrer/prompt were
      //      stripped by the browser or by SPA history.replaceState.
      //   5. ip_hash of the signup_completed event matches an ip_hash that
      //      visited /go in the trailing 14 days. Catches the "returning
      //      visitor" pattern — user browses /go on day 1, comes back direct
      //      on day 3, signs up with no /go signal in the signup session
      //      itself (caught a 4-of-5 under-count on 2026-06-08).
      const signupRows = await db.execute(sql`
        WITH go_ip_hashes AS (
          SELECT DISTINCT ip_hash FROM journey_events
          WHERE page = '/go/'
            AND ip_hash IS NOT NULL
            AND created_at >= ${fromDate}::timestamptz - INTERVAL '14 days'
            AND created_at < ${toDate}
        )
        SELECT COUNT(DISTINCT data->>'user_id')::int AS n
        FROM journey_events
        WHERE event = 'signup_completed'
          AND created_at >= ${fromDate} AND created_at < ${toDate}
          AND (
            data->>'from_go' = 'true'
            OR data->>'referrer' LIKE '%/go%'
            OR data->>'entry_url' LIKE '%prompt=%'
            OR data->>'entry_url' LIKE '%utm_source=%'
            OR ip_hash IN (SELECT ip_hash FROM go_ip_hashes)
          )
      `);
      const signupsFromGo = Number((signupRows.rows as any[])[0]?.n) || 0;
      events['signup_completed'] = signupsFromGo;

      // Per-placeholder-variant breakdown. Sessions are assigned 50/50
      // via localStorage on /go and the variant rides on every journey
      // event in data->>'placeholder_variant'. Slice the funnel by that.
      const variantRows = await db.execute(sql`
        WITH session_variants AS (
          SELECT DISTINCT session_id, data->>'placeholder_variant' AS variant
          FROM journey_events
          WHERE page = '/go/'
            AND data->>'placeholder_variant' IS NOT NULL
            AND created_at >= ${fromDate} AND created_at < ${toDate}
            AND ${devFilter}
        )
        SELECT sv.variant, je.event, COUNT(DISTINCT je.session_id)::int AS sessions
        FROM journey_events je
        JOIN session_variants sv USING (session_id)
        WHERE je.page = '/go/' AND je.created_at >= ${fromDate} AND je.created_at < ${toDate}
          AND ${devFilter}
        GROUP BY sv.variant, je.event
      `);
      const byPlaceholderVariant: Record<string, Record<string, number>> = {};
      for (const r of variantRows.rows as any[]) {
        const v = String(r.variant);
        if (!byPlaceholderVariant[v]) byPlaceholderVariant[v] = {};
        byPlaceholderVariant[v][r.event] = Number(r.sessions) || 0;
      }

      out[w.key] = {
        sessionCount: Number(durRow.total) || 0,
        medianSeconds: Number(durRow.median_s) || 0,
        events,
        pricingTiers,
        pricingThenSubmit,
        byPlaceholderVariant,
      };
    }

    res.json({ windows: out });
  } catch (e: any) {
    console.error('[Admin] go-funnel error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== /go Funnel — split by device ==========
// Same funnel events as getGoFunnel, bucketed by user-agent into
// mobile vs desktop so we can see if the leak shape differs by device.
// Mobile = UA contains mobile/android/iphone/ipad/etc. Desktop = everything else.
export async function getGoFunnelByDevice(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const todayCutoff = new Date();
    todayCutoff.setUTCHours(0, 0, 0, 0);
    const windows: Array<{ key: 'today' | 'd7' | 'd30' | 'all'; cutoff: Date }> = [
      { key: 'today', cutoff: todayCutoff },
      { key: 'd7', cutoff: new Date(Date.now() - 7 * 86400000) },
      { key: 'd30', cutoff: new Date(Date.now() - 30 * 86400000) },
      { key: 'all', cutoff: new Date(Date.now() - 36500 * 86400000) },
    ];

    const out: Record<string, any> = {};
    for (const w of windows) {
      const cutoff = w.cutoff;

      const rows = await db.execute(sql`
        WITH classified AS (
          SELECT
            session_id,
            event,
            CASE
              WHEN user_agent ~* '(mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini)'
              THEN 'mobile' ELSE 'desktop'
            END AS device
          FROM journey_events
          WHERE page = '/go/' AND created_at > ${cutoff}
            AND session_id NOT IN (
              SELECT DISTINCT session_id FROM journey_events
              WHERE page = '/go/' AND data->>'is_dev' = 'true'
            )
        )
        SELECT device, event, COUNT(DISTINCT session_id)::int AS sessions
        FROM classified
        GROUP BY device, event
      `);

      const byDevice: { mobile: Record<string, number>; desktop: Record<string, number> } = {
        mobile: {}, desktop: {},
      };
      for (const r of rows.rows as any[]) {
        const d = r.device as 'mobile' | 'desktop';
        byDevice[d][r.event] = Number(r.sessions) || 0;
      }

      out[w.key] = byDevice;
    }

    res.json({ windows: out });
  } catch (e: any) {
    console.error('[Admin] go-funnel-by-device error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Mark sessions as dev (retroactive funnel exclusion) ==========
// POST /api/admin/mark-dev-sessions
//
// Bulk-flags journey sessions as dev/internal so funnel queries exclude
// them. A session is marked by inserting a synthetic journey_event with
// data: { is_dev: true } — same shape the /go page emits when localStorage
// is set via ?devex=1. The funnel queries already filter sessions with
// ANY is_dev:true event, so one synthetic row per session suffices.
//
// Body: { byUserIds?: string[], sessionIds?: string[], sinceDays?: number }
// Returns: { marked: number, skipped: number }
export async function markDevSessions(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { byUserIds, sessionIds, sinceDays } = req.body || {};
    const days = typeof sinceDays === 'number' && sinceDays > 0 ? Math.floor(sinceDays) : 60;
    const cutoff = new Date(Date.now() - days * 86400000);

    // Resolve the candidate session list.
    let targetSessionIds = new Set<string>();

    if (Array.isArray(sessionIds) && sessionIds.length > 0) {
      for (const s of sessionIds) if (typeof s === 'string' && s) targetSessionIds.add(s);
    }

    if (Array.isArray(byUserIds) && byUserIds.length > 0) {
      // Find every session that ever had an event tied to one of these
      // user IDs (the user_id lives in journey_events.data->>'user_id').
      const userIdsLit = `{${byUserIds.map((id: string) => `"${id.replace(/"/g, '\\"')}"`).join(',')}}`;
      const rows = await db.execute(sql`
        SELECT DISTINCT session_id
        FROM journey_events
        WHERE data->>'user_id' = ANY(${userIdsLit}::text[])
          AND created_at > ${cutoff}
      `);
      for (const r of rows.rows as any[]) targetSessionIds.add(String(r.session_id));
    }

    if (targetSessionIds.size === 0) {
      return res.json({ marked: 0, skipped: 0, note: 'No sessions matched the criteria.' });
    }

    // Skip sessions already marked (idempotent).
    const sessionsArr = Array.from(targetSessionIds);
    const sessionsLit = `{${sessionsArr.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(',')}}`;
    const alreadyRows = await db.execute(sql`
      SELECT DISTINCT session_id
      FROM journey_events
      WHERE session_id = ANY(${sessionsLit}::text[])
        AND data->>'is_dev' = 'true'
    `);
    const alreadyMarked = new Set<string>((alreadyRows.rows as any[]).map((r) => String(r.session_id)));
    const toMark = sessionsArr.filter((s) => !alreadyMarked.has(s));

    if (toMark.length === 0) {
      return res.json({ marked: 0, skipped: alreadyMarked.size, note: 'All matched sessions already flagged.' });
    }

    // Insert one synthetic dev-flag event per session.
    for (const sid of toMark) {
      await db.execute(sql`
        INSERT INTO journey_events (session_id, event, data, page, platform, created_at)
        VALUES (${sid}, 'admin_dev_flag', '{"is_dev": true, "source": "retroactive-mark"}'::jsonb, '/go/', 'web', NOW())
      `);
    }

    res.json({ marked: toMark.length, skipped: alreadyMarked.size, totalCandidates: targetSessionIds.size });
  } catch (e: any) {
    console.error('[Admin] mark-dev-sessions error:', e);
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
}

// ========== Prompts funnel ==========
// Per-prompt shown/clicked/converted counts so we can see which conversion
// mechanics are pulling weight and which aren't worth the surface area they
// take up. Built directly from journey_events — every prompt component in
// the app already fires `<prompt>_shown` / `<prompt>_clicked` events, so
// this is read-only aggregation, no new tracking needed.
//
// Grouped into three families on the client:
//   - Modals/toasts (have both _shown and a follow-up signup/click event)
//   - One-shot CTAs (no _shown, only click events — pricing, sign-in, etc.)
//   - Landing-page section visibility (section_reached events for scroll depth)
//
// Admin sessions are excluded via the same data->>'is_admin' check the
// journey list uses.
const PROMPT_EVENTS = [
  // UsageReceipt (top-center pill on every gen)
  'usage_receipt_shown', 'usage_receipt_cta_clicked',
  // CreditNudge (bottom-right toast at 50/25/10% remaining)
  'credit_nudge_shown', 'credit_nudge_clicked', 'credit_nudge_dismissed',
  // GuestSignupModal (novel + audio variants)
  'guest_signup_modal_shown', 'guest_signup_modal_signup', 'guest_signup_modal_dismissed',
  // Chat-message signup modal (5 → 3 messages)
  'guest_chat_signup_modal_shown', 'guest_chat_signup_modal_signup', 'guest_chat_signup_modal_dismissed',
  // UpgradeModal — inline (credits exhausted)
  'upgrade_inline_shown', 'upgrade_signup_google', 'upgrade_signup_email', 'upgrade_checkout_redirect',
  // UpgradeModal — audio cap variant (7-day trial copy)
  'audio_cap_inline_shown', 'audio_cap_signup_google', 'audio_cap_signup_email', 'audio_cap_checkout_redirect',
  // Dream Offer (relabeled generic upgrade — Author tier, printed book + audiobook)
  'dream_offer_shown', 'dream_offer_checkout_redirect',
  // Anchor A/B (Hormozi stacked vs Audible-flip) — visual block removed but
  // the tracking still fires so we can revive if needed.
  'upgrade_inline_shown_anchor_stacked', 'upgrade_checkout_redirect_anchor_stacked',
  'upgrade_inline_shown_anchor_audible', 'upgrade_checkout_redirect_anchor_audible',
  // Pixel — CompleteRegistration / Subscribe / InitiateCheckout (pure outcome events)
  // Note: these come through the auto-tracker not as explicit click events; tracked for funnel context.
  // One-shot CTAs (no _shown, only click)
  'pricing_cta_clicked', 'final_cta_submitted', 'signin_clicked', 'signup_banner_clicked',
  // Share-flow events (library page)
  'share_cta_clicked', 'share_published', 'share_link_copied', 'share_link_opened', 'share_book_listened',
  // Landing section reached (scroll depth)
  'section_reached',
  // One-time credit boosts (modal shown, pack clicked, purchase completed) +
  // the boost CTA on the 25/10% credit nudge.
  'boost_modal_shown', 'boost_clicked', 'boost_purchased', 'credit_nudge_boost_clicked',
  // Entry events (signup completion, prompt redirect)
  'prompt_redirect_arrived',
];

export async function getPromptsFunnel(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // Drizzle's sql template doesn't reliably type-cast a JS array to a
    // Postgres text[] for ANY(). Expand the whitelist into an IN clause with
    // each event as its own parameter — verbose but bulletproof and the list
    // is short enough that the SQL stays small.
    const eventList = sql.join(PROMPT_EVENTS.map((e) => sql`${e}`), sql`, `);
    const rows = await db.execute(sql`
      SELECT
        event,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS count_7d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS count_30d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '90 days') AS count_90d,
        COUNT(*) AS count_all
      FROM journey_events
      WHERE event IN (${eventList})
        AND created_at > NOW() - INTERVAL '90 days'
        AND COALESCE((data->>'is_admin')::boolean, false) = false
      GROUP BY event
      ORDER BY count_30d DESC NULLS LAST
    `);

    // Shape the response as a flat list of { event, count_7d, count_30d, count_90d, count_all }.
    // Grouping into prompt-families happens on the client so the admin UI can
    // re-bucket without a backend redeploy.
    const counts = (rows.rows as any[]).map((r) => ({
      event: String(r.event),
      d7: Number(r.count_7d) || 0,
      d30: Number(r.count_30d) || 0,
      d90: Number(r.count_90d) || 0,
      all: Number(r.count_all) || 0,
    }));

    res.json({ counts });
  } catch (e: any) {
    console.error('[Admin] prompts-funnel error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// GET /api/admin/engagement-funnel — "where do users bounce?"
//
// Returns:
// - audio_gen_distribution: how many free users have 0, 1, 2, 3, 4, 5+ audio gens
// - chapter_distribution: same shape, chapter writes
// - reached_pct: cumulative — what % of free users reach the Nth audio gen
// - median_minutes_to_nth_audio: time from signup to Nth audio gen (median)
// - bounce_after_nth_audio: of users who reached gen N, how many never returned for N+1
//
// "Free" = plan='free' to keep paid users from skewing the bounce numbers
// (their journey continues past the paywall, so they look like outliers).
// Admin / Ben accounts excluded by email list.
export async function getEngagementFunnel(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const excludeEmails = [
      'benbrynildsen5757@gmail.com',
      'ben@germaniabrewhaus.com',
      'test@ben.com',
      'wolfgangbrynildsen@gmail.com',
      'ben@wilhelmcoldbrew.com',
    ];
    const excludeLit = `{${excludeEmails.map((e) => `"${e}"`).join(',')}}`;

    // Per-user audio generation counts and timestamps.
    // SOURCE: credit_transactions where action='generate-audio' — this is the
    // universal write path for TTS. The audio_generations table has missing
    // rows for pre-2026-05-22 scene-id formats (silent skip bug noted in
    // server/index.ts:2510-2513). credit_transactions captures every gen,
    // including free first-samples (with credits_used=0).
    const perUser = await db.execute(sql`
      WITH user_pool AS (
        SELECT id, created_at
        FROM users
        WHERE plan = 'free'
          AND email <> ALL(${excludeLit}::text[])
      ),
      audio_ranked AS (
        SELECT
          ct.user_id,
          ct.created_at,
          ROW_NUMBER() OVER (PARTITION BY ct.user_id ORDER BY ct.created_at) AS gen_n
        FROM credit_transactions ct
        JOIN user_pool up ON up.id = ct.user_id
        WHERE ct.action = 'generate-audio'
      ),
      chapter_counts AS (
        SELECT p.user_id, COUNT(c.id)::int AS chapter_count
        FROM projects p
        JOIN user_pool up ON up.id = p.user_id
        LEFT JOIN chapters c ON c.project_id = p.id
          AND length(trim(c.prose)) > 50  -- non-empty chapter prose
        GROUP BY p.user_id
      )
      SELECT
        up.id AS user_id,
        up.created_at AS signup_at,
        COALESCE((SELECT COUNT(*)::int FROM audio_ranked ar WHERE ar.user_id = up.id), 0) AS audio_gens,
        (SELECT MIN(created_at) FROM audio_ranked ar WHERE ar.user_id = up.id) AS first_audio_at,
        (SELECT MAX(created_at) FROM audio_ranked ar WHERE ar.user_id = up.id) AS last_audio_at,
        COALESCE((SELECT chapter_count FROM chapter_counts cc WHERE cc.user_id = up.id), 0) AS chapters
      FROM user_pool up
      ORDER BY up.created_at DESC
    `);

    // Median minutes from signup to the Nth audio gen.
    const timing = await db.execute(sql`
      WITH user_pool AS (
        SELECT id, created_at
        FROM users
        WHERE plan = 'free'
          AND email <> ALL(${excludeLit}::text[])
      ),
      audio_ranked AS (
        SELECT
          ct.user_id,
          ct.created_at,
          up.created_at AS signup_at,
          ROW_NUMBER() OVER (PARTITION BY ct.user_id ORDER BY ct.created_at) AS gen_n
        FROM credit_transactions ct
        JOIN user_pool up ON up.id = ct.user_id
        WHERE ct.action = 'generate-audio'
      )
      SELECT
        gen_n,
        COUNT(*)::int AS users_reaching,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - signup_at))/60))::int AS median_minutes_from_signup
      FROM audio_ranked
      WHERE gen_n <= 10
      GROUP BY gen_n
      ORDER BY gen_n
    `);

    const rows = perUser.rows as Array<{
      user_id: string;
      signup_at: string;
      audio_gens: number;
      first_audio_at: string | null;
      last_audio_at: string | null;
      chapters: number;
    }>;

    const totalFree = rows.length;

    // Build distributions: count of users with exactly N audio gens (clamped at 10+).
    const audioBuckets: Record<string, number> = {};
    const chapterBuckets: Record<string, number> = {};
    for (const r of rows) {
      const ab = r.audio_gens >= 10 ? '10+' : String(r.audio_gens);
      audioBuckets[ab] = (audioBuckets[ab] || 0) + 1;
      const cb = r.chapters >= 10 ? '10+' : String(r.chapters);
      chapterBuckets[cb] = (chapterBuckets[cb] || 0) + 1;
    }

    // Reached %: % of free users who reached at least N audio gens.
    const reachedPct: Array<{ gen_n: number; users: number; pct: number }> = [];
    for (let n = 1; n <= 10; n++) {
      const users = rows.filter((r) => r.audio_gens >= n).length;
      reachedPct.push({ gen_n: n, users, pct: totalFree > 0 ? users / totalFree : 0 });
    }

    // Bounce after N: of users who reached N gens, how many didn't reach N+1.
    const bounceAfter: Array<{ gen_n: number; reached_n: number; bounced: number; bounce_rate: number }> = [];
    for (let n = 1; n <= 9; n++) {
      const reachedN = rows.filter((r) => r.audio_gens >= n).length;
      const reachedNext = rows.filter((r) => r.audio_gens >= n + 1).length;
      const bounced = reachedN - reachedNext;
      bounceAfter.push({
        gen_n: n,
        reached_n: reachedN,
        bounced,
        bounce_rate: reachedN > 0 ? bounced / reachedN : 0,
      });
    }

    res.json({
      total_free_users: totalFree,
      audio_gen_distribution: audioBuckets,
      chapter_distribution: chapterBuckets,
      reached_pct: reachedPct,
      bounce_after_nth_audio: bounceAfter,
      timing_per_nth_audio: timing.rows,
    });
  } catch (e: any) {
    console.error('[Admin] engagement-funnel error:', e?.message || e, e?.stack);
    res.status(500).json({ error: 'Internal server error', detail: e?.message });
  }
}

// GET /api/admin/playback-funnel — the REAL audio engagement funnel
//
// Audio generation is automatic on "Create Book" so credit_transactions rows
// exist for nearly every user — they don't measure engagement. Playback events
// (audio_play_started in journey_events) measure who actually pressed play.
//
// Reports:
// - distribution of audio_play_started counts per user
// - distribution of DISTINCT chapters played (the user's actual listening breadth)
// - reach % at each Nth distinct chapter played
// - bounce after each Nth chapter
// - median minutes from signup to Nth chapter played
export async function getPlaybackFunnel(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    // ?days=N filters the user pool to signups in the last N days.
    // Useful when the product UX changed and older cohorts aren't comparable.
    // Omit to include all free users.
    const daysParam = Number(req.query.days);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 0;

    const excludeEmails = [
      'benbrynildsen5757@gmail.com',
      'ben@germaniabrewhaus.com',
      'test@ben.com',
      'wolfgangbrynildsen@gmail.com',
      'ben@wilhelmcoldbrew.com',
    ];
    const excludeLit = `{${excludeEmails.map((e) => `"${e}"`).join(',')}}`;
    const sinceClause = days > 0 ? sql`AND u.created_at > NOW() - (${days} || ' days')::interval` : sql``;

    // Per-user: total play events, distinct chapters played, first/last play.
    const perUser = await db.execute(sql`
      WITH user_pool AS (
        SELECT u.id, u.created_at
        FROM users u
        WHERE u.plan = 'free'
          AND u.email <> ALL(${excludeLit}::text[])
          ${sinceClause}
      ),
      play_events AS (
        SELECT
          je.data->>'user_id' AS user_id,
          je.data->>'chapter_id' AS chapter_id,
          je.created_at,
          je.event
        FROM journey_events je
        WHERE je.event IN ('audio_play_started','audio_play_ended')
          AND je.data->>'user_id' IS NOT NULL
      ),
      per_user_play AS (
        SELECT
          pe.user_id,
          COUNT(*) FILTER (WHERE pe.event = 'audio_play_started')::int AS play_starts,
          COUNT(*) FILTER (WHERE pe.event = 'audio_play_ended')::int AS play_ends,
          COUNT(DISTINCT pe.chapter_id) FILTER (WHERE pe.event = 'audio_play_started' AND pe.chapter_id IS NOT NULL)::int AS distinct_chapters_played,
          MIN(pe.created_at) FILTER (WHERE pe.event = 'audio_play_started') AS first_play_at,
          MAX(pe.created_at) FILTER (WHERE pe.event = 'audio_play_started') AS last_play_at
        FROM play_events pe
        WHERE pe.user_id IN (SELECT id FROM user_pool)
        GROUP BY pe.user_id
      )
      SELECT
        up.id AS user_id,
        up.created_at AS signup_at,
        COALESCE(pup.play_starts, 0) AS play_starts,
        COALESCE(pup.play_ends, 0) AS play_ends,
        COALESCE(pup.distinct_chapters_played, 0) AS distinct_chapters_played,
        pup.first_play_at,
        pup.last_play_at
      FROM user_pool up
      LEFT JOIN per_user_play pup ON pup.user_id = up.id
    `);

    // Time from signup to Nth distinct chapter played.
    const timing = await db.execute(sql`
      WITH user_pool AS (
        SELECT u.id, u.created_at
        FROM users u
        WHERE u.plan = 'free'
          AND u.email <> ALL(${excludeLit}::text[])
          ${sinceClause}
      ),
      first_play_per_chapter AS (
        SELECT
          je.data->>'user_id' AS user_id,
          je.data->>'chapter_id' AS chapter_id,
          MIN(je.created_at) AS first_played_at
        FROM journey_events je
        JOIN user_pool up ON up.id = je.data->>'user_id'
        WHERE je.event = 'audio_play_started'
          AND je.data->>'chapter_id' IS NOT NULL
        GROUP BY 1, 2
      ),
      ranked AS (
        SELECT
          fpc.user_id,
          fpc.chapter_id,
          fpc.first_played_at,
          up.created_at AS signup_at,
          ROW_NUMBER() OVER (PARTITION BY fpc.user_id ORDER BY fpc.first_played_at) AS chapter_n
        FROM first_play_per_chapter fpc
        JOIN user_pool up ON up.id = fpc.user_id
      )
      SELECT
        chapter_n,
        COUNT(*)::int AS users_reaching,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (first_played_at - signup_at))/60))::int AS median_minutes_from_signup
      FROM ranked
      WHERE chapter_n <= 10
      GROUP BY chapter_n
      ORDER BY chapter_n
    `);

    const rows = perUser.rows as Array<{
      user_id: string;
      signup_at: string;
      play_starts: number;
      play_ends: number;
      distinct_chapters_played: number;
      first_play_at: string | null;
      last_play_at: string | null;
    }>;

    const total = rows.length;

    const distinctBuckets: Record<string, number> = {};
    const startsBuckets: Record<string, number> = {};
    for (const r of rows) {
      const d = r.distinct_chapters_played >= 10 ? '10+' : String(r.distinct_chapters_played);
      distinctBuckets[d] = (distinctBuckets[d] || 0) + 1;
      const s = r.play_starts >= 10 ? '10+' : String(r.play_starts);
      startsBuckets[s] = (startsBuckets[s] || 0) + 1;
    }

    // Reach %: % of free users who played at least N distinct chapters.
    const reachedPct: Array<{ chapter_n: number; users: number; pct: number }> = [];
    for (let n = 1; n <= 10; n++) {
      const users = rows.filter((r) => r.distinct_chapters_played >= n).length;
      reachedPct.push({ chapter_n: n, users, pct: total > 0 ? users / total : 0 });
    }

    // Bounce: of those who played N distinct chapters, how many didn't get to N+1.
    const bounceAfter: Array<{ chapter_n: number; reached_n: number; bounced: number; bounce_rate: number }> = [];
    for (let n = 1; n <= 9; n++) {
      const reachedN = rows.filter((r) => r.distinct_chapters_played >= n).length;
      const reachedNext = rows.filter((r) => r.distinct_chapters_played >= n + 1).length;
      const bounced = reachedN - reachedNext;
      bounceAfter.push({
        chapter_n: n,
        reached_n: reachedN,
        bounced,
        bounce_rate: reachedN > 0 ? bounced / reachedN : 0,
      });
    }

    res.json({
      window_days: days || null,
      total_free_users: total,
      distinct_chapters_played_distribution: distinctBuckets,
      play_starts_distribution: startsBuckets,
      reached_pct: reachedPct,
      bounce_after_nth_chapter: bounceAfter,
      timing_per_nth_chapter: timing.rows,
    });
  } catch (e: any) {
    console.error('[Admin] playback-funnel error:', e?.message || e, e?.stack);
    res.status(500).json({ error: 'Internal server error', detail: e?.message });
  }
}

// GET /api/admin/no-audio-cohort — what do the never-tried-audio users actually do?
//
// Free users with zero audio generations: how long do their sessions last,
// how many events do they fire, what kind of events dominate, and how far
// do they get on chapter writing? Answers "are they planning and bouncing,
// or doing nothing at all?"
export async function getNoAudioCohort(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const excludeEmails = [
      'benbrynildsen5757@gmail.com',
      'ben@germaniabrewhaus.com',
      'test@ben.com',
      'wolfgangbrynildsen@gmail.com',
      'ben@wilhelmcoldbrew.com',
    ];
    const excludeLit = `{${excludeEmails.map((e) => `"${e}"`).join(',')}}`;

    // Per-user session aggregates across all their journey sessions.
    const perUser = await db.execute(sql`
      WITH no_audio_users AS (
        SELECT u.id, u.created_at AS signup_at
        FROM users u
        WHERE u.plan = 'free'
          AND u.email <> ALL(${excludeLit}::text[])
          AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.user_id = u.id AND ct.action = 'generate-audio')
      ),
      user_sessions AS (
        SELECT
          je.data->>'user_id' AS user_id,
          je.session_id,
          MIN(je.created_at) AS started_at,
          MAX(je.created_at) AS ended_at,
          COUNT(*)::int AS events_in_session
        FROM journey_events je
        WHERE je.data->>'user_id' IN (SELECT id FROM no_audio_users)
        GROUP BY je.data->>'user_id', je.session_id
      ),
      user_chapter_counts AS (
        SELECT p.user_id, COUNT(c.id)::int AS chapter_count
        FROM projects p
        LEFT JOIN chapters c ON c.project_id = p.id
          AND length(trim(c.prose)) > 50
        WHERE p.user_id IN (SELECT id FROM no_audio_users)
        GROUP BY p.user_id
      ),
      user_project_counts AS (
        SELECT user_id, COUNT(*)::int AS project_count
        FROM projects
        WHERE user_id IN (SELECT id FROM no_audio_users)
        GROUP BY user_id
      )
      SELECT
        nau.id AS user_id,
        nau.signup_at,
        COALESCE(SUM(EXTRACT(EPOCH FROM (us.ended_at - us.started_at))/60), 0)::numeric AS total_minutes,
        COALESCE(SUM(us.events_in_session), 0)::int AS total_events,
        COALESCE(COUNT(DISTINCT us.session_id), 0)::int AS session_count,
        COALESCE((SELECT chapter_count FROM user_chapter_counts cc WHERE cc.user_id = nau.id), 0) AS chapters,
        COALESCE((SELECT project_count FROM user_project_counts pc WHERE pc.user_id = nau.id), 0) AS projects
      FROM no_audio_users nau
      LEFT JOIN user_sessions us ON us.user_id = nau.id
      GROUP BY nau.id, nau.signup_at
    `);

    // Top event types across the cohort.
    const topEvents = await db.execute(sql`
      WITH no_audio_users AS (
        SELECT u.id
        FROM users u
        WHERE u.plan = 'free'
          AND u.email <> ALL(${excludeLit}::text[])
          AND NOT EXISTS (SELECT 1 FROM credit_transactions ct WHERE ct.user_id = u.id AND ct.action = 'generate-audio')
      )
      SELECT
        event,
        COUNT(*)::int AS total,
        COUNT(DISTINCT data->>'user_id')::int AS unique_users
      FROM journey_events
      WHERE data->>'user_id' IN (SELECT id FROM no_audio_users)
      GROUP BY event
      ORDER BY total DESC
      LIMIT 30
    `);

    const rows = perUser.rows as Array<{
      user_id: string;
      signup_at: string;
      total_minutes: string | number;
      total_events: number;
      session_count: number;
      chapters: number;
      projects: number;
    }>;

    const total = rows.length;
    const minutes = rows.map((r) => Number(r.total_minutes) || 0);
    minutes.sort((a, b) => a - b);
    const median = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.length % 2 === 1 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;

    const eventsArr = rows.map((r) => r.total_events).sort((a, b) => a - b);

    const timeBuckets: Record<string, number> = {
      '0 min (no events)': 0,
      '<1 min': 0,
      '1–5 min': 0,
      '5–15 min': 0,
      '15–30 min': 0,
      '30–60 min': 0,
      '60+ min': 0,
    };
    for (const m of minutes) {
      if (m === 0) timeBuckets['0 min (no events)']++;
      else if (m < 1) timeBuckets['<1 min']++;
      else if (m < 5) timeBuckets['1–5 min']++;
      else if (m < 15) timeBuckets['5–15 min']++;
      else if (m < 30) timeBuckets['15–30 min']++;
      else if (m < 60) timeBuckets['30–60 min']++;
      else timeBuckets['60+ min']++;
    }

    // Activity depth — what's the deepest each user got?
    const activity = {
      no_events: rows.filter((r) => r.total_events === 0).length,
      events_only_no_project: rows.filter((r) => r.total_events > 0 && r.projects === 0).length,
      project_no_chapter: rows.filter((r) => r.projects > 0 && r.chapters === 0).length,
      one_chapter: rows.filter((r) => r.chapters === 1).length,
      two_plus_chapters: rows.filter((r) => r.chapters >= 2).length,
    };

    res.json({
      cohort_size: total,
      median_minutes_per_user: Math.round(median(minutes) * 10) / 10,
      mean_minutes_per_user: total > 0 ? Math.round((minutes.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0,
      median_events_per_user: Math.round(median(eventsArr)),
      time_spent_distribution: timeBuckets,
      activity_depth: activity,
      top_events: topEvents.rows,
    });
  } catch (e: any) {
    console.error('[Admin] no-audio-cohort error:', e?.message || e, e?.stack);
    res.status(500).json({ error: 'Internal server error', detail: e?.message });
  }
}

// GET /api/admin/audio-gen-bounce — measures the gen-wait bounce rate.
//
// Compares audio_auto_dispatched events (server started rendering audio) with
// audio_play_started events (user actually heard playback) per user-chapter.
// Users who hit dispatch but never play are the "bounced during gen wait"
// cohort — the leak Ben's been worried about.
//
// Returns:
// - cohort size + bounce rate (per-dispatch and per-user)
// - time-to-play distribution (how long after dispatch users pressed play)
// - median + p90 wait times
//
// ?days=N filters to events in the last N days. Defaults to 30.
// GET /api/admin/chapter-truncation?days=30
// Detects chapters whose prose looks cut off mid-sentence. Signal: prose
// doesn't end with terminal punctuation (. ! ? " ') after stripping
// trailing whitespace. Cleanly-finished prose almost always ends with one
// of those; truncations end on words like "and", "the", "of", etc.
//
// Used to measure how often maxTokens cutoffs are hurting users. The
// mobile app used maxTokens = words * 1.5, which truncated chapters
// whose generated word count overshot the target (Claude often does
// this). After bumping to 2.5x the rate should drop.
export async function getChapterTruncation(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const daysParam = Number(req.query.days);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 30;

    const excludeEmails = [
      'benbrynildsen5757@gmail.com',
      'ben@germaniabrewhaus.com',
      'test@ben.com',
      'wolfgangbrynildsen@gmail.com',
      'ben@wilhelmcoldbrew.com',
    ];
    const excludeLit = `{${excludeEmails.map((e) => `"${e}"`).join(',')}}`;

    // Pull chapters with non-empty prose from the last N days, joined to
    // project owner so we can exclude admin accounts.
    const rows = await db.execute(sql`
      SELECT c.id, c.title, c.number, c.project_id, c.prose, c.updated_at,
             p.user_id, u.email
      FROM chapters c
      JOIN projects p ON p.id = c.project_id
      JOIN users u ON u.id = p.user_id
      WHERE c.prose IS NOT NULL
        AND LENGTH(c.prose) > 200
        AND c.updated_at > NOW() - (${days} || ' days')::interval
        AND u.email <> ALL(${excludeLit}::text[])
      ORDER BY c.updated_at DESC
    `);
    const data = rows.rows as Array<{
      id: string; title: string; number: number; project_id: string;
      prose: string; updated_at: string; user_id: string; email: string;
    }>;

    // A clean chapter ends with terminal punctuation (.!?'") possibly
    // followed by a closing quote/bracket or trailing whitespace.
    // A truncated chapter ends mid-word or on a non-terminal token.
    const TERMINAL_RE = /[.!?'"”’\)\]]\s*$/;
    const truncated: typeof data = [];
    let clean = 0;
    for (const r of data) {
      const trimmed = (r.prose || '').replace(/\s+$/, '');
      if (TERMINAL_RE.test(trimmed)) {
        clean += 1;
      } else {
        truncated.push(r);
      }
    }

    const trunc = truncated.length;
    const total = data.length;
    const truncRate = total > 0 ? trunc / total : 0;

    // Per-day breakdown so we can see if a recent change moved the needle.
    const byDay = new Map<string, { total: number; trunc: number }>();
    for (const r of data) {
      const day = r.updated_at.slice(0, 10);
      const bucket = byDay.get(day) || { total: 0, trunc: 0 };
      bucket.total += 1;
      bucket.trunc += truncated.includes(r) ? 1 : 0;
      byDay.set(day, bucket);
    }
    const daily = Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, b]) => ({
        day,
        total: b.total,
        truncated: b.trunc,
        rate: b.total > 0 ? b.trunc / b.total : 0,
      }));

    // Sample truncated chapters so Ben can eyeball them.
    const samples = truncated.slice(0, 12).map((r) => {
      const trimmed = (r.prose || '').replace(/\s+$/, '');
      const tail = trimmed.slice(-160);
      return {
        chapter_id: r.id,
        chapter_number: r.number,
        title: r.title,
        email: r.email,
        project_id: r.project_id,
        updated_at: r.updated_at,
        prose_length_chars: trimmed.length,
        prose_word_count: trimmed.trim().split(/\s+/).length,
        last_160_chars: tail,
      };
    });

    res.json({
      window_days: days,
      total_chapters_with_prose: total,
      truncated_chapters: trunc,
      truncation_rate: truncRate,
      clean_chapters: clean,
      daily,
      samples,
    });
  } catch (e: any) {
    console.error('[Admin] chapter-truncation error:', e?.message || e, e?.stack);
    res.status(500).json({ error: 'Internal server error', detail: e?.message });
  }
}

export async function getAudioGenBounce(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const daysParam = Number(req.query.days);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 30;

    const excludeEmails = [
      'benbrynildsen5757@gmail.com',
      'ben@germaniabrewhaus.com',
      'test@ben.com',
      'wolfgangbrynildsen@gmail.com',
      'ben@wilhelmcoldbrew.com',
    ];
    const excludeLit = `{${excludeEmails.map((e) => `"${e}"`).join(',')}}`;

    const rows = await db.execute(sql`
      WITH eligible_users AS (
        SELECT id FROM users WHERE email <> ALL(${excludeLit}::text[])
      ),
      dispatches AS (
        SELECT
          data->>'user_id' AS user_id,
          data->>'chapter_id' AS chapter_id,
          MIN(created_at) AS dispatched_at
        FROM journey_events
        WHERE event = 'audio_auto_dispatched'
          AND created_at > NOW() - (${days} || ' days')::interval
          AND data->>'user_id' IN (SELECT id FROM eligible_users)
          AND data->>'chapter_id' IS NOT NULL
        GROUP BY 1, 2
      ),
      plays AS (
        SELECT
          data->>'user_id' AS user_id,
          data->>'chapter_id' AS chapter_id,
          MIN(created_at) AS played_at
        FROM journey_events
        WHERE event = 'audio_play_started'
          AND data->>'user_id' IN (SELECT id FROM eligible_users)
          AND data->>'chapter_id' IS NOT NULL
        GROUP BY 1, 2
      )
      SELECT
        d.user_id,
        d.chapter_id,
        d.dispatched_at,
        p.played_at,
        CASE WHEN p.played_at IS NULL THEN NULL
             ELSE EXTRACT(EPOCH FROM (p.played_at - d.dispatched_at))
        END AS wait_seconds
      FROM dispatches d
      LEFT JOIN plays p ON p.user_id = d.user_id AND p.chapter_id = d.chapter_id
    `);

    const data = rows.rows as Array<{
      user_id: string;
      chapter_id: string;
      dispatched_at: string;
      played_at: string | null;
      wait_seconds: string | number | null;
    }>;

    const totalDispatches = data.length;
    const played = data.filter((r) => r.played_at !== null);
    const bounced = data.filter((r) => r.played_at === null);

    const userDispatches = new Map<string, number>();
    const userPlays = new Map<string, number>();
    for (const r of data) {
      userDispatches.set(r.user_id, (userDispatches.get(r.user_id) || 0) + 1);
      if (r.played_at !== null) userPlays.set(r.user_id, (userPlays.get(r.user_id) || 0) + 1);
    }
    const usersWithDispatch = userDispatches.size;
    const usersWithAnyPlay = userPlays.size;
    const usersNoPlay = usersWithDispatch - usersWithAnyPlay;

    const waitBuckets: Record<string, number> = {
      '<5s': 0, '5–15s': 0, '15–30s': 0, '30–60s': 0,
      '60–120s': 0, '2–5min': 0, '5–30min': 0, '30min–24h': 0, '>24h': 0,
    };
    const waitSecs: number[] = [];
    for (const r of played) {
      const s = Number(r.wait_seconds) || 0;
      waitSecs.push(s);
      if (s < 5) waitBuckets['<5s']++;
      else if (s < 15) waitBuckets['5–15s']++;
      else if (s < 30) waitBuckets['15–30s']++;
      else if (s < 60) waitBuckets['30–60s']++;
      else if (s < 120) waitBuckets['60–120s']++;
      else if (s < 300) waitBuckets['2–5min']++;
      else if (s < 1800) waitBuckets['5–30min']++;
      else if (s < 86400) waitBuckets['30min–24h']++;
      else waitBuckets['>24h']++;
    }
    waitSecs.sort((a, b) => a - b);
    const medianWait = waitSecs.length ? waitSecs[Math.floor(waitSecs.length / 2)] : 0;
    const p90Wait = waitSecs.length ? waitSecs[Math.floor(waitSecs.length * 0.9)] : 0;

    res.json({
      window_days: days,
      total_dispatches: totalDispatches,
      played_dispatches: played.length,
      bounced_dispatches: bounced.length,
      bounce_rate_per_dispatch: totalDispatches > 0 ? bounced.length / totalDispatches : 0,
      users_with_dispatch: usersWithDispatch,
      users_with_any_play: usersWithAnyPlay,
      users_no_play_at_all: usersNoPlay,
      user_bounce_rate: usersWithDispatch > 0 ? usersNoPlay / usersWithDispatch : 0,
      median_wait_seconds: Math.round(medianWait * 10) / 10,
      p90_wait_seconds: Math.round(p90Wait * 10) / 10,
      wait_distribution: waitBuckets,
    });
  } catch (e: any) {
    console.error('[Admin] audio-gen-bounce error:', e?.message || e, e?.stack);
    res.status(500).json({ error: 'Internal server error', detail: e?.message });
  }
}

// GET /api/admin/no-credits-cohort — users who signed up and spent ZERO credits.
//
// The deepest leak in the funnel: signed up, never used a single credit. Could
// mean they (a) signed up out of curiosity and bounced, (b) hit a wall before
// any action that costs credits (e.g., stuck in project planning / chat),
// (c) got their first-chapter freebie and walked away, or (d) the UI never
// surfaced a credit-spending action to them.
//
// Returns: cohort size + % of free, time on site, activity depth, top events.
// ?days=N optional to limit to recent cohort.
export async function getNoCreditsCohort(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const daysParam = Number(req.query.days);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.floor(daysParam) : 0;

    const excludeEmails = [
      'benbrynildsen5757@gmail.com',
      'ben@germaniabrewhaus.com',
      'test@ben.com',
      'wolfgangbrynildsen@gmail.com',
      'ben@wilhelmcoldbrew.com',
    ];
    const excludeLit = `{${excludeEmails.map((e) => `"${e}"`).join(',')}}`;
    const sinceClause = days > 0 ? sql`AND u.created_at > NOW() - (${days} || ' days')::interval` : sql``;

    // Per-user session aggregates for free users who haven't spent ANY credits.
    // "No spend" = credits_remaining = credits_total AND no credit_transactions
    // rows. Belt + suspenders since transactions can have creditsUsed=0 for
    // free-sample audio.
    const perUser = await db.execute(sql`
      WITH no_credits_users AS (
        SELECT u.id, u.created_at AS signup_at, u.credits_remaining, u.credits_total
        FROM users u
        WHERE u.plan = 'free'
          AND u.credits_remaining = u.credits_total
          AND u.email <> ALL(${excludeLit}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM credit_transactions ct
            WHERE ct.user_id = u.id AND ct.credits_used > 0
          )
          ${sinceClause}
      ),
      user_sessions AS (
        SELECT
          je.data->>'user_id' AS user_id,
          je.session_id,
          MIN(je.created_at) AS started_at,
          MAX(je.created_at) AS ended_at,
          COUNT(*)::int AS events_in_session
        FROM journey_events je
        WHERE je.data->>'user_id' IN (SELECT id FROM no_credits_users)
        GROUP BY je.data->>'user_id', je.session_id
      ),
      user_chapter_counts AS (
        SELECT p.user_id, COUNT(c.id)::int AS chapter_count
        FROM projects p
        LEFT JOIN chapters c ON c.project_id = p.id
          AND length(trim(c.prose)) > 50
        WHERE p.user_id IN (SELECT id FROM no_credits_users)
        GROUP BY p.user_id
      ),
      user_project_counts AS (
        SELECT user_id, COUNT(*)::int AS project_count
        FROM projects
        WHERE user_id IN (SELECT id FROM no_credits_users)
        GROUP BY user_id
      )
      SELECT
        ncu.id AS user_id,
        ncu.signup_at,
        ncu.credits_remaining,
        ncu.credits_total,
        COALESCE(SUM(EXTRACT(EPOCH FROM (us.ended_at - us.started_at))/60), 0)::numeric AS total_minutes,
        COALESCE(SUM(us.events_in_session), 0)::int AS total_events,
        COALESCE(COUNT(DISTINCT us.session_id), 0)::int AS session_count,
        COALESCE((SELECT chapter_count FROM user_chapter_counts cc WHERE cc.user_id = ncu.id), 0) AS chapters,
        COALESCE((SELECT project_count FROM user_project_counts pc WHERE pc.user_id = ncu.id), 0) AS projects
      FROM no_credits_users ncu
      LEFT JOIN user_sessions us ON us.user_id = ncu.id
      GROUP BY ncu.id, ncu.signup_at, ncu.credits_remaining, ncu.credits_total
    `);

    // Top events across the cohort + last event per user.
    const topEvents = await db.execute(sql`
      WITH no_credits_users AS (
        SELECT u.id
        FROM users u
        WHERE u.plan = 'free'
          AND u.credits_remaining = u.credits_total
          AND u.email <> ALL(${excludeLit}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM credit_transactions ct
            WHERE ct.user_id = u.id AND ct.credits_used > 0
          )
          ${sinceClause}
      )
      SELECT
        event,
        COUNT(*)::int AS total,
        COUNT(DISTINCT data->>'user_id')::int AS unique_users
      FROM journey_events
      WHERE data->>'user_id' IN (SELECT id FROM no_credits_users)
      GROUP BY event
      ORDER BY total DESC
      LIMIT 30
    `);

    // Last event fired per user — what was the final thing they saw / did
    // before bouncing? This is the single highest-leverage diagnostic.
    const lastEvents = await db.execute(sql`
      WITH no_credits_users AS (
        SELECT u.id
        FROM users u
        WHERE u.plan = 'free'
          AND u.credits_remaining = u.credits_total
          AND u.email <> ALL(${excludeLit}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM credit_transactions ct
            WHERE ct.user_id = u.id AND ct.credits_used > 0
          )
          ${sinceClause}
      ),
      ranked AS (
        SELECT
          je.data->>'user_id' AS user_id,
          je.event,
          je.created_at,
          ROW_NUMBER() OVER (PARTITION BY je.data->>'user_id' ORDER BY je.created_at DESC) AS rn
        FROM journey_events je
        WHERE je.data->>'user_id' IN (SELECT id FROM no_credits_users)
      )
      SELECT event, COUNT(*)::int AS users
      FROM ranked
      WHERE rn = 1
      GROUP BY event
      ORDER BY users DESC
      LIMIT 20
    `);

    // Free user totals for the % calc.
    const totalsRows = await db.execute(sql`
      SELECT COUNT(*)::int AS total_free
      FROM users u
      WHERE u.plan = 'free'
        AND u.email <> ALL(${excludeLit}::text[])
        ${sinceClause}
    `);
    const totalFree = (totalsRows.rows[0] as any)?.total_free || 0;

    const rows = perUser.rows as Array<{
      user_id: string;
      signup_at: string;
      credits_remaining: number;
      credits_total: number;
      total_minutes: string | number;
      total_events: number;
      session_count: number;
      chapters: number;
      projects: number;
    }>;

    const total = rows.length;
    const minutes = rows.map((r) => Number(r.total_minutes) || 0).sort((a, b) => a - b);
    const eventsArr = rows.map((r) => r.total_events).sort((a, b) => a - b);
    const median = (arr: number[]) =>
      arr.length === 0 ? 0 : arr.length % 2 === 1 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;

    const timeBuckets: Record<string, number> = {
      '0 min (no events)': 0,
      '<1 min': 0,
      '1–5 min': 0,
      '5–15 min': 0,
      '15–30 min': 0,
      '30–60 min': 0,
      '60+ min': 0,
    };
    for (const m of minutes) {
      if (m === 0) timeBuckets['0 min (no events)']++;
      else if (m < 1) timeBuckets['<1 min']++;
      else if (m < 5) timeBuckets['1–5 min']++;
      else if (m < 15) timeBuckets['5–15 min']++;
      else if (m < 30) timeBuckets['15–30 min']++;
      else if (m < 60) timeBuckets['30–60 min']++;
      else timeBuckets['60+ min']++;
    }

    const activity = {
      no_events: rows.filter((r) => r.total_events === 0).length,
      events_only_no_project: rows.filter((r) => r.total_events > 0 && r.projects === 0).length,
      project_no_chapter: rows.filter((r) => r.projects > 0 && r.chapters === 0).length,
      one_chapter: rows.filter((r) => r.chapters === 1).length,
      two_plus_chapters: rows.filter((r) => r.chapters >= 2).length,
    };

    // Credit-cap mix — how many at 250 vs 500 (cohort spans the tier change).
    const creditCapMix: Record<string, number> = {};
    for (const r of rows) {
      const key = `${r.credits_total} cap`;
      creditCapMix[key] = (creditCapMix[key] || 0) + 1;
    }

    res.json({
      window_days: days || null,
      total_free_users: totalFree,
      cohort_size: total,
      cohort_pct: totalFree > 0 ? total / totalFree : 0,
      median_minutes_per_user: Math.round(median(minutes) * 10) / 10,
      mean_minutes_per_user: total > 0 ? Math.round((minutes.reduce((a, b) => a + b, 0) / total) * 10) / 10 : 0,
      median_events_per_user: Math.round(median(eventsArr)),
      credit_cap_mix: creditCapMix,
      time_spent_distribution: timeBuckets,
      activity_depth: activity,
      top_events: topEvents.rows,
      last_events: lastEvents.rows,
    });
  } catch (e: any) {
    console.error('[Admin] no-credits-cohort error:', e?.message || e, e?.stack);
    res.status(500).json({ error: 'Internal server error', detail: e?.message });
  }
}

// ========== UTM campaign funnel ==========
// Per (source, campaign, content): server-logged ad clicks, JS sessions,
// prompt submits, signups and paid — so each X/Meta campaign's full
// click→visit→prompt→signup→paid funnel is visible in one table.
//
// Three sources merged by key:
//   1. ad_clicks        — server-side click log (/go + /go2 only, no JS needed)
//   2. journey_events   — tagged sessions; /go static page reports page='/go/'
//                         with the full URL in data->>'url', the React app
//                         puts the query string in page itself
//   3. users            — attribution stamped at signup (cookie or ip-fallback)
export async function getUtmFunnel(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86400000);

    type Row = {
      source: string; campaign: string | null; content: string | null;
      adClicks: number; visits: number; focused: number; prompts: number;
      sessionSignups: number; signups: number; paid: number;
    };
    const buckets = new Map<string, Row>();
    // Journey URLs are raw (utm_campaign=V4%20Sales) while ad_clicks/users
    // store express-decoded values ("V4 Sales") — decode before keying so
    // the three sources land in the same bucket.
    const dec = (v: string | null | undefined) => {
      if (!v) return null;
      try { return decodeURIComponent(String(v).replace(/\+/g, ' ')).slice(0, 200) || null; }
      catch { return String(v).slice(0, 200) || null; }
    };
    const bucket = (source: string | null, campaign: string | null, content: string | null): Row => {
      const src = (source || 'unknown').toLowerCase();
      const key = `${src}|${campaign || ''}|${content || ''}`;
      let b = buckets.get(key);
      if (!b) {
        b = { source: src, campaign, content, adClicks: 0, visits: 0, focused: 0, prompts: 0, sessionSignups: 0, signups: 0, paid: 0 };
        buckets.set(key, b);
      }
      return b;
    };

    // 1. Server-logged ad clicks (humans only)
    const clicks = await db.execute(sql`
      SELECT source, utm_campaign, utm_content, COUNT(*)::int AS n
      FROM ad_clicks
      WHERE created_at > ${since} AND is_bot = false
      GROUP BY 1, 2, 3
    `);
    for (const r of clicks.rows as any[]) {
      bucket(r.source, dec(r.utm_campaign), dec(r.utm_content)).adClicks += Number(r.n) || 0;
    }

    // 2. Tagged journey sessions + their funnel events. First tagged
    // page_load wins per session (a session can't switch campaigns).
    const sessions = await db.execute(sql`
      WITH tagged AS (
        SELECT DISTINCT ON (session_id)
          session_id,
          COALESCE(page, '') || '&' || COALESCE(data->>'url', '') AS hay
        FROM journey_events
        WHERE created_at > ${since}
          AND event = 'page_load'
          AND (page LIKE '%utm_source=%' OR data->>'url' LIKE '%utm_source=%'
            OR page LIKE '%clid=%' OR data->>'url' LIKE '%clid=%')
        ORDER BY session_id, created_at ASC
      )
      SELECT
        t.hay,
        BOOL_OR(je.event = 'focus_input') AS focused,
        BOOL_OR(je.event IN ('prompt_submit', 'final_cta_submitted')) AS submitted,
        BOOL_OR(je.event = 'signup_completed') AS signed_up
      FROM tagged t
      JOIN journey_events je ON je.session_id = t.session_id
        AND je.created_at > ${since}
      GROUP BY t.session_id, t.hay
    `);
    for (const r of sessions.rows as any[]) {
      const p = payloadFromUrl(String(r.hay || ''));
      if (!p) continue;
      const b = bucket(p.plat || p.src || null, dec(p.cam), dec(p.con));
      b.visits += 1;
      if (r.focused) b.focused += 1;
      if (r.submitted) b.prompts += 1;
      if (r.signed_up) b.sessionSignups += 1;
    }

    // 3. Stamped signups + paid
    const signups = await db.execute(sql`
      SELECT
        COALESCE(ad_platform, utm_source) AS source,
        utm_campaign, utm_content,
        COUNT(*)::int AS signups,
        COUNT(*) FILTER (WHERE plan != 'free' AND stripe_subscription_status = 'active')::int AS paid
      FROM users
      WHERE created_at > ${since}
        AND (utm_source IS NOT NULL OR ad_platform IS NOT NULL)
      GROUP BY 1, 2, 3
    `);
    for (const r of signups.rows as any[]) {
      const b = bucket(r.source, dec(r.utm_campaign), dec(r.utm_content));
      b.signups += Number(r.signups) || 0;
      b.paid += Number(r.paid) || 0;
    }

    const rows = Array.from(buckets.values()).sort((a, b) =>
      (b.adClicks + b.visits) - (a.adClicks + a.visits));

    // Untagged context so paid traffic can be read against the organic base.
    const organic = await db.execute(sql`
      SELECT
        COUNT(*)::int AS signups,
        COUNT(*) FILTER (WHERE plan != 'free' AND stripe_subscription_status = 'active')::int AS paid
      FROM users
      WHERE created_at > ${since}
        AND utm_source IS NULL AND ad_platform IS NULL
    `);

    res.json({
      days,
      rows,
      organic: {
        signups: Number((organic.rows[0] as any)?.signups) || 0,
        paid: Number((organic.rows[0] as any)?.paid) || 0,
      },
    });
  } catch (e: any) {
    console.error('[Admin] utm-funnel error:', e?.message || e);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ========== Attribution backfill ==========
// Retro-stamps users who signed up without attribution — the cookie shipped
// 2026-06-11, so anyone who clicked an ad before then (or clicked in an
// in-app webview and signed up in their real browser) shows as organic.
// Matching: the user's own journey sessions (events tagged with their
// user_id after auth) → tagged page_load in those sessions, else ad_clicks /
// tagged journeys from the same ip_hash in the 14 days before signup.
// Never overwrites existing attribution. Idempotent — safe to re-run.
export async function backfillAttribution(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
    const since = new Date(Date.now() - days * 86400000);
    const dryRun = String(req.query.dry || '') === '1';

    const candidates = await db.select({
      id: users.id, email: users.email, createdAt: users.createdAt,
    }).from(users)
      .where(sql`${users.createdAt} > ${since}
        AND ${users.utmSource} IS NULL AND ${users.adPlatform} IS NULL`);

    const results: any[] = [];
    for (const u of candidates) {
      const createdAt = u.createdAt instanceof Date ? u.createdAt : new Date(u.createdAt as any);
      const lookback = new Date(createdAt.getTime() - 14 * 86400000);
      // Only credit ad touches BEFORE signup (+1h grace so the tagged
      // landing that led directly into the signup still counts) — a
      // post-signup retargeting click must not retro-claim an organic user.
      const signupCutoff = new Date(createdAt.getTime() + 3600000);

      // 1. The user's own sessions (post-auth events carry user_id in data)
      const own = await db.execute(sql`
        SELECT COALESCE(page, '') || '&' || COALESCE(data->>'url', '') AS hay
        FROM journey_events
        WHERE session_id IN (
            SELECT DISTINCT session_id FROM journey_events
            WHERE data->>'user_id' = ${u.id} AND created_at > ${lookback}
          )
          AND event = 'page_load'
          AND created_at > ${lookback}
          AND created_at <= ${signupCutoff}
          AND (page LIKE '%utm_source=%' OR data->>'url' LIKE '%utm_source=%'
            OR page LIKE '%clid=%' OR data->>'url' LIKE '%clid=%')
        ORDER BY created_at DESC
        LIMIT 1
      `);
      let attrib = (own.rows as any[])[0]?.hay
        ? payloadFromUrl(String((own.rows as any[])[0].hay))
        : null;
      let via = attrib ? 'own-session' : null;

      // 2. Same-ip tagged traffic before signup
      if (!attrib) {
        const ipRes = await db.execute(sql`
          SELECT DISTINCT ip_hash FROM journey_events
          WHERE data->>'user_id' = ${u.id} AND ip_hash IS NOT NULL
            AND created_at > ${lookback}
          LIMIT 5
        `);
        for (const ipRow of ipRes.rows as any[]) {
          attrib = await attributionFromRecentTraffic(String(ipRow.ip_hash), createdAt);
          if (attrib) { via = 'ip-match'; break; }
        }
      }

      if (!attrib) continue;
      if (!dryRun) {
        await db.update(users)
          .set(attributionColumns(attrib))
          .where(sql`${users.id} = ${u.id} AND ${users.utmSource} IS NULL AND ${users.adPlatform} IS NULL`);
      }
      results.push({ email: u.email, via, platform: attrib.plat || null, campaign: attrib.cam || null, content: attrib.con || null });
    }

    res.json({ checked: candidates.length, stamped: dryRun ? 0 : results.length, dryRun, matches: results });
  } catch (e: any) {
    console.error('[Admin] backfill-attribution error:', e?.message || e);
    res.status(500).json({ error: 'Internal server error' });
  }
}
