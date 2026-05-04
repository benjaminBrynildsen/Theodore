# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci                # install
npm run dev:all       # run frontend + backend together (concurrently)
npm run dev           # Vite only — frontend on http://localhost:5050
npm run dev:server    # tsx watch on server/index.ts — API on http://localhost:3001
npm run build         # vite build → dist/
npm run server        # run compiled API in production mode
npm run start         # vite build && tsx server/index.ts (single-process prod)
npm run db:push       # drizzle-kit push (apply schema in server/schema.ts to DATABASE_URL)
npm run db:studio     # drizzle-kit studio (DB browser)
npm run seed          # tsx server/seed.ts
npm run lint          # eslint .
```

There is **no test suite configured** — no `npm test`, no test runner. Don't fabricate one. Verify changes by running `npm run lint` and exercising the app via `npm run dev:all`.

The dev frontend port is **5050** (set in `vite.config.ts`), not 5173 as the README states. Vite proxies `/api` and `/uploads` to `localhost:3001`. The server's CORS allowlist (`server/index.ts`) covers 5050/5173/5757/5758/5055/3001 in development; production only allows `APP_URL`.

DB schema is applied with `drizzle-kit push` — there are no migration files in `drizzle/`. Edit `server/schema.ts` and re-run `npm run db:push`.

## Architecture

Theodore is a writing-system app: React 19 + Vite + Tailwind v4 frontend, Express 5 + Drizzle ORM + Postgres backend, single-process deploy. AI features wrap Anthropic/OpenAI (text), ElevenLabs (TTS/music/SFX), and Gemini (images). Billing is Stripe subscriptions with a credit metering system.

### Server (`server/`, ESM, run via tsx)

`server/index.ts` is the single Express app — ~1500 lines of route handlers, no router split. All routes live there. Domain modules it composes:

- `db.ts` — single `pg.Pool` + drizzle instance, exports `db` and `pool`.
- `schema.ts` — Drizzle table defs: `users`, `sessions`, `projects`, `chapters`, `canonEntries`, `creditTransactions`, `canonSnapshots`, `validationOverrides`. Heavy use of `jsonb` columns (`premise`, `scenes`, `narrativeControls`, canon `data`, etc.) — type-specific shape lives inside JSON, not separate columns.
- `auth.ts` — cookie sessions: HTTP-only `theodore_session` cookie, SHA-256 token hash stored in `sessions`, scrypt password hash, 30-day TTL. `requireAuth(req, res)` writes the 401 itself and returns null on failure — handlers must `return` immediately when it returns null. `getAuth(req)` is the non-failing variant.
- `ai.ts` — Anthropic/OpenAI text generation, including SSE streaming. Token→credit conversion: `1 credit = 1000 weighted tokens` with per-model input/output multipliers (`claude-opus-4-6`, `claude-sonnet-4-5`, `gpt-5.2`, `gpt-4.1`).
- `image-gen.ts` — Gemini image gen + prompt builders for character/location/scene/cover/children's page targets.
- `tts.ts`, `music.ts`, `sfx.ts`, `suno.ts` — ElevenLabs (and legacy Suno) audio generation.
- `billing.ts` — Stripe tier definitions. Tier prices are computed dynamically from `CREDIT_COST_PER_CREDIT_USD` × `BILLING_MARKUP_MULTIPLE` × tier credit count. Tiers: `writer` (10k), `author` (30k), `studio` (100k). Free plan = 500 credits.

Critical Express ordering in `server/index.ts`:

1. CORS is built around the `allowedOrigins` set (APP_URL + dev list) — every origin check goes through `isAllowedOrigin`.
2. `/api/billing/webhook` **must** see the raw body, so the JSON parser middleware is wrapped to skip that path.
3. `/uploads` is served as static from `process.cwd()/uploads` (created at boot).
4. `dist/` static serving + SPA fallback (`app.get('/{*path}', …)`) come last.

Authorization pattern: every project/chapter/canon route filters by user via `getOwnedProject/getOwnedChapter/getOwnedCanonEntry`. There is no shared middleware — each handler calls `requireAuth` then the ownership helper. Preserve this when adding routes.

Generation routes also enforce: per-user single-flight (`activeGenerationUsers` Set), credit precheck (`creditsRemaining <= 0` → 402), and a guest endpoint `/api/generate/guest` whose action must be in `GUEST_ALLOWED_ACTIONS` (`plan-project`, `scaffold-chapters`) — the onboarding chat uses this before sign-up. Rate limits live in an in-memory `rateLimitStore` Map (LRU-pruned at 2000 entries) — fine for single-instance Render deploys, not horizontally scalable.

After a successful generation, the server writes a row to `creditTransactions` and decrements `users.creditsRemaining`. Streaming responses emit `data: {type: 'text' | 'done' | 'error', …}` SSE frames.

### Frontend (`src/`)

Entry: `src/main.tsx` → `src/App.tsx`. Most views are `React.lazy`-loaded; `App.tsx` is the orchestrator that decides between `LandingPage` / `AuthView` / `ChatCreation` (guest onboarding) / the workspace shell (`TopBar` + `LeftSidebar` + `ProjectView` + `RightSidebar` + `BottomNav` + `AudioPlayerBar`).

State is split across multiple **Zustand** stores in `src/store/`:

- `index.ts` — projects, chapters, scenes, edit mode, view state. Persists to `localStorage` key `theodore-app-store` (only data + IDs, not UI flags).
- `canon.ts` — canon entries. Persists to `theodore-canon-store`.
- `auth.ts` — current user. Not persisted; rehydrates by calling `/api/auth/me` in `bootstrap()`.
- `credits.ts` — credit balance + transaction log mirror. Hydrated from the auth user on login.
- `audio.ts`, `music.ts`, `settings.ts`, `validation.ts` — subsystem state.

When loading from the API, stores convert both camelCase and snake_case row keys (`p.targetLength || p.target_length`) — Drizzle returns camelCase already, but legacy/raw rows may not, so this defensive mapping is intentional. When updating a chapter's `prose`, `useStore.updateChapter` does substantial work synchronously: scans for entity mentions via `lib/metadata-scan`, snapshots into `aiIntentMetadata.versionHistory` (capped at 30), merges `referencedCanonIds`, and debounces the API write through `debounceSave` (default 500ms). Auto-detected canon entries are tagged `auto-detected` + `chapter-N`. Don't bypass this path when mutating prose.

Component layout (`src/components/`):

- `views/` — top-level routes: `Home`, `ProjectView`, `ChapterView`, `ReadingMode`, `ToolsView`, `SettingsView`, `AuthView`, `LandingPage`, `ChatCreation`.
- `layout/` — chrome (sidebars, top/bottom bars, audio player).
- `editmode/` — scene-based chapter editor (`SceneCard`, `VibeEditor`, `EditChatPanel`, `EditModeSidebar`).
- `features/` — large, mostly self-contained tool panels (Audiobook, AI Cover, Plot Hole, Mood Board, Story Arc, Series Bible, Manuscript Formatter, etc.). Each is one file; treat them as independent.
- `canon/`, `credits/`, `validation/`, `modals/`, `ui/` — supporting widgets.

### Generation pipeline

The prompt-construction contract lives in `docs/PROMPT-ARCHITECTURE.md` (Theodore v1.0). When changing what context goes into a generation call, follow that token-budget structure: SYSTEM ROLE → CRAFT RULES → WRITING STYLE → STORY SKELETON → ACTIVE CANON (deep, ~150 tok per focal entity) → REFERENCED CANON (light, ~30 tok per mention) → PREVIOUS CHAPTER BRIDGE (last 3 paragraphs) → CHAPTER BLUEPRINT → INSTRUCTION. Total target: 1.4k–2.2k input tokens.

Frontend flow: `lib/prompt-builder.ts` (774 lines) assembles the prompt → `lib/generate.ts` posts to `/api/generate` or `/api/generate/stream` → on success `useCreditsStore.recordUsage()` is called. Specialized helpers in `lib/`:

- `scaffold.ts` — chapter scaffolding from premise.
- `ai-autofill.ts` — auto-fill premise fields.
- `metadata-scan.ts` — entity mention detection (used in store on every prose update).
- `entity-normalization.ts` — canon name canonicalization.
- `emotion-analyzer.ts` — per-scene emotional metadata; debounced 3s after edits.
- `validation-engine.ts` — diff canon edits against chapter content, produce `ValidationIssue[]` for `ImpactPanel`.
- `dialogue-tagger.ts`, `voice-assign.ts`, `tts-types.ts` — multi-voice TTS pipeline.

### Conventions

- **IDs are prefixed** (`user-`, `project-`, `chapter-`, `canon-`, `snap-`). When inserting, generate `${prefix}-${randomUUID()}` server-side or `generateId()` client-side.
- **JSON columns**: shape new data as nested JSON inside the existing column (e.g. canon `data`, project `narrativeControls`, chapter `premise`/`scenes`/`aiIntentMetadata`). Don't add new top-level columns for fields that vary by canon type or feature flag.
- **Debounced writes**: store mutations save through `debounceSave(key, fn, ms=500)`. Don't `await api.update*` from within a Zustand setter — push the write through the debounce.
- **Optimistic local state wins**: `loadChapters` keeps the local set when the backend returns fewer rows (handles backend lag after creates). Same defensive merging in `loadProjects`.
- **Strict TS** with `noUnusedLocals`/`noUnusedParameters`/`erasableSyntaxOnly` (see `tsconfig.app.json`). Server side uses `.js` extensions in imports because it's run as ESM through tsx — keep that pattern (e.g. `from './schema.js'` even though the file is `.ts`).
- **Tailwind v4** via `@tailwindcss/vite` (no `tailwind.config.*`). Theme tokens come from CSS in `src/index.css` / `src/App.css`.

### Deploy

Branch-based on Render via `render.yaml`: `develop` → `theodore-staging`, `main` → `theodore-production`. Build = `npm ci && npm run build`, predeploy = `npm run db:push`, start = `npm run server`, health = `/api/health`. `.github/workflows/deploy.yml` is a no-op unless `RENDER_*_DEPLOY_HOOK` secrets are set — Render's own auto-deploy handles the actual push-to-live.

Required env vars are listed in `.env.example` and `DEPLOYMENT.md`. The Stripe billing path is gated: routes return 503 when `STRIPE_SECRET_KEY` is unset — keep that fallback so dev works without Stripe keys.
