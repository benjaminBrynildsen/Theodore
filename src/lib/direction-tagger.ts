// ========== AI Narration Direction Tagger ==========
// Inserts [direction] tags for emotional delivery, pauses, and vocal actions
// These tags are passed directly to ElevenLabs V3 for native emotional rendering

import { generateText } from './generate';

/** Known direction tags that ElevenLabs V3 supports well */
export const DIRECTION_TAGS = [
  // Emotion
  'excited', 'sad', 'angry', 'annoyed', 'sarcastic', 'bitter', 'hopeful',
  'fearful', 'disgusted', 'surprised', 'amused', 'tender', 'longing',
  // Delivery
  'whispering', 'shouting', 'monotone', 'dramatic', 'deadpan', 'gentle',
  'urgent', 'hesitant', 'confident', 'nervous', 'cold', 'warm',
  // Vocal actions
  'sighs', 'laughs', 'scoffs', 'gasps', 'clears throat', 'chuckles',
  'snickers', 'cries', 'sobs', 'groans', 'yawns',
  // Pacing
  'thoughtful', 'pause', 'dramatic pause', 'slowly', 'quickly',
] as const;

export type DirectionTag = typeof DIRECTION_TAGS[number];

/** Check if a bracketed tag is a direction tag vs a character name */
export function isDirectionTag(tag: string): boolean {
  const lower = tag.toLowerCase().trim();
  return DIRECTION_TAGS.includes(lower as DirectionTag)
    || lower.startsWith('pause')
    || lower.endsWith('ly') // adverbs like "softly", "angrily"
    || /^(whisper|shout|cry|laugh|sigh|gasp|groan|sob|scoff|chuckle|snicker|yawn)s?$/i.test(lower)
    || /^(excited|sad|angry|annoyed|sarcastic|bitter|hopeful|fearful|disgusted|surprised|amused|tender|dramatic|gentle|urgent|hesitant|confident|nervous|cold|warm|deadpan|monotone|thoughtful|slow|fast|quiet|loud)$/i.test(lower);
}

/**
 * Uses AI to insert [direction] tags for emotional delivery into prose.
 * These guide ElevenLabs V3's voice delivery for tone, pacing, and vocal actions.
 */
export async function tagDirections(
  prose: string,
  projectId: string,
  chapterId: string,
): Promise<string> {
  if (!prose.trim()) return prose;

  const prompt = `You are an audiobook director. Insert [direction] tags into prose to guide voice actor delivery for emotional moments, pacing, and vocal actions.

## Rules
1. Insert [tag] BEFORE the dialogue or narration it applies to
2. Use lowercase tags: [whispering], [excited], [sighs], [thoughtful], [annoyed], [sarcastic], etc.
3. Tag types:
   - Emotion: [excited], [sad], [angry], [annoyed], [sarcastic], [bitter], [hopeful], [fearful], [tender]
   - Delivery: [whispering], [shouting], [gentle], [urgent], [hesitant], [confident], [nervous], [cold], [warm]
   - Vocal actions: [sighs], [laughs], [scoffs], [gasps], [clears throat], [chuckles], [cries]
   - Pacing: [thoughtful], [pause], [dramatic pause], [slowly]
4. Add 4-10 tags per scene — focus on emotional turning points and dialogue delivery
5. Do NOT tag neutral narration — only moments with clear emotional weight
6. Preserve ALL existing text, [CharacterName] tags, and {sfx:...} tags EXACTLY as-is
7. Do NOT add [direction] tags that duplicate existing [CharacterName] tags
8. Only add [direction] tags, nothing else
9. If direction tags already exist, leave them unchanged

## Example
Input: [Jack] "You figure they're watching? Or just bored?" Sparrow set down the sugar. [Sparrow] "If I can see the tail, they're amateurs," they murmured. "If I can't, they're professionals or ghosts."
Output: [thoughtful] [Jack] "You figure they're watching? Or just bored?" Sparrow set down the sugar. [whispering] [Sparrow] "If I can see the tail, they're amateurs," they murmured. "If I can't, they're professionals or ghosts."

## Prose to Tag
${prose}

## Output
Return ONLY the tagged prose. No explanations, no markdown fences.`;

  const result = await generateText({
    prompt,
    model: 'gpt-4.1-mini',
    maxTokens: Math.max(2000, Math.ceil(prose.length / 2)),
    temperature: 0.1,
    action: 'direction-tagging',
    projectId,
    chapterId,
  });

  const tagged = result.text.trim();

  // Sanity check — output should be similar length (direction tags are short)
  if (tagged.length < prose.length * 0.5 || tagged.length > prose.length * 2.0) {
    console.warn('[DirectionTagger] AI output length suspicious, falling back to original');
    return prose;
  }

  return tagged;
}
