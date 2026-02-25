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
  creditsRemaining: integer('credits_remaining').notNull().default(500),
  creditsTotal: integer('credits_total').notNull().default(500),
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
  narrativeControls: jsonb('narrative_controls').$type<Record<string, any>>().notNull(),
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
