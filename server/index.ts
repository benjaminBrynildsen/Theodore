import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db, pool } from './db.js';
import { projects, chapters, canonEntries, users, creditTransactions, audioGenerations, sfxLibrary, supportRequests, guestEvents, ttsJobs as ttsJobsTable } from './schema.js';
import crypto from 'crypto';
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
import { generateImage, generateImageOpenAI, generateImageGrok, buildCharacterPortraitPrompt, buildLocationIllustrationPrompt, buildSceneIllustrationPrompt, buildBookCoverPrompt, buildChildrensPagePrompt, buildChildrensHeroPrompt } from './image-gen.js';
import { generateChapterAudio, generateVoicePreview, ELEVENLABS_VOICES, OPENAI_VOICES, FISH_AUDIO_VOICES, getVoicesWithPreviews, getFishVoicesWithPreviews, estimateTTSCredits } from './tts.js';
import { getOverview, getUsers, getUserDetail, getActivity, getDailyStats, deleteUser, adjustUserCredits, clearChapterScenes, requireAdmin } from './admin.js';
import multer from 'multer';
import { pageViewMiddleware, getTrafficStats } from './pageviews.js';
import type { ElevenLabsVoice } from './tts.js';
// Legacy alias
type OpenAIVoice = ElevenLabsVoice;
import { getPaidTierConfig, getStripeClient, getStripePriceIdForTier, isPaidPlanTier, listPaidTierConfigs, FREE_TIER_CREDITS, FREE_TIER_NAME, ttsCreditCost, MUSIC_CREDITS_PER_TRACK, SFX_CREDITS_PER_GEN, IMAGE_CREDITS_PER_GEN } from './billing.js';
import { trackRegistration, trackSubscription, trackCheckoutInitiated } from './meta-capi.js';
import { receiveJourneyEvents, receiveBeacon, getJourneys, getJourneyDetail, getUserJourneys } from './journey.js';
import { ensureGuestSessionId, upsertGuestBackup, estimatePayloadBytes, MAX_PAYLOAD_BYTES, hashIp, claimGuestBackupForUser } from './guest-session.js';
import { attachActiveCharacterRoutes } from './active-character.js';
import { parseBookText } from './book-parser.js';

// Keep the process alive when a rogue async error escapes a handler. Without
// these, a single failed fetch or bad JSON body crashes the whole server and
// every user gets a 502 until Render restarts it.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

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

// Concurrent-generation locks. Stored as Maps with start timestamps so a
// stuck request (model hang, network failure, missed finally cleanup) can't
// permanently block a user. Entries older than GENERATION_LOCK_TTL_MS are
// considered stale and replaced.
const GENERATION_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const activeGenerationUsers = new Map<string, number>();
const activeGuestIps = new Map<string, number>();

/** True if the user already has a fresh (non-stale) generation in flight. */
function hasFreshLock(map: Map<string, number>, key: string): boolean {
  const startedAt = map.get(key);
  if (startedAt == null) return false;
  if (Date.now() - startedAt > GENERATION_LOCK_TTL_MS) {
    map.delete(key);
    return false;
  }
  return true;
}

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
    coverUrl: asOptionalString(body.coverUrl) || null,
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
  if ('coverUrl' in body) updates.coverUrl = body.coverUrl === null ? null : asOptionalString(body.coverUrl);
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
  // Invalidate cached scenes when prose is edited without an accompanying scenes update.
  // Prevents audio regeneration from using stale per-scene text after chapter edits.
  if ('prose' in body && !('scenes' in body)) updates.scenes = [];
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
    const reason = String(req.body?.reason || '');
    const tierConfig = getPaidTierConfig(tier);
    if (!tierConfig) return res.status(400).json({ error: 'Invalid tier. Use writer, author, studio, or publisher.' });

    // 7-day free trial when the upgrade is triggered by the audio cap. Card
    // is required up front (payment_method_collection defaults to 'if_required'
    // in older APIs; we set it explicitly to 'always' to be safe across
    // versions). Other upgrade paths keep the original no-trial flow.
    const isAudioCapTrial = reason === 'audio_cap';

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
      payment_method_collection: 'always',
      subscription_data: {
        metadata: {
          userId: auth.user.id,
          tier: tierConfig.tier,
          credits: String(tierConfig.credits),
          ...(isAudioCapTrial ? { trial_source: 'audio_cap' } : {}),
        },
        ...(isAudioCapTrial ? { trial_period_days: 7 } : {}),
      },
    });

    trackCheckoutInitiated(req as any, auth.user.email);
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
        // Meta CAPI: track subscription server-side
        const tierConfig = getPaidTierConfig(nextPlan);
        const priceDollars = tierConfig ? tierConfig.priceCents / 100 : 0;
        trackSubscription(req as any, user.email, priceDollars);
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
    trackRegistration(req as any);
    let guestClaim: Awaited<ReturnType<typeof claimGuestBackupForUser>> | null = null;
    try {
      guestClaim = await claimGuestBackupForUser(req, res, user.id);
      if (guestClaim.claimed) {
        console.log('[guest-claim] register user=%s projects=%d chapters=%d canon=%d errors=%d', user.id, guestClaim.projects, guestClaim.chapters, guestClaim.canon, guestClaim.errors);
      }
    } catch (claimErr) {
      console.error('[guest-claim] failed during register', claimErr);
    }
    res.json({ user: toSafeUser(user), token, guestClaim });
  } catch (e: any) {
    respondInternalError(res, 'auth.register', e);
  }
});

// Google Sign-In — verify ID token, find/create user, create session
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body; // Google ID token from client
    if (!credential) return res.status(400).json({ error: 'Missing Google credential.' });

    const allowedAudiences = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
    ].filter((v): v is string => !!v);
    if (allowedAudiences.length === 0) return res.status(500).json({ error: 'Google auth not configured.' });

    // Verify the ID token with Google
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!verifyRes.ok) return res.status(401).json({ error: 'Invalid Google token.' });
    const payload = await verifyRes.json() as any;

    // Verify audience matches one of our configured client IDs (web/iOS/Android)
    if (!allowedAudiences.includes(payload.aud)) return res.status(401).json({ error: 'Token audience mismatch.' });

    const email = normalizeEmail(payload.email || '');
    if (!email) return res.status(400).json({ error: 'No email in Google token.' });

    const name = payload.name || payload.given_name || null;
    const avatarUrl = payload.picture || null;
    const now = new Date();

    // Find or create user
    let user = await getUserByEmail(email);
    if (!user) {
      // New user — create account
      const [inserted] = await db.insert(users).values({
        id: `user-${randomUUID()}`,
        email,
        passwordHash: null, // No password for Google users
        emailVerifiedAt: now, // Google verifies email
        name,
        avatarUrl,
        plan: 'free',
        creditsRemaining: FREE_TIER_CREDITS,
        creditsTotal: FREE_TIER_CREDITS,
      }).returning();
      user = inserted;
      trackRegistration(req as any);
    } else {
      // Existing user — update name/avatar if not set
      const updates: any = { updatedAt: now };
      if (!user.name && name) updates.name = name;
      if (!user.avatarUrl && avatarUrl) updates.avatarUrl = avatarUrl;
      if (!user.emailVerifiedAt) updates.emailVerifiedAt = now;
      const [updated] = await db.update(users).set(updates).where(eq(users.id, user.id)).returning();
      user = updated;
    }

    const token = await createSession(user.id, req, res);
    let guestClaim: Awaited<ReturnType<typeof claimGuestBackupForUser>> | null = null;
    try {
      guestClaim = await claimGuestBackupForUser(req, res, user.id);
      if (guestClaim.claimed) {
        console.log('[guest-claim] google user=%s projects=%d chapters=%d canon=%d errors=%d', user.id, guestClaim.projects, guestClaim.chapters, guestClaim.canon, guestClaim.errors);
      }
    } catch (claimErr) {
      console.error('[guest-claim] failed during google auth', claimErr);
    }
    res.json({ user: toSafeUser(user), token, guestClaim });
  } catch (e: any) {
    respondInternalError(res, 'auth.google', e);
  }
});

// Mobile bridge — Google redirects here with id_token in URL fragment (implicit flow).
// Page JS extracts the token and deep-links into the native app via the theodore:// scheme.
app.get('/api/auth/google/mobile/bridge', (_req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html><head><meta charset="utf-8"><title>Signing you in…</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#0f0f0f;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}</style>
</head><body><div><p>Returning to Theodore…</p><p id="fallback" style="opacity:.6;font-size:13px;display:none">If nothing happens, <a id="deep" style="color:#9cf">tap here</a>.</p></div>
<script>
(function(){
  var hash = window.location.hash || '';
  var params = new URLSearchParams(hash.replace(/^#/, ''));
  var idToken = params.get('id_token');
  var state = params.get('state') || '';
  var error = params.get('error');
  var target = 'theodore://auth/google?' + (error ? ('error=' + encodeURIComponent(error)) : ('id_token=' + encodeURIComponent(idToken || ''))) + (state ? ('&state=' + encodeURIComponent(state)) : '');
  document.getElementById('deep').href = target;
  document.getElementById('fallback').style.display = 'block';
  window.location.replace(target);
})();
</script></body></html>`);
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
    // Piggyback chapter counts + word counts so the project cards can show
    // "N chapters · M pages" without N fan-out requests. One aggregate query.
    let statsByProject: Record<string, { chapterCount: number; wordCount: number }> = {};
    if (result.length) {
      const stats = await db.execute<{ project_id: string; chapter_count: number; word_count: number }>(sql`
        SELECT
          project_id,
          COUNT(*)::int AS chapter_count,
          COALESCE(SUM(
            CASE
              WHEN length(trim(prose)) = 0 THEN 0
              ELSE array_length(regexp_split_to_array(trim(prose), '[[:space:]]+'), 1)
            END
          ), 0)::int AS word_count
        FROM chapters
        WHERE project_id IN (${sql.join(result.map((p: any) => sql`${p.id}`), sql`, `)})
        GROUP BY project_id
      `);
      const rows = (stats as any).rows || stats;
      for (const r of rows as Array<{ project_id: string; chapter_count: number; word_count: number }>) {
        statsByProject[r.project_id] = {
          chapterCount: Number(r.chapter_count) || 0,
          wordCount: Number(r.word_count) || 0,
        };
      }
    }
    const enriched = result.map((p: any) => ({
      ...p,
      chapterCount: statsByProject[p.id]?.chapterCount || 0,
      wordCount: statsByProject[p.id]?.wordCount || 0,
    }));
    res.json(enriched);
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

// ========== Active Character (Open Beats, STT, Grok reaction stream) ==========
attachActiveCharacterRoutes(app, requireAuth);

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
// activeGuestIps is declared at the top of the file as a TTL Map.

const GUEST_SALT = process.env.PAGEVIEW_SALT || process.env.SESSION_SECRET || 'theodore-guest-salt';
function hashGuestIp(ip: string): string {
  return crypto.createHash('sha256').update(ip + GUEST_SALT).digest('hex').slice(0, 32);
}
function extractCountry(req: express.Request): string | null {
  // CDN headers: Cloudflare (cf-ipcountry), Vercel (x-vercel-ip-country),
  // Render (x-country), AWS CloudFront (cloudfront-viewer-country)
  const raw = req.headers['cf-ipcountry']
    || req.headers['x-vercel-ip-country']
    || req.headers['x-country']
    || req.headers['cloudfront-viewer-country']
    || null;
  return raw ? String(raw).slice(0, 4).toUpperCase() : null;
}

async function logGuestEvent(req: express.Request, opts: {
  ip: string; event: string; action?: string; model?: string; metadata?: string; inputTokens?: number; outputTokens?: number;
}) {
  try {
    await db.insert(guestEvents).values({
      ipHash: hashGuestIp(opts.ip),
      event: opts.event,
      action: opts.action ?? null,
      model: opts.model ?? null,
      country: extractCountry(req),
      metadata: opts.metadata ?? null,
      inputTokens: opts.inputTokens ?? 0,
      outputTokens: opts.outputTokens ?? 0,
    });
  } catch (err) {
    console.warn('[guest-events] log failed:', (err as Error)?.message);
  }
}

// Lightweight guest event logger — lets the client record events that don't
// go through the generate endpoints (e.g. project creation with a title).
app.post('/api/guest/log', async (req, res) => {
  try {
    const { event, action, metadata } = req.body;
    if (!event) return res.status(400).json({ error: 'Missing event' });
    const ip = requestClientIp(req);
    if (!takeRateLimitToken(res, 'guest-log', ip, 30, 60 * 60 * 1000)) return;
    void logGuestEvent(req, { ip, event, action, metadata });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Log failed' });
  }
});

// Back up an unauthenticated visitor's local project state so it survives
// signup even if their browser's localStorage doesn't (different device,
// incognito, cleared cache). Cookie-keyed, heavily rate-limited + size-capped
// to defend against spam since the endpoint is unauth.
app.post('/api/guest/backup', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (auth?.user) {
      // Logged-in users should not be using this path — their data is already
      // persisted via the normal /projects endpoints. Silently no-op rather
      // than 401 so we don't noise up the client during the auth transition.
      return res.json({ ok: true, skipped: 'authed' });
    }

    const ip = requestClientIp(req);
    if (!takeRateLimitToken(res, 'guest-backup', ip, 60, 60 * 60 * 1000)) return;

    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const sizeBytes = estimatePayloadBytes(body);
    if (sizeBytes > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: 'Backup too large', maxBytes: MAX_PAYLOAD_BYTES });
    }
    if (sizeBytes === 0) {
      return res.status(400).json({ error: 'Empty payload' });
    }

    const guestSessionId = ensureGuestSessionId(req, res);
    await upsertGuestBackup(guestSessionId, body, {
      ipHash: hashIp(ip),
      userAgent: req.get('user-agent') || null,
      sizeBytes,
    });
    res.json({ ok: true, sizeBytes });
  } catch (e: any) {
    respondInternalError(res, 'guest.backup', e);
  }
});

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

    // No per-IP concurrency lock for guests — rate limiting (20/hr) is
    // sufficient, and the lock was causing cascading 429s when the chat
    // derive + quick outline + scaffold all competed for the same lock.
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

      void logGuestEvent(req, {
        ip, event: 'generate', action, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
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
    // Chat (plan-project) is free — don't check or deduct credits.
    // It costs us ~$0.03 for 20 messages and drives engagement.
    const isFreeChat = action === 'plan-project';
    if (!isFreeChat && user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }
    // Skip lock for lightweight chat actions (plan-project = Imagine chat)
    const skipLock = ['plan-project'].includes(action);
    if (!skipLock && hasFreshLock(activeGenerationUsers, user.id)) {
      return res.status(429).json({ error: 'Generation already in progress for this account.' });
    }

    if (!skipLock) activeGenerationUsers.set(user.id, Date.now());
    if (!skipLock) res.on('close', () => { activeGenerationUsers.delete(user.id); });
    try {
      const result = await generate({
        prompt, systemPrompt, model, maxTokens, temperature,
        userId: user.id, projectId, chapterId, action,
      });

      const effectiveCredits = isFreeChat ? 0 : result.creditsUsed;

      await db.insert(creditTransactions).values({
        userId: user.id,
        action: action || 'generate',
        creditsUsed: effectiveCredits,
        model: result.model,
        chapterId,
        metadata: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          projectId,
        },
      });

      if (effectiveCredits > 0) {
        await db.update(users).set({
          creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${effectiveCredits})`,
          updatedAt: new Date(),
        }).where(eq(users.id, user.id));
      }

      const updatedCredits = isFreeChat ? user.creditsRemaining : Math.max(0, (user.creditsRemaining ?? 0) - effectiveCredits);
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
      if (!skipLock) activeGenerationUsers.delete(user.id);
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

      void logGuestEvent(req, {
        ip, event: 'generate-stream', action,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      });

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
    const isFreeChatStream = action === 'plan-project';
    if (!isFreeChatStream && user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }
    const skipLockStream = ['plan-project'].includes(action);
    if (!skipLockStream && hasFreshLock(activeGenerationUsers, user.id)) {
      return res.status(429).json({ error: 'Generation already in progress for this account.' });
    }

    if (!skipLockStream) activeGenerationUsers.set(user.id, Date.now());
    if (!skipLockStream) res.on('close', () => { activeGenerationUsers.delete(user.id); });
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

      const effectiveCreditsStream = isFreeChatStream ? 0 : result.creditsUsed;

      await db.insert(creditTransactions).values({
        userId: user.id,
        action: action || 'generate-stream',
        creditsUsed: effectiveCreditsStream,
        model: result.model,
        chapterId,
        metadata: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          projectId,
        },
      });

      if (effectiveCreditsStream > 0) {
        await db.update(users).set({
          creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${effectiveCreditsStream})`,
          updatedAt: new Date(),
        }).where(eq(users.id, user.id));
      }

      const updatedCreditsStream = isFreeChatStream ? user.creditsRemaining : Math.max(0, (user.creditsRemaining ?? 0) - effectiveCreditsStream);
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
      if (!skipLockStream) activeGenerationUsers.delete(user.id);
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
    const { prompt, aspectRatio, style, projectId, target, targetId, provider } = req.body;
    if (!prompt && !target) return res.status(400).json({ error: 'Missing prompt or target' });

    // Guests can generate covers (Gemini is free). Other image types require auth.
    const isGuestCover = !auth && target === 'cover';
    if (!auth && !isGuestCover) return res.status(401).json({ error: 'Not signed in' });

    if (isGuestCover) {
      const ip = requestClientIp(req);
      if (!takeRateLimitToken(res, 'image.guest', ip, 5, 60 * 60 * 1000)) return;
    }

    let user: any = null;
    if (auth) {
      const [u] = await db.select().from(users).where(eq(users.id, auth.user.id));
      user = u;
      if (!user) return res.status(404).json({ error: 'User not found' });
    }

    // Children's-book page images default to Grok for cross-page style
    // consistency (xAI's image model keeps character + art style steadier
    // across related prompts than gpt-image-1). Explicit provider='openai'
    // still routes to OpenAI. Both are gated to the publisher plan.
    const wantsOpenAI = provider === 'openai';
    const wantsGrok = provider === 'grok' || (target === 'page' && !wantsOpenAI);
    const usingBetaImageProvider = wantsOpenAI || wantsGrok;
    if (usingBetaImageProvider && user?.plan !== 'publisher') {
      return res.status(403).json({
        error: 'Image generation is currently available on the Publisher plan only.',
      });
    }

    if (user && user.creditsRemaining < IMAGE_CREDITS_PER_GEN) {
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
    } else if (target === 'cover') {
      // Try DB first (authenticated users). Fall back to client-provided
      // prompt for guests (whose projects only exist in localStorage).
      const [project] = projectId
        ? await db.select().from(projects).where(eq(projects.id, projectId))
        : [];
      const clientPrompt = typeof prompt === 'string' ? prompt : '';
      if (project) {
        const nc = (project.narrativeControls as any) || {};
        const coverChapters = await db.select({ premise: chapters.premise })
          .from(chapters).where(eq(chapters.projectId, projectId!))
          .orderBy(chapters.number).limit(3);
        const chapterHints = coverChapters
          .map(c => (c.premise as any)?.purpose).filter(Boolean).join('; ').slice(0, 300);
        finalPrompt = buildBookCoverPrompt({
          title: project.title,
          type: project.type,
          subtype: project.subtype || undefined,
          genreEmphasis: nc.genreEmphasis,
          toneMood: nc.toneMood,
          coverStyle: style || 'illustrated',
          chapterHints: clientPrompt || chapterHints,
        });
      } else {
        // Guest fallback: build prompt from whatever the client sent
        finalPrompt = buildBookCoverPrompt({
          title: 'Novel',
          type: 'book',
          coverStyle: style || 'illustrated',
          chapterHints: clientPrompt,
        });
      }
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
    } else if (target === 'childrens-hero' && projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const cbs = (project.childrensBookSettings as any) || {};
      finalPrompt = buildChildrensHeroPrompt({
        bookTitle: project.title,
        ageRange: cbs.ageRange,
        illustrationStyle: cbs.illustrationStyle,
        styleGuide: cbs.styleGuide || undefined,
        characterVisuals: cbs.characterVisuals || undefined,
      });
    }

    if (!finalPrompt) return res.status(400).json({ error: 'Could not build image prompt' });

    // Resolve the project's hero shot (if any) so page generations can
    // feed it back into Grok as a reference image for consistent
    // character rendering. We skip the reference when generating the
    // hero itself or the cover.
    let referenceImagePath: string | undefined;
    if (wantsGrok && target === 'page' && projectId) {
      try {
        const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
        const heroUrl = (proj?.childrensBookSettings as any)?.characterHeroImageUrl;
        if (typeof heroUrl === 'string' && heroUrl.startsWith('/uploads/')) {
          const rel = heroUrl.replace(/^\//, '');
          const abs = path.join(process.cwd(), rel);
          if (fs.existsSync(abs)) referenceImagePath = abs;
        }
      } catch { /* non-fatal */ }
    }

    const generator = wantsGrok
      ? generateImageGrok
      : wantsOpenAI
        ? generateImageOpenAI
        : generateImage;
    const result = await generator({
      prompt: finalPrompt,
      aspectRatio: aspectRatio || '1:1',
      style: style || 'concept-art',
      userId: auth?.user?.id || 'guest',
      projectId,
      referenceImagePath,
    });

    // Deduct credits (skip for guests)
    if (auth?.user) {
      await db.update(users).set({
        creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
      }).where(eq(users.id, auth.user.id));

      await db.insert(creditTransactions).values({
        userId: auth.user.id,
        action: 'generate-image',
        creditsUsed: result.creditsUsed,
        model: result.model,
        chapterId: null,
        metadata: { projectId, prompt: result.prompt, imageUrl: result.imageUrl },
      });
    }

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

    // If target is the children's-book hero shot, save the URL (and the
    // prompt we used, for auditing) on the project so subsequent page
    // generations can reference it as an image input.
    if (target === 'childrens-hero' && projectId) {
      const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (proj) {
        const nextCbs = {
          ...((proj.childrensBookSettings as any) || {}),
          characterHeroImageUrl: result.imageUrl,
          characterHeroPrompt: result.prompt,
        };
        await db.update(projects).set({
          childrensBookSettings: nextCbs,
          updatedAt: new Date(),
        }).where(eq(projects.id, projectId));
      }
    }

    res.json({
      imageUrl: result.imageUrl,
      prompt: result.prompt,
      creditsUsed: auth?.user ? result.creditsUsed : 0,
      creditsRemaining: auth?.user ? Math.max(0, (auth.user.creditsRemaining ?? 0) - result.creditsUsed) : null,
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
    const [voices, fishVoices] = await Promise.all([
      getVoicesWithPreviews(),
      getFishVoicesWithPreviews(),
    ]);
    res.json({
      voices,
      fishVoices,
      providers: {
        openai: true,
        fish: !!process.env.FISH_AUDIO_API_KEY,
        elevenlabs: !!process.env.ELEVENLABS_API_KEY,
      },
    });
  } catch {
    res.json({
      voices: ELEVENLABS_VOICES,
      fishVoices: FISH_AUDIO_VOICES,
      providers: { openai: true, fish: !!process.env.FISH_AUDIO_API_KEY, elevenlabs: !!process.env.ELEVENLABS_API_KEY },
    });
  }
});

// ========== Async TTS Job System ==========
// Jobs are persisted to the tts_jobs DB table so they survive server restarts.
// Render deploys used to interrupt long generations — in-memory job state was
// lost and the client's next poll got a 404. Now each job's full spec is in
// the DB; on startup we pick up any unfinished job and re-run it.

const STALE_HEARTBEAT_SECONDS = 30;
const RESUME_WINDOW_MINUTES = 60;

interface TTSJobSpec {
  chapterId: string;
  prose: string;
  narratorVoice?: string;
  characterVoices?: Record<string, string>;
  characterDescriptions?: Record<string, string>;
  narratorStyle?: string;
  model?: string;
  provider?: string;
  speed?: number;
  multiVoice?: boolean;
  sceneSFX?: any[];
  chapterNumber?: number;
  chapterTitle?: string;
  isFreeAudioSample?: boolean;
}

// Lightweight in-memory progress tracker so frequent /job/:id polls don't hit
// the DB on every tick. Writes still go to DB; this is just a read cache.
const liveProgress = new Map<string, number>();
// In-memory set of jobs this instance is currently generating, so graceful
// shutdown can mark them for fast pick-up by the next instance.
const activeJobIds = new Set<string>();

async function createPersistedJob(job: { id: string; spec: TTSJobSpec; userId?: string | null; isGuest?: boolean }) {
  await db.insert(ttsJobsTable).values({
    id: job.id,
    status: 'pending',
    progress: 0,
    spec: job.spec,
    userId: job.userId || null,
    isGuest: !!job.isGuest,
  });
}

async function updatePersistedJob(id: string, patch: Partial<{ status: 'pending' | 'processing' | 'complete' | 'error'; progress: number; result: any; error: string | null; attempts: number }>) {
  const values: Record<string, any> = { updatedAt: new Date() };
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.progress !== undefined) values.progress = patch.progress;
  if (patch.result !== undefined) values.result = patch.result;
  if (patch.error !== undefined) values.error = patch.error;
  if (patch.attempts !== undefined) values.attempts = patch.attempts;
  await db.update(ttsJobsTable).set(values).where(eq(ttsJobsTable.id, id));
}

async function getPersistedJob(id: string) {
  const [row] = await db.select().from(ttsJobsTable).where(eq(ttsJobsTable.id, id));
  return row;
}

// Try to atomically claim a stalled job. Returns true if this instance now
// owns the job (so we should run it), false if another instance already did.
async function claimPersistedJob(id: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_HEARTBEAT_SECONDS * 1000);
  const claimed = await db
    .update(ttsJobsTable)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(
      and(
        eq(ttsJobsTable.id, id),
        or(eq(ttsJobsTable.status, 'pending'), eq(ttsJobsTable.status, 'processing')),
        sql`${ttsJobsTable.updatedAt} < ${cutoff}`,
      ),
    )
    .returning({ id: ttsJobsTable.id });
  return claimed.length > 0;
}

// Execute a TTS job: runs generation, saves audio, deducts credits, updates
// DB status. Used by both the initial submit path and the resume-on-startup
// sweep. Idempotent-ish: if it completes, it writes 'complete'; if it throws,
// it writes 'error'. Credit deduction only happens on successful completion.
async function runTTSJob(jobId: string) {
  const row = await getPersistedJob(jobId);
  if (!row) return;
  const spec = row.spec as unknown as TTSJobSpec;
  activeJobIds.add(jobId);

  const heartbeat = setInterval(() => {
    void db.update(ttsJobsTable).set({ updatedAt: new Date() }).where(eq(ttsJobsTable.id, jobId)).catch(() => {});
  }, 10_000);

  try {
    const voiceMap = {
      narrator: (spec.narratorVoice || 'XrExE9yKIg1WjnnlVkGX') as ElevenLabsVoice,
      characters: (spec.characterVoices || {}) as Record<string, ElevenLabsVoice>,
    };
    const knownCharacters = Object.keys(spec.characterVoices || {});
    console.log(`[TTS] Running job ${jobId} (attempt ${row.attempts + 1}) for ${spec.chapterId}`);
    await updatePersistedJob(jobId, { status: 'processing', attempts: row.attempts + 1, error: null });

    const result = await generateChapterAudio({
      chapterId: spec.chapterId,
      prose: spec.prose,
      voiceMap,
      provider: spec.provider || 'elevenlabs',
      model: spec.model || 'eleven_multilingual_v2',
      speed: spec.speed || 1.0,
      multiVoice: spec.multiVoice ?? false,
      knownCharacters,
      characterDescriptions: spec.characterDescriptions || {},
      narratorStyle: spec.narratorStyle || undefined,
      sceneSFX: spec.sceneSFX || [],
      chapterNumber: spec.chapterNumber || undefined,
      chapterTitle: spec.chapterTitle || undefined,
      onProgress: (pct) => {
        liveProgress.set(jobId, pct);
        void db.update(ttsJobsTable).set({ progress: pct, updatedAt: new Date() }).where(eq(ttsJobsTable.id, jobId)).catch(() => {});
      },
    });

    const isFreeSample = !!spec.isFreeAudioSample;
    const actualCreditsUsed = isFreeSample ? 0 : result.creditsUsed;
    let creditsRemaining: number | null = null;

    if (row.userId && !row.isGuest) {
      if (!isFreeSample) {
        await db.update(users).set({
          creditsRemaining: sql`GREATEST(0, ${users.creditsRemaining} - ${result.creditsUsed})`,
        }).where(eq(users.id, row.userId));
      }
      await db.insert(creditTransactions).values({
        userId: row.userId,
        action: 'generate-audio',
        creditsUsed: actualCreditsUsed,
        model: spec.model || 'eleven_multilingual_v2',
        chapterId: spec.chapterId,
        metadata: {
          narratorVoice: spec.narratorVoice, segments: result.segments, durationEstimate: result.durationEstimate,
          charCount: spec.prose.length, freeAudioSample: isFreeSample || undefined,
        },
      });

      // Save audio generation record for persistence
      const isScene = spec.chapterId.startsWith('scene-');
      const realChapterId = isScene ? undefined : spec.chapterId;
      const sceneId = isScene ? spec.chapterId.replace('scene-', '') : undefined;
      let projectId = '';
      if (realChapterId) {
        const [ch] = await db.select({ projectId: chapters.projectId }).from(chapters).where(eq(chapters.id, realChapterId));
        projectId = ch?.projectId || '';
      } else if (sceneId) {
        const userChapters = await db.select().from(chapters);
        for (const ch of userChapters) {
          const scenes = (ch.scenes || []) as any[];
          if (scenes.some((s: any) => s.id === sceneId)) {
            projectId = ch.projectId;
            break;
          }
        }
      }
      if (projectId) {
        await db.update(audioGenerations).set({ isActive: false }).where(eq(audioGenerations.chapterId, spec.chapterId));
        const existing = await db.select({ version: audioGenerations.version })
          .from(audioGenerations)
          .where(eq(audioGenerations.chapterId, spec.chapterId))
          .orderBy(audioGenerations.version);
        const nextVersion = existing.length > 0 ? Math.max(...existing.map(e => e.version)) + 1 : 1;
        await db.insert(audioGenerations).values({
          userId: row.userId,
          projectId,
          chapterId: spec.chapterId,
          sceneId: sceneId || null,
          version: nextVersion,
          audioUrl: result.audioUrl,
          durationSeconds: result.durationEstimate,
          segments: result.segments,
          voiceConfig: { provider: spec.provider || 'elevenlabs', narratorVoice: spec.narratorVoice, model: spec.model, speed: spec.speed, multiVoice: spec.multiVoice },
          sfxConfig: spec.sceneSFX || [],
          creditsUsed: result.creditsUsed,
          isActive: true,
        });
      }

      const [userRow] = await db.select({ credits: users.creditsRemaining }).from(users).where(eq(users.id, row.userId));
      creditsRemaining = userRow?.credits ?? null;
    }

    await updatePersistedJob(jobId, {
      status: 'complete',
      progress: 100,
      result: {
        audioUrl: result.audioUrl,
        durationEstimate: result.durationEstimate,
        segments: result.segments,
        creditsUsed: actualCreditsUsed,
        creditsRemaining,
      },
      error: null,
    });
    console.log(`[TTS] Job ${jobId}: Complete → ${result.audioUrl}`);
  } catch (e: any) {
    console.error(`[TTS] Job ${jobId}: Failed —`, e.message);
    try { fs.appendFileSync(path.join(process.cwd(), 'uploads', 'audio', 'error.log'), `[${new Date().toISOString()}] Job ${jobId} error: ${e.message}\n${e.stack || ''}\n`); } catch {}
    await updatePersistedJob(jobId, { status: 'error', error: e.message || 'Audio generation failed' });
  } finally {
    clearInterval(heartbeat);
    liveProgress.delete(jobId);
    activeJobIds.delete(jobId);
  }
}

// On startup, pick up any job that was interrupted by a previous instance
// and hasn't been heartbeating for STALE_HEARTBEAT_SECONDS. Runs in the
// background so it doesn't block /api/health.
async function resumeInterruptedJobs() {
  try {
    const cutoffHeartbeat = new Date(Date.now() - STALE_HEARTBEAT_SECONDS * 1000);
    const cutoffAge = new Date(Date.now() - RESUME_WINDOW_MINUTES * 60 * 1000);
    const rows = await db.select().from(ttsJobsTable).where(
      and(
        or(eq(ttsJobsTable.status, 'pending'), eq(ttsJobsTable.status, 'processing')),
        sql`${ttsJobsTable.updatedAt} < ${cutoffHeartbeat}`,
        sql`${ttsJobsTable.createdAt} > ${cutoffAge}`,
      ),
    );
    if (rows.length === 0) return;
    console.log(`[TTS] Resuming ${rows.length} interrupted job(s)`);
    for (const row of rows) {
      const claimed = await claimPersistedJob(row.id);
      if (!claimed) continue; // another instance beat us to it
      void runTTSJob(row.id).catch((err) => console.error(`[TTS] Resume of ${row.id} failed:`, err));
    }
  } catch (e: any) {
    console.error('[TTS] resumeInterruptedJobs failed:', e?.message);
  }
}

// Periodic sweep catches stalled jobs from peers whose SIGTERM we didn't hear
// (e.g. SIGKILL after the drain timeout).
setInterval(() => { void resumeInterruptedJobs(); }, 60_000);

app.post('/api/tts/generate', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth) return res.status(401).json({ error: 'Not authenticated' });

    let { narratorVoice, provider } = req.body;
    const { chapterId, prose, characterVoices, characterDescriptions, narratorStyle, model, speed, multiVoice, sceneSFX, chapterNumber, chapterTitle } = req.body;
    if (!chapterId || !prose) return res.status(400).json({ error: 'chapterId and prose are required' });

    // Credit check
    const [user] = await db.select().from(users).where(eq(users.id, auth.user.id));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Free users always get Grok/Leo — it's the cheapest provider Theodore
    // supports and is the default preview voice for the 60-second free cap.
    // Whatever the client asked for (ElevenLabs premium, OpenAI budget, etc.)
    // is ignored until they upgrade. This keeps ElevenLabs spend to paying
    // users only.
    const isFreeUser = !user.planTier || user.planTier === 'free';
    if (isFreeUser) {
      provider = 'grok';
      narratorVoice = 'grok:leo';
    }

    // First audio gen for a free user is on the house — the playback-side 60s
    // cap is the real economic gate. Subsequent generations charge credits
    // (Grok is cheap, so this rarely matters).
    let isFreeAudioSample = false;
    if (isFreeUser) {
      const existingAudioTxns = await db.select({ id: creditTransactions.id })
        .from(creditTransactions)
        .where(and(eq(creditTransactions.userId, auth.user.id), eq(creditTransactions.action, 'generate-audio')))
        .limit(1);
      if (existingAudioTxns.length === 0) {
        isFreeAudioSample = true;
      }
    }

    if (!isFreeAudioSample) {
      // Provider-aware estimate — the flat 100-credit floor was calibrated for
      // ElevenLabs and blocked users on cheap providers (Grok: 10 min, OpenAI: 20 min)
      // from ever generating. Mirrors client-side estimateTTSCredits so the
      // confirm modal and server gate agree.
      const providerKey = (provider || 'elevenlabs') as string;
      const estimatedCost = estimateTTSCredits(String(prose).length, providerKey);
      if (user.creditsRemaining < estimatedCost) {
        return res.status(402).json({
          error: 'Insufficient credits for audio generation',
          creditsRemaining: user.creditsRemaining,
          creditsNeeded: estimatedCost,
          needsUpgrade: true,
        });
      }
    }

    const jobId = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const spec: TTSJobSpec = {
      chapterId, prose, narratorVoice, characterVoices, characterDescriptions, narratorStyle,
      model, provider, speed, multiVoice, sceneSFX, chapterNumber, chapterTitle,
      isFreeAudioSample,
    };
    await createPersistedJob({ id: jobId, spec, userId: auth.user.id, isGuest: false });

    res.json({ jobId, status: 'pending' });

    void runTTSJob(jobId).catch((err) => console.error(`[TTS] runTTSJob(${jobId}) crashed:`, err));
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
    const { chapterId, prose, sceneSFX, chapterNumber, chapterTitle } = req.body;
    if (!chapterId || !prose) return res.status(400).json({ error: 'chapterId and prose are required' });
    if (typeof prose !== 'string' || prose.length > 20000) {
      return res.status(400).json({ error: 'Guest audio sample is limited to 20,000 characters.' });
    }

    const ip = requestClientIp(req);
    // 1 free guest TTS per IP per day. The same helper that auth/generate use.
    if (!takeRateLimitToken(res, 'tts.guest', ip, 1, 24 * 60 * 60 * 1000)) return;

    // Guests always get Grok / Leo regardless of what the client sends.
    // Mirrors the free-user branch on the authed endpoint (line 2281-2290):
    // cheapest provider, consistent default voice, no ElevenLabs spend on
    // anonymous traffic. Client selections are ignored here.
    void logGuestEvent(req, { ip, event: 'tts', action: 'generate-audio', model: 'grok-tts-1' });

    const jobId = `tts-guest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const spec: TTSJobSpec = {
      chapterId, prose,
      narratorVoice: 'grok:leo',
      model: 'grok-tts-1',
      provider: 'grok',
      speed: 1.0,
      multiVoice: false,
      sceneSFX: sceneSFX || [],
      chapterNumber, chapterTitle,
    };
    await createPersistedJob({ id: jobId, spec, isGuest: true });

    res.json({ jobId, status: 'pending' });

    console.log(`[TTS] Guest job ${jobId}: Generating for ${chapterId} from ${ip}`);
    void runTTSJob(jobId).catch((err) => console.error(`[TTS] Guest runTTSJob(${jobId}) crashed:`, err));
  } catch (e: any) {
    console.error('Guest TTS error:', e.message);
    if (!res.headersSent) respondInternalError(res, 'api', e);
  }
});

app.get('/api/tts/job/:jobId', async (req, res) => {
  const job = await getPersistedJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.status === 'complete') {
    res.json({ status: 'complete', ...((job.result as any) || {}) });
  } else if (job.status === 'error') {
    res.json({ status: 'error', error: job.error || 'Audio generation failed' });
  } else {
    // Prefer live progress from this instance if present (more up-to-date).
    const pct = liveProgress.get(req.params.jobId) ?? job.progress ?? 0;
    res.json({ status: job.status, progress: pct });
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
app.get('/api/admin/users/:userId/journeys', getUserJourneys);
app.delete('/api/admin/users/:userId', deleteUser);
app.post('/api/admin/users/:userId/credits', adjustUserCredits);
app.post('/api/admin/chapters/:chapterId/clear-scenes', clearChapterScenes);
app.get('/api/admin/activity', getActivity);
app.get('/api/admin/stats/daily', getDailyStats);
app.get('/api/admin/traffic', getTrafficStats);
app.get('/api/admin/journeys', getJourneys);
app.get('/api/admin/journeys/:sessionId', getJourneyDetail);

// Grok image reference-input diagnostic. Hits xAI's /v1/images/generations
// four times with the same project's hero shot + prompt, varying ONLY the
// image field name ('none' | 'image' | 'images' | 'image_url'). Admin can
// visually compare the four outputs to confirm which field xAI honors.
// Usage: POST /api/admin/debug/grok-image-ref-test
//   body: { projectId, prompt?: string }
app.post('/api/admin/debug/grok-image-ref-test', express.json(), async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    const { projectId, prompt } = (req.body || {}) as { projectId?: string; prompt?: string };
    if (!projectId) return res.status(400).json({ error: 'projectId required' });

    const [proj] = await db.select().from(projects).where(eq(projects.id, String(projectId)));
    if (!proj) return res.status(404).json({ error: 'Project not found' });
    const heroUrl = (proj.childrensBookSettings as any)?.characterHeroImageUrl;
    if (typeof heroUrl !== 'string' || !heroUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Project has no hero shot — generate one first.' });
    }
    const absPath = path.join(process.cwd(), heroUrl.replace(/^\//, ''));
    if (!fs.existsSync(absPath)) {
      return res.status(400).json({ error: `Hero file missing on disk: ${absPath}` });
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'XAI_API_KEY not configured' });

    const fileBytes = fs.readFileSync(absPath);
    const mime = absPath.endsWith('.jpg') || absPath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    const dataUrl = `data:${mime};base64,${fileBytes.toString('base64')}`;
    const model = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';
    const testPrompt = prompt
      || 'The same character, side profile, standing on a grassy hill at sunrise, same outfit and hair';

    const variants: Array<{ label: string; extra: Record<string, unknown> }> = [
      { label: 'none', extra: {} },
      { label: 'image', extra: { image: dataUrl } },
      { label: 'images', extra: { images: [dataUrl] } },
      { label: 'image_url', extra: { image_url: dataUrl } },
    ];

    const ensureDir = () => {
      const dir = path.join(uploadsPath, 'generated');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return dir;
    };
    const saveDir = ensureDir();

    const results = await Promise.all(variants.map(async (v) => {
      try {
        const body = { model, prompt: testPrompt, n: 1, response_format: 'b64_json', ...v.extra };
        const response = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(body),
        });
        const detail = await response.text();
        if (!response.ok) {
          return { label: v.label, ok: false, status: response.status, error: detail.slice(0, 400) };
        }
        const data = JSON.parse(detail) as { data?: Array<{ b64_json?: string; url?: string }> };
        const item = data.data?.[0];
        if (!item?.b64_json && !item?.url) {
          return { label: v.label, ok: false, status: 200, error: 'No image in response' };
        }
        let bytes: Buffer;
        if (item.b64_json) bytes = Buffer.from(item.b64_json, 'base64');
        else {
          const f = await fetch(item.url!);
          bytes = Buffer.from(await f.arrayBuffer());
        }
        const fname = `grok-ref-test-${v.label}-${randomUUID().slice(0, 6)}.png`;
        fs.writeFileSync(path.join(saveDir, fname), bytes);
        return { label: v.label, ok: true, imageUrl: `/uploads/generated/${fname}`, bytes: bytes.length };
      } catch (e: any) {
        return { label: v.label, ok: false, error: e?.message || 'request failed' };
      }
    }));

    res.json({
      model,
      promptUsed: testPrompt,
      heroUrl,
      heroBytes: fileBytes.length,
      results,
      instructions: 'Visually compare the four output images. If /uploads/generated/grok-ref-test-image-*.png matches the hero shot character but grok-ref-test-none-*.png does not, the `image` field is being honored. Same logic for `images` and `image_url`. If all four look identical and unlike the hero, xAI is ignoring all three field names.',
    });
  } catch (e: any) {
    console.error('[admin.grok-image-ref-test] unexpected error', e);
    res.status(500).json({ error: e?.message || 'debug failed' });
  }
});

// Journey tracking — public endpoints (no auth, guests need to send events)
app.post('/api/journey', express.json(), receiveJourneyEvents);
app.post('/api/beacon', express.text({ type: '*/*' }), receiveBeacon);

// ========== Serve generated images ==========
const uploadsPath = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

// Upload a composited cover image (base64 → file). Used by the client-side
// Canvas overlay that bakes the title text onto the AI-generated background.
app.post('/api/upload/cover', async (req, res) => {
  try {
    const auth = await getAuth(req);
    const { image, projectId } = req.body;
    if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Missing image data' });
    // Accept both raw base64 and data URLs
    const base64 = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (5MB max)' });
    const dir = path.join(uploadsPath, 'covers');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `${randomUUID()}.png`;
    fs.writeFileSync(path.join(dir, filename), buffer);
    const coverUrl = `/uploads/covers/${filename}`;
    // Save to project if authenticated
    if (projectId && auth?.user) {
      await db.update(projects).set({ coverUrl }).where(eq(projects.id, String(projectId)));
    }
    res.json({ coverUrl });
  } catch (e: any) {
    respondInternalError(res, 'upload.cover', e);
  }
});

// ========== Document import: extract plain text from uploaded file ==========
// Accepts .pdf, .docx; returns normalized plain text capped at MAX_IMPORT_TEXT_BYTES.
// The client pipes this text into the Imagine chat as the user's opening message,
// so the AI can assess the work and ask follow-up questions about gaps.
const MAX_IMPORT_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_TEXT_BYTES = 500 * 1024;
const IMPORT_ACCEPTED_EXTENSIONS = new Set(['.pdf', '.docx']);

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMPORT_UPLOAD_BYTES, files: 1 },
});

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

async function extractTextFromFile(fileName: string, buffer: Buffer): Promise<string> {
  const ext = fileExtension(fileName);

  if (ext === '.pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      try { await parser.destroy(); } catch {}
    }
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
    return buffer.toString('utf8');
  }

  throw new Error(`Unsupported file type: ${ext || 'unknown'}`);
}

function truncateToBytes(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const full = Buffer.byteLength(text, 'utf8');
  if (full <= maxBytes) return { text, truncated: false };
  const sliced = Buffer.from(text, 'utf8').subarray(0, maxBytes);
  let out = sliced.toString('utf8').replace(/\uFFFD+$/, '');
  const lastBreak = Math.max(
    out.lastIndexOf('\n\n'),
    out.lastIndexOf('. '),
    out.lastIndexOf('! '),
    out.lastIndexOf('? '),
  );
  if (lastBreak > out.length - 2000) out = out.slice(0, lastBreak + 1).trim();
  return { text: out, truncated: true };
}

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file';
  return base.replace(/[^\w.\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'file';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && (UUID_RE.test(id) || /^[a-zA-Z0-9_-]{8,64}$/.test(id));
}

app.post('/api/import/extract', (req, res) => {
  importUpload.single('file')(req, res, async (err: any) => {
    try {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'too-large-upload', message: `File exceeds ${Math.round(MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024)} MB limit.` });
          return;
        }
        res.status(400).json({ error: 'upload-failed', message: err.message || 'Upload failed.' });
        return;
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: 'no-file', message: 'No file uploaded.' });
        return;
      }

      const fileName = file.originalname || 'upload';
      const ext = (() => {
        const idx = fileName.lastIndexOf('.');
        return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
      })();

      if (!IMPORT_ACCEPTED_EXTENSIONS.has(ext)) {
        res.status(400).json({
          error: 'unsupported-format',
          message: `We can't read ${ext || 'this file type'} yet. Try .pdf or .docx, or paste your synopsis instead.`,
        });
        return;
      }

      let text: string;
      try {
        const raw = await extractTextFromFile(fileName, file.buffer);
        text = normalizeExtractedText(raw);
      } catch (parseErr: any) {
        console.error('[import] parse failed', { fileName, err: parseErr?.message });
        res.status(400).json({
          error: 'parse-failed',
          message: `We couldn't read "${fileName}". Try exporting it as a text file and uploading that instead.`,
        });
        return;
      }

      if (text.length < 50) {
        res.status(400).json({
          error: 'empty',
          message: `That file had no readable text. If it's a scan or image-only PDF, we can't OCR it yet — try a text version.`,
        });
        return;
      }

      const extractedBytes = Buffer.byteLength(text, 'utf8');
      const { text: finalText, truncated } = truncateToBytes(text, MAX_IMPORT_TEXT_BYTES);

      const words = finalText.split(/\s+/).filter(Boolean).length;
      res.json({
        text: finalText,
        fileName,
        words,
        bytes: Buffer.byteLength(finalText, 'utf8'),
        extractedBytes,
        truncated,
      });
    } catch (e: any) {
      console.error('[import] unexpected error', e);
      res.status(500).json({ error: 'server-error', message: 'Something went wrong on our side — try again.' });
    }
  });
});

// ========== Direct book import: upload → structured project + chapters ==========
// Parallel to /api/import/extract, but instead of feeding the Imagine chat
// this endpoint creates a fully-formed project with chapters populated from
// the uploaded book — no AI generation, no chat. Chapters land as
// `status: 'human-edited'` so the UI doesn't offer to generate over them.
// Intended path for customers importing a finished manuscript to narrate.
app.post('/api/import/as-project', (req, res) => {
  importUpload.single('file')(req, res, async (err: any) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;

      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'too-large-upload', message: `File exceeds ${Math.round(MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024)} MB limit.` });
          return;
        }
        res.status(400).json({ error: 'upload-failed', message: err.message || 'Upload failed.' });
        return;
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: 'no-file', message: 'No file uploaded.' });
        return;
      }

      const fileName = file.originalname || 'upload';
      const ext = fileExtension(fileName);
      if (!IMPORT_ACCEPTED_EXTENSIONS.has(ext) && ext !== '.txt' && ext !== '.md' && ext !== '.markdown') {
        res.status(400).json({
          error: 'unsupported-format',
          message: `We can't read ${ext || 'this file type'} yet. Try .pdf, .docx, or a plain-text export.`,
        });
        return;
      }

      let rawText: string;
      try {
        rawText = await extractTextFromFile(fileName, file.buffer);
      } catch (parseErr: any) {
        console.error('[import-project] parse failed', { fileName, err: parseErr?.message });
        res.status(400).json({
          error: 'parse-failed',
          message: `We couldn't read "${fileName}". Try exporting it as a text file and uploading that instead.`,
        });
        return;
      }

      if (!rawText || rawText.trim().length < 50) {
        res.status(400).json({
          error: 'empty',
          message: `That file had no readable text. If it's a scan or image-only PDF, we can't OCR it yet — try a text version.`,
        });
        return;
      }

      const parsed = parseBookText(rawText, fileName);
      if (!parsed.chapters.length) {
        res.status(400).json({
          error: 'no-chapters',
          message: `We couldn't find any readable chapters in that file.`,
        });
        return;
      }

      // Create the project. Book subtype defaults to 'novel' — user can
      // change it later in project settings if they imported short stories
      // or something else. We skip narrativeControls (defaults apply).
      const [project] = await db.insert(projects).values(buildProjectInsert({
        title: parsed.title || 'Imported Book',
        type: 'book',
        subtype: 'novel',
        targetLength: 'medium',
        assistanceLevel: 3,
      }, auth.user.id)).returning();

      // Create chapters sequentially. We build them as `human-edited` with
      // full prose + scenes so the UI treats them as the user's own work
      // and never tries to auto-generate drafts over them. premise.purpose
      // gets seeded from the opening paragraph so chapter cards show a
      // teaser rather than a bare "Chapter N" label.
      const createdChapters = [];
      for (let i = 0; i < parsed.chapters.length; i++) {
        const ch = parsed.chapters[i];
        const [row] = await db.insert(chapters).values(buildChapterInsert({
          number: i + 1,
          title: ch.title,
          prose: ch.prose,
          status: 'human-edited',
          timelinePosition: i + 1,
          scenes: ch.scenes,
          premise: {
            purpose: ch.premiseSummary,
            changes: '',
            characters: [],
            emotionalBeat: '',
            setupPayoff: [],
            constraints: [],
          },
        }, project.id)).returning();
        createdChapters.push(row);
      }

      res.json({
        project,
        chapters: createdChapters,
        chapterCount: createdChapters.length,
      });
    } catch (e: any) {
      console.error('[import-project] unexpected error', e);
      res.status(500).json({ error: 'server-error', message: 'Something went wrong on our side — try again.' });
    }
  });
});

// ========== Chat attachments: stored files with extracted text for Imagine chat ==========
// The Imagine chat (ChatCreation) lets users attach files to the conversation so
// the AI has durable text context for every turn. We extract the text once on upload
// and save the original to /uploads/chat/{sessionId}/ so it can be moved into the
// project's folder when the project is actually created (via /api/chat/claim).
const CHAT_ACCEPTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.markdown']);
const chatUploadsDir = path.join(uploadsPath, 'chat');
const projectUploadsDir = path.join(uploadsPath, 'projects');
if (!fs.existsSync(chatUploadsDir)) fs.mkdirSync(chatUploadsDir, { recursive: true });
if (!fs.existsSync(projectUploadsDir)) fs.mkdirSync(projectUploadsDir, { recursive: true });

app.post('/api/chat/attach', (req, res) => {
  importUpload.single('file')(req, res, async (err: any) => {
    try {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'too-large-upload', message: `File exceeds ${Math.round(MAX_IMPORT_UPLOAD_BYTES / 1024 / 1024)} MB limit.` });
          return;
        }
        res.status(400).json({ error: 'upload-failed', message: err.message || 'Upload failed.' });
        return;
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) {
        res.status(400).json({ error: 'no-file', message: 'No file uploaded.' });
        return;
      }
      const sessionId = req.body?.sessionId;
      if (!isSafeId(sessionId)) {
        res.status(400).json({ error: 'bad-session', message: 'Missing or invalid session id.' });
        return;
      }

      const fileName = file.originalname || 'upload';
      const ext = fileExtension(fileName);
      if (!CHAT_ACCEPTED_EXTENSIONS.has(ext)) {
        res.status(400).json({
          error: 'unsupported-format',
          message: `We can't read ${ext || 'this file type'} yet. Try a .pdf, .docx, .txt, or .md file.`,
        });
        return;
      }

      let text: string;
      try {
        const raw = await extractTextFromFile(fileName, file.buffer);
        text = normalizeExtractedText(raw);
      } catch (parseErr: any) {
        console.error('[chat.attach] parse failed', { fileName, err: parseErr?.message });
        res.status(400).json({
          error: 'parse-failed',
          message: `We couldn't read "${fileName}". Try a different file.`,
        });
        return;
      }

      if (text.length < 20) {
        res.status(400).json({
          error: 'empty',
          message: `That file had no readable text. If it's a scan or image-only PDF, we can't OCR it yet.`,
        });
        return;
      }

      const extractedBytes = Buffer.byteLength(text, 'utf8');
      const { text: finalText, truncated } = truncateToBytes(text, MAX_IMPORT_TEXT_BYTES);

      // Persist the original file so it can be claimed into the project folder later.
      const sessionDir = path.join(chatUploadsDir, sessionId);
      if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
      const attachmentId = randomUUID();
      const storedName = `${attachmentId}-${sanitizeFilename(fileName)}`;
      const storedPath = path.join(sessionDir, storedName);
      try {
        fs.writeFileSync(storedPath, file.buffer);
      } catch (writeErr: any) {
        console.error('[chat.attach] failed to persist', { storedPath, err: writeErr?.message });
        res.status(500).json({ error: 'server-error', message: 'Could not save the file — try again.' });
        return;
      }

      const url = `/uploads/chat/${sessionId}/${storedName}`;
      const words = finalText.split(/\s+/).filter(Boolean).length;
      res.json({
        id: attachmentId,
        fileName,
        storedName,
        url,
        size: file.size,
        words,
        extractedBytes,
        text: finalText,
        truncated,
      });
    } catch (e: any) {
      console.error('[chat.attach] unexpected error', e);
      res.status(500).json({ error: 'server-error', message: 'Something went wrong on our side — try again.' });
    }
  });
});

// Claim chat attachments for a newly created project: move files from
// /uploads/chat/{sessionId}/ to /uploads/projects/{projectId}/ and return a
// URL rewrite map the client uses to update message attachments.
app.post('/api/chat/claim', express.json(), async (req, res) => {
  try {
    const { sessionId, projectId } = (req.body || {}) as { sessionId?: unknown; projectId?: unknown };
    if (!isSafeId(sessionId)) {
      res.status(400).json({ error: 'bad-session', message: 'Invalid session id.' });
      return;
    }
    if (!isSafeId(projectId)) {
      res.status(400).json({ error: 'bad-project', message: 'Invalid project id.' });
      return;
    }
    const sessionDir = path.join(chatUploadsDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      res.json({ urlMap: {}, moved: 0 });
      return;
    }
    const projectDir = path.join(projectUploadsDir, projectId);
    if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

    const entries = fs.readdirSync(sessionDir);
    const urlMap: Record<string, string> = {};
    let moved = 0;
    for (const entry of entries) {
      const src = path.join(sessionDir, entry);
      const dst = path.join(projectDir, entry);
      try {
        fs.renameSync(src, dst);
      } catch {
        // Fallback for cross-device renames: copy + unlink.
        try {
          fs.copyFileSync(src, dst);
          fs.unlinkSync(src);
        } catch (copyErr: any) {
          console.error('[chat.claim] move failed', { src, dst, err: copyErr?.message });
          continue;
        }
      }
      urlMap[`/uploads/chat/${sessionId}/${entry}`] = `/uploads/projects/${projectId}/${entry}`;
      moved++;
    }
    try {
      fs.rmdirSync(sessionDir);
    } catch {
      // Directory may still have leftover files that failed to move; leave for cleanup.
    }
    res.json({ urlMap, moved });
  } catch (e: any) {
    console.error('[chat.claim] unexpected error', e);
    res.status(500).json({ error: 'server-error', message: 'Could not move attachments.' });
  }
});

// ========== Creator welcome videos ==========
// Each of the 12 outreach creators can have one personalized MP4 stored on
// the persistent disk and rendered on /creators/[slug]. Upload lives in the
// admin dashboard; Ben records on his phone.
const CREATOR_SLUGS = new Set([
  'malva', 'manu', 'tommy', 'tom', 'thomas', 'dan',
  'dom', 'alamin', 'tim', 'artturi', 'bitnext', 'ken',
]);
const creatorVideoDir = path.join(uploadsPath, 'creator-videos');
if (!fs.existsSync(creatorVideoDir)) fs.mkdirSync(creatorVideoDir, { recursive: true });

const creatorVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, creatorVideoDir),
    filename: (req, _file, cb) => cb(null, `${(req.params as any).slug}.mp4`),
  }),
  limits: { fileSize: 150 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      cb(new Error('File must be a video'));
      return;
    }
    cb(null, true);
  },
});

app.get('/api/creator-videos', (_req, res) => {
  try {
    const files = fs.existsSync(creatorVideoDir) ? fs.readdirSync(creatorVideoDir) : [];
    const videos = files
      .filter((f) => f.endsWith('.mp4'))
      .map((f) => f.slice(0, -4))
      .filter((slug) => CREATOR_SLUGS.has(slug));
    res.json({ videos });
  } catch {
    res.json({ videos: [] });
  }
});

app.post('/api/admin/creator-videos/:slug', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const slug = req.params.slug;
  if (!CREATOR_SLUGS.has(slug)) {
    res.status(400).json({ error: 'Unknown creator slug' });
    return;
  }
  creatorVideoUpload.single('video')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed' });
      return;
    }
    if (!(req as any).file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    res.json({ ok: true, url: `/uploads/creator-videos/${slug}.mp4` });
  });
});

app.delete('/api/admin/creator-videos/:slug', async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const slug = req.params.slug;
  if (!CREATOR_SLUGS.has(slug)) {
    res.status(400).json({ error: 'Unknown creator slug' });
    return;
  }
  const filePath = path.join(creatorVideoDir, `${slug}.mp4`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

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

// ========== Public Library (phase 1) ==========
// Endpoints for library.theodore.tools and /library/* paths. No auth.
// Strict: only serves projects with isPublic=true.

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'book';
}

async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 8; i++) {
    const suffix = crypto.randomBytes(3).toString('hex');
    const candidate = `${base}-${suffix}`;
    const [existing] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, candidate)).limit(1);
    if (!existing) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function publicProjectPayload(p: typeof projects.$inferSelect) {
  const cfg = (p.shareConfig || {}) as any;
  return {
    slug: p.slug,
    title: p.title,
    coverUrl: p.coverUrl,
    type: p.type,
    subtype: p.subtype,
    description: cfg.description || '',
    authorDisplayName: cfg.authorDisplayName || 'A Theodore author',
    allowText: cfg.allowText !== false,
    allowAudio: cfg.allowAudio !== false,
    publishedAt: p.publishedAt,
  };
}

function chapterIsAllowed(cfg: any, chapterId: string): boolean {
  if (!cfg) return true;
  if (cfg.allowedChapterIds == null) return true;
  if (!Array.isArray(cfg.allowedChapterIds)) return true;
  return cfg.allowedChapterIds.includes(chapterId);
}

// Audio is stored in two shapes:
//   1) Full-chapter: audioGenerations.chapterId === chapter.id
//   2) Scene-level: audioGenerations.chapterId starts with `${chapter.id}-scene-`
// For a chapter we want the active full-chapter audio if present; otherwise
// stitch together the active scene audios in the chapter's scene order.
function collectAudioForChapter(
  chapter: typeof chapters.$inferSelect,
  allAudio: Array<typeof audioGenerations.$inferSelect>,
): { segments: Array<{ audioUrl: string; durationSeconds: number | null }>; totalDuration: number | null } {
  // Full-chapter audio wins. Prefer isActive but accept any if none active.
  const fullCandidates = allAudio
    .filter(a => a.chapterId === chapter.id)
    .sort((a, b) => (b.createdAt as any) - (a.createdAt as any));
  const fullChapter = fullCandidates.find(a => a.isActive) || fullCandidates[0];
  if (fullChapter) {
    return {
      segments: [{ audioUrl: fullChapter.audioUrl, durationSeconds: fullChapter.durationSeconds ?? null }],
      totalDuration: fullChapter.durationSeconds ?? null,
    };
  }

  // Scene-level: group by sceneId, pick most recent per scene (prefer active)
  const bySceneMatching = allAudio.filter(a => a.chapterId.startsWith(`${chapter.id}-scene-`));
  const latestByScene = new Map<string, typeof allAudio[number]>();
  for (const a of bySceneMatching) {
    const sid = a.sceneId || a.chapterId;
    const prev = latestByScene.get(sid);
    if (!prev) { latestByScene.set(sid, a); continue; }
    // Prefer active rows; if tie, newer wins
    if (a.isActive && !prev.isActive) latestByScene.set(sid, a);
    else if (a.isActive === prev.isActive && (a.createdAt as any) > (prev.createdAt as any)) latestByScene.set(sid, a);
  }

  // Order by chapter's scene ordering
  const sceneOrder: string[] = Array.isArray(chapter.scenes)
    ? (chapter.scenes as any[])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(s => s.id)
    : [];

  const ordered = sceneOrder
    .map(sid => latestByScene.get(sid))
    .filter(Boolean) as typeof allAudio;

  // If nothing from scene order matched (orphaned), fall back to any
  const segments = (ordered.length ? ordered : Array.from(latestByScene.values()))
    .map(a => ({ audioUrl: a.audioUrl, durationSeconds: a.durationSeconds ?? null }));
  const totalDuration = segments.length
    ? segments.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) || null
    : null;

  return { segments, totalDuration };
}

// Public: book metadata + chapter list
app.get('/api/public/book/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const [project] = await db.select().from(projects).where(and(eq(projects.slug, slug), eq(projects.isPublic, true))).limit(1);
    if (!project) return res.status(404).json({ error: 'Book not found' });

    const cfg = (project.shareConfig || {}) as any;
    const chapterRows = await db.select().from(chapters).where(eq(chapters.projectId, project.id));
    const sortedChapters = chapterRows
      .filter(c => chapterIsAllowed(cfg, c.id))
      .sort((a, b) => a.timelinePosition - b.timelinePosition);

    // Match by chapterId prefix — older audios may have missing/stale
    // projectId values, and isActive may not be consistent across scenes.
    // We rely on chapterId ownership (prefix match) for safety.
    const chapterIdSet = new Set(sortedChapters.map(c => c.id));
    const audioRows = sortedChapters.length
      ? await db.select().from(audioGenerations)
          .where(or(
            ...sortedChapters.flatMap(c => [
              eq(audioGenerations.chapterId, c.id),
              sql`${audioGenerations.chapterId} LIKE ${c.id + '-scene-%'}`,
            ])
          ))
      : [];
    // Safety filter in case the OR expands to something unexpected
    const filteredAudio = audioRows.filter(a => {
      const prefix = (a.chapterId || '').split('-scene-')[0];
      return chapterIdSet.has(prefix) || chapterIdSet.has(a.chapterId);
    });

    res.json({
      book: publicProjectPayload(project),
      chapters: sortedChapters.map(c => {
        const { segments, totalDuration } = collectAudioForChapter(c, filteredAudio);
        return {
          id: c.id,
          number: c.number,
          title: c.title,
          hasAudio: segments.length > 0,
          durationSeconds: totalDuration,
        };
      }),
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to load book' });
  }
});

// Public: single chapter content
app.get('/api/public/book/:slug/chapter/:chapterId', async (req, res) => {
  try {
    const { slug, chapterId } = req.params;
    const [project] = await db.select().from(projects).where(and(eq(projects.slug, slug), eq(projects.isPublic, true))).limit(1);
    if (!project) return res.status(404).json({ error: 'Book not found' });

    const cfg = (project.shareConfig || {}) as any;
    if (!chapterIsAllowed(cfg, chapterId)) return res.status(404).json({ error: 'Chapter not available' });

    const [chapter] = await db.select().from(chapters).where(and(eq(chapters.id, chapterId), eq(chapters.projectId, project.id))).limit(1);
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

    const audioRows = await db.select().from(audioGenerations)
      .where(or(
        eq(audioGenerations.chapterId, chapter.id),
        sql`${audioGenerations.chapterId} LIKE ${chapter.id + '-scene-%'}`,
      ));
    const { segments, totalDuration } = collectAudioForChapter(chapter, audioRows);

    const audio = (cfg.allowAudio !== false && segments.length > 0) ? {
      audioUrl: segments[0].audioUrl,
      durationSeconds: totalDuration,
      segments,
    } : null;

    res.json({
      book: publicProjectPayload(project),
      chapter: {
        id: chapter.id,
        number: chapter.number,
        title: chapter.title,
        prose: cfg.allowText !== false ? chapter.prose : null,
        imageUrl: chapter.imageUrl,
      },
      audio,
    });
  } catch (e: any) {
    res.status(500).json({ error: 'Failed to load chapter' });
  }
});

// Public: track a listen (fire-and-forget)
app.post('/api/public/track-listen/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    await db.update(projects)
      .set({ listens: sql`${projects.listens} + 1` })
      .where(and(eq(projects.slug, slug), eq(projects.isPublic, true)));
    res.json({ ok: true });
  } catch {
    res.json({ ok: false });
  }
});

// Author: publish a project
app.post('/api/projects/:id/publish', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth?.user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const project = await getOwnedProject(id, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const body = (req.body || {}) as {
      allowText?: boolean;
      allowAudio?: boolean;
      allowedChapterIds?: string[] | null;
      description?: string;
      authorDisplayName?: string;
    };

    let slug = project.slug;
    if (!slug) slug = await generateUniqueSlug(project.title);

    const shareConfig = {
      allowText: body.allowText !== false,
      allowAudio: body.allowAudio !== false,
      allowedChapterIds: body.allowedChapterIds === undefined ? null : body.allowedChapterIds,
      description: body.description ?? (project.shareConfig as any)?.description ?? '',
      authorDisplayName: body.authorDisplayName ?? (project.shareConfig as any)?.authorDisplayName ?? (auth.user.name || 'A Theodore author'),
    };

    await db.update(projects).set({
      isPublic: true,
      slug,
      publishedAt: project.publishedAt || new Date(),
      shareConfig,
      updatedAt: new Date(),
    }).where(eq(projects.id, id));

    res.json({ ok: true, slug, shareConfig });
  } catch (e: any) {
    respondInternalError(res, 'publish', e);
  }
});

// Author: unpublish
app.post('/api/projects/:id/unpublish', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth?.user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const project = await getOwnedProject(id, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    await db.update(projects).set({ isPublic: false, updatedAt: new Date() }).where(eq(projects.id, id));
    res.json({ ok: true });
  } catch (e: any) {
    respondInternalError(res, 'unpublish', e);
  }
});

// Author: share status / stats
app.get('/api/projects/:id/share-status', async (req, res) => {
  try {
    const auth = await getAuth(req);
    if (!auth?.user) return res.status(401).json({ error: 'Unauthorized' });
    const { id } = req.params;
    const project = await getOwnedProject(id, auth.user.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      isPublic: project.isPublic,
      slug: project.slug,
      publishedAt: project.publishedAt,
      shareConfig: project.shareConfig || {},
      listens: project.listens || 0,
    });
  } catch (e: any) {
    respondInternalError(res, 'share-status', e);
  }
});

const distPath = path.resolve(process.cwd(), 'dist');
// Log pageviews BEFORE the static handler so we capture HTML navigations
// (bundled assets are skipped inside the middleware via /assets/ prefix).
app.use(pageViewMiddleware);
app.use(express.static(distPath));
app.get('/{*splat}', (_req, res) => {
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npx vite build' });
  }
});

// Self-healing startup migration for additive schema changes. This runs on
// every boot; ADD COLUMN IF NOT EXISTS is a no-op when the column is already
// present. Added because prod skipped db:push historically, and a missed
// migration silently breaks SELECTs that drizzle generates from schema.ts.
async function ensureAdditiveSchema() {
  const statements = [
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug text`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS published_at timestamp`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_config jsonb DEFAULT '{}'::jsonb`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS listens integer NOT NULL DEFAULT 0`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'projects_slug_unique') THEN
         BEGIN
           ALTER TABLE projects ADD CONSTRAINT projects_slug_unique UNIQUE (slug);
         EXCEPTION WHEN duplicate_object THEN NULL;
         END;
       END IF;
     END $$`,
    `CREATE TABLE IF NOT EXISTS tts_jobs (
       id text PRIMARY KEY,
       status text NOT NULL DEFAULT 'pending',
       progress integer NOT NULL DEFAULT 0,
       spec jsonb NOT NULL,
       result jsonb,
       error text,
       user_id text,
       is_guest boolean NOT NULL DEFAULT false,
       attempts integer NOT NULL DEFAULT 0,
       created_at timestamp NOT NULL DEFAULT NOW(),
       updated_at timestamp NOT NULL DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS tts_jobs_status_updated_idx ON tts_jobs(status, updated_at)`,
  ];
  for (const sql of statements) {
    try {
      await pool.query(sql);
    } catch (e: any) {
      console.error('[startup-migration] failed:', sql.slice(0, 80), e?.message || e);
    }
  }
}

// Catch-all Express error handler — must be registered LAST. Without this,
// an error thrown inside a route can bubble up and crash the process.
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[express-error]', req.method, req.originalUrl, err?.message || err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'internal', message: 'Something went wrong on our side.' });
});

ensureAdditiveSchema().finally(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Theodore API running on port ${PORT}`);
  });

  // Pick up any TTS job the previous instance left unfinished. Runs async so
  // the server starts serving immediately; resumed jobs stream progress back
  // to polling clients the same way fresh ones do.
  void resumeInterruptedJobs();

  // Graceful shutdown: when Render deploys a new version it sends SIGTERM.
  // Without a handler the process dies instantly and any in-flight request
  // returns 502. Stop accepting new connections, let pending ones finish
  // (up to 25s — Render's proxy typically gives ~30s before force-killing).
  // For in-flight TTS jobs: mark their DB row with an old updated_at so the
  // next instance picks them up immediately via resumeInterruptedJobs.
  const shutdown = (signal: string) => {
    console.log(`[${signal}] received — draining requests…`);
    if (activeJobIds.size > 0) {
      const stalePast = new Date(Date.now() - (STALE_HEARTBEAT_SECONDS + 5) * 1000);
      const ids = Array.from(activeJobIds);
      console.log(`[shutdown] releasing ${ids.length} active TTS job(s) for resume`);
      // Best-effort, fire-and-forget — we don't want to block server.close on DB.
      for (const id of ids) {
        void db.update(ttsJobsTable)
          .set({ status: 'pending', updatedAt: stalePast })
          .where(eq(ttsJobsTable.id, id))
          .catch(() => {});
      }
    }
    server.close(() => {
      console.log('[shutdown] all connections closed, exiting');
      process.exit(0);
    });
    setTimeout(() => {
      console.warn('[shutdown] timed out waiting for connections, forcing exit');
      process.exit(0);
    }, 25_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
