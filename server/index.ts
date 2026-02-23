import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from './db.js';
import { projects, chapters, canonEntries, users, creditTransactions } from './schema.js';
import { eq, and } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ========== Health ==========
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (e: any) {
    res.status(500).json({ status: 'error', database: e.message });
  }
});

// ========== Users ==========
app.post('/api/users', async (req, res) => {
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    const allowed = [
      'email',
      'name',
      'avatarUrl',
      'plan',
      'creditsRemaining',
      'creditsTotal',
      'stripeCustomerId',
      'stripeSubscriptionId',
      'byokKey',
      'byokProvider',
      'settings',
    ] as const;
    for (const key of allowed) {
      if (key in req.body) updates[key] = req.body[key];
    }

    const [user] = await db.insert(users).values(req.body).onConflictDoUpdate({
      target: users.id,
      set: updates,
    }).returning();
    res.json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/users/:id', async (req, res) => {
  try {
    const [user] = await db.update(users).set({ ...req.body, updatedAt: new Date() }).where(eq(users.id, req.params.id)).returning();
    res.json(user);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Projects ==========
app.get('/api/projects', async (req, res) => {
  try {
    const userId = req.query.userId as string;
    const result = userId
      ? await db.select().from(projects).where(eq(projects.userId, userId))
      : await db.select().from(projects);
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/projects/:id', async (req, res) => {
  try {
    const [project] = await db.select().from(projects).where(eq(projects.id, req.params.id));
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects', async (req, res) => {
  try {
    const [project] = await db.insert(projects).values(req.body).returning();
    res.json(project);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/projects/:id', async (req, res) => {
  try {
    const [project] = await db.update(projects).set({ ...req.body, updatedAt: new Date() }).where(eq(projects.id, req.params.id)).returning();
    res.json(project);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/projects/:id', async (req, res) => {
  try {
    await db.delete(projects).where(eq(projects.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Chapters ==========
app.get('/api/projects/:projectId/chapters', async (req, res) => {
  try {
    const result = await db.select().from(chapters).where(eq(chapters.projectId, req.params.projectId));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/chapters', async (req, res) => {
  try {
    const [chapter] = await db.insert(chapters).values(req.body).returning();
    res.json(chapter);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/chapters/:id', async (req, res) => {
  try {
    const [chapter] = await db.update(chapters).set({ ...req.body, updatedAt: new Date() }).where(eq(chapters.id, req.params.id)).returning();
    res.json(chapter);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/chapters/:id', async (req, res) => {
  try {
    await db.delete(chapters).where(eq(chapters.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Canon Entries ==========
app.get('/api/projects/:projectId/canon', async (req, res) => {
  try {
    const result = await db.select().from(canonEntries).where(eq(canonEntries.projectId, req.params.projectId));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/canon', async (req, res) => {
  try {
    const [entry] = await db.insert(canonEntries).values(req.body).returning();
    res.json(entry);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/canon/:id', async (req, res) => {
  try {
    const [entry] = await db.update(canonEntries).set({ ...req.body, updatedAt: new Date() }).where(eq(canonEntries.id, req.params.id)).returning();
    res.json(entry);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/canon/:id', async (req, res) => {
  try {
    await db.delete(canonEntries).where(eq(canonEntries.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Credit Transactions ==========
app.get('/api/users/:userId/transactions', async (req, res) => {
  try {
    const result = await db.select().from(creditTransactions).where(eq(creditTransactions.userId, req.params.userId));
    res.json(result);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/transactions', async (req, res) => {
  try {
    const [tx] = await db.insert(creditTransactions).values(req.body).returning();
    // Deduct credits from user
    if (req.body.userId && req.body.creditsUsed) {
      const [user] = await db.select().from(users).where(eq(users.id, req.body.userId));
      if (user) {
        await db.update(users).set({
          creditsRemaining: Math.max(0, user.creditsRemaining - req.body.creditsUsed),
          updatedAt: new Date(),
        }).where(eq(users.id, req.body.userId));
      }
    }
    res.json(tx);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== AI Generation ==========
import { generate, generateStream, tokensToCredits, callWithUserKey, callWithUserKeyStream } from './ai.js';

// Non-streaming generation (auto-fill, validation, etc.)
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, systemPrompt, model, maxTokens, temperature, userId, projectId, chapterId, action } = req.body;
    
    if (!userId || !prompt) {
      return res.status(400).json({ error: 'Missing userId or prompt' });
    }

    // Check credits (skip for BYOK users)
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const isByok = user.plan === 'byok' && user.byokKey;
    if (!isByok && user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }

    const byokProvider =
      (user.byokProvider as string | undefined) ||
      ((String(model || '').startsWith('gpt') || String(model || '').startsWith('openai')) ? 'openai' : 'anthropic');

    const result = isByok
      ? await callWithUserKey(
          { prompt, systemPrompt, model, maxTokens, temperature, userId, projectId, chapterId, action },
          byokProvider,
          user.byokKey as string,
        )
      : await generate({
          prompt, systemPrompt, model, maxTokens, temperature,
          userId, projectId, chapterId, action,
        });

    // Log transaction and deduct credits (skip for BYOK)
    if (!isByok) {
      await db.insert(creditTransactions).values({
        userId,
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
      }).where(eq(users.id, userId));
    }

    res.json({
      text: result.text,
      model: result.model,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        creditsUsed: result.creditsUsed,
        creditsRemaining: isByok ? null : Math.max(0, user.creditsRemaining - result.creditsUsed),
      },
    });
  } catch (e: any) {
    console.error('Generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Streaming generation (chapter writing)
app.post('/api/generate/stream', async (req, res) => {
  try {
    const { prompt, systemPrompt, model, maxTokens, temperature, userId, projectId, chapterId, action } = req.body;
    
    if (!userId || !prompt) {
      return res.status(400).json({ error: 'Missing userId or prompt' });
    }

    // Check credits
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const isByok = user.plan === 'byok' && user.byokKey;
    if (!isByok && user.creditsRemaining <= 0) {
      return res.status(402).json({ error: 'Insufficient credits', creditsRemaining: 0 });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const byokProvider =
      (user.byokProvider as string | undefined) ||
      ((String(model || '').startsWith('gpt') || String(model || '').startsWith('openai')) ? 'openai' : 'anthropic');

    const result = isByok
      ? await callWithUserKeyStream(
          { prompt, systemPrompt, model, maxTokens, temperature, userId, projectId, chapterId, action },
          byokProvider,
          user.byokKey as string,
          res,
        )
      : await generateStream(
          { prompt, systemPrompt, model, maxTokens, temperature, userId, projectId, chapterId, action },
          res
        );

    // Log transaction
    if (!isByok) {
      await db.insert(creditTransactions).values({
        userId,
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
      }).where(eq(users.id, userId));
    }

    // Final event with usage stats
    res.write(`data: ${JSON.stringify({
      type: 'done',
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        creditsUsed: result.creditsUsed,
        creditsRemaining: isByok ? null : Math.max(0, user.creditsRemaining - result.creditsUsed),
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

// Get user credit balance
app.get('/api/users/:id/credits', async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      plan: user.plan,
      creditsRemaining: user.creditsRemaining,
      creditsTotal: user.creditsTotal,
      isByok: user.plan === 'byok' && !!user.byokKey,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ========== Serve static in production ==========
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));
app.get('/{*path}', (_req, res) => {
  const indexFile = path.join(distPath, 'index.html');
  if (require('fs').existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).json({ error: 'Frontend not built. Run: npx vite build' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Theodore API running on port ${PORT}`);
});
