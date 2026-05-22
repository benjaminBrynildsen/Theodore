/**
 * Fixed category list used across the Discover marketplace. Auto-categorize
 * prompts pin to this list, the publish dialog renders it as a dropdown, and
 * the validator below guards the publish + update endpoints.
 *
 * Add new entries here when the catalog grows — don't remove existing ones
 * without a migration plan, since live books reference them by string.
 */
export const CATEGORIES = [
  'Fantasy',
  'Sci-Fi',
  'Romance',
  'Thriller',
  'Mystery',
  'Horror',
  'Literary',
  'Historical Fiction',
  'Adventure',
  'Young Adult',
  "Children's",
  'Action',
  'Drama',
  'Comedy',
  'Memoir',
  'Non-Fiction',
] as const;

export type Category = typeof CATEGORIES[number];

export function isValidCategory(v: unknown): v is Category {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 30)
    .slice(0, 3);
}
