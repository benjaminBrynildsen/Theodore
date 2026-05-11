// ========== Character Voice Assignment — web port of mobile spec ==========
// Mirrors theodore-mobile-app/lib/character-voices.ts. Same locked Grok voice
// slots, same project-wide consistency rule (voices don't change per chapter).
//
// Per-project assignment plan (Ben 2026-04-25, ported to web 2026-05-09):
//   - Leo  → narrator AND fallback for any character not in the top 4
//   - Rex  → most important male character
//   - Sal  → second-most important male character
//   - Eve  → most important female character
//   - Ara  → second-most important female character
//
// Importance ranking (web): role-based — protagonist > antagonist > supporting.
// Mobile uses Haiku's `mainCharacter` flag at outline time (set on the
// `data` jsonb blob); web doesn't currently emit that flag, so we use the
// existing `character.role` enum which Theodore's outline pipeline does set.
// Within each gender we sort by role priority then by canon order.

import type { CharacterEntry } from '../types/canon';

export const NARRATOR_VOICE = 'grok:leo';
export const MALE_CHARACTER_VOICES = ['grok:rex', 'grok:sal'] as const;
export const FEMALE_CHARACTER_VOICES = ['grok:eve', 'grok:ara'] as const;

export type Gender = 'male' | 'female' | 'neutral';

export interface VoiceAssignment {
  characterId: string;
  characterName: string;
  voice: string;
  gender: Gender;
  role: string;
  /** true when the character falls back to the narrator (didn't make the top-2 cut for their gender). */
  isFallback: boolean;
}

const MAIN_ROLES = new Set<string>(['protagonist', 'antagonist', 'supporting']);

function getGender(c: CharacterEntry): Gender {
  const raw = (c.character?.gender || '').toLowerCase().trim();
  if (raw === 'male' || raw === 'man' || raw === 'boy' || raw === 'm') return 'male';
  if (raw === 'female' || raw === 'woman' || raw === 'girl' || raw === 'f') return 'female';
  return 'neutral';
}

function isMain(c: CharacterEntry): boolean {
  return MAIN_ROLES.has(String(c.character?.role || ''));
}

function rolePriority(role: string): number {
  if (role === 'protagonist') return 0;
  if (role === 'antagonist') return 1;
  if (role === 'supporting') return 2;
  return 3;
}

/**
 * Pure function: doesn't mutate the canon. Returns one assignment per
 * character. Top 2 main males → rex/sal, top 2 main females → eve/ara,
 * everyone else → narrator (isFallback=true).
 */
export function assignVoicesForProject(characters: CharacterEntry[]): VoiceAssignment[] {
  if (!characters.length) return [];

  const mains = characters.filter(isMain);
  const sortByRole = (a: CharacterEntry, b: CharacterEntry) =>
    rolePriority(String(a.character?.role || '')) -
    rolePriority(String(b.character?.role || ''));

  const males = mains.filter((c) => getGender(c) === 'male').sort(sortByRole);
  const females = mains.filter((c) => getGender(c) === 'female').sort(sortByRole);

  const voiceById = new Map<string, string>();
  males.slice(0, MALE_CHARACTER_VOICES.length).forEach((c, i) => {
    voiceById.set(c.id, MALE_CHARACTER_VOICES[i]);
  });
  females.slice(0, FEMALE_CHARACTER_VOICES.length).forEach((c, i) => {
    voiceById.set(c.id, FEMALE_CHARACTER_VOICES[i]);
  });

  return characters.map<VoiceAssignment>((c) => ({
    characterId: c.id,
    characterName: c.name,
    voice: voiceById.get(c.id) || NARRATOR_VOICE,
    gender: getGender(c),
    role: String(c.character?.role || ''),
    isFallback: !voiceById.has(c.id),
  }));
}

// Grok voice metadata table — original 5 multilingual voices plus the
// English library subset (en, en-US, en-GB, en-IE, en-ZA). Keep this in
// sync with NARRATOR_OPTIONS / GROK_VOICES in the UI components.
const GROK_VOICE_META: Record<string, { name: string; desc: string }> = {
  'grok:leo': { name: 'Leo', desc: 'Authoritative narrator' },
  'grok:rex': { name: 'Rex', desc: 'Confident & clear' },
  'grok:sal': { name: 'Sal', desc: 'Smooth & grounded' },
  'grok:eve': { name: 'Eve', desc: 'Energetic & bright' },
  'grok:ara': { name: 'Ara', desc: 'Warm & inviting' },
  'grok:6a41d324': { name: 'Liam', desc: 'American · steady' },
  'grok:d11249e6': { name: 'Emma', desc: 'American · mature & wise' },
  'grok:f15c6a6a': { name: 'Henry', desc: 'British · grounded' },
  'grok:bedd6226': { name: 'Olivia', desc: 'British · young & bright' },
  'grok:a7b78b05': { name: 'Sean', desc: 'Irish · warm' },
  'grok:355dca53': { name: 'Niamh', desc: 'Irish · lyrical' },
  'grok:5d695b41': { name: 'Marc', desc: 'South African · measured' },
  'grok:135ff7ec': { name: 'Thandi', desc: 'South African · warm' },
  'grok:96819d0bd28d': { name: 'Daniel', desc: 'English · clear' },
  'grok:78a495fdbb39': { name: 'James', desc: 'English · youthful' },
  'grok:f8cf5c2c78d4': { name: 'Grace', desc: 'English · young & bright' },
  'grok:79f3a8b96d43': { name: 'Claire', desc: 'English · poised' },
};

export function getVoiceLabel(voiceId: string): string {
  const meta = GROK_VOICE_META[voiceId];
  if (meta) return meta.name;
  return voiceId.replace(/^grok:/, '');
}

export function getVoiceDescription(voiceId: string): string {
  return GROK_VOICE_META[voiceId]?.desc || '';
}
