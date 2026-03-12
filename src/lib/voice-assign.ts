// ========== Auto Voice Assignment ==========
// Maps character personality traits to ElevenLabs TTS voices
// Gender is a hard constraint — male characters ONLY get male/neutral voices, female ONLY get female/neutral

import type { CharacterEntry } from '../types/canon';
import type { ElevenLabsVoice } from './tts-types';
import { DEFAULT_MALE_VOICE, DEFAULT_FEMALE_VOICE, DEFAULT_NEUTRAL_VOICE } from './tts-types';

// Legacy alias
export type OpenAIVoice = ElevenLabsVoice;

interface VoiceProfile {
  id: ElevenLabsVoice;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  tone: string;
  keywords: string[];
}

// Clearly labeled gender per voice — this is the source of truth
const VOICE_PROFILES: VoiceProfile[] = [
  // ---- MALE voices ----
  {
    id: 'pNInz6obpgDQGcFmaJgB', // Adam
    name: 'Adam',
    gender: 'male',
    tone: 'deep',
    keywords: ['authoritative', 'commanding', 'powerful', 'intimidating', 'stoic', 'serious', 'stern', 'gruff', 'king', 'leader', 'villain', 'dark', 'brooding', 'deep'],
  },
  {
    id: 'TxGEqnHWrfWFTfGW9XjX', // Josh
    name: 'Josh',
    gender: 'male',
    tone: 'warm',
    keywords: ['warm', 'kind', 'friendly', 'gentle', 'caring', 'paternal', 'wise', 'mentor', 'thoughtful', 'patient', 'calm', 'comforting', 'supportive', 'father'],
  },
  {
    id: 'VR6AewLTigWG4xSOukaG', // Arnold
    name: 'Arnold',
    gender: 'male',
    tone: 'energetic',
    keywords: ['energetic', 'crisp', 'professional', 'analytical', 'detective', 'soldier', 'disciplined', 'reserved', 'practical', 'straightforward'],
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9', // Daniel
    name: 'Daniel',
    gender: 'male',
    tone: 'calm',
    keywords: ['calm', 'measured', 'refined', 'scholarly', 'wise', 'old', 'ancient', 'elder', 'sage', 'mystic', 'philosophical', 'contemplative'],
  },
  {
    id: 'TX3LPaxmHKxFdv7VOQHJ', // Liam
    name: 'Liam',
    gender: 'male',
    tone: 'neutral',
    keywords: ['neutral', 'clear', 'young', 'adventurous', 'brave', 'hero', 'protagonist', 'everyman'],
  },
  // ---- FEMALE voices ----
  {
    id: '21m00Tcm4TlvDq8ikWAM', // Rachel
    name: 'Rachel',
    gender: 'female',
    tone: 'warm',
    keywords: ['warm', 'motherly', 'nurturing', 'compassionate', 'elegant', 'graceful', 'refined', 'queen', 'sophisticated', 'confident', 'mature', 'mother'],
  },
  {
    id: 'XB0fDUnXU5powFXDhCwa', // Charlotte
    name: 'Charlotte',
    gender: 'female',
    tone: 'energetic',
    keywords: ['energetic', 'young', 'enthusiastic', 'adventurous', 'brave', 'spirited', 'bold', 'rebellious', 'fierce', 'passionate', 'impulsive', 'lively'],
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL', // Sarah
    name: 'Sarah',
    gender: 'female',
    tone: 'gentle',
    keywords: ['soft', 'melancholic', 'romantic', 'dreamy', 'poetic', 'sensitive', 'introverted', 'shy', 'quiet', 'tender', 'wistful', 'ethereal', 'innocent', 'sweet'],
  },
  {
    id: 'pFZP5JQG7iQjIQuC4Bku', // Lily
    name: 'Lily',
    gender: 'female',
    tone: 'warm',
    keywords: ['storyteller', 'narrator', 'wise', 'expressive', 'dramatic', 'charismatic', 'engaging'],
  },
  {
    id: 'ThT5KcBeYPX3keUQqHPh', // Dorothy
    name: 'Dorothy',
    gender: 'female',
    tone: 'bright',
    keywords: ['bright', 'optimistic', 'cheerful', 'playful', 'curious', 'hopeful', 'gentle', 'lighthearted', 'whimsical'],
  },
  // ---- NEUTRAL voices (safe for any gender) ----
  {
    id: 'XrExE9yKIg1WjnnlVkGX', // Matilda
    name: 'Matilda',
    gender: 'neutral',
    tone: 'dramatic',
    keywords: ['dramatic', 'theatrical', 'expressive', 'charismatic', 'flamboyant', 'trickster', 'cunning', 'mischievous', 'performer', 'storyteller', 'eccentric'],
  },
  {
    id: 'JBFqnCBsd6RMkjVDRZzb', // George
    name: 'George',
    gender: 'neutral',
    tone: 'balanced',
    keywords: ['balanced', 'versatile', 'narrator', 'warm', 'engaging', 'professional'],
  },
];

// Common terms that map to male/female
const MALE_TERMS = ['male', 'man', 'boy', 'he', 'him', 'his', 'king', 'prince', 'lord', 'sir', 'father', 'son', 'brother', 'husband', 'mr', 'gentleman'];
const FEMALE_TERMS = ['female', 'woman', 'girl', 'she', 'her', 'queen', 'princess', 'lady', 'dame', 'mother', 'daughter', 'sister', 'wife', 'mrs', 'ms', 'miss'];

/**
 * Resolves a character's gender from their profile.
 * Returns 'male', 'female', or null if ambiguous/unspecified.
 */
function resolveGender(character: CharacterEntry): 'male' | 'female' | null {
  const char = character.character || {} as any;
  const genderField = (char.gender || '').toLowerCase().trim();

  // Direct match on gender field
  if (MALE_TERMS.some(t => genderField.includes(t))) return 'male';
  if (FEMALE_TERMS.some(t => genderField.includes(t))) return 'female';

  // Scan description and other fields for gender signals
  const textBag = [
    character.description || '',
    char.role || '',
    char.backstory || '',
    ...(char.personality?.traits || []),
  ].join(' ').toLowerCase();

  // Look for pronoun patterns — "she is", "his sword", etc.
  const maleHits = MALE_TERMS.filter(t => new RegExp(`\\b${t}\\b`).test(textBag)).length;
  const femaleHits = FEMALE_TERMS.filter(t => new RegExp(`\\b${t}\\b`).test(textBag)).length;

  if (maleHits > femaleHits && maleHits >= 2) return 'male';
  if (femaleHits > maleHits && femaleHits >= 2) return 'female';

  return null;
}

/**
 * Automatically assigns an ElevenLabs TTS voice based on character profile.
 * Gender is a HARD constraint — never assigns a male voice to a female character or vice versa.
 * The narrator voice is excluded so characters always sound distinct from narration.
 */
export function autoAssignVoice(character: CharacterEntry, excludeVoice?: ElevenLabsVoice): ElevenLabsVoice {
  const char = character.character || {} as any;
  const { role } = char;
  const personality = char.personality || {} as any;

  const resolvedGender = resolveGender(character);

  // Filter voices by gender — hard gate, and exclude narrator voice
  let candidates: VoiceProfile[];
  if (resolvedGender === 'male') {
    candidates = VOICE_PROFILES.filter(p => p.gender === 'male' || p.gender === 'neutral');
  } else if (resolvedGender === 'female') {
    candidates = VOICE_PROFILES.filter(p => p.gender === 'female' || p.gender === 'neutral');
  } else {
    // Unknown gender — use neutral voices only to be safe
    candidates = VOICE_PROFILES.filter(p => p.gender === 'neutral');
  }

  // Never assign the narrator's voice to a character
  if (excludeVoice) {
    candidates = candidates.filter(p => p.id !== excludeVoice);
  }

  // Fallback defaults by gender
  const defaultVoice: ElevenLabsVoice = resolvedGender === 'male' ? DEFAULT_MALE_VOICE
    : resolvedGender === 'female' ? DEFAULT_FEMALE_VOICE
    : DEFAULT_NEUTRAL_VOICE;

  if (candidates.length === 0) return defaultVoice;

  // Collect personality signals
  const signals: string[] = [
    ...(personality.traits || []),
    ...(personality.strengths || []),
    ...(personality.flaws || []),
    ...(personality.quirks || []),
    personality.speechPattern || '',
    personality.innerVoice || '',
    char.age || '',
    role || '',
    character.description || '',
  ].map(s => s.toLowerCase());

  const signalText = signals.join(' ');

  // Score each candidate voice on keyword match
  let bestVoice: ElevenLabsVoice = defaultVoice;
  let bestScore = -1;

  for (const profile of candidates) {
    let score = 0;

    // Keyword matching
    for (const keyword of profile.keywords) {
      if (signalText.includes(keyword)) {
        score += 2;
      }
    }

    // Role-based bonuses (within gender-appropriate candidates)
    if (role === 'antagonist') {
      if (profile.name === 'Adam' || profile.name === 'Matilda') score += 3; // deep/dramatic
      if (profile.name === 'Charlotte') score += 2; // fierce female antagonist
    }
    if (role === 'protagonist') {
      if (profile.name === 'Josh' || profile.name === 'Rachel' || profile.name === 'Charlotte') score += 2;
    }

    // Age-based signals
    if (signalText.includes('old') || signalText.includes('elder') || signalText.includes('ancient')) {
      if (profile.name === 'Daniel' || profile.name === 'Adam' || profile.name === 'Rachel') score += 3;
    }
    if (signalText.includes('young') || signalText.includes('child') || signalText.includes('teen')) {
      if (profile.name === 'Charlotte' || profile.name === 'Dorothy' || profile.name === 'Liam') score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVoice = profile.id;
    }
  }

  return bestVoice;
}

/**
 * Returns a human-readable reason for why a voice was chosen.
 */
export function voiceAssignmentReason(character: CharacterEntry, voice: ElevenLabsVoice): string {
  const profile = VOICE_PROFILES.find(p => p.id === voice);
  if (!profile) return '';

  const resolvedGender = resolveGender(character);
  const genderLabel = resolvedGender || 'unspecified gender';
  const traits = character.character?.personality?.traits?.slice(0, 3).join(', ') || 'general personality';
  return `${profile.name} — ${profile.tone} ${profile.gender} voice for ${genderLabel} character (${traits})`;
}

/** Exported for use in other modules */
export { resolveGender };
