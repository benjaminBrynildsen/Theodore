// ========== Auto Voice Assignment ==========
// Maps character personality traits to OpenAI TTS voices

import type { CharacterEntry } from '../types/canon';
import type { OpenAIVoice } from './tts-types';

interface VoiceProfile {
  id: OpenAIVoice;
  gender: string;
  tone: string;
  keywords: string[]; // personality keywords that match this voice
}

const VOICE_PROFILES: VoiceProfile[] = [
  {
    id: 'onyx',
    gender: 'male',
    tone: 'deep',
    keywords: ['authoritative', 'commanding', 'powerful', 'intimidating', 'stoic', 'serious', 'stern', 'gruff', 'king', 'leader', 'villain', 'dark', 'brooding', 'deep'],
  },
  {
    id: 'ash',
    gender: 'male',
    tone: 'warm',
    keywords: ['warm', 'kind', 'friendly', 'gentle', 'caring', 'paternal', 'wise', 'mentor', 'thoughtful', 'patient', 'calm', 'comforting', 'supportive'],
  },
  {
    id: 'echo',
    gender: 'male',
    tone: 'neutral',
    keywords: ['neutral', 'professional', 'logical', 'analytical', 'detective', 'soldier', 'disciplined', 'reserved', 'practical', 'straightforward'],
  },
  {
    id: 'coral',
    gender: 'female',
    tone: 'warm',
    keywords: ['warm', 'motherly', 'nurturing', 'compassionate', 'elegant', 'graceful', 'refined', 'queen', 'sophisticated', 'confident', 'mature'],
  },
  {
    id: 'nova',
    gender: 'female',
    tone: 'energetic',
    keywords: ['energetic', 'young', 'enthusiastic', 'adventurous', 'brave', 'spirited', 'bold', 'rebellious', 'fierce', 'passionate', 'impulsive', 'lively'],
  },
  {
    id: 'shimmer',
    gender: 'female',
    tone: 'bright',
    keywords: ['bright', 'optimistic', 'cheerful', 'innocent', 'sweet', 'playful', 'curious', 'hopeful', 'gentle', 'lighthearted', 'whimsical'],
  },
  {
    id: 'sage',
    gender: 'neutral',
    tone: 'calm',
    keywords: ['wise', 'old', 'ancient', 'elder', 'sage', 'mystic', 'spiritual', 'philosophical', 'serene', 'contemplative', 'scholarly'],
  },
  {
    id: 'fable',
    gender: 'neutral',
    tone: 'dramatic',
    keywords: ['dramatic', 'theatrical', 'expressive', 'charismatic', 'flamboyant', 'trickster', 'cunning', 'mischievous', 'performer', 'storyteller', 'eccentric'],
  },
  {
    id: 'ballad',
    gender: 'neutral',
    tone: 'gentle',
    keywords: ['soft', 'melancholic', 'romantic', 'dreamy', 'poetic', 'sensitive', 'introverted', 'shy', 'quiet', 'tender', 'wistful', 'ethereal'],
  },
];

/**
 * Automatically assigns an OpenAI TTS voice based on character profile.
 * Considers gender, personality traits, role, and speech pattern.
 */
export function autoAssignVoice(character: CharacterEntry): OpenAIVoice {
  const char = character.character || {} as any;
  const { gender, role } = char;
  const personality = char.personality || {} as any;

  // Collect all signals into a keyword bag
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

  // Score each voice profile
  let bestVoice: OpenAIVoice = 'echo'; // default fallback
  let bestScore = -1;

  for (const profile of VOICE_PROFILES) {
    let score = 0;

    // Gender match is a strong signal
    const charGender = (gender || '').toLowerCase();
    if (profile.gender !== 'neutral') {
      if (charGender.includes(profile.gender)) {
        score += 3;
      } else if (charGender && !charGender.includes(profile.gender)) {
        score -= 5; // strong penalty for gender mismatch
      }
    }

    // Keyword matching
    for (const keyword of profile.keywords) {
      if (signalText.includes(keyword)) {
        score += 2;
      }
    }

    // Role-based bonuses
    if (role === 'antagonist' && (profile.id === 'onyx' || profile.id === 'fable')) score += 2;
    if (role === 'protagonist' && (profile.id === 'ash' || profile.id === 'coral' || profile.id === 'nova')) score += 1;
    if (role === 'minor' && profile.id === 'echo') score += 1;

    // Age-based signals
    if (signalText.includes('old') || signalText.includes('elder') || signalText.includes('ancient')) {
      if (profile.id === 'sage' || profile.id === 'onyx') score += 2;
    }
    if (signalText.includes('young') || signalText.includes('child') || signalText.includes('teen')) {
      if (profile.id === 'nova' || profile.id === 'shimmer') score += 2;
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
export function voiceAssignmentReason(character: CharacterEntry, voice: OpenAIVoice): string {
  const profile = VOICE_PROFILES.find(p => p.id === voice);
  if (!profile) return '';

  const traits = character.character?.personality?.traits?.slice(0, 3).join(', ') || 'general personality';
  const gender = character.character?.gender || 'unspecified gender';
  return `${profile.tone} voice for ${gender} character (${traits})`;
}
