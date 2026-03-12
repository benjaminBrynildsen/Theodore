// ========== AI Dialogue Tagger ==========
// Inserts [CharacterName] tags before quoted dialogue in prose

import { generateText } from './generate';

/**
 * Uses AI to insert [CharacterName] tags before each quoted dialogue line.
 * Preserves all other text exactly. Deterministic (low temperature).
 */
export async function tagDialogue(
  prose: string,
  characterNames: string[],
  projectId: string,
  chapterId: string,
): Promise<string> {
  if (!prose.trim() || characterNames.length === 0) return prose;

  // Skip if prose already has tags
  const existingTags = prose.match(/\[[^\]]+\]\s*[\u201C"]/g);
  if (existingTags && existingTags.length > 0) {
    // Some tags already exist — only tag untagged dialogue
  }

  const prompt = `You are a dialogue attribution assistant. Your job is to insert speaker tags before quoted dialogue in prose.

## Character Names
${characterNames.map(n => `- ${n}`).join('\n')}

## Rules
1. Before each quoted dialogue (text in "" or \u201C\u201D), insert [CharacterName] to identify the speaker
2. Use context clues (dialogue tags like "said", "asked", nearby character mentions) to determine who is speaking
3. If you cannot determine the speaker with confidence, use [Narrator]
4. Preserve ALL other text EXACTLY as-is — do not change any words, punctuation, or formatting
5. Only add [CharacterName] tags, nothing else
6. If a tag like [Name] already exists before a quote, leave it unchanged

## Example
Input: "I won't go," Sarah said. James shook his head. "Then I'll go alone."
Output: [Sarah] "I won't go," Sarah said. James shook his head. [James] "Then I'll go alone."

## Prose to Tag
${prose}

## Output
Return ONLY the tagged prose. No explanations, no markdown fences.`;

  const result = await generateText({
    prompt,
    model: 'gpt-4.1-mini',
    maxTokens: Math.max(2000, Math.ceil(prose.length / 2)),
    temperature: 0.1,
    action: 'dialogue-tagging',
    projectId,
    chapterId,
  });

  const tagged = result.text.trim();

  // Sanity check: tagged text should be similar length to original (tags add ~10-20%)
  // If AI returned something wildly different, fall back to original
  if (tagged.length < prose.length * 0.5 || tagged.length > prose.length * 2) {
    console.warn('[DialogueTagger] AI output length suspicious, falling back to original');
    return prose;
  }

  return tagged;
}
