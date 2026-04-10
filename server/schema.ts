import { pgTable, text, integer, boolean, timestamp, jsonb, serial, varchar, real } from 'drizzle-orm/pg-core';

// ========== Users ==========
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash'),
  emailVerifiedAt: timestamp('email_verified_at'),
  passwordResetTokenHash: text('password_reset_token_hash'),
  passwordResetExpiresAt: timestamp('password_reset_expires_at'),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  plan: text('plan').notNull().default('free'), // free, writer, author, studio
  creditsRemaining: integer('credits_remaining').notNull().default(100),
  creditsTotal: integer('credits_total').notNull().default(100),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  stripeSubscriptionStatus: text('stripe_subscription_status').default('inactive'),
  stripeCurrentPeriodEnd: timestamp('stripe_current_period_end'),
  stripeCancelAtPeriodEnd: boolean('stripe_cancel_at_period_end').default(false),
  stripePriceTier: text('stripe_price_tier'),
  byokKey: text('byok_key'), // encrypted
  byokProvider: text('byok_provider'),
  settings: jsonb('settings').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Auth Sessions ==========
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastUsedAt: timestamp('last_used_at').defaultNow().notNull(),
});

// ========== Projects ==========
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  type: text('type').notNull().default('book'),
  subtype: text('subtype'),
  targetLength: text('target_length').notNull().default('medium'),
  toneBaseline: text('tone_baseline').default(''),
  assistanceLevel: integer('assistance_level').notNull().default(3),
  ageRange: text('age_range'),
  childrensBookSettings: jsonb('childrens_book_settings').$type<Record<string, any>>(),
  narrativeControls: jsonb('narrative_controls').$type<Record<string, any>>().notNull(),
  coverUrl: text('cover_url'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Chapters ==========
export const chapters = pgTable('chapters', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  timelinePosition: integer('timeline_position').notNull(),
  status: text('status').notNull().default('premise-only'),
  premise: jsonb('premise').$type<Record<string, any>>().notNull(),
  prose: text('prose').notNull().default(''),
  referencedCanonIds: jsonb('referenced_canon_ids').$type<string[]>().default([]),
  aiIntentMetadata: jsonb('ai_intent_metadata').$type<Record<string, any>>(),
  validationStatus: jsonb('validation_status').$type<Record<string, any>>().notNull(),
  scenes: jsonb('scenes').$type<any[]>().default([]),
  editChatHistory: jsonb('edit_chat_history').$type<any[]>().default([]),
  imageUrl: text('image_url'),
  illustrationNotes: text('illustration_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Canon Entries ==========
export const canonEntries = pgTable('canon_entries', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // character, location, system, artifact, rule, event
  name: text('name').notNull(),
  description: text('description').default(''),
  imageUrl: text('image_url'),
  tags: jsonb('tags').$type<string[]>().default([]),
  notes: text('notes').default(''),
  version: integer('version').notNull().default(1),
  linkedCanonIds: jsonb('linked_canon_ids').$type<string[]>().default([]),
  // Type-specific data stored as JSON
  data: jsonb('data').$type<Record<string, any>>().notNull(), // character/location/system/artifact/rule/event data
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Credit Transactions ==========
export const creditTransactions = pgTable('credit_transactions', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  creditsUsed: integer('credits_used').notNull(),
  model: text('model').default(''),
  chapterId: text('chapter_id'),
  metadata: jsonb('metadata').$type<Record<string, any>>().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Canon Snapshots (for validation diffing) ==========
export const canonSnapshots = pgTable('canon_snapshots', {
  id: serial('id').primaryKey(),
  canonEntryId: text('canon_entry_id').notNull().references(() => canonEntries.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  data: jsonb('data').$type<Record<string, any>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Audio Generations ==========
export const audioGenerations = pgTable('audio_generations', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  chapterId: text('chapter_id').notNull(),
  sceneId: text('scene_id'), // null for full-chapter generations
  version: integer('version').notNull().default(1),
  audioUrl: text('audio_url').notNull(),
  durationSeconds: real('duration_seconds'),
  segments: integer('segments'),
  voiceConfig: jsonb('voice_config').$type<Record<string, any>>().default({}), // narrator, model, speed, etc.
  sfxConfig: jsonb('sfx_config').$type<any[]>().default([]), // scene SFX used
  creditsUsed: integer('credits_used').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true), // current active version
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== SFX Library ==========
export const sfxLibrary = pgTable('sfx_library', {
  id: serial('id').primaryKey(),
  prompt: text('prompt').notNull(),
  audioUrl: text('audio_url').notNull(),
  durationSeconds: real('duration_seconds'),
  position: text('position').notNull().default('background'), // background, start, end, inline
  source: text('source').notNull().default('elevenlabs'), // elevenlabs, uploaded, theodore
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }), // null = shared/system
  isPublic: boolean('is_public').notNull().default(true),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Support Requests ==========
export const supportRequests = pgTable('support_requests', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // 'refund', 'support', etc.
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'), // pending, approved, denied, resolved
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Guest Events ==========
// Anonymous visitor activity on the Imagine chat / guest endpoints.
// Logged because guests have no userId → they never hit credit_transactions,
// which means signed-out activity is otherwise invisible to the admin.
export const guestEvents = pgTable('guest_events', {
  id: serial('id').primaryKey(),
  ipHash: text('ip_hash').notNull(),
  event: text('event').notNull(), // 'generate', 'generate-stream', 'tts', 'project-created'
  action: text('action'), // sub-action (e.g. 'plan-project')
  model: text('model'),
  country: text('country'), // 2-letter ISO code from CDN headers (cf-ipcountry etc.)
  metadata: text('metadata'), // freeform context (e.g. novel title)
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Page Views (site analytics) ==========
// Lightweight visit log for the marketing/landing side of theodore.tools.
// Populated by a middleware on non-API HTML GETs. Admin dashboard reads
// aggregates from here (total / 24h / 7d / top referrers / top countries).
export const pageViews = pgTable('page_views', {
  id: serial('id').primaryKey(),
  path: text('path').notNull(),
  referrer: text('referrer'),
  referrerHost: text('referrer_host'),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash'), // sha256 of ip + salt (privacy)
  country: text('country'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  userId: text('user_id'), // null for anon visitors
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Journey Events ==========
// Full session-level tracking of every visitor action from landing through
// signup. Each row is a single event in a visitor's journey. Sessions are
// grouped by session_id (generated client-side per page load).
export const journeyEvents = pgTable('journey_events', {
  id: serial('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  event: text('event').notNull(),
  data: jsonb('data'),           // event-specific payload (element, scroll %, etc.)
  ipHash: text('ip_hash'),
  city: text('city'),
  region: text('region'),
  country: text('country'),
  userAgent: text('user_agent'),
  page: text('page'),            // '/go/' or '/' or view name
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Validation Overrides ==========
export const validationOverrides = pgTable('validation_overrides', {
  id: serial('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  canonEntryId: text('canon_entry_id').notNull(),
  field: text('field').notNull(),
  reason: text('reason').notNull(),
  overriddenBy: text('overridden_by').notNull(), // user id
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
