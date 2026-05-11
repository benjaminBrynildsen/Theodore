// Voice-attribution caching layer — the DB-aware orchestration around the
// pure `voice-attribution.ts` module. Reads from / writes to the
// chapters.voiceAttribution jsonb column. Web-only; mobile uses its own
// caching when it ports the pipeline.
//
// Invalidation: stored cache includes a SHA-256 hash of the prose at
// attribution time. On read, we recompute the hash and discard the cache if
// the prose has changed since (chapter edits, regenerations).

import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from './db.js';
import { chapters, canonEntries } from './schema.js';
import { attributeChapter, type AttributionSegment, type CharacterRosterEntry } from './voice-attribution.js';

function hashProse(prose: string): string {
  return crypto.createHash('sha256').update(prose, 'utf8').digest('hex');
}

interface CachePayload {
  segments: AttributionSegment[];
  status: 'ok' | 'needs-review';
  attempts: number;
  model: string;
  attributedAt: string;
  tokensIn: number;
  tokensOut: number;
  proseHash?: string;
  unattributedQuotes?: string[];
}

export interface EnsureResult {
  segments: AttributionSegment[];
  /** 'cached' when reused, 'fresh' when re-run, 'failed' when the LLM pass errored. */
  source: 'cached' | 'fresh' | 'failed';
  status: 'ok' | 'needs-review' | 'error';
  /** Set only when source==='failed' so callers can log. */
  error?: string;
}

/**
 * Returns a usable attribution-segments array for the given chapter. Reuses
 * the cached jsonb when prose hash matches; otherwise re-runs the strict Opus
 * pass and caches the result.
 *
 * Returns segments=[] with source='failed' when the LLM call errors. Callers
 * should fall back to the regex heuristic in that case (existing behavior).
 *
 * Skips the call entirely (returns empty cached) when there are no characters
 * in the roster — multi-voice with no characters is single-voice.
 */
export async function ensureChapterAttribution(chapterId: string): Promise<EnsureResult> {
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!chapter || !chapter.prose) {
    return { segments: [], source: 'failed', status: 'error', error: 'chapter not found or empty prose' };
  }

  const currentHash = hashProse(chapter.prose);
  const cached = chapter.voiceAttribution as CachePayload | null;

  // Cache hit — prose matches AND we got a clean result last time.
  // 'needs-review' results aren't reused; we retry on next gen in case the
  // model does better with a fresh window of context.
  if (cached && cached.proseHash === currentHash && cached.status === 'ok' && Array.isArray(cached.segments) && cached.segments.length > 0) {
    return { segments: cached.segments, source: 'cached', status: 'ok' };
  }

  // Pull roster
  const canonChars = await db.select().from(canonEntries).where(
    and(eq(canonEntries.projectId, chapter.projectId), eq(canonEntries.type, 'character')),
  );
  const roster: CharacterRosterEntry[] = canonChars.map((c: any) => ({
    canonName: c.name,
    aliases: Array.isArray(c.tags) ? c.tags.filter((t: any) => typeof t === 'string') : [],
    gender: (c.data && typeof c.data === 'object' && c.data.gender) ? String(c.data.gender) : '',
  }));

  if (roster.length === 0) {
    // No named characters → attribution is a no-op. Cache an empty result so
    // we don't repeat the lookup on every audio regen.
    const payload: CachePayload = {
      segments: [],
      status: 'ok',
      attempts: 0,
      model: 'none',
      attributedAt: new Date().toISOString(),
      tokensIn: 0,
      tokensOut: 0,
      proseHash: currentHash,
    };
    await db.update(chapters).set({ voiceAttribution: payload, updatedAt: new Date() }).where(eq(chapters.id, chapterId)).catch(() => {});
    return { segments: [], source: 'fresh', status: 'ok' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { segments: [], source: 'failed', status: 'error', error: 'ANTHROPIC_API_KEY missing' };
  }

  try {
    const result = await attributeChapter({
      prose: chapter.prose,
      characters: roster,
      apiKey,
    });

    const payload: CachePayload = {
      segments: result.segments,
      status: result.status,
      attempts: result.attempts,
      model: result.model,
      attributedAt: new Date().toISOString(),
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      proseHash: currentHash,
      ...(result.unattributedQuotes ? { unattributedQuotes: result.unattributedQuotes } : {}),
    };

    await db.update(chapters)
      .set({ voiceAttribution: payload, updatedAt: new Date() })
      .where(eq(chapters.id, chapterId));

    return { segments: result.segments, source: 'fresh', status: result.status };
  } catch (e: any) {
    return { segments: [], source: 'failed', status: 'error', error: e?.message || String(e) };
  }
}

export function isAttributionCacheFresh(chapter: { prose?: string | null; voiceAttribution: Record<string, any> | null }): boolean {
  if (!chapter.prose) return false;
  const cached = chapter.voiceAttribution as CachePayload | null;
  if (!cached || cached.status !== 'ok' || !Array.isArray(cached.segments) || cached.segments.length === 0) return false;
  return cached.proseHash === hashProse(chapter.prose);
}
