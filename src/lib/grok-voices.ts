// xAI's flagship Grok voices (21 added July 2026, then Aurora and Liora).
// All multilingual. IDs come from xAI's built-in roster; tone notes from
// xAI's voice docs where it gives them. xAI doesn't publish gender, so these
// are offered as narrators and aren't auto-cast to characters by gender.
// Keep in sync with GROK_FLAGSHIP_VOICES in server/tts.ts.

export interface GrokVoiceOption {
  id: string;
  name: string;
  desc: string;
  gender: 'male' | 'female' | 'neutral';
}

const v = (voiceId: string, name: string, desc: string): GrokVoiceOption => ({ id: `grok:${voiceId}`, name, desc, gender: 'neutral' });

export const GROK_FLAGSHIP_VOICES: GrokVoiceOption[] = [
  v('orion', 'Orion', 'Rich, cinematic & resonant · audiobooks'),
  v('perseus', 'Perseus', 'Strong, confident & trustworthy · narration'),
  v('altair', 'Altair', 'Elegant, refined & premium · narration'),
  v('zagan', 'Zagan', 'Powerful & dramatic · characters & narration'),
  v('carina', 'Carina', 'Soft, empathetic & soothing'),
  v('luna', 'Luna', 'Gentle, patient & nurturing'),
  v('atlas', 'Atlas', 'Confident, commanding & reassuring'),
  v('castor', 'Castor', 'Charismatic, down-to-earth & easygoing'),
  v('sirius', 'Sirius', 'Quick-witted, clever & playful'),
  v('iris', 'Iris', 'Friendly, upbeat & charming'),
  v('helix', 'Helix', 'Bold, dynamic & high-energy'),
  v('zenith', 'Zenith', 'Sharp, focused & driven'),
  v('celeste', 'Celeste', 'Flagship voice'),
  v('aurora', 'Aurora', 'Flagship voice'),
  v('liora', 'Liora', 'Flagship voice'),
  v('helios', 'Helios', 'Flagship voice'),
  v('kepler', 'Kepler', 'Flagship voice'),
  v('rigel', 'Rigel', 'Flagship voice'),
  v('cosmo', 'Cosmo', 'Flagship voice'),
  v('ursa', 'Ursa', 'Flagship voice'),
  v('lumen', 'Lumen', 'Flagship voice'),
  v('lux', 'Lux', 'Flagship voice'),
  v('naksh', 'Naksh', 'Flagship voice'),
];

/**
 * A voice list plus any the server reports that it lacks (xAI adds voices
 * over time; the server reads xAI's live list). Order kept, no duplicates.
 */
export function withServerGrokVoices<T extends { id: string }>(
  local: T[],
  server: Array<{ id: string; name: string; desc?: string; gender?: string }> | undefined,
  make: (s: { id: string; name: string; desc: string; gender: 'male' | 'female' | 'neutral' }) => T,
): T[] {
  if (!server?.length) return local;
  const known = new Set(local.map((x) => x.id));
  const extra = server
    .filter((s) => s.id?.startsWith('grok:') && !known.has(s.id))
    .map((s) => make({ id: s.id, name: s.name, desc: s.desc || 'New voice', gender: s.gender === 'male' || s.gender === 'female' ? s.gender : 'neutral' }));
  return extra.length ? [...local, ...extra] : local;
}
