// Shared voice-param builder used by every code path that hits /api/tts/generate.
// Two callers today:
//   - AudiobookPanel (the studio UI)
//   - AudioPlayerBar (the post-chapter-gen auto-play flow)
// Both MUST send the same shape or the server will pick the wrong path. See
// docs/MULTI_VOICE.md.

import type { CharacterEntry } from '../types/canon';
import { assignVoicesForProject } from './character-voices';
import { isPaidPlan } from './plan';

export interface BuildVoiceParamsInput {
  /** Active TTS provider — drives the pool shape. */
  provider: 'elevenlabs' | 'openai' | 'fish' | 'grok' | string;
  /** Whether multi-voice is requested by the UI. Always coerced false for unpaid users. */
  multiVoiceRequested: boolean;
  /** Plan string from /auth/me. Free users never get multi-voice (server enforces too). */
  plan: string | null | undefined;
  /** Canon character entries for the active project. */
  characters: CharacterEntry[];
  /**
   * Fallback ElevenLabs voice assignments (per-character, picked from the
   * 80+ ElevenLabs library). Only used when provider === 'elevenlabs'.
   */
  elevenlabsAssignments?: Array<{ characterId: string; characterName: string; voiceId: string }>;
}

export interface BuildVoiceParamsOutput {
  /** What the server actually runs in multi-voice mode. False for free users or non-supporting providers. */
  effectiveMultiVoice: boolean;
  /** Character-name → provider-appropriate voice ID. Empty when single-voice. */
  characterVoices: Record<string, string>;
  /** Optional metadata for providers that consume it (ElevenLabs style block). */
  characterDescriptions: Record<string, string>;
  /** Canon → list of aliases used in prose. Helps the server's regex fallback. */
  characterAliases: Record<string, string[]>;
  /** Canon → 'male' | 'female' | '' for he/she pronoun resolution in fallback. */
  characterGenders: Record<string, string>;
}

const PROVIDERS_THAT_SUPPORT_MULTI = new Set(['grok', 'elevenlabs']);

function buildDescription(char: CharacterEntry | undefined): string | undefined {
  if (!char) return undefined;
  const c = (char.character || {}) as any;
  const personality = c.personality || {};
  const parts: string[] = [];
  if (c.gender) parts.push(c.gender);
  if (c.age) parts.push(`${c.age} years old`);
  if (c.role) parts.push(`${c.role} character`);
  if (personality.speechPattern) parts.push(`Speech style: ${personality.speechPattern}`);
  if (personality.traits?.length) parts.push(`Personality: ${personality.traits.slice(0, 4).join(', ')}`);
  if (char.description) parts.push(char.description.slice(0, 120));
  return parts.length > 0 ? parts.join('. ') + '.' : undefined;
}

function normGender(raw: any): string {
  const g = (typeof raw === 'string' ? raw : '').toLowerCase().trim();
  if (g === 'male' || g === 'man' || g === 'boy' || g === 'm') return 'male';
  if (g === 'female' || g === 'woman' || g === 'girl' || g === 'f') return 'female';
  return '';
}

export function buildVoiceParams(input: BuildVoiceParamsInput): BuildVoiceParamsOutput {
  const providerKey = String(input.provider || '').toLowerCase();
  const supports = PROVIDERS_THAT_SUPPORT_MULTI.has(providerKey);
  const allowed = supports && isPaidPlan(input.plan);
  const effectiveMultiVoice = allowed && input.multiVoiceRequested;

  const characterVoices: Record<string, string> = {};
  const characterDescriptions: Record<string, string> = {};
  const characterAliases: Record<string, string[]> = {};
  const characterGenders: Record<string, string> = {};

  // Always populate aliases + genders even in single-voice — the server's
  // regex fallback uses them, and an attribution pass needs them.
  for (const ch of input.characters) {
    const c = (ch.character || {}) as any;
    // Aliases live on the canon `tags` array (strings only). Also include
    // explicit fullName / firstName variations when meaningfully different.
    const tagAliases: string[] = Array.isArray((ch as any).tags)
      ? (ch as any).tags.filter((t: any) => typeof t === 'string')
      : [];
    const extra: string[] = [];
    if (c.fullName && c.fullName !== ch.name) extra.push(c.fullName);
    if (c.firstName && c.firstName !== ch.name) extra.push(c.firstName);
    const all = Array.from(new Set([...tagAliases, ...extra]));
    if (all.length > 0) characterAliases[ch.name] = all;
    const g = normGender(c.gender);
    if (g) characterGenders[ch.name] = g;
  }

  if (!effectiveMultiVoice) {
    return {
      effectiveMultiVoice: false,
      characterVoices: {},
      characterDescriptions: {},
      characterAliases,
      characterGenders,
    };
  }

  if (providerKey === 'grok') {
    // Pool-based assignment from docs/MULTI_VOICE.md.
    const grokAssignments = assignVoicesForProject(input.characters);
    for (const a of grokAssignments) {
      if (a.isFallback) continue; // narrator covers fallback chars server-side
      characterVoices[a.characterName] = a.voice;
      const char = input.characters.find((c) => c.id === a.characterId);
      const desc = buildDescription(char);
      if (desc) characterDescriptions[a.characterName] = desc;
    }
  } else if (providerKey === 'elevenlabs') {
    for (const a of input.elevenlabsAssignments || []) {
      characterVoices[a.characterName] = a.voiceId;
      const char = input.characters.find((c) => c.id === a.characterId);
      const desc = buildDescription(char);
      if (desc) characterDescriptions[a.characterName] = desc;
    }
  }

  return { effectiveMultiVoice, characterVoices, characterDescriptions, characterAliases, characterGenders };
}
