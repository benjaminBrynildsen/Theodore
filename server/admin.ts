// Admin API — dashboard endpoints for platform analytics
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { users, projects, chapters, creditTransactions, audioGenerations } from './schema.js';
import { sql, eq, desc, count, sum } from 'drizzle-orm';
import { getAuth } from './auth.js';

// Admin user IDs — only these accounts can access admin endpoints
const ADMIN_EMAILS = new Set([
  'benbrynildsen5757@gmail.com',
  'ben@germaniabrewhaus.com',
]);

export async function requireAdmin(req: Request, res: Response): Promise<{ user: any } | null> {
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

    res.json({
      totalUsers,
      totalProjects,
      totalChapters,
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
      .select({ id: projects.id, title: projects.title, type: projects.type, status: projects.status, createdAt: projects.createdAt })
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

// ========== Recent Activity Feed ==========
export async function getActivity(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const rows = await db
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

    res.json({ activity: rows });
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
