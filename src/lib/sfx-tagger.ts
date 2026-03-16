// ========== AI SFX Tagger ==========
// Inserts {sfx:description} tags inline at moments in prose where spot sound effects occur

import { generateText } from './generate';

/**
 * Uses AI to insert {sfx:description} tags at action moments in prose.
 * These represent one-off spot sounds (basketball bouncing, door slam, footsteps)
 * NOT ambient/background sounds (those stay as SceneSFX at scene level).
 */
export async function tagSFX(
  prose: string,
  projectId: string,
  chapterId: string,
): Promise<string> {
  if (!prose.trim()) return prose;

  const prompt = `You are a sound design assistant for audiobook production. Your job is to insert inline sound effect tags into prose at moments where distinct, short sounds occur.

## Rules
1. Insert {sfx:description} tags BEFORE the text that describes the sound action, so the sound plays during/alongside the narration
2. Only tag distinct, one-off sounds — NOT ambient/background sounds
3. Keep descriptions short (2-4 words): {sfx:door slam}, {sfx:glass shattering}, {sfx:basketball bouncing}
4. Good spot SFX: footsteps, punches, gunshots, door creaks, glass breaking, phone ringing, car horn, keyboard typing, ball bouncing, sneaker squeaks
5. Do NOT tag: rain, wind, crowd noise, traffic, music — these are ambient sounds handled separately
6. Preserve ALL other text EXACTLY as-is — do not change any words, punctuation, or formatting
7. Only add {sfx:description} tags, nothing else
8. Add 3-8 tags per scene maximum — only the most impactful moments
9. If {sfx:...} tags already exist, leave them unchanged
10. Place tags BEFORE the sentence or clause where the sound occurs
11. Do NOT place any {sfx:} tags in the first paragraph — the scene intro sound effect already covers the opening atmosphere

## Example
Input: He dribbled the ball twice, then launched from the three-point line. The ball swished through the net. "Nothing but net!" TJ shouted, his sneakers squeaking on the court as he celebrated.
Output: {sfx:basketball dribbling} He dribbled the ball twice, then launched from the three-point line. {sfx:basketball swish} The ball swished through the net. "Nothing but net!" TJ shouted, {sfx:sneaker squeaks} his sneakers squeaking on the court as he celebrated.

## Prose to Tag
${prose}

## Output
Return ONLY the tagged prose. No explanations, no markdown fences.`;

  const result = await generateText({
    prompt,
    model: 'gpt-4.1-mini',
    maxTokens: Math.max(2000, Math.ceil(prose.length / 2)),
    temperature: 0.1,
    action: 'sfx-tagging',
    projectId,
    chapterId,
  });

  const tagged = result.text.trim();

  // Sanity check
  if (tagged.length < prose.length * 0.5 || tagged.length > prose.length * 2.5) {
    console.warn('[SFXTagger] AI output length suspicious, falling back to original');
    return prose;
  }

  return tagged;
}
