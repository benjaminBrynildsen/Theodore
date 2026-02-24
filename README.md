# Theodore

Theodore is a writing system app with:

- React + Vite frontend
- Express API backend
- PostgreSQL + Drizzle ORM
- Credit/subscription model

## Local development

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL` and `OPENAI_API_KEY`
3. Run:

```bash
npm ci
npm run db:push
npm run dev:all
```

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

## Production deploy

Recommended: Render Blueprint + branch auto-deploy.

- `develop` branch -> staging deploy
- `main` branch -> production deploy

Repository includes `render.yaml` for this setup.

See `DEPLOYMENT.md` for setup steps and required GitHub secrets.
