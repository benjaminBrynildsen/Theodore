// Strip internal production tags from reader/export output.
// Keeps source prose untouched in editor/studio.

export function stripDialogueSpeakerTags(text: string): string {
  if (!text) return text;
  // Remove tags like [Narrator] "...", [Coach Dorsey] "..."
  return text.replace(/\[([^\]\n]{1,80})\]\s*(?=["“'])/g, '');
}
