CREATE TABLE "audio_generations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"chapter_id" text NOT NULL,
	"scene_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"audio_url" text NOT NULL,
	"duration_seconds" real,
	"segments" integer,
	"voice_config" jsonb DEFAULT '{}'::jsonb,
	"sfx_config" jsonb DEFAULT '[]'::jsonb,
	"credits_used" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canon_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"image_url" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"notes" text DEFAULT '',
	"version" integer DEFAULT 1 NOT NULL,
	"linked_canon_ids" jsonb DEFAULT '[]'::jsonb,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canon_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"canon_entry_id" text NOT NULL,
	"version" integer NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"timeline_position" integer NOT NULL,
	"status" text DEFAULT 'premise-only' NOT NULL,
	"premise" jsonb NOT NULL,
	"prose" text DEFAULT '' NOT NULL,
	"referenced_canon_ids" jsonb DEFAULT '[]'::jsonb,
	"ai_intent_metadata" jsonb,
	"validation_status" jsonb NOT NULL,
	"scenes" jsonb DEFAULT '[]'::jsonb,
	"edit_chat_history" jsonb DEFAULT '[]'::jsonb,
	"image_url" text,
	"illustration_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"credits_used" integer NOT NULL,
	"model" text DEFAULT '',
	"chapter_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'book' NOT NULL,
	"subtype" text,
	"target_length" text DEFAULT 'medium' NOT NULL,
	"tone_baseline" text DEFAULT '',
	"assistance_level" integer DEFAULT 3 NOT NULL,
	"age_range" text,
	"childrens_book_settings" jsonb,
	"narrative_controls" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sfx_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"audio_url" text NOT NULL,
	"duration_seconds" real,
	"position" text DEFAULT 'background' NOT NULL,
	"source" text DEFAULT 'elevenlabs' NOT NULL,
	"user_id" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp,
	"password_reset_token_hash" text,
	"password_reset_expires_at" timestamp,
	"name" text,
	"avatar_url" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"credits_remaining" integer DEFAULT 100 NOT NULL,
	"credits_total" integer DEFAULT 100 NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_subscription_status" text DEFAULT 'inactive',
	"stripe_current_period_end" timestamp,
	"stripe_cancel_at_period_end" boolean DEFAULT false,
	"stripe_price_tier" text,
	"byok_key" text,
	"byok_provider" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "validation_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"canon_entry_id" text NOT NULL,
	"field" text NOT NULL,
	"reason" text NOT NULL,
	"overridden_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_generations" ADD CONSTRAINT "audio_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_generations" ADD CONSTRAINT "audio_generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_entries" ADD CONSTRAINT "canon_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canon_snapshots" ADD CONSTRAINT "canon_snapshots_canon_entry_id_canon_entries_id_fk" FOREIGN KEY ("canon_entry_id") REFERENCES "public"."canon_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sfx_library" ADD CONSTRAINT "sfx_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_overrides" ADD CONSTRAINT "validation_overrides_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;