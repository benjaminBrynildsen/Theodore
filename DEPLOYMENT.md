# Theodore Deployment

Render works well for your goal: push from Codex CLI and go live automatically.

## Recommended setup (Render native auto deploy)

Use branch-based deploys directly in Render:

- `develop` -> staging service
- `main` -> production service

This repo includes `render.yaml` to provision both web services + databases.

## 1) Create services on Render

1. In Render, create a **Blueprint** from this repo.
2. Render reads `render.yaml` and creates:
   - `theodore-staging` (branch `develop`)
   - `theodore-production` (branch `main`)
   - `theodore-staging-db`
   - `theodore-production-db`
3. Keep auto-deploy enabled in both services.

## 2) Set required environment variables

For both web services:

- `OPENAI_API_KEY`
- `APP_URL` (service URL or custom domain)

Already wired by `render.yaml`:

- `DATABASE_URL` from each service's linked Render Postgres
- `NODE_ENV=production`

Optional Stripe vars (when billing is live):

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_WRITER`
- `STRIPE_PRICE_AUTHOR`
- `STRIPE_PRICE_STUDIO`

## 3) Runtime behavior

- Build command: `npm ci && npm run build`
- Pre-deploy command: `npm run db:push`
- Start command: `npm run server`
- Health check: `/api/health`

## 4) Push-to-live flow from Codex CLI

1. Commit changes locally.
2. Push to `develop` for staging.
3. Validate staging.
4. Merge to `main` for production.

Render auto deploys on each push.

## Optional: deploy hooks via GitHub Actions

This repo also has `.github/workflows/deploy.yml` for optional deploy hook triggering.
If no deploy hook secrets are set, it safely skips hook triggers.

Optional hook secrets:

- `RENDER_STAGING_DEPLOY_HOOK`
- `RENDER_PRODUCTION_DEPLOY_HOOK`
- `STAGING_HEALTHCHECK_URL`
- `PRODUCTION_HEALTHCHECK_URL`
