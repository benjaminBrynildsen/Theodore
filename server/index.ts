import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, eq, or } from 'drizzle-orm';
import { db, pool } from './db.js';
import { projects, chapters, canonEntries, users, creditTransactions } from './schema.js';
import {
  clearAllUserSessions,
  createSession,
  destroySession,
  getAuth,
  getUserByEmail,
  getUserByResetToken,
  hashPassword,
  isValidEmail,
  normalizeEmail,
  requireAuth,
  setResetToken,
  toSafeUser,
  verifyPassword,
} from './auth.js';
import { generate, generateStream } from './ai.js';
import { getPaidTierConfig, getStripeClient, getStripePriceIdForTier, isPaidPlanTier, listPaidTierConfigs } from './billing.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors({ origin: true, credentials: true }));
const jsonParser = express.json({ limit: '10mb' });
app.use((req, res, next) => {
  if (req.path === '/api/billing/webhook') return next();
  return jsonParser(req, res, next);
});

type DbProject = typeof projects.$inferSelect;
type DbChapter = typeof chapters.$inferSelect;
type DbCanonEntry = typeof canonEntries.$inferSelect;

async function getOwnedProject(projectId: string, userId: string): Promise<DbProject | null> {
  const [project] = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.userId, userId)));
  return project || null;
}

async function getOwnedChapter(chapterId: string, userId: string): Promise<DbChapter | null> {
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
  if (!chapter) return null;
  const project = await getOwnedProject(chapter.projectId, userId);
  return project ? chapter : null;
}

async function getOwnedCanonEntry(entryId: string, userId: string): Promise<DbCanonEntry | null> {
  const [entry] = await db.select().from(canonEntries).where(eq(canonEntries.id, entryId));
  if (!entry) return null;
  const project = await getOwnedProject(entry.projectId, userId);
  return project ? entry : null;
}

async function getUserByStripeIds(customerId?: string | null, subscriptionId?: string | null) {
  if (!customerId && !subscriptionId) return null;
  const filters: any[] = [];
  if (customerId) filters.push(eq(users.stripeCustomerId, customerId));
  if (subscriptionId) filters.push(eq(users.stripeSubscriptionId, subscriptionId));
  const predicate = filters.length === 1 ? filters[0] : or(...filters as any);
  const [user] = await db.select().from(users).where(predicate);
  return user || null;
}

function getTierCredits(tier: string): number {
  if (isPaidPlanTier(tier)) return getPaidTierConfig(tier)?.credits || 0;
  if (tier === 'free') return 500;
  return 500;
}

function resolveFrontendOrigin(req: express.Request): string {
  const origin = req.get('origin');
  if (origin) return origin.replace(/\/$/, '');
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  return 'http://localhost:5173';
}

function isStripeSubscriptionActive(status?: string | null): boolean {
  return status === 'active' || status === 'trialing';
}

function asObject(value: unknown, fallback: Record<string, any> = {}): Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : fallback;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const DEFAULT_NARRATIVE_CONTROLS = {
  toneMood: { lightDark: 50, hopefulGrim: 50, whimsicalSerious: 50 },
  pacing: 'balanced',
  dialogueWeight: 'balanced',
  focusMix: { character: 40, plot: 40, world: 20 },
  genreEmphasis: [],
};

const DEFAULT_PREMISE = {
  purpose: '',
  changes: '',
  characters: [],
  emotionalBeat: '',
  setupPayoff: [],
  constraints: [],
};

const DEFAULT_VALIDATION_STATUS = {
  isValid: true,
  checks: [],
};

function buildProjectInsert(bodyRaw: unknown, userId: string) {
  const body = asObject(bodyRaw);
  return {
    id: asOptionalString(body.id) || `project-${randomUUID()}`,
    userId,
    title: asString(body.title, 'Untitled Project'),
    type: asString(body.type, 'book'),
    subtype: 'subtype' in body ? asOptionalString(body.subtype) : null,
    targetLength: asString(body.targetLength, 'medium'),
    toneBaseline: asString(body.toneBaseline, ''),
    assistanceLevel: Math.max(1, Math.min(5, Math.round(asFiniteNumber(body.assistanceLevel, 3)))),
    ageRange: 'ageRange' in body ? asOptionalString(body.ageRange) : null,
    narrativeControls: asObject(body.narrativeControls, DEFAULT_NARRATIVE_CONTROLS),
    status: asString(body.status, 'active'),
  };
}

function buildProjectUpdate(bodyRaw: unknown) {
  const body = asObject(bodyRaw);
  const updates: Record<string, any> = { updatedAt: new Date() };

  if ('title' in body && typeof body.title === 'string') updates.title = body.title;
  if ('type' in body && typeof body.type === 'string') updates.type = body.type;
  if ('subtype' in body) updates.subtype = body.subtype === null ? null : asOptionalString(body.subtype);
  if ('targetLength' in body && typeof body.targetLength === 'string') updates.targetLength = body.targetLength;
  if ('toneBaseline' in body && typeof body.toneBaseline === 'string') updates.toneBaseline = body.toneBaseline;
  if ('assistanceLevel' in body) {
    updates.assistanceLevel = Math.max(1, Math.min(5, Math.round(asFiniteNumber(body.assistanceLevel, 3))));
  }
  if ('ageRange' in body) updates.ageRange = body.ageRange === null ? null : asOptionalString(body.ageRange);
  if ('narrativeControls' in body) updates.narrativeControls = asObject(body.narrativeControls, DEFAULT_NARRATIVE_CONTROLS);
  if ('status' in body && typeof body.status === 'string') updates.status = body.status;

  return updates;
}

function buildChapterInsert(bodyRaw: unknown, projectId: string) {
  const body = asObject(bodyRaw);
  const number = Math.max(1, Math.round(asFiniteNumber(body.number, 1)));
  return {
    id: asOptionalString(body.id) || `chapter-${randomUUID()}`,
    projectId,
    number,
    title: asString(body.title, `Chapter ${number}`),
    timelinePosition: Math.max(1, Math.round(asFiniteNumber(body.timelinePosition, number))),
    status: asString(body.status, 'premise-only'),
    premise: asObject(body.premise, DEFAULT_PREMISE),
    prose: asString(body.prose, ''),
    referencedCanonIds: asStringArray(body.referencedCanonIds),
    aiIntentMetadata: 'aiIntentMetadata' in body ? asObject(body.aiIntentMetadata) : undefined,
    validationStatus: asObject(body.validationStatus, DEFAULT_VALIDATION_STATUS),
  };
}

function buildChapterUpdate(bodyRaw: unknown, projectId: string) {
  const body = asObject(bodyRaw);
  const updates: Record<string, any> = {
    projectId,
    updatedAt: new Date(),
  };

  if ('number' in body) updates.number = Math.max(1, Math.round(asFiniteNumber(body.number, 1)));
  if ('title' in body && typeof body.title === 'string') updates.title = body.title;
  if ('timelinePosition' in body) updates.timelinePosition = Math.max(1, Math.round(asFiniteNumber(body.timelinePosition, 1)));
  if ('status' in body && typeof body.status === 'string') updates.status = body.status;
  if ('premise' in body) updates.premise = asObject(body.premise, DEFAULT_PREMISE);
  if ('prose' in body && typeof body.prose === 'string') updates.prose = body.prose;
  if ('referencedCanonIds' in body) updates.referencedCanonIds = asStringArray(body.referencedCanonIds);
  if ('aiIntentMetadata' in body) updates.aiIntentMetadata = body.aiIntentMetadata === null ? null : asObject(body.aiIntentMetadata);
  if ('validationStatus' in body) updates.validationStatus = asObject(body.validationStatus, DEFAULT_VALIDATION_STATUS);

  return updates;
}

function buildCanonInsert(bodyRaw: unknown, projectId: string) {
  const body = asObject(bodyRaw);
  return {
    id: asOptionalString(body.id) || `canon-${randomUUID()}`,
    projectId,
    type: asString(body.type, 'character'),
    name: asString(body.name, 'Untitled Entry'),
    description: asString(body.description, ''),
    imageUrl: 'imageUrl' in body ? (body.imageUrl === null ? null : asOptionalString(body.imageUrl)) : null,
    tags: asStringArray(body.tags),
    notes: asString(body.notes, ''),
    version: Math.max(1, Math.round(asFiniteNumber(body.version, 1))),
    linkedCanonIds: asStringArray(body.linkedCanonIds),
    data: asObject(body.data),
  };
}

function buildCanonUpdate(bodyRaw: unknown, projectId: string) {
  const body = asObject(bodyRaw);
  const updates: Record<string, any> = {
    projectId,
    updatedAt: new Date(),
  };
  if ('type' in body && typeof body.type === 'string') updates.type = body.type;
  if ('name' in body && typeof body.name === 'string') updates.name = body.name;
  if ('description' in body && typeof body.description === 'string') updates.description = body.description;
  if ('imageUrl' in body) updates.imageUrl = body.imageUrl === null ? null : asOptionalString(body.imageUrl);
  if ('tags' in body) updates.tags = asStringArray(body.tags);
  if ('notes' in body && typeof body.notes === 'string') updates.notes = body.notes;
  if ('version' in body) updates.version = Math.max(1, Math.round(asFiniteNumber(body.version, 1)));
  if ('linkedCanonIds' in body) updates.linkedCanonIds = asStringArray(body.linkedCanonIds);
  if ('data' in body) updates.data = asObject(body.data);
  return updates;
}

// ========== Health ==========
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', database: e.message });
  }
});

// ========== Billing ==========
app.get('/api/billing/plans', (_req, res) => {
  res.json({
    paidTiers: listPaidTierConfigs(),
    free: {
      tier: 'free',
      name: 'Free',
      credits: 500,
      priceUsd: 0,
      priceCents: 0,
      summary: '500 credits / month',
    },
  });
});

app.get('/api/billing/status', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const user = auth.user;
    res.json({
      plan: user.plan,
      creditsRemaining: user.creditsRemaining,
      creditsTotal: user.creditsTotal,
      stripeCustomerId: user.stripeCustomerId,
      stripeSubscriptionId: user.stripeSubscriptionId,
      stripeSubscriptionStatus: (user as any).stripeSubscriptionStatus || null,
      stripeCurrentPeriodEnd: (user as any).stripeCurrentPeriodEnd || null,
      stripeCancelAtPeriodEnd: Boolean((user as any).stripeCancelAtPeriodEnd),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/billing/checkout', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const tier = String(req.body?.tier || '');
    const tierConfig = getPaidTierConfig(tier);
    if (!tierConfig) return res.status(400).json({ error: 'Invalid tier. Use writer, author, or studio.' });

    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY and install stripe.' });
    }

    let customerId = auth.user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email,
        name: auth.user.name || undefined,
        metadata: { userId: auth.user.id },
      });
      customerId = customer.id;
      await db.update(users).set({
        stripeCustomerId: customerId,
        updatedAt: new Date(),
      }).where(eq(users.id, auth.user.id));
    }

    const origin = resolveFrontendOrigin(req);
    const successUrl = process.env.STRIPE_CHECKOUT_SUCCESS_URL || `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env.STRIPE_CHECKOUT_CANCEL_URL || `${origin}/?billing=cancel`;
    const stripePriceId = getStripePriceIdForTier(tierConfig.tier);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      line_items: stripePriceId
        ? [{ price: stripePriceId, quantity: 1 }]
        : [{
            price_data: {
              currency: 'usd',
              unit_amount: tierConfig.priceCents,
              recurring: { interval: 'month' },
              product_data: {
                name: `Theodore ${tierConfig.name}`,
                description: `${tierConfig.credits.toLocaleString()} credits/month`,
              },
            },
            quantity: 1,
          }],
      metadata: {
        userId: auth.user.id,
        tier: tierConfig.tier,
      },
      subscription_data: {
        metadata: {
          userId: auth.user.id,
          tier: tierConfig.tier,
          credits: String(tierConfig.credits),
        },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/billing/portal', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const stripe = await getStripeClient();
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY and install stripe.' });
    }
    if (!auth.user.stripeCustomerId) {
      return res.status(400).json({ error: 'No billing customer found. Start with checkout first.' });
    }

    const origin = resolveFrontendOrigin(req);
    const returnUrl = process.env.STRIPE_PORTAL_RETURN_URL || `${origin}/`;
    const session = await stripe.billingPortal.sessions.create({
      customer: auth.user.stripeCustomerId,
      return_url: returnUrl,
    });
    res.json({ url: session.url });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = await getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripe || !webhookSecret) {
      return res.status(503).json({ error: 'Stripe webhook is not configured.' });
    }
    const signature = req.headers['stripe-signature'];
    if (!signature || Array.isArray(signature)) {
      return res.status(400).json({ error: 'Missing stripe-signature header.' });
    }

    const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const customerId = typeof session.customer === 'string' ? session.customer : null;
      const subscriptionId = typeof session.subscription === 'string' ? session.subscription : null;
      const metadataTier = String(session.metadata?.tier || '');
      const metadataUserId = String(session.metadata?.userId || '');
      const tier = isPaidPlanTier(metadataTier) ? metadataTier : null;

      let user = null;
      if (metadataUserId) {
        const [row] = await db.select().from(users).where(eq(users.id, metadataUserId));
        user = row || null;
      }
      if (!user) {
        user = await getUserByStripeIds(customerId, subscriptionId);
      }

      if (user) {
        const nextPlan = tier || (isPaidPlanTier(user.plan) ? (user.plan as any) : 'writer');
        const creditsTotal = getTierCredits(nextPlan);
        await db.update(users).set({
          plan: nextPlan,
          creditsTotal,
          creditsRemaining: creditsTotal,
          stripeCustomerId: customerId || user.stripeCustomerId,
          stripeSubscriptionId: subscriptionId || user.stripeSubscriptionId,
          stripeSubscriptionStatus: 'active' as any,
          stripePriceTier: nextPlan as any,
          stripeCancelAtPeriodEnd: false as any,
          updatedAt: new Date(),
        } as any).where(eq(users.id, user.id));
      }
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : null;
      const subscriptionId = typeof subscription.id === 'string' ? subscription.id : null;
      const status = String(subscription.status || '');
      const metadataTier = String(subscription.metadata?.tier || '');
      const tier = isPaidPlanTier(metadataTier) ? metadataTier : null;
      const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null;
      const cancelAtPeriodEnd = Boolean(subscription.cancel_at_period_end);

      const user = await getUserByStripeIds(customerId, subscriptionId);
      if (user) {
        const shouldRemainPaid = isStripeSubscriptionActive(status) || status === 'past_due' || status === 'unpaid';
        const nextPlan = shouldRemainPaid
          ? (tier || (isPaidPlanTier(user.plan) ? user.plan : 'writer'))
          : 'free';
        const creditsTotal = getTierCredits(nextPlan);
        const creditsRemaining = nextPlan === 'free'
          ? Math.min(500, Math.max(user.creditsRemaining, 0))
          : (nextPlan !== user.plan ? creditsTotal : Math.min(Math.max(user.creditsRemaining, 0), creditsTotal));

        await db.update(users).set({
          plan: nextPlan,
          creditsTotal,
          creditsRemaining,
          stripeCustomerId: customerId || user.stripeCustomerId,
          stripeSubscriptionId: subscriptionId || user.stripeSubscriptionId,
          stripeSubscriptionStatus: status as any,
          stripeCurrentPeriodEnd: periodEnd as any,
          stripePriceTier: (nextPlan === 'free' ? null : nextPlan) as any,
          stripeCancelAtPeriodEnd: cancelAtPeriodEnd as any,
          updatedAt: new Date(),
        } as any).where(eq(users.id, user.id));
      }
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as any;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : null;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : null;
      const user = await getUserByStripeIds(customerId, subscriptionId);
      if (user) {
        const currentTier = isPaidPlanTier(user.plan)
          ? user.plan
          : isPaidPlanTier((user as any).stripePriceTier || '')
          ? (user as any).stripePriceTier
          : null;
        if (currentTier) {
          const creditsTotal = getTierCredits(currentTier);
          await db.update(users).set({
            creditsTotal,
            creditsRemaining: creditsTotal,
            updatedAt: new Date(),
          }).where(eq(users.id, user.id));
        }
      }
    }

    res.json({ received: true });
  } catch (e: any) {
    console.error('Stripe webhook error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ========== Auth ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || '');
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;

    if (!isValidEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const existing = await getUserByEmail(email);
    if (existing?.passwordHash) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const now = new Date();
    const passwordHash = hashPassword(password);

    let user = existing;
    if (!user) {
      const [inserted] = await db.insert(users).values({
        id: `user-${randomUUID()}`,
        email,
        passwordHash,
        emailVerifiedAt: now,
        name: name || null,
        plan: 'free',
        creditsRemaining: 500,
        creditsTotal: 500,
      }).returning();
      user = inserted;
    } else {
      const [updated] = await db.update(users).set({
        passwordHash,
        emailVerifiedAt: now,
        name: name || user.name,
        updatedAt: now,
      }).where(eq(users.id, user.id)).returning();
      user = updated;
    }

    await createSession(user.id, req, res);
    res.json({ user: toSafeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await getUserByEmail(email);
    if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    await createSession(user.id, req, res);
    res.json({ user: toSafeUser(user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: toSafeUser(auth.user) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || '');
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await getUserByEmail(email);
    let resetToken: string | undefined;
    if (user?.passwordHash) {
      resetToken = await setResetToken(user.id);
      if (process.env.NODE_ENV !== 'production') {
        console.info(`[Auth] Password reset token for ${email}: ${resetToken}`);
      }
    }

    res.json({
      ok: true,
      message: 'If that email exists, a reset link has been generated.',
      ...(process.env.NODE_ENV !== 'production' && resetToken ? { resetToken } : {}),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body?.token || '');
    const password = String(req.body?.password || '');
    if (!token) return res.status(400).json({ error: 'Reset token is required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const user = await getUserByResetToken(token);
    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }
    if (user.passwordResetExpiresAt.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Reset token has expired.' });
    }

    const passwordHash = hashPassword(password);
    const [updated] = await db.update(users).set({
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id)).returning();

    await clearAllUserSessions(user.id);
    await createSession(user.id, req, res);
    res.json({ ok: true, user: toSafeUser(updated) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========== Users ==========
app.get('/api/users/me', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    res.json(toSafeUser(auth.user));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/users/me', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowed = [
      'name',
      'avatarUrl',
      'settings',
    ] as const;

    if (typeof req.body?.email === 'string') {
      const normalized = normalizeEmail(req.body.email);
      if (!isValidEmail(normalized)) return res.status(400).json({ error: 'Invalid email address.' });
      updates.email = normalized;
    }
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    const [updated] = await db.update(users).set(updates).where(eq(users.id, auth.user.id)).returning();
    res.json(toSafeUser(updated));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========== Projects ==========
app.get('/api/projects', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const result = await db.select().from(projects).where(eq(projects.userId, auth.user.id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const project = await getOwnedProject(req.params.id, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const [project] = await db.insert(projects).values(buildProjectInsert(req.body, auth.user.id)).returning();
    res.json(project);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const owned = await getOwnedProject(req.params.id, auth.user.id);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    const [project] = await db.update(projects).set(buildProjectUpdate(req.body)).where(eq(projects.id, req.params.id)).returning();
    res.json(project);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const owned = await getOwnedProject(req.params.id, auth.user.id);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    await db.delete(projects).where(eq(projects.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Chapters ==========
app.get('/api/projects/:projectId/chapters', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const project = await getOwnedProject(req.params.projectId, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const result = await db.select().from(chapters).where(eq(chapters.projectId, req.params.projectId));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chapters', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const projectId = String(req.body?.projectId || '');
    const project = await getOwnedProject(projectId, auth.user.id);
    if (!project) return res.status(403).json({ error: 'Forbidden' });

    const [chapter] = await db.insert(chapters).values(buildChapterInsert(req.body, projectId)).returning();
    res.json(chapter);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/chapters/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chapter = await getOwnedChapter(req.params.id, auth.user.id);
    if (!chapter) return res.status(404).json({ error: 'Not found' });

    const [updated] = await db.update(chapters).set(buildChapterUpdate(req.body, chapter.projectId)).where(eq(chapters.id, req.params.id)).returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/chapters/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chapter = await getOwnedChapter(req.params.id, auth.user.id);
    if (!chapter) return res.status(404).json({ error: 'Not found' });

    await db.delete(chapters).where(eq(chapters.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Canon Entries ==========
app.get('/api/projects/:projectId/canon', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const project = await getOwnedProject(req.params.projectId, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const result = await db.select().from(canonEntries).where(eq(canonEntries.projectId, req.params.projectId));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/canon', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const projectId = String(req.body?.projectId || '');
    const project = await getOwnedProject(projectId, auth.user.id);
    if (!project) return res.status(403).json({ error: 'Forbidden' });

    const [entry] = await db.insert(canonEntries).values(buildCanonInsert(req.body, projectId)).returning();
    res.json(entry);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/canon/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const entry = await getOwnedCanonEntry(req.params.id, auth.user.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const [updated] = await db.update(canonEntries).set(buildCanonUpdate(req.body, entry.projectId)).where(eq(canonEntries.id, req.params.id)).returning();
    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/canon/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const entry = await getOwnedCanonEntry(req.params.id, auth.user.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    await db.delete(canonEntries).where(eq(canonEntries.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Credit Transactions ==========
app.get('/api/users/:userId/transactions', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (req.params.userId !== auth.user.id) return res.status(403).json({ error: 'Forbidden' });
    const result = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, auth.user.id));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;

    const body = asObject(req.body);
    const creditsUsed = Math.max(0, Math.round(asFiniteNumber(body.creditsUsed, 0)));
    const [tx] = await db.insert(creditTransactions).values({
      userId: auth.user.id,
      action: asString(body.action, 'generate'),
      creditsUsed,
      model: asString(body.model, ''),
      chapterId: asOptionalString(body.chapterId),
      metadata: asObject(body.metadata),
    }).returning();

    if (creditsUsed > 0) {
      await db.update(users).set({
        creditsRemaining: Math.max(0, auth.user.creditsRemaining - creditsUsed),
        updatedAt: new Date(),
      }).where(eq(users.id, auth.user.id));
    }
    res.json(tx);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== AI Generation ==========
app.post('/api/generate', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { prompt, systemPrompt, model, maxTokens, temperature, projectId, chapterId, action } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    if (projectId) {
      const project = await getOwnedProject(String(projectId), auth.user.id);
      if (!project) return res.status(403).json({ error: 'Forbidden' });
    }
    if (chapterId) {
      const chapter = await getOwnedChapter(String(chapterId), auth.user.id);
      if (!chapter) return res.status(403).json({ error: 'Forbidden' });
      if (projectId && chapter.projectId !== projectId) return res.status(400).json({ error: 'Chapter/project mismatch' });
    }

    const user = auth.user;
    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }
    const result = await generate({
      prompt, systemPrompt, model, maxTokens, temperature,
      userId: user.id, projectId, chapterId, action,
    });

    await db.insert(creditTransactions).values({
      userId: user.id,
      action: action || 'generate',
      creditsUsed: result.creditsUsed,
      model: result.model,
      chapterId,
      metadata: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        projectId,
      },
    });

    await db.update(users).set({
      creditsRemaining: Math.max(0, user.creditsRemaining - result.creditsUsed),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));

    res.json({
      text: result.text,
      model: result.model,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        creditsUsed: result.creditsUsed,
        creditsRemaining: Math.max(0, user.creditsRemaining - result.creditsUsed),
      },
    });
  } catch (e: any) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/generate/stream', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const { prompt, systemPrompt, model, maxTokens, temperature, projectId, chapterId, action } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }
    if (projectId) {
      const project = await getOwnedProject(String(projectId), auth.user.id);
      if (!project) return res.status(403).json({ error: 'Forbidden' });
    }
    if (chapterId) {
      const chapter = await getOwnedChapter(String(chapterId), auth.user.id);
      if (!chapter) return res.status(403).json({ error: 'Forbidden' });
      if (projectId && chapter.projectId !== projectId) return res.status(400).json({ error: 'Chapter/project mismatch' });
    }

    const user = auth.user;
    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const result = await generateStream(
      { prompt, systemPrompt, model, maxTokens, temperature, userId: user.id, projectId, chapterId, action },
      res,
    );

    await db.insert(creditTransactions).values({
      userId: user.id,
      action: action || 'generate-stream',
      creditsUsed: result.creditsUsed,
      model: result.model,
      chapterId,
      metadata: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        projectId,
      },
    });

    await db.update(users).set({
      creditsRemaining: Math.max(0, user.creditsRemaining - result.creditsUsed),
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));

    res.write(`data: ${JSON.stringify({
      type: 'done',
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        creditsUsed: result.creditsUsed,
        creditsRemaining: Math.max(0, user.creditsRemaining - result.creditsUsed),
      },
    })}\n\n`);

    res.end();
  } catch (e: any) {
    console.error('Stream error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: e.message });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
      res.end();
    }
  }
});

app.get('/api/users/:id/credits', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (req.params.id !== auth.user.id) return res.status(403).json({ error: 'Forbidden' });
    const user = auth.user;
    res.json({
      plan: user.plan,
      creditsRemaining: user.creditsRemaining,
      creditsTotal: user.creditsTotal,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Serve static in production ==========
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (_req, res) => {
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npx vite build' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Theodore API running on port ${PORT}`);
});
