/**
 * AI-powered entity refinement — sends regex-detected candidates + prose context
 * to an LLM for proper classification, filtering, and alias detection.
 */

import { generateText } from './generate';

export interface RefinedEntity {
  name: string;
  type: 'character' | 'location' | 'system' | 'artifact' | 'media' | 'none';
  aliases?: string[];
  description?: string;
}

export interface RefinementResult {
  entities: RefinedEntity[];
}

const SYSTEM_PROMPT = `You are a literary analysis assistant. Your job is to classify named entities extracted from fiction prose.

You will receive:
1. A prose excerpt from a chapter
2. A list of candidate entity names detected by regex

For each candidate, determine:
- **type**: "character", "location", "system", "artifact", "media", or "none"
  - "character" = a person or named being in the story
  - "location" = a place (city, room, building, region, etc.)
  - "system" = a magic system, government, organization, protocol
  - "artifact" = a named object, weapon, device, document
  - "media" = a song, book, film, or other creative work referenced in the story
  - "none" = NOT an entity. Common words, abstract concepts, sentence fragments, verbs, adjectives, or anything that isn't a proper named entity in the story. Be aggressive with this — if in doubt, mark "none".

- **aliases**: For characters ONLY — list any nicknames, shortened names, or alternate names used in the prose for this same person. E.g. if "Jonathan" is also called "Jon" or "Johnny" in the text, include those as aliases. Only include aliases you can actually find evidence for in the prose.

- **description**: A brief (1 sentence) description of the entity based on what's evident in the prose.

IMPORTANT RULES:
- Common English words that happen to be capitalized (e.g. "Think", "Forecast", "Storm", "Inside", "Nothing") are ALWAYS "none"
- Sentence fragments like "Move-In The" or "Looking Back" are "none"
- Time references (months, days, seasons) are "none"
- Generic descriptors ("The Old Man", "The Storm") are "none" unless they are clearly used as a proper name/title
- County/city/region names (e.g. "Willoughby County") are "location", not "character"
- Be precise: only real named entities from the narrative should survive

Respond with ONLY valid JSON (no markdown fences, no explanation):
{
  "entities": [
    { "name": "Mason", "type": "character", "aliases": ["Mase"], "description": "Lifelong friend who recently moved to a rural area" },
    { "name": "Willoughby County", "type": "location", "aliases": [], "description": "The rural county where the story takes place" },
    { "name": "Think", "type": "none" },
    { "name": "Forecast", "type": "none" }
  ]
}`;

/**
 * Send candidates + prose to LLM for refinement.
 * Falls back to the raw candidates if the LLM call fails.
 */
export async function refineEntitiesWithAI(
  prose: string,
  candidates: {
    characters: string[];
    locations: string[];
    systems: string[];
    artifacts: string[];
    media: string[];
  },
  options?: { projectId?: string; chapterId?: string },
): Promise<RefinementResult> {
  // Collect all candidates with their regex-guessed type for context
  const allCandidates: { name: string; guessedType: string }[] = [];
  for (const name of candidates.characters) allCandidates.push({ name, guessedType: 'character' });
  for (const name of candidates.locations) allCandidates.push({ name, guessedType: 'location' });
  for (const name of candidates.systems) allCandidates.push({ name, guessedType: 'system' });
  for (const name of candidates.artifacts) allCandidates.push({ name, guessedType: 'artifact' });
  for (const name of candidates.media) allCandidates.push({ name, guessedType: 'media' });

  if (allCandidates.length === 0) {
    return { entities: [] };
  }

  // Truncate prose to ~3000 chars to keep token usage reasonable
  const proseExcerpt = prose.length > 3000 ? prose.slice(0, 3000) + '\n[...truncated...]' : prose;

  const prompt = `## Prose Excerpt
${proseExcerpt}

## Candidates to Classify
${allCandidates.map((c) => `- "${c.name}" (regex guessed: ${c.guessedType})`).join('\n')}

Classify each candidate and detect any character aliases. Respond with JSON only.`;

  try {
    const result = await generateText({
      prompt,
      systemPrompt: SYSTEM_PROMPT,
      action: 'refine-entities',
      temperature: 0.1,
      maxTokens: 1500,
      projectId: options?.projectId,
      chapterId: options?.chapterId,
    });

    // Strip markdown fences if present
    const raw = result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(raw) as RefinementResult;
    if (!parsed.entities || !Array.isArray(parsed.entities)) {
      console.warn('[AI Entity Refine] Invalid response shape, falling back');
      return fallback(candidates);
    }

    return parsed;
  } catch (err) {
    console.error('[AI Entity Refine] LLM call failed, using regex results:', err);
    return fallback(candidates);
  }
}

/** Convert raw regex candidates into the refinement shape (no filtering applied) */
function fallback(candidates: {
  characters: string[];
  locations: string[];
  systems: string[];
  artifacts: string[];
  media: string[];
}): RefinementResult {
  const entities: RefinedEntity[] = [];
  for (const name of candidates.characters) entities.push({ name, type: 'character' });
  for (const name of candidates.locations) entities.push({ name, type: 'location' });
  for (const name of candidates.systems) entities.push({ name, type: 'system' });
  for (const name of candidates.artifacts) entities.push({ name, type: 'artifact' });
  for (const name of candidates.media) entities.push({ name, type: 'media' });
  return { entities };
}
