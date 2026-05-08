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

    // Total credits used — exclude admin grant/debit rows.
    const [{ value: totalUsed }] = await db
      .select({ value: sum(creditTransactions.creditsUsed) })
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.userId, userId),
        gt(creditTransactions.creditsUsed, 0),
      ));

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

    const result = await sendPushToTokens(tokens, {
      title: title.trim(),
      body: body.trim(),
      data: data && typeof data === 'object' ? data : undefined,
    });
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        temperature: 0.4,
        system: COPY_GRADER_SYSTEM,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[Admin] grade-copy upstream error:', r.status, body.slice(0, 300));
      res.status(502).json({ error: `Anthropic API ${r.status}` });
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0.9,
        system: CONCEPT_HEADLINES_SYSTEM,
        messages: [{ role: 'user', content: `CONCEPT: """${trimmed}"""\n\nGenerate exactly ${count} headlines.` }],
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[Admin] concept-to-headlines upstream error:', r.status, body.slice(0, 300));
      res.status(502).json({ error: `Anthropic API ${r.status}` });
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
