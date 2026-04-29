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
  creditsRemaining: integer('credits_remaining').notNull().default(1000),
  creditsTotal: integer('credits_total').notNull().default(1000),
  lastCreditResetAt: timestamp('last_credit_reset_at'),
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
  isPublic: boolean('is_public').notNull().default(false),
  slug: text('slug').unique(),
  publishedAt: timestamp('published_at'),
  shareConfig: jsonb('share_config').$type<{
    allowFullBook?: boolean;
    allowedChapterIds?: string[] | null; // null = all, [] = none
    allowText?: boolean;
    allowAudio?: boolean;
    authorDisplayName?: string;
    description?: string;
  }>().default({}),
  listens: integer('listens').notNull().default(0),
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

// ========== Guest Backups ==========
// Server-side backup of unauthenticated visitors' in-progress work.
// Keyed by guest_session_id (set via HttpOnly cookie by the server on first
// unauth API hit). Upserted by the client whenever guest state is dirty;
// claimed on register/google login so signup doesn't lose the work the
// visitor did before creating an account. Rows with claimed_at != null are
// retained briefly for admin diagnostics, then purged; unclaimed rows are
// purged after ~30 days.
export const guestBackups = pgTable('guest_backups', {
  guestSessionId: text('guest_session_id').primaryKey(),
  data: jsonb('data').$type<Record<string, any>>().notNull(),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  sizeBytes: integer('size_bytes').notNull().default(0),
  claimedByUserId: text('claimed_by_user_id'),
  claimedAt: timestamp('claimed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== TTS Jobs ==========
// Persistent TTS job state so long generations survive server restarts.
// Render deploys send SIGTERM and restart the instance; without this table the
// in-memory job map was lost and the client's next poll got a 404. On startup,
// any job still in 'processing'/'pending' with a stale heartbeat is re-run.
export const ttsJobs = pgTable('tts_jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('pending'), // pending | processing | complete | error
  progress: integer('progress').notNull().default(0),
  spec: jsonb('spec').$type<Record<string, any>>().notNull(),
  result: jsonb('result').$type<Record<string, any>>(),
  error: text('error'),
  userId: text('user_id'),
  isGuest: boolean('is_guest').notNull().default(false),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Generation Jobs (mobile background-resilient text/image gen) ==========
// Mirrors the tts_jobs pattern so a phone backgrounding mid-generation doesn't
// kill the work. `kind` discriminates ('prose' | 'image' | …); `partial` is a
// throttled snapshot of in-progress text so the client can show live word
// counts even after re-attaching to a job in flight.
export const genJobs = pgTable('gen_jobs', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(), // 'prose' for now; 'image' later
  status: text('status').notNull().default('pending'),
  progress: integer('progress').notNull().default(0),
  spec: jsonb('spec').$type<Record<string, any>>().notNull(),
  partial: text('partial'), // best-effort live snapshot for resume UX
  result: jsonb('result').$type<Record<string, any>>(),
  error: text('error'),
  userId: text('user_id'),
  chapterId: text('chapter_id'), // denormalized so we can look up by chapter
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Outreach Recipients ==========
// People we're sending cold outreach to (creators, partners, press).
// Status drives a kanban-style pipeline view in the admin Outreach tab.
export const outreachRecipients = pgTable('outreach_recipients', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  company: text('company'),
  platform: text('platform'), // 'youtube', 'x', 'podcast', 'newsletter', etc.
  channelUrl: text('channel_url'),
  status: text('status').notNull().default('todo'), // todo, queued, sent, opened, replied, positive, negative, paused, bounced
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Outreach Emails ==========
// One row per send. The id doubles as the tracking-pixel UUID, so a pixel
// hit at /t/{id}.gif resolves directly to the email row.
export const outreachEmails = pgTable('outreach_emails', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull().references(() => outreachRecipients.id, { onDelete: 'cascade' }),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text'),
  threadId: text('thread_id'),       // Gmail Message-ID for in-thread replies
  fromAddress: text('from_address').notNull(),
  toAddress: text('to_address').notNull(),
  status: text('status').notNull().default('sent'), // sent, bounced, failed
  errorMessage: text('error_message'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Outreach Templates ==========
// Reusable cold-email templates. The tagSlug auto-gets merged into a
// recipient's `tags` array when a template is sent — that's how we
// answer "how is template X performing?" later (filter pipeline by tag,
// or hit /api/admin/outreach/templates/stats for per-template rates).
export const outreachTemplates = pgTable('outreach_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  tagSlug: text('tag_slug').notNull().unique(), // e.g., 'intro-v1'
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ========== Outreach Replies ==========
// Inbound replies pulled from Ben's Gmail INBOX via IMAP (server/inbox.ts).
// Match path 1: From: matches a recipient.email → recipientId set.
// Match path 2: In-Reply-To / References match outreach_emails.threadId →
// emailId set, recipientId resolved from that email row.
// gmailMessageId (RFC2822 Message-ID header) is the dedup key — re-running the
// poller never inserts the same reply twice.
export const outreachReplies = pgTable('outreach_replies', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').references(() => outreachRecipients.id, { onDelete: 'cascade' }),
  emailId: text('email_id').references(() => outreachEmails.id, { onDelete: 'set null' }),
  gmailMessageId: text('gmail_message_id').unique(),
  gmailUid: integer('gmail_uid'),
  fromAddress: text('from_address'),
  fromName: text('from_name'),
  subject: text('subject'),
  snippet: text('snippet'),       // first ~280 chars of plaintext body
  bodyText: text('body_text'),
  bodyHtml: text('body_html'),
  isRead: boolean('is_read').notNull().default(false),
  receivedAt: timestamp('received_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Outreach Opens ==========
// Every pixel hit. is_bot rows are kept (not deleted) so we can audit the
// filter; the admin UI counts only is_bot=false.
export const outreachOpens = pgTable('outreach_opens', {
  id: serial('id').primaryKey(),
  emailId: text('email_id').notNull().references(() => outreachEmails.id, { onDelete: 'cascade' }),
  ip: text('ip'),
  userAgent: text('user_agent'),
  country: text('country'),
  isBot: boolean('is_bot').notNull().default(false),
  botReason: text('bot_reason'),
  msSinceSend: integer('ms_since_send'),
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


// ========== Marketplace Moderation (Apple Guideline 1.2) ==========
// Reports are created by any signed-in user against a public project.
// Status starts 'pending'; admin manual-resolves with 'dismissed' or 'removed'.
export const contentReports = pgTable('content_reports', {
  id: text('id').primaryKey(),
  reporterId: text('reporter_id'),
  projectSlug: text('project_slug').notNull(),
  projectId: text('project_id'),
  chapterId: text('chapter_id'),
  reason: text('reason').notNull(),
  details: text('details').default(''),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at'),
});

// One row per (blocker, blocked) pair. Blocked authors' projects are filtered
// out of the Discover feed and detail endpoints for the blocker.
export const userBlocks = pgTable('user_blocks', {
  blockerId: text('blocker_id').notNull(),
  blockedUserId: text('blocked_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ========== Push Tokens ==========
// Mobile devices register Expo push tokens here. A user can have multiple
// devices (phone + tablet); we key by token to keep duplicates out.
export const pushTokens = pgTable('push_tokens', {
  token: text('token').primaryKey(),
  userId: text('user_id').notNull(),
  platform: text('platform').notNull().default('ios'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
});
