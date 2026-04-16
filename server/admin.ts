// Admin API — dashboard endpoints for platform analytics
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from './db.js';
import { users, projects, chapters, creditTransactions, audioGenerations, guestEvents } from './schema.js';
import { sql, eq, desc, count, sum } from 'drizzle-orm';
import { getAuth } from './auth.js';

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

    // Total credits consumed
    const [{ value: totalCreditsUsed }] = await db
      .select({ value: sum(creditTransactions.creditsUsed) })
      .from(creditTransactions);

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

    // MRR calculation
    const pricingMap: Record<string, number> = { writer: 10, author: 30, studio: 99 };
    const mrr = planBreakdown.reduce((acc, { plan, count: c }) => {
      return acc + (pricingMap[plan] || 0) * c;
    }, 0);

    // Audio generations count
    const [{ value: totalAudioGens }] = await db.select({ value: count() }).from(audioGenerations);

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

    const [{ value: total }] = await db.select({ value: count() }).from(users);

    res.json({ users: rows, total, limit, offset });
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

    // Total credits used
    const [{ value: totalUsed }] = await db
      .select({ value: sum(creditTransactions.creditsUsed) })
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, userId));

    res.json({
      user,
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

    // Credits used per day
    const creditsPerDay = await db.execute(sql`
      SELECT DATE(created_at) as day, SUM(credits_used) as total, COUNT(*) as count
      FROM credit_transactions
      WHERE created_at > NOW() - INTERVAL '30 days'
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
