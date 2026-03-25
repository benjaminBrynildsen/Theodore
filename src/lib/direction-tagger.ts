// ========== AI Narration Direction Tagger ==========
// Inserts [direction] tags for emotional delivery, pauses, and vocal actions
// These tags are passed directly to ElevenLabs V3 for native emotional rendering

import { generateText } from './generate';

/** Known direction tags that ElevenLabs V3 supports well */
export const DIRECTION_TAGS = [
  // Vocal actions — the WOW factor, use these most
  'sighs', 'laughs', 'scoffs', 'gasps', 'clears throat', 'chuckles',
  'snickers', 'cries', 'sobs', 'groans', 'yawns',
  // Emotion
  'excited', 'sad', 'angry', 'annoyed', 'sarcastic', 'bitter', 'hopeful',
  'fearful', 'disgusted', 'surprised', 'amused', 'tender', 'longing',
  // Delivery
  'whispering', 'shouting', 'monotone', 'dramatic', 'deadpan', 'gentle',
  'urgent', 'hesitant', 'confident', 'nervous', 'cold', 'warm',
  // Pacing
  'thoughtful', 'pause', 'dramatic pause', 'slowly', 'quickly',
] as const;

/** Grouped for the UI picker */
export const DIRECTION_TAG_GROUPS = {
  'Vocal Actions': ['sighs', 'laughs', 'scoffs', 'gasps', 'clears throat', 'chuckles', 'snickers', 'cries', 'sobs', 'groans', 'yawns'],
  'Emotions': ['excited', 'sad', 'angry', 'annoyed', 'sarcastic', 'bitter', 'hopeful', 'fearful', 'disgusted', 'surprised', 'amused', 'tender', 'longing'],
  'Delivery': ['whispering', 'shouting', 'monotone', 'dramatic', 'deadpan', 'gentle', 'urgent', 'hesitant', 'confident', 'nervous', 'cold', 'warm'],
  'Pacing': ['thoughtful', 'pause', 'dramatic pause', 'slowly', 'quickly'],
} as const;

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
 * Prioritizes vocal actions (sighs, laughs, gasps) at high-impact moments.
 * Less is more — only tag moments that genuinely change how the line should sound.
 */
export async function tagDirections(
  prose: string,
  projectId: string,
  chapterId: string,
): Promise<string> {
  if (!prose.trim()) return prose;

  const prompt = `You are a world-class audiobook director. Your job is to insert [direction] tags into prose that will make listeners go "wow" when they hear the AI narrator perform them.

## Philosophy
- **Vocal actions are your star players.** A well-placed [sighs], [laughs], [gasps], or [clears throat] at the right moment makes the audiobook feel ALIVE. Prioritize these.
- **Less is more.** 3-6 perfectly placed tags beat 15 generic ones. Every tag should earn its spot.
- **Match the text.** Only tag what the text already implies. If someone slams a door angrily, [angry] fits. If someone whispers a secret, [whispering] fits. Don't force emotions.
- **Avoid tagging every line.** Most narration should play naturally without direction. Only intervene at emotional peaks, tonal shifts, and dramatic moments.

## Tag Types (in priority order)
1. **Vocal Actions** (USE MOST — these wow people):
   [sighs], [laughs], [scoffs], [gasps], [clears throat], [chuckles], [snickers], [cries], [sobs], [groans], [yawns]
   → Place these where a real person would naturally make the sound. Before a resigned line: [sighs]. After hearing shocking news: [gasps]. Dismissing something: [scoffs].

2. **Delivery** (use selectively for contrast):
   [whispering], [shouting], [gentle], [urgent], [hesitant], [confident], [nervous]
   → Only when the delivery style clearly differs from normal speech.

3. **Emotion** (use sparingly — ElevenLabs infers emotion well from text):
   [excited], [sad], [angry], [sarcastic], [bitter], [tender]
   → Only when the emotion ISN'T obvious from the words themselves. If someone says "I hate you," you don't need [angry].

4. **Pacing** (rare but powerful):
   [pause], [dramatic pause], [slowly], [thoughtful]
   → Save for genuine dramatic beats. A revelation. A decision. A moment of silence.

## Rules
1. Insert [tag] BEFORE the text it applies to
2. Use lowercase: [sighs], [whispering], [gasps]
3. Preserve ALL existing text, [CharacterName] tags EXACTLY as-is
4. Do NOT tag where [CharacterName] tags already set the right tone
5. Do NOT cluster multiple direction tags together — spread them out
6. Do NOT put a direction tag on every paragraph or every line of dialogue
7. If direction tags already exist, leave them unchanged
8. Return ONLY the tagged prose — no explanations

## Example (notice: sparse, impactful placement)

Input:
[Marcus] "I told you this would happen." He set down his coffee and stared out the window. The rain hadn't stopped in three days. [Elena] "Maybe it still can." Her voice cracked on the last word. She turned away so he wouldn't see.

Output:
[Marcus] "I told you this would happen." [sighs] He set down his coffee and stared out the window. The rain hadn't stopped in three days. [hesitant] [Elena] "Maybe it still can." Her voice cracked on the last word. She turned away so he wouldn't see.

(Only 2 tags — but both are perfectly placed. The [sighs] makes Marcus feel real. The [hesitant] changes Elena's delivery.)

## Prose to Tag
${prose}

## Output
Return ONLY the tagged prose.`;

  const result = await generateText({
    prompt,
    model: 'gpt-4.1-mini',
    maxTokens: Math.max(2000, Math.ceil(prose.length / 2)),
    temperature: 0.2,
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
