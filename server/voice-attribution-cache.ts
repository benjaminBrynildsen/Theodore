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
  /** Bump when the roster-builder shape changes so older caches re-attribute. */
  rosterVersion?: number;
}

const CURRENT_ROSTER_VERSION = 2;

// Honorifics that should not be treated as a first-name candidate when we
// split a canonName into tokens. Without this, "Ms. Davenport" → firstName
// "Ms." which is useless for attribution.
const TITLE_TOKENS = new Set([
  'mr', 'mrs', 'ms', 'miss', 'mx',
  'dr', 'prof', 'professor',
  'capt', 'cpt', 'captain',
  'sgt', 'sergeant',
  'lt', 'lieutenant',
  'col', 'colonel',
  'gen', 'general',
  'sir', 'lady', 'lord', 'dame',
  'rev', 'reverend',
  'st', 'saint',
]);

function isTitleToken(t: string): boolean {
  return TITLE_TOKENS.has(t.replace(/\.$/, '').toLowerCase());
}

/**
 * Builds the alias list passed to the attribution LLM. Pulls from the
 * character's explicit aliases AND derives first/last name tokens from the
 * canonName so prose using just "Davenport" or "Madison" still resolves to
 * "Ms. Davenport". Without this enrichment, Sonnet sees `aliases: []` and
 * falls back to needs-review on pronoun-heavy text.
 */
function buildAliasesForCharacter(c: any): string[] {
  const data = (c && typeof c.data === 'object' && c.data) ? c.data : {};
  const canonName = String(c.name || '').trim();

  const explicitAliases: string[] = Array.isArray(data.aliases)
    ? data.aliases.filter((a: any) => typeof a === 'string' && a.trim().length > 0)
    : [];
  const tagAliases: string[] = Array.isArray(c.tags)
    ? c.tags.filter((t: any) => typeof t === 'string' && t.trim().length > 0)
    : [];

  // Split canonName into name tokens, skipping titles.
  const tokens = canonName.split(/\s+/).filter((t: string) => t.length > 0);
  const meaningful = tokens.filter((t: string) => !isTitleToken(t));
  const firstName = meaningful[0];
  const lastName = meaningful.length > 1 ? meaningful[meaningful.length - 1] : undefined;

  const fullName = (typeof data.fullName === 'string' && data.fullName.trim() && data.fullName !== canonName)
    ? data.fullName.trim()
    : undefined;

  const all = new Set<string>();
  for (const a of explicitAliases) all.add(a.trim());
  for (const t of tagAliases) all.add(t.trim());
  if (firstName && firstName !== canonName) all.add(firstName);
  if (lastName && lastName !== canonName && lastName !== firstName) all.add(lastName);
  if (fullName) all.add(fullName);
  // Don't repeat the canonName itself — Sonnet already gets that as `canonName`.
  all.delete(canonName);
  return Array.from(all);
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
 * The TTS job system rewrites chapterId to `<uuid>-v<timestamp>` or
 * `<uuid>-scene-<sceneId>-v<timestamp>` so each generation has a unique
 * audio cache key. The chapters table only stores the bare UUID, though,
 * so we have to strip the suffixes before looking up the row. UUIDs are
 * 36 chars (hyphenated) so the leading UUID survives.
 */
function extractBaseChapterId(suffixedId: string): string {
  let id = suffixedId;
  // -v<digits> at the end (audio version stamp from Date.now())
  id = id.replace(/-v\d+$/, '');
  // -scene-<uuid> just before the version (per-scene audio splits)
  id = id.replace(/-scene-[a-f0-9-]{36}$/, '');
  return id;
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
 *
 * @param chapterId  Either the bare chapter UUID or the version-suffixed
 *                   form the TTS job system uses (`<uuid>-v...`,
 *                   `<uuid>-scene-<uuid>-v...`). We strip the suffix internally.
 * @param proseOverride  Optional. When provided (e.g., per-scene audio gen
 *                   where the prose is a scene slice rather than full chapter),
 *                   we attribute against this text instead of pulling from DB.
 *                   The chapter row is still consulted for the cache key.
 */
export async function ensureChapterAttribution(chapterId: string, proseOverride?: string): Promise<EnsureResult> {
  const baseId = extractBaseChapterId(chapterId);
  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, baseId)).limit(1);
  if (!chapter) {
    return { segments: [], source: 'failed', status: 'error', error: `chapter ${baseId} not found` };
  }
  const proseToAttribute = (proseOverride ?? chapter.prose) || '';
  if (!proseToAttribute.trim()) {
    return { segments: [], source: 'failed', status: 'error', error: 'empty prose' };
  }

  const currentHash = hashProse(proseToAttribute);
  const cached = chapter.voiceAttribution as CachePayload | null;

  // Cache hit — prose matches AND we got a clean result last time AND it was
  // built against the current roster shape. 'needs-review' results aren't
  // reused; we retry on next gen in case the model does better with a fresh
  // window of context. rosterVersion mismatch forces re-attribution after a
  // roster-builder change (e.g. richer aliases) — older caches were generated
  // with thin rosters and would have over-attributed to narrator.
  // Note: we only cache for the full-chapter prose (proseOverride absent).
  // Scene-level prose slices are too narrow for the cache to be reusable.
  if (
    !proseOverride &&
    cached &&
    cached.proseHash === currentHash &&
    cached.status === 'ok' &&
    Array.isArray(cached.segments) &&
    cached.segments.length > 0 &&
    (cached.rosterVersion ?? 1) >= CURRENT_ROSTER_VERSION
  ) {
    return { segments: cached.segments, source: 'cached', status: 'ok' };
  }

  // Pull roster — enrich aliases with the character's explicit aliases plus
  // derived first/last-name tokens (with title-prefix stripping), so Sonnet
  // can resolve "Madison said" or "Davenport snapped" back to "Ms. Davenport".
  const canonChars = await db.select().from(canonEntries).where(
    and(eq(canonEntries.projectId, chapter.projectId), eq(canonEntries.type, 'character')),
  );
  const roster: CharacterRosterEntry[] = canonChars.map((c: any) => ({
    canonName: c.name,
    aliases: buildAliasesForCharacter(c),
    gender: (c.data && typeof c.data === 'object' && c.data.gender) ? String(c.data.gender) : '',
  }));

  if (roster.length === 0) {
    // No named characters → attribution is a no-op. Cache an empty result so
    // we don't repeat the lookup on every audio regen.
    if (!proseOverride) {
      const payload: CachePayload = {
        segments: [],
        status: 'ok',
        attempts: 0,
        model: 'none',
        attributedAt: new Date().toISOString(),
        tokensIn: 0,
        tokensOut: 0,
        proseHash: currentHash,
        rosterVersion: CURRENT_ROSTER_VERSION,
      };
      await db.update(chapters).set({ voiceAttribution: payload, updatedAt: new Date() }).where(eq(chapters.id, baseId)).catch(() => {});
    }
    return { segments: [], source: 'fresh', status: 'ok' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { segments: [], source: 'failed', status: 'error', error: 'ANTHROPIC_API_KEY missing' };
  }

  try {
    const result = await attributeChapter({
      prose: proseToAttribute,
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
      rosterVersion: CURRENT_ROSTER_VERSION,
      ...(result.unattributedQuotes ? { unattributedQuotes: result.unattributedQuotes } : {}),
    };

    // Only persist when attributing the FULL chapter prose. Scene slices
    // would overwrite the chapter-wide cache with a partial result.
    if (!proseOverride) {
      await db.update(chapters)
        .set({ voiceAttribution: payload, updatedAt: new Date() })
        .where(eq(chapters.id, baseId));
    }

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
