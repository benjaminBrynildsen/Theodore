// ========== Character Voice Assignment — web port of mobile spec ==========
// See docs/MULTI_VOICE.md for the full design. Keep this file in lockstep with
// theodore-mobile-app/lib/character-voices.ts and the GROK_VOICES table in
// theodore-web/server/tts.ts.
//
// Phase 3 (2026-05-11): pools expanded from 2+2 to 8+8 using xAI's English
// voice library. Pool head order is the multilingual originals (Rex/Sal,
// Eve/Ara) so Phase-1 projects keep their original voice mapping on re-render.
//
// Per-project assignment:
//   - Narrator + fallback: Leo
//   - Top 8 male characters → MALE_CHARACTER_VOICES[0..7]
//   - Top 8 female characters → FEMALE_CHARACTER_VOICES[0..7]
//   - Beyond rank 8 or neutral gender → narrator fallback
//
// Importance ranking (web): role-based — protagonist > antagonist > supporting.
// Within same role, canon array order. Mobile uses Haiku's `mainCharacter`
// flag as the primary signal; web will adopt it once outlines emit it.

import type { CharacterEntry } from '../types/canon';

export const NARRATOR_VOICE = 'grok:leo';
// Pool head is intentionally the multilingual originals so Phase-1 projects
// (before 2026-05) preserve their voice assignments when re-rendered.
export const MALE_CHARACTER_VOICES = [
  'grok:rex',          // Rex — Confident & clear (multilingual)
  'grok:sal',          // Sal — Smooth & grounded (multilingual)
  'grok:f15c6a6a',     // Henry — British, grounded
  'grok:6a41d324',     // Liam — American, steady
  'grok:a7b78b05',     // Sean — Irish, warm
  'grok:5d695b41',     // Marc — South African, measured
  'grok:96819d0bd28d', // Daniel — English, clear
  'grok:78a495fdbb39', // James — English, youthful
] as const;
export const FEMALE_CHARACTER_VOICES = [
  'grok:eve',          // Eve — Energetic & bright (multilingual)
  'grok:ara',          // Ara — Warm & inviting (multilingual)
  'grok:bedd6226',     // Olivia — British, young & bright
  'grok:d11249e6',     // Emma — American, mature & wise
  'grok:355dca53',     // Niamh — Irish, lyrical
  'grok:135ff7ec',     // Thandi — South African, warm
  'grok:f8cf5c2c78d4', // Grace — English, young & bright
  'grok:79f3a8b96d43', // Claire — English, poised
] as const;

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

// Eligible roles for a unique voice. We exclude 'mentioned' — those are
// referenced characters who never speak. 'minor' is included now that the
// pool is wide enough (Phase 3) — side characters can get a unique voice.
const VOICED_ROLES = new Set<string>(['protagonist', 'antagonist', 'supporting', 'minor']);

function getGender(c: CharacterEntry): Gender {
  const raw = (c.character?.gender || '').toLowerCase().trim();
  if (raw === 'male' || raw === 'man' || raw === 'boy' || raw === 'm') return 'male';
  if (raw === 'female' || raw === 'woman' || raw === 'girl' || raw === 'f') return 'female';
  return 'neutral';
}

function isVoiced(c: CharacterEntry): boolean {
  const role = String(c.character?.role || '');
  // Empty role passes through — older projects without role data still get voices.
  return role === '' || VOICED_ROLES.has(role);
}

function rolePriority(role: string): number {
  if (role === 'protagonist') return 0;
  if (role === 'antagonist') return 1;
  if (role === 'supporting') return 2;
  if (role === 'minor') return 3;
  return 4;
}

/**
 * Pure function: doesn't mutate the canon. Returns one assignment per
 * character. Top 8 voiced males → MALE_CHARACTER_VOICES, top 8 voiced females
 * → FEMALE_CHARACTER_VOICES, neutral/excess → narrator (isFallback=true).
 */
export function assignVoicesForProject(characters: CharacterEntry[]): VoiceAssignment[] {
  if (!characters.length) return [];

  const voiced = characters.filter(isVoiced);
  const sortByRole = (a: CharacterEntry, b: CharacterEntry) =>
    rolePriority(String(a.character?.role || '')) -
    rolePriority(String(b.character?.role || ''));

  const males = voiced.filter((c) => getGender(c) === 'male').sort(sortByRole);
  const females = voiced.filter((c) => getGender(c) === 'female').sort(sortByRole);

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
