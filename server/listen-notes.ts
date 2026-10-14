/**
 * Listening notes: notes typed while an audiobook plays, pinned to a chapter
 * and the stretch of audio just before the tap. Owner-only CRUD.
 *
 *   GET    /api/listen-notes?projectId=…   the signed-in user's notes for a book
 *   POST   /api/listen-notes               create
 *   PATCH  /api/listen-notes/:id           change the note text or status
 *   DELETE /api/listen-notes/:id           delete
 */
import type { Express, Request, Response } from 'express';
import { and, asc, eq } from 'drizzle-orm';
import { db } from './db.js';
import { listenNotes } from './schema.js';

type RequireAuth = (req: Request, res: Response) => Promise<{ user: { id: string } } | null>;

const STATUSES = new Set(['open', 'used', 'dismissed']);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function attachListenNoteRoutes(app: Express, requireAuth: RequireAuth): void {
  app.get('/api/listen-notes', async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const projectId = str(req.query.projectId, 200);
      if (!projectId) return res.status(400).json({ error: 'projectId is required.' });
      const rows = await db.select().from(listenNotes)
        .where(and(eq(listenNotes.userId, auth.user.id), eq(listenNotes.projectId, projectId)))
        .orderBy(asc(listenNotes.chapterNumber), asc(listenNotes.audioTime));
      res.json({ notes: rows });
    } catch (e) {
      console.error('[listen-notes] list failed', e);
      res.status(500).json({ error: 'Could not load notes.' });
    }
  });

  app.post('/api/listen-notes', async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const b = req.body || {};
      const id = str(b.id, 80);
      const projectId = str(b.projectId, 200);
      const chapterId = str(b.chapterId, 200);
      if (!id || !projectId || !chapterId) return res.status(400).json({ error: 'id, projectId and chapterId are required.' });
      const row = {
        id,
        userId: auth.user.id,
        projectId,
        chapterId,
        chapterNumber: num(b.chapterNumber) ?? null,
        chapterTitle: str(b.chapterTitle, 300) ?? null,
        audioTime: num(b.audioTime) ?? 0,
        startTime: num(b.startTime) ?? 0,
        passage: str(b.passage, 4000) ?? null,
        passageStart: num(b.passageStart) ?? null,
        passageEnd: num(b.passageEnd) ?? null,
        note: str(b.note, 8000) ?? '',
        status: 'open',
      };
      await db.insert(listenNotes).values(row).onConflictDoNothing();
      res.json({ note: row });
    } catch (e) {
      console.error('[listen-notes] create failed', e);
      res.status(500).json({ error: 'Could not save the note.' });
    }
  });

  app.patch('/api/listen-notes/:id', async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      const note = str(req.body?.note, 8000);
      if (note !== undefined) updates.note = note;
      const status = str(req.body?.status, 20);
      if (status && STATUSES.has(status)) updates.status = status;
      const [row] = await db.update(listenNotes).set(updates)
        .where(and(eq(listenNotes.id, req.params.id), eq(listenNotes.userId, auth.user.id)))
        .returning();
      if (!row) return res.status(404).json({ error: 'Note not found.' });
      res.json({ note: row });
    } catch (e) {
      console.error('[listen-notes] update failed', e);
      res.status(500).json({ error: 'Could not update the note.' });
    }
  });

  app.delete('/api/listen-notes/:id', async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      if (!auth) return;
      await db.delete(listenNotes).where(and(eq(listenNotes.id, req.params.id), eq(listenNotes.userId, auth.user.id)));
      res.json({ ok: true });
    } catch (e) {
      console.error('[listen-notes] delete failed', e);
      res.status(500).json({ error: 'Could not delete the note.' });
    }
  });
}
