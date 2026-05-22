import { generate } from './ai.js';
import { CATEGORIES, isValidCategory, normalizeTags } from './categories.js';

interface CategorizeInput {
  userId: string;
  projectId: string;
  title: string;
  description?: string;
  proseSample?: string;
}

export interface CategorizeResult {
  category: string | null;
  tags: string[];
}

/**
 * Picks a primary category (one of CATEGORIES) plus up to 3 short tags for a
 * book, using Haiku 4.5 as a fast-and-cheap classifier. Returns nulls/empty on
 * any failure — callers should leave the project untouched in that case
 * rather than write garbage.
 */
export async function categorizeProject(opts: CategorizeInput): Promise<CategorizeResult> {
  const systemPrompt = `You categorize fiction books for a marketplace.
Pick exactly one primary category from this list: ${CATEGORIES.join(', ')}.
Then choose up to 3 short tags (1-2 words each, lowercase) that describe the book's flavor — themes, settings, vibe.
Return ONLY raw JSON in this shape: {"category": "Fantasy", "tags": ["dragons", "coming-of-age", "epic"]}.
No commentary, no markdown fence.`;

  const prompt = `Title: ${opts.title}\n\nDescription: ${opts.description?.trim() || '(none provided)'}\n\nOpening prose:\n${(opts.proseSample || '').slice(0, 1500)}`;

  try {
    const res = await generate({
      model: 'claude-haiku',
      systemPrompt,
      prompt,
      maxTokens: 200,
      temperature: 0.3,
      userId: opts.userId,
      projectId: opts.projectId,
      action: 'categorize-project',
    });
    const match = res.text.match(/\{[\s\S]*\}/);
    if (!match) return { category: null, tags: [] };
    const parsed = JSON.parse(match[0]);
    return {
      category: isValidCategory(parsed.category) ? parsed.category : null,
      tags: normalizeTags(parsed.tags),
    };
  } catch (e: any) {
    console.error('[categorize] failed:', e?.message || e);
    return { category: null, tags: [] };
  }
}
