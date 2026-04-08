import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db, pool } from './db.js';
import { projects, chapters, canonEntries, users, creditTransactions, audioGenerations, sfxLibrary, supportRequests } from './schema.js';
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
import { generateImage, generateImageOpenAI, buildCharacterPortraitPrompt, buildLocationIllustrationPrompt, buildSceneIllustrationPrompt, buildBookCoverPrompt, buildChildrensPagePrompt } from './image-gen.js';
import { generateChapterAudio, generateVoicePreview, ELEVENLABS_VOICES, OPENAI_VOICES, getVoicesWithPreviews } from './tts.js';
import { getOverview, getUsers, getUserDetail, getActivity, getDailyStats } from './admin.js';
import type { ElevenLabsVoice } from './tts.js';
// Legacy alias
type OpenAIVoice = ElevenLabsVoice;
import { getPaidTierConfig, getStripeClient, getStripePriceIdForTier, isPaidPlanTier, listPaidTierConfigs, FREE_TIER_CREDITS, FREE_TIER_NAME, ttsCreditCost, MUSIC_CREDITS_PER_TRACK, SFX_CREDITS_PER_GEN, IMAGE_CREDITS_PER_GEN } from './billing.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

const APP_URL = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null;
const DEV_ALLOWED_ORIGINS = [
  'http://localhost:5050',
  'http://127.0.0.1:5050',
  'http://localhost:5757',
  'http://localhost:5758',
  'http://127.0.0.1:5757',
  'http://127.0.0.1:5758',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5055',
  'http://127.0.0.1:5055',
];
const allowedOrigins = new Set<string>([
  ...(APP_URL ? [APP_URL] : []),
  ...(process.env.NODE_ENV === 'production' ? [] : DEV_ALLOWED_ORIGINS),
]);

function normalizeOrigin(originHeader?: string | null): string | null {
  if (!originHeader || typeof originHeader !== 'string') return null;
  const normalized = originHeader.trim().replace(/\/$/, '');
  return normalized || null;
}

function isAllowedOrigin(originHeader?: string | null): boolean {
  const normalized = normalizeOrigin(originHeader);
  if (!normalized) return false;
  return allowedOrigins.has(normalized);
}

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    return callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
}));
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
  return FREE_TIER_CREDITS;
}

function resolveFrontendOrigin(req: express.Request): string {
  const origin = req.get('origin');
  if (isAllowedOrigin(origin)) return normalizeOrigin(origin) as string;
  if (APP_URL) return APP_URL;
  return 'http://localhost:5173';
}

function respondInternalError(res: express.Response, scope: string, error: unknown): void {
  console.error(`[${scope}]`, error);
  // Drizzle wraps pg errors as "Failed query: ..." and puts the actual
  // PostgreSQL error on `error.cause`. Walk the chain so the response shows
  // the real reason (e.g. "column users.foo does not exist") rather than
  // just the SQL drizzle attempted.
  const collected: string[] = [];
  let current: unknown = error;
  let depth = 0;
  while (current && depth < 5) {
    if (current instanceof Error) {
      const msg = current.message;
      const code = (current as any).code;
      const detail = (current as any).detail;
      const part = code ? `${msg} [${code}]` : msg;
      if (part) collected.push(part);
      if (detail && typeof detail === 'string') collected.push(detail);
      current = (current as any).cause;
    } else {
      collected.push(String(current));
      current = null;
    }
    depth++;
  }
  const message = collected.length ? collected.join(' ⟶ ') : 'Internal server error';
  res.status(500).json({ error: `[${scope}] ${message}` });
}

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateLimitEntry>();
const activeGenerationUsers = new Set<string>();

function pruneRateLimitStore(now: number): void {
  if (rateLimitStore.size < 2000) return;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function takeRateLimitToken(
  res: express.Response,
  scope: string,
  identity: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  pruneRateLimitStore(now);
  const key = `${scope}:${identity}`;
  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'Too many attempts. Please try again shortly.' });
    return false;
  }
  existing.count += 1;
  rateLimitStore.set(key, existing);
  return true;
}

function requestClientIp(req: express.Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function normalizedEmailFromBody(req: express.Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email : '';
  return normalizeEmail(email);
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
    childrensBookSettings: 'childrensBookSettings' in body && body.childrensBookSettings ? asObject(body.childrensBookSettings) : null,
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
  if ('childrensBookSettings' in body) updates.childrensBookSettings = body.childrensBookSettings ? asObject(body.childrensBookSettings) : null;
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
    scenes: Array.isArray(body.scenes) ? body.scenes : [],
    editChatHistory: Array.isArray(body.editChatHistory) ? body.editChatHistory : [],
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
  if ('scenes' in body) updates.scenes = Array.isArray(body.scenes) ? body.scenes : [];
  if ('editChatHistory' in body) updates.editChatHistory = Array.isArray(body.editChatHistory) ? body.editChatHistory : [];
  if ('imageUrl' in body) updates.imageUrl = body.imageUrl === null ? null : asOptionalString(body.imageUrl);
  if ('illustrationNotes' in body) updates.illustrationNotes = body.illustrationNotes === null ? null : asOptionalString(body.illustrationNotes);

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
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Debug TTS test endpoint (remove after debugging)
app.get('/api/debug/tts-test', async (req, res) => {
  if (req.query.key !== 'theodore-debug-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    const { generateChapterAudio } = await import('./tts.js');
    const result = await generateChapterAudio({
      chapterId: 'debug-test-' + Date.now(),
      prose: 'The rain fell softly on the old cobblestones.',
      narratorVoice: 'XrExE9yKIg1WjnnlVkGX',
      voiceMap: { narrator: 'XrExE9yKIg1WjnnlVkGX' as any, characters: {} },
      speed: 1,
      multiVoice: false,
      sceneSFX: [],
    });
    // Verify file exists on disk
    const filePath = path.join(process.cwd(), result.audioUrl);
    const exists = fs.existsSync(filePath);
    res.json({ ok: true, audioUrl: result.audioUrl, duration: result.durationEstimate, segments: result.segments, fileExists: exists });
  } catch (e: any) {
    res.json({ ok: false, error: e.message, stack: e.stack?.split('\n').slice(0, 5) });
  }
});

// Debug: check logs and files on persistent disk
app.get('/api/debug/disk', async (req, res) => {
  if (req.query.key !== 'theodore-debug-2026') return res.status(403).json({ error: 'forbidden' });
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const files: string[] = [];
  const walk = (dir: string) => {
    try {
      for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        const st = fs.statSync(fp);
        if (st.isDirectory()) walk(fp);
        else files.push(fp.replace(uploadsDir, '') + ` (${st.size}b)`);
      }
    } catch {}
  };
  walk(uploadsDir);
  const ttsLog = fs.existsSync(path.join(uploadsDir, 'audio', 'tts.log')) ? fs.readFileSync(path.join(uploadsDir, 'audio', 'tts.log'), 'utf-8').slice(-2000) : 'no tts.log';
  const errorLog = fs.existsSync(path.join(uploadsDir, 'audio', 'error.log')) ? fs.readFileSync(path.join(uploadsDir, 'audio', 'error.log'), 'utf-8').slice(-2000) : 'no error.log';
  res.json({ files, ttsLog, errorLog });
});

// Debug: book stats for credit estimation
app.get('/api/debug/book-stats', async (req, res) => {
  if (req.query.key !== 'theodore-debug-2026') return res.status(403).json({ error: 'forbidden' });
  try {
    const allProjects = await db.execute<{id: string; title: string}>(sql`SELECT id, title FROM projects`);
    const allChapters = await db.execute<any>(sql`SELECT id, project_id, number, title, prose, scenes FROM chapters`);
    const projectRows = allProjects.rows || allProjects;
    const chapterRows = allChapters.rows || allChapters;
    const stats = (projectRows as any[]).map((p: any) => {
      const pChapters = (chapterRows as any[]).filter((c: any) => c.project_id === p.id).sort((a: any, b: any) => a.number - b.number);
      return {
        id: p.id,
        title: p.title,
        chapterCount: pChapters.length,
        chapters: pChapters.map(c => {
          const scenes = (c.scenes || []) as any[];
          const proseLen = (c.prose || '').length;
          return {
            id: c.id,
            number: c.number,
            title: c.title,
            proseChars: proseLen,
            sceneCount: scenes.length,
            scenes: scenes.map((s: any) => ({
              id: s.id,
              title: s.title,
              proseChars: (s.prose || '').length,
              sfxCount: (s.sfx || []).filter((x: any) => x.enabled).length,
            })),
          };
        }),
      };
    });
    res.json({ projects: stats });
  } catch (e: any) {
    res.json({ error: e.message });
  }
});

// ========== Billing ==========
app.get('/api/billing/plans', (_req, res) => {
  res.json({
    paidTiers: listPaidTierConfigs(),
    free: {
      tier: 'free',
      name: FREE_TIER_NAME,
      credits: FREE_TIER_CREDITS,
      priceUsd: 0,
      priceCents: 0,
      summary: `${FREE_TIER_CREDITS} credits / month`,
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
    respondInternalError(res, 'api', e);
  }
});

app.post('/api/billing/checkout', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const tier = String(req.body?.tier || '');
    const tierConfig = getPaidTierConfig(tier);
    if (!tierConfig) return res.status(400).json({ error: 'Invalid tier. Use writer, author, studio, or publisher.' });

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
    respondInternalError(res, 'billing.checkout', e);
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
    respondInternalError(res, 'billing.portal', e);
  }
});

app.post('/api/billing/cancel', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const stripe = await getStripeClient();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    if (!auth.user.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription found.' });

    const subscription = await stripe.subscriptions.update(auth.user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await db.update(users).set({
      stripeCancelAtPeriodEnd: true as any,
      updatedAt: new Date(),
    } as any).where(eq(users.id, auth.user.id));

    res.json({ ok: true, cancelAt: subscription.current_period_end });
  } catch (e: any) {
    respondInternalError(res, 'billing.cancel', e);
  }
});

app.post('/api/billing/reactivate', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const stripe = await getStripeClient();
    if (!stripe) return res.status(503).json({ error: 'Stripe is not configured.' });
    if (!auth.user.stripeSubscriptionId) return res.status(400).json({ error: 'No active subscription found.' });

    await stripe.subscriptions.update(auth.user.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await db.update(users).set({
      stripeCancelAtPeriodEnd: false as any,
      updatedAt: new Date(),
    } as any).where(eq(users.id, auth.user.id));

    res.json({ ok: true });
  } catch (e: any) {
    respondInternalError(res, 'billing.reactivate', e);
  }
});

app.post('/api/billing/refund', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Please provide a reason for the refund request.' });
    if (reason.length > 2000) return res.status(400).json({ error: 'Reason must be under 2000 characters.' });

    await db.insert(supportRequests).values({
      userId: auth.user.id,
      type: 'refund',
      reason,
      status: 'pending',
    });

    res.json({ ok: true, message: 'Refund request submitted. We\'ll review it within 24-48 hours.' });
  } catch (e: any) {
    respondInternalError(res, 'billing.refund', e);
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
          ? Math.min(FREE_TIER_CREDITS, Math.max(user.creditsRemaining, 0))
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
    console.error('Stripe webhook error:', e);
    res.status(400).json({ error: 'Invalid webhook payload.' });
  }
});

// ========== Auth ==========
app.post('/api/auth/register', async (req, res) => {
  try {
    const ip = requestClientIp(req);
    const emailForLimit = normalizedEmailFromBody(req) || 'unknown-email';
    if (!takeRateLimitToken(res, 'auth.register', `${ip}:${emailForLimit}`, 8, 15 * 60 * 1000)) return;

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
        creditsRemaining: FREE_TIER_CREDITS,
        creditsTotal: FREE_TIER_CREDITS,
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

    const token = await createSession(user.id, req, res);
    res.json({ user: toSafeUser(user), token });
  } catch (e: any) {
    respondInternalError(res, 'auth.register', e);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = requestClientIp(req);
    const emailForLimit = normalizedEmailFromBody(req) || 'unknown-email';
    if (!takeRateLimitToken(res, 'auth.login', `${ip}:${emailForLimit}`, 12, 15 * 60 * 1000)) return;

    const email = normalizeEmail(req.body?.email || '');
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const user = await getUserByEmail(email);
    if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = await createSession(user.id, req, res);
    res.json({ user: toSafeUser(user), token });
  } catch (e: any) {
    respondInternalError(res, 'auth.login', e);
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (e: any) {
    respondInternalError(res, 'auth.logout', e);
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not signed in' });
    res.json({ user: toSafeUser(auth.user) });
  } catch (e: any) {
    respondInternalError(res, 'auth.me', e);
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const ip = requestClientIp(req);
    const emailForLimit = normalizedEmailFromBody(req) || 'unknown-email';
    if (!takeRateLimitToken(res, 'auth.forgot', `${ip}:${emailForLimit}`, 8, 15 * 60 * 1000)) return;

    const email = normalizeEmail(req.body?.email || '');
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const user = await getUserByEmail(email);
    let resetToken: string | undefined;
    const allowDevResetToken = process.env.ALLOW_DEV_RESET_TOKEN === 'true';
    if (user?.passwordHash) {
      resetToken = await setResetToken(user.id);
      if (allowDevResetToken) {
        console.info(`[Auth] Password reset token for ${email}: ${resetToken}`);
      }
    }

    res.json({
      ok: true,
      message: 'If that email exists, a reset link has been generated.',
      ...(allowDevResetToken && resetToken ? { resetToken } : {}),
    });
  } catch (e: any) {
    respondInternalError(res, 'auth.forgotPassword', e);
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const ip = requestClientIp(req);
    if (!takeRateLimitToken(res, 'auth.resetPassword', ip, 8, 15 * 60 * 1000)) return;

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
    const sessionToken = await createSession(user.id, req, res);
    res.json({ ok: true, user: toSafeUser(updated), token: sessionToken });
  } catch (e: any) {
    respondInternalError(res, 'auth.resetPassword', e);
  }
});

// ========== Users ==========
app.get('/api/users/me', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    res.json(toSafeUser(auth.user));
  } catch (e: any) {
    respondInternalError(res, 'api', e);
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
    respondInternalError(res, 'api', e);
  }
});

// ========== Projects ==========
app.get('/api/projects', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const result = await db.select().from(projects).where(eq(projects.userId, auth.user.id));
    res.json(result);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const project = await getOwnedProject(req.params.id, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.post('/api/projects', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const [project] = await db.insert(projects).values(buildProjectInsert(req.body, auth.user.id)).returning();
    res.json(project);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const owned = await getOwnedProject(req.params.id, auth.user.id);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    const [project] = await db.update(projects).set(buildProjectUpdate(req.body)).where(eq(projects.id, req.params.id)).returning();
    res.json(project);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const owned = await getOwnedProject(req.params.id, auth.user.id);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    await db.delete(projects).where(eq(projects.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { respondInternalError(res, 'api', e); }
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
  } catch (e: any) { respondInternalError(res, 'api', e); }
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
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.patch('/api/chapters/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chapter = await getOwnedChapter(req.params.id, auth.user.id);
    if (!chapter) return res.status(404).json({ error: 'Not found' });

    const [updated] = await db.update(chapters).set(buildChapterUpdate(req.body, chapter.projectId)).where(eq(chapters.id, req.params.id)).returning();
    res.json(updated);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.delete('/api/chapters/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const chapter = await getOwnedChapter(req.params.id, auth.user.id);
    if (!chapter) return res.status(404).json({ error: 'Not found' });

    await db.delete(chapters).where(eq(chapters.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { respondInternalError(res, 'api', e); }
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
  } catch (e: any) { respondInternalError(res, 'api', e); }
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
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.patch('/api/canon/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const entry = await getOwnedCanonEntry(req.params.id, auth.user.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const [updated] = await db.update(canonEntries).set(buildCanonUpdate(req.body, entry.projectId)).where(eq(canonEntries.id, req.params.id)).returning();
    res.json(updated);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

app.delete('/api/canon/:id', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    const entry = await getOwnedCanonEntry(req.params.id, auth.user.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    await db.delete(canonEntries).where(eq(canonEntries.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

// ========== Credit Transactions ==========
app.get('/api/users/:userId/transactions', async (req, res) => {
  try {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (req.params.userId !== auth.user.id) return res.status(403).json({ error: 'Forbidden' });
    const result = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, auth.user.id));
    res.json(result);
  } catch (e: any) { respondInternalError(res, 'api', e); }
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
        creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${creditsUsed})`,
        updatedAt: new Date(),
      }).where(eq(users.id, auth.user.id));
    }
    res.json(tx);
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

// ========== AI Generation ==========

// Guest (unauthenticated) generation — only for plan-project during onboarding
const GUEST_ALLOWED_ACTIONS = new Set([
  // Planning + outline
  'plan-project', 'scaffold-chapters', 'generate-chapter-outline',
  'scene-prose-split', 'entity-refine', 'extract-continuity',
  // Chapter writing + extending
  'generate-chapter', 'extend-chapter', 'dialogue-clarity-pass',
  // Editing flows
  'inline-edit',
  // Post-generation enhancements
  'sfx-ambience', 'dialogue-tagging', 'auto-fill',
]);
const activeGuestIps = new Set<string>();

app.post('/api/generate/guest', async (req, res) => {
  try {
    const { prompt, systemPrompt, model, maxTokens, temperature, action } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    if (!action || !GUEST_ALLOWED_ACTIONS.has(action)) {
      return res.status(403).json({ error: 'Guest generation is only available for project planning.' });
    }

    const ip = requestClientIp(req);

    // Rate limit: 20 guest generations per hour per IP
    if (!takeRateLimitToken(res, 'guest-generate', ip, 20, 60 * 60 * 1000)) return;

    if (activeGuestIps.has(ip)) {
      return res.status(429).json({ error: 'Generation already in progress.' });
    }

    activeGuestIps.add(ip);
    try {
      const result = await generate({
        prompt, systemPrompt, model,
        maxTokens: Math.min(maxTokens || 2200, action === 'generate-chapter' ? 8000 : 2200),
        temperature,
        userId: undefined,
        projectId: undefined,
        chapterId: undefined,
        action,
      });

      res.json({
        text: result.text,
        model: result.model,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          creditsUsed: 0,
          creditsRemaining: null,
        },
      });
    } finally {
      activeGuestIps.delete(ip);
    }
  } catch (e: any) {
    console.error('Guest generate error:', e.message);
    respondInternalError(res, 'api', e);
  }
});

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
      if (!project) console.warn('[Generate] Project not found for user, proceeding anyway');
    }
    if (chapterId) {
      const chapter = await getOwnedChapter(String(chapterId), auth.user.id);
      if (!chapter) console.warn('[Generate] Chapter not found for user, proceeding anyway');
      if (projectId && chapter.projectId !== projectId) return res.status(400).json({ error: 'Chapter/project mismatch' });
    }

    const user = auth.user;
    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }
    if (activeGenerationUsers.has(user.id)) {
      return res.status(429).json({ error: 'Generation already in progress for this account.' });
    }

    activeGenerationUsers.add(user.id);
    try {
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
        creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));

      const updatedCredits = Math.max(0, (user.creditsRemaining ?? 0) - result.creditsUsed);
      res.json({
        text: result.text,
        model: result.model,
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          creditsUsed: result.creditsUsed,
          creditsRemaining: updatedCredits,
        },
      });
    } finally {
      activeGenerationUsers.delete(user.id);
    }
  } catch (e: any) {
    console.error('Generate error:', e.message);
    respondInternalError(res, 'api', e);
  }
});

// Guest streaming generation — for unauthenticated users exploring the workspace
app.post('/api/generate/guest/stream', async (req, res) => {
  try {
    const { prompt, systemPrompt, model, maxTokens, temperature, action } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    if (!action || !GUEST_ALLOWED_ACTIONS.has(action)) {
      return res.status(403).json({ error: 'Guest generation is only available for allowed actions.' });
    }

    const ip = requestClientIp(req);
    if (!takeRateLimitToken(res, 'guest-generate', ip, 20, 60 * 60 * 1000)) return;
    if (activeGuestIps.has(ip)) {
      return res.status(429).json({ error: 'Generation already in progress.' });
    }

    activeGuestIps.add(ip);
    try {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const cappedMaxTokens = Math.min(maxTokens || 2200, action === 'generate-chapter' ? 8000 : 2200);
      const result = await generateStream(
        { prompt, systemPrompt, model, maxTokens: cappedMaxTokens, temperature, userId: undefined, projectId: undefined, chapterId: undefined, action },
        res,
      );

      res.write(`data: ${JSON.stringify({
        type: 'done',
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          creditsUsed: 0,
          creditsRemaining: null,
        },
      })}\n\n`);
      res.end();
    } finally {
      activeGuestIps.delete(ip);
    }
  } catch (e: any) {
    console.error('Guest stream error:', e.message);
    if (!res.headersSent) {
      respondInternalError(res, 'api', e);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e?.message || 'Generation failed.' })}\n\n`);
      res.end();
    }
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
      if (!project) console.warn('[Generate] Project not found for user, proceeding anyway');
    }
    if (chapterId) {
      const chapter = await getOwnedChapter(String(chapterId), auth.user.id);
      if (!chapter) console.warn('[Generate] Chapter not found for user, proceeding anyway');
      if (projectId && chapter.projectId !== projectId) return res.status(400).json({ error: 'Chapter/project mismatch' });
    }

    const user = auth.user;
    if (user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }
    if (activeGenerationUsers.has(user.id)) {
      return res.status(429).json({ error: 'Generation already in progress for this account.' });
    }

    activeGenerationUsers.add(user.id);
    try {
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
        creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
        updatedAt: new Date(),
      }).where(eq(users.id, user.id));

      const updatedCreditsStream = Math.max(0, (user.creditsRemaining ?? 0) - result.creditsUsed);
      res.write(`data: ${JSON.stringify({
        type: 'done',
        usage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          creditsUsed: result.creditsUsed,
          creditsRemaining: updatedCreditsStream,
        },
      })}\n\n`);

      res.end();
    } finally {
      activeGenerationUsers.delete(user.id);
    }
  } catch (e: any) {
    console.error('Stream error:', e.message);
    if (!res.headersSent) {
      respondInternalError(res, 'api', e);
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: e?.message || 'Generation failed.' })}\n\n`);
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
  } catch (e: any) { respondInternalError(res, 'api', e); }
});

// ========== Image Generation (Gemini Nano Banana 2) ==========

app.post('/api/generate/image', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not signed in' });

    const { prompt, aspectRatio, style, projectId, target, targetId, provider } = req.body;
    if (!prompt && !target) return res.status(400).json({ error: 'Missing prompt or target' });

    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // OpenAI image gen is the children's book beta path. Restricted to publisher
    // tier only. Other tiers fall back to the default Gemini provider regardless
    // of what the client requests, so we don't surface a 403 mid-flow.
    const wantsOpenAI = provider === 'openai';
    if (wantsOpenAI && user.plan !== 'publisher') {
      return res.status(403).json({
        error: 'Image generation is currently available on the Publisher plan only.',
      });
    }

    if (user.creditsRemaining < IMAGE_CREDITS_PER_GEN) {
      return res.status(402).json({ error: 'INSUFFICIENT_CREDITS', message: 'Not enough credits for image generation.' });
    }

    let finalPrompt = prompt || '';

    // Auto-build prompt from target type
    if (target === 'character' && targetId) {
      const [entry] = await db.select().from(canonEntries).where(eq(canonEntries.id, targetId));
      if (!entry) return res.status(404).json({ error: 'Canon entry not found' });
      const data = entry.data as any;
      finalPrompt = buildCharacterPortraitPrompt({
        name: entry.name,
        description: entry.description || undefined,
        appearance: data?.character?.appearance,
        age: data?.character?.age,
        gender: data?.character?.gender,
        occupation: data?.character?.occupation,
      });
    } else if (target === 'location' && targetId) {
      const [entry] = await db.select().from(canonEntries).where(eq(canonEntries.id, targetId));
      if (!entry) return res.status(404).json({ error: 'Canon entry not found' });
      const data = entry.data as any;
      finalPrompt = buildLocationIllustrationPrompt({
        name: entry.name,
        description: entry.description || undefined,
        locationType: data?.location?.locationType,
        atmosphere: data?.location?.currentState?.atmosphere,
        sensoryDetails: data?.location?.currentState?.sensoryDetails,
        climate: data?.location?.geography?.climate,
        terrain: data?.location?.geography?.terrain,
      });
    } else if (target === 'scene' && targetId && projectId) {
      // targetId is chapterId:sceneId
      const [chapterId, sceneId] = targetId.split(':');
      const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
      if (!chapter) return res.status(404).json({ error: 'Chapter not found' });
      const scenes = (chapter.scenes as any[]) || [];
      const scene = scenes.find((s: any) => s.id === sceneId);
      if (!scene) return res.status(404).json({ error: 'Scene not found' });
      finalPrompt = buildSceneIllustrationPrompt({
        title: scene.title,
        summary: scene.summary,
        characters: (chapter.premise as any)?.characters,
      });
    } else if (target === 'cover' && projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const nc = (project.narrativeControls as any) || {};
      finalPrompt = buildBookCoverPrompt({
        title: project.title,
        type: project.type,
        subtype: project.subtype || undefined,
        genreEmphasis: nc.genreEmphasis,
        toneMood: nc.toneMood,
      });
    } else if (target === 'page' && targetId) {
      const [chapter] = await db.select().from(chapters).where(eq(chapters.id, targetId));
      if (!chapter) return res.status(404).json({ error: 'Page not found' });
      const [project] = await db.select().from(projects).where(eq(projects.id, chapter.projectId));
      const cbs = (project?.childrensBookSettings as any) || {};
      finalPrompt = buildChildrensPagePrompt({
        title: chapter.title,
        prose: chapter.prose || '',
        illustrationNotes: chapter.illustrationNotes || undefined,
        illustrationStyle: cbs.illustrationStyle,
        ageRange: cbs.ageRange,
        bookTitle: project?.title,
        styleGuide: cbs.styleGuide || undefined,
        characterVisuals: cbs.characterVisuals || undefined,
      });
    }

    if (!finalPrompt) return res.status(400).json({ error: 'Could not build image prompt' });

    const generator = wantsOpenAI ? generateImageOpenAI : generateImage;
    const result = await generator({
      prompt: finalPrompt,
      aspectRatio: aspectRatio || '1:1',
      style: style || 'concept-art',
      userId: auth.user.id,
      projectId,
    });

    // Deduct credits
    await db.update(users).set({
      creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
    }).where(eq(users.id, auth.user.id));

    // Log the transaction
    await db.insert(creditTransactions).values({
      userId: auth.user.id,
      action: 'generate-image',
      creditsUsed: result.creditsUsed,
      model: result.model,
      chapterId: null,
      metadata: { projectId, prompt: result.prompt, imageUrl: result.imageUrl },
    });

    // If target is a canon entry, update its imageUrl
    if ((target === 'character' || target === 'location') && targetId) {
      await db.update(canonEntries).set({
        imageUrl: result.imageUrl,
        updatedAt: new Date(),
      }).where(eq(canonEntries.id, targetId));
    }

    // If target is a page (children's book), update chapter imageUrl
    if (target === 'page' && targetId) {
      await db.update(chapters).set({
        imageUrl: result.imageUrl,
        updatedAt: new Date(),
      }).where(eq(chapters.id, targetId));
    }

    res.json({
      imageUrl: result.imageUrl,
      prompt: result.prompt,
      creditsUsed: result.creditsUsed,
      creditsRemaining: Math.max(0, (auth.user.creditsRemaining ?? 0) - result.creditsUsed),
    });
  } catch (e: any) {
    console.error('Image generation error:', e);
    if (e.message?.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'Image generation not configured. Contact support.' });
    }
    res.status(500).json({ error: e.message || 'Image generation failed' });
  }
});

// ========== TTS / Audiobook Generation ==========

// Check if user has a free audio sample available
app.get('/api/tts/free-sample', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.json({ available: false });
    const user = auth.user;
    const isFreeUser = !user.planTier || user.planTier === 'free';
    if (!isFreeUser) return res.json({ available: false, reason: 'paid' });
    const existing = await db.select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, user.id), eq(creditTransactions.action, 'generate-audio')))
      .limit(1);
    res.json({ available: existing.length === 0 });
  } catch (e: any) {
    res.json({ available: false });
  }
});

app.get('/api/tts/voices', async (_req, res) => {
  try {
    const voices = await getVoicesWithPreviews();
    res.json({ voices });
  } catch {
    res.json({ voices: ELEVENLABS_VOICES });
  }
});

// ========== Async TTS Job System ==========
// Jobs run in the background to avoid Render's 30-second proxy timeout

interface TTSJob {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  progress?: number; // 0-100
  result?: any;
  error?: string;
  createdAt: number;
}

const ttsJobs = new Map<string, TTSJob>();

// Clean up old jobs every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000; // 30 min
  for (const [id, job] of ttsJobs) {
    if (job.createdAt < cutoff) ttsJobs.delete(id);
  }
}, 10 * 60 * 1000);

app.post('/api/tts/generate', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const { chapterId, prose, narratorVoice, characterVoices, characterDescriptions, narratorStyle, model, provider, speed, multiVoice, sceneSFX } = req.body;
    if (!chapterId || !prose) return res.status(400).json({ error: 'chapterId and prose are required' });

    // Credit check
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Free audio sample: Dreamer (free) users get 1 free scene with OpenAI TTS
    const isFreeUser = !user.planTier || user.planTier === 'free';
    let isFreeAudioSample = false;
    if (isFreeUser) {
      const existingAudioTxns = await db.select({ id: creditTransactions.id })
        .from(creditTransactions)
        .where(and(eq(creditTransactions.userId, auth.user.id), eq(creditTransactions.action, 'generate-audio')))
        .limit(1);
      if (existingAudioTxns.length === 0 && (provider || 'elevenlabs') !== 'elevenlabs') {
        // First audio gen + using OpenAI = free sample
        isFreeAudioSample = true;
      } else if (existingAudioTxns.length === 0 && (provider || 'elevenlabs') === 'elevenlabs') {
        // Free sample only works with OpenAI budget voices
        return res.status(402).json({ error: 'Free audio sample is only available with OpenAI TTS. Switch to Budget quality to try it free!' });
      }
    }

    if (!isFreeAudioSample) {
      // Minimum TTS cost is 100 credits (1K chars)
      if (user.creditsRemaining < 100) return res.status(402).json({ error: 'Insufficient credits for audio generation' });
    }

    // Create job and return immediately
    const jobId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: TTSJob = { id: jobId, status: 'pending', createdAt: Date.now() };
    ttsJobs.set(jobId, job);

    // Return job ID immediately (beats the 30-second timeout)
    res.json({ jobId, status: 'pending' });

    // Run generation in background
    job.status = 'processing';

    const voiceMap = {
      narrator: (narratorVoice || 'XrExE9yKIg1WjnnlVkGX') as ElevenLabsVoice,
      characters: (characterVoices || {}) as Record<string, ElevenLabsVoice>,
    };
    const knownCharacters = Object.keys(characterVoices || {});
    console.log(`[TTS] Job ${jobId}: Generating for ${chapterId}, multiVoice: ${multiVoice}, narrator: ${narratorVoice}`);

    try {
      const result = await generateChapterAudio({
        chapterId,
        prose,
        voiceMap,
        provider: provider || 'elevenlabs',
        model: model || 'eleven_multilingual_v2',
        speed: speed || 1.0,
        multiVoice: multiVoice ?? false,
        knownCharacters,
        characterDescriptions: characterDescriptions || {},
        narratorStyle: narratorStyle || undefined,
        sceneSFX: sceneSFX || [],
        onProgress: (pct) => { job.progress = pct; },
      });

      const actualCreditsUsed = isFreeAudioSample ? 0 : result.creditsUsed;

      if (!isFreeAudioSample) {
        // Deduct credits atomically (user object may be stale since TTS runs in background)
        await db.update(users).set({
          creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
        }).where(eq(users.id, auth.user.id));
      }

      // Log transaction (even free samples, so we know they used their freebie)
      await db.insert(creditTransactions).values({
        userId: auth.user.id,
        action: 'generate-audio',
        creditsUsed: actualCreditsUsed,
        model: model || 'eleven_multilingual_v2',
        chapterId,
        metadata: {
          narratorVoice, segments: result.segments, durationEstimate: result.durationEstimate,
          charCount: prose.length, freeAudioSample: isFreeAudioSample || undefined,
        },
      });

      // Save audio generation to DB for persistence
      // Determine projectId and sceneId from chapterId
      const isScene = chapterId.startsWith('scene-');
      const realChapterId = isScene ? undefined : chapterId;
      const sceneId = isScene ? chapterId.replace('scene-', '') : undefined;
      
      // Look up project from chapter
      let projectId = '';
      if (realChapterId) {
        const [ch] = await db.select({ projectId: chapters.projectId }).from(chapters).where(eq(chapters.id, realChapterId));
        projectId = ch?.projectId || '';
      } else if (sceneId) {
        // Scene IDs are stored in chapters.scenes JSON - search all user chapters
        const userChapters = await db.select().from(chapters);
        for (const ch of userChapters) {
          const scenes = (ch.scenes || []) as any[];
          if (scenes.some((s: any) => s.id === sceneId)) {
            projectId = ch.projectId;
            realChapterId && (undefined); // already set
            break;
          }
        }
      }

      // Deactivate previous versions for this chapter/scene
      if (projectId) {
        await db.update(audioGenerations)
          .set({ isActive: false })
          .where(eq(audioGenerations.chapterId, chapterId));
        
        // Get next version number
        const existing = await db.select({ version: audioGenerations.version })
          .from(audioGenerations)
          .where(eq(audioGenerations.chapterId, chapterId))
          .orderBy(audioGenerations.version);
        const nextVersion = existing.length > 0 ? Math.max(...existing.map(e => e.version)) + 1 : 1;

        await db.insert(audioGenerations).values({
          userId: auth.user.id,
          projectId,
          chapterId,
          sceneId: sceneId || null,
          version: nextVersion,
          audioUrl: result.audioUrl,
          durationSeconds: result.durationEstimate,
          segments: result.segments,
          voiceConfig: { provider: provider || 'elevenlabs', narratorVoice, model, speed, multiVoice },
          sfxConfig: sceneSFX || [],
          creditsUsed: result.creditsUsed,
          isActive: true,
        });
        console.log(`[TTS] Saved audio generation v${nextVersion} for ${chapterId}`);
      }

      job.status = 'complete';
      job.result = {
        audioUrl: result.audioUrl,
        durationEstimate: result.durationEstimate,
        segments: result.segments,
        creditsUsed: result.creditsUsed,
        creditsRemaining: Math.max(0, (user.creditsRemaining ?? 0) - result.creditsUsed),
      };
      console.log(`[TTS] Job ${jobId}: Complete → ${result.audioUrl}`);
    } catch (e: any) {
      console.error(`[TTS] Job ${jobId}: Error:`, e.message);
      try { fs.appendFileSync(path.join(process.cwd(), 'uploads', 'audio', 'error.log'), `[${new Date().toISOString()}] Job ${jobId} inner error: ${e.message}\n${e.stack || ''}\n`); } catch {}
      job.status = 'error';
      job.error = e.message || 'Audio generation failed';
    }
  } catch (e: any) {
    console.error('TTS generation error:', e);
    try { fs.appendFileSync(path.join(process.cwd(), 'uploads', 'audio', 'error.log'), `[${new Date().toISOString()}] TTS outer error: ${e.message}\n${e.stack || ''}\n`); } catch {}
    if (e.message?.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({ error: 'TTS not configured. Add ELEVENLABS_API_KEY to enable audio generation.' });
    }
    res.status(500).json({ error: e.message || 'Audio generation failed' });
  }
});

// Poll for job completion
// Guest TTS — one free OpenAI sample per IP per day. No auth required.
// Used by the unauthenticated Imagine flow so guests can hear what audio
// generation feels like before signing up.
app.post('/api/tts/generate/guest', async (req, res) => {
  try {
    const { chapterId, prose, narratorVoice, model, provider, speed, sceneSFX } = req.body;
    if (!chapterId || !prose) return res.status(400).json({ error: 'chapterId and prose are required' });
    if ((provider || 'openai') !== 'openai') {
      return res.status(403).json({ error: 'Guest audio sample is only available with OpenAI TTS.' });
    }
    if (typeof prose !== 'string' || prose.length > 2000) {
      return res.status(400).json({ error: 'Guest audio sample is limited to 2000 characters.' });
    }

    const ip = requestClientIp(req);
    // 1 free guest TTS per IP per day. The same helper that auth/generate use.
    if (!takeRateLimitToken(res, 'tts.guest', ip, 1, 24 * 60 * 60 * 1000)) return;

    const jobId = `tts-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: TTSJob = { id: jobId, status: 'pending', createdAt: Date.now() };
    ttsJobs.set(jobId, job);

    res.json({ jobId, status: 'pending' });

    job.status = 'processing';
    const voiceMap = {
      narrator: (narratorVoice || 'XrExE9yKIg1WjnnlVkGX') as ElevenLabsVoice,
      characters: {} as Record<string, ElevenLabsVoice>,
    };
    console.log(`[TTS] Guest job ${jobId}: Generating for ${chapterId} from ${ip}`);

    try {
      const result = await generateChapterAudio({
        chapterId,
        prose,
        voiceMap,
        provider: 'openai',
        model: model || 'openai-gpt-4o-mini-tts',
        speed: speed || 1.0,
        multiVoice: false,
        knownCharacters: [],
        characterDescriptions: {},
        narratorStyle: undefined,
        sceneSFX: sceneSFX || [],
        onProgress: (pct) => { job.progress = pct; },
      });

      job.status = 'complete';
      job.result = {
        audioUrl: result.audioUrl,
        durationEstimate: result.durationEstimate,
        segments: result.segments,
        creditsUsed: 0,
        creditsRemaining: null,
      };
      console.log(`[TTS] Guest job ${jobId}: Complete → ${result.audioUrl}`);
    } catch (e: any) {
      console.error(`[TTS] Guest job ${jobId}: Failed —`, e.message);
      job.status = 'error';
      job.error = e.message || 'Audio generation failed';
    }
  } catch (e: any) {
    console.error('Guest TTS error:', e.message);
    if (!res.headersSent) respondInternalError(res, 'api', e);
  }
});

app.get('/api/tts/job/:jobId', async (req, res) => {
  const job = ttsJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'complete') {
    res.json({ status: 'complete', ...job.result });
  } else if (job.status === 'error') {
    res.json({ status: 'error', error: job.error });
  } else {
    res.json({ status: job.status, progress: job.progress || 0 });
  }
});

// ========== Audio Generation History ==========

// Get all audio generations for a project
app.get('/api/audio/generations/:projectId', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const rows = await db.select().from(audioGenerations)
      .where(eq(audioGenerations.projectId, req.params.projectId))
      .orderBy(audioGenerations.chapterId, audioGenerations.version);

    res.json({ generations: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Set active version for a chapter/scene
app.put('/api/audio/generations/:id/activate', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const [gen] = await db.select().from(audioGenerations).where(eq(audioGenerations.id, parseInt(req.params.id)));
    if (!gen) return res.status(404).json({ error: 'Generation not found' });

    // Deactivate all versions for this chapter
    await db.update(audioGenerations)
      .set({ isActive: false })
      .where(eq(audioGenerations.chapterId, gen.chapterId));

    // Activate the selected version
    await db.update(audioGenerations)
      .set({ isActive: true })
      .where(eq(audioGenerations.id, gen.id));

    res.json({ ok: true, audioUrl: gen.audioUrl });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ========== SFX Library ==========

// Get SFX library
app.get('/api/sfx/library', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const rows = await db.select().from(sfxLibrary)
      .orderBy(sfxLibrary.usageCount);

    res.json({ sfx: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Search SFX library by prompt similarity
app.get('/api/sfx/library/search', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const query = (req.query.q as string || '').toLowerCase().trim();
    if (!query) return res.json({ sfx: [] });

    // Simple keyword search
    const rows = await db.select().from(sfxLibrary);
    const matches = rows.filter(s => 
      s.prompt.toLowerCase().includes(query) || 
      query.split(' ').some(word => s.prompt.toLowerCase().includes(word))
    ).sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    res.json({ sfx: matches.slice(0, 10) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/tts/preview', async (req, res) => {
  try {
    const { voice, text } = req.body;
    if (!voice) return res.status(400).json({ error: 'voice is required' });

    const audioBuffer = await generateVoicePreview(String(voice), text);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.length),
    });
    res.send(audioBuffer);
  } catch (e: any) {
    console.error('TTS preview error:', e);
    res.status(500).json({ error: e.message || 'Preview failed' });
  }
});

// ========== Music Generation (ElevenLabs) ==========

import { generateSceneMusic, isMusicAvailable } from './music.js';
import { generateSFX, isSFXAvailable } from './sfx.js';

app.get('/api/music/status', async (_req, res) => {
  res.json({ available: isMusicAvailable() });
});

app.post('/api/music/generate', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const { sceneId, prompt, genre, durationHint } = req.body;
    if (!sceneId || !prompt) return res.status(400).json({ error: 'sceneId and prompt are required' });

    if (!isMusicAvailable()) {
      return res.status(503).json({ error: 'Music generation not configured. Set ELEVENLABS_API_KEY or MUSIC_API_ENDPOINT.' });
    }

    // Credit check
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.creditsRemaining < MUSIC_CREDITS_PER_TRACK) return res.status(402).json({ error: 'Insufficient credits for music generation' });

    const result = await generateSceneMusic({ sceneId, prompt, genre, durationHint });

    // Deduct credits
    await db.update(users).set({
      creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
    }).where(eq(users.id, auth.user.id));

    await db.insert(creditTransactions).values({
      userId: auth.user.id,
      action: 'generate-music',
      creditsUsed: result.creditsUsed,
      model: 'elevenlabs-music',
      metadata: { sceneId, genre, durationSeconds: result.durationSeconds },
    });

    res.json({
      ...result,
      creditsRemaining: Math.max(0, (auth.user.creditsRemaining ?? 0) - result.creditsUsed),
    });
  } catch (e: any) {
    console.error('Music generation error:', e);
    res.status(500).json({ error: e.message || 'Music generation failed' });
  }
});

// ========== Sound Effects (ElevenLabs) ==========

app.get('/api/sfx/status', async (_req, res) => {
  res.json({ available: isSFXAvailable() });
});

app.post('/api/sfx/generate', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    const { prompt, durationSeconds } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    if (!isSFXAvailable()) {
      return res.status(503).json({ error: 'SFX generation not configured. Set ELEVENLABS_API_KEY.' });
    }

    // Check SFX library first for a matching prompt
    const normalizedPrompt = prompt.toLowerCase().trim();
    const libraryEntries = await db.select().from(sfxLibrary);
    const match = libraryEntries.find(s => {
      const libPrompt = s.prompt.toLowerCase().trim();
      return libPrompt === normalizedPrompt || 
        libPrompt.includes(normalizedPrompt) || 
        normalizedPrompt.includes(libPrompt);
    });

    if (match && match.audioUrl) {
      // Check if the file still exists
      const filePath = path.join(process.cwd(), match.audioUrl);
      if (fs.existsSync(filePath)) {
        console.log(`[SFX] Library hit: "${prompt}" → ${match.audioUrl}`);
        await db.update(sfxLibrary)
          .set({ usageCount: (match.usageCount || 0) + 1 })
          .where(eq(sfxLibrary.id, match.id));
        return res.json({
          audioUrl: match.audioUrl,
          durationSeconds: match.durationSeconds || durationSeconds,
          creditsUsed: 0,
          fromLibrary: true,
        });
      }
    }

    // Credit check
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.creditsRemaining < SFX_CREDITS_PER_GEN) return res.status(402).json({ error: 'Insufficient credits for SFX generation' });

    const result = await generateSFX({ prompt, durationSeconds });

    // Deduct credits
    await db.update(users).set({
      creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
    }).where(eq(users.id, auth.user.id));

    await db.insert(creditTransactions).values({
      userId: auth.user.id,
      action: 'generate-sfx',
      creditsUsed: result.creditsUsed,
      model: 'elevenlabs-sfx',
      metadata: { prompt, durationSeconds: result.durationSeconds },
    });

    // Save to SFX library for reuse
    // Check if a similar prompt already exists
    const existingLib = await db.select().from(sfxLibrary);
    const normalizedForSave = prompt.toLowerCase().trim();
    const existing = existingLib.find(s => s.prompt.toLowerCase().trim() === normalizedForSave);
    
    if (existing) {
      // Update usage count
      await db.update(sfxLibrary)
        .set({ usageCount: (existing.usageCount || 0) + 1 })
        .where(eq(sfxLibrary.id, existing.id));
    } else {
      // Add to library
      await db.insert(sfxLibrary).values({
        prompt: prompt.trim(),
        audioUrl: result.audioUrl,
        durationSeconds: result.durationSeconds,
        position: durationSeconds > 10 ? 'background' : 'inline',
        source: 'elevenlabs',
        userId: auth.user.id,
        isPublic: true,
        usageCount: 1,
      });
      console.log(`[SFX] Added to library: "${prompt}" → ${result.audioUrl}`);
    }

    res.json({
      ...result,
      creditsRemaining: Math.max(0, (auth.user.creditsRemaining ?? 0) - result.creditsUsed),
    });
  } catch (e: any) {
    console.error('SFX generation error:', e);
    res.status(500).json({ error: e.message || 'SFX generation failed' });
  }
});

// ========== TEMP: Admin data recovery endpoint ==========
app.get('/api/admin/recover-scenes', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'] as string;
    const expectedSecret = process.env.OPENAI_API_KEY?.slice(-8);
    if (!secret || secret !== expectedSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const query = req.query.q as string || '';
    // Search projects and chapters matching query
    const allProjects = await db.select().from(projects);
    const matchedProjects = query
      ? allProjects.filter(p => p.title.toLowerCase().includes(query.toLowerCase()))
      : allProjects;
    const result: any[] = [];
    for (const proj of matchedProjects) {
      const chaptersData = await db.select().from(chapters).where(eq(chapters.projectId, proj.id));
      result.push({
        project: proj,
        chapters: chaptersData.map(c => ({
          id: c.id,
          title: c.title,
          number: c.number,
          status: c.status,
          scenesCount: ((c.scenes as any[]) || []).length,
          scenes: c.scenes,
          fullProse: c.prose,
        })),
      });
    }
    res.json({ count: result.length, projects: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Admin Dashboard ==========
app.get('/api/admin/overview', getOverview);
app.get('/api/admin/users', getUsers);
app.get('/api/admin/users/:userId', getUserDetail);
app.get('/api/admin/activity', getActivity);
app.get('/api/admin/stats/daily', getDailyStats);

// ========== Serve generated images ==========
const uploadsPath = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// ========== Serve static in production ==========
// ========== Shareable Audio ==========
app.get('/api/share/audio/:chapterId', async (req, res) => {
  try {
    const { chapterId } = req.params;
    const [audioRecord] = await db.select().from(audioGenerations)
      .where(and(eq(audioGenerations.chapterId, chapterId), eq(audioGenerations.isActive, true)))
      .orderBy(desc(audioGenerations.createdAt))
      .limit(1);
    if (!audioRecord) return res.status(404).json({ error: 'Audio not found' });

    const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId));
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

    const [project] = await db.select().from(projects).where(eq(projects.id, chapter.projectId));

    res.json({
      audioUrl: audioRecord.audioUrl,
      duration: audioRecord.durationSeconds,
      chapterTitle: chapter.title,
      chapterNumber: chapter.number,
      projectTitle: project?.title || 'Untitled',
      coverUrl: null, // Cover is client-generated, not stored
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to load shared audio' });
  }
});

const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (_req, res) => {
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
