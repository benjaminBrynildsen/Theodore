// ========== Auto Voice Assignment ==========
// Maps character personality traits to ElevenLabs TTS voices
// Gender is a hard constraint — male characters ONLY get male/neutral voices, female ONLY get female/neutral
// Age is a soft constraint — we strongly prefer age-appropriate voices but fall back if needed

import type { CharacterEntry } from '../types/canon';
import type { ElevenLabsVoice, AgeCategory, VoiceInfo } from './tts-types';
import { ELEVENLABS_VOICES, DEFAULT_MALE_VOICE, DEFAULT_FEMALE_VOICE, DEFAULT_NEUTRAL_VOICE } from './tts-types';

// Legacy alias
export type OpenAIVoice = ElevenLabsVoice;

interface VoiceProfile {
  id: ElevenLabsVoice;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  age: AgeCategory;
  tone: string;
  accent: string;
  descriptive: string;
  useCase: string;
  description: string;
  keywords: string[];
}

// Voice profiles with keyword associations + rich metadata — all IDs verified against ElevenLabs API (2026-03-12)
const VOICE_PROFILES: VoiceProfile[] = [
  // ──── YOUNG MALE ────
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', gender: 'male', age: 'young', tone: 'neutral', accent: 'american', descriptive: 'energetic', useCase: 'narration', description: 'Young American male, great for energetic and social characters', keywords: ['neutral', 'clear', 'adventurous', 'brave', 'hero', 'protagonist', 'everyman', 'explorer', 'energetic', 'social'] },
  { id: 'SOYHLrjzK2X1ezoPC6cr', name: 'Harry', gender: 'male', age: 'young', tone: 'intense', accent: 'american', descriptive: 'strong', useCase: 'characters', description: 'Intense young voice ideal for fierce, warrior-type characters', keywords: ['fierce', 'warrior', 'intense', 'passionate', 'angry', 'battle', 'fighter', 'rebellious', 'defiant'] },
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', gender: 'male', age: 'young', tone: 'warm', accent: 'american', descriptive: 'casual', useCase: 'conversational', description: 'Casual and easygoing, perfect for approachable male leads', keywords: ['warm', 'kind', 'friendly', 'gentle', 'caring', 'thoughtful', 'romantic', 'earnest', 'sincere', 'charming'] },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', gender: 'male', age: 'young', tone: 'casual', accent: 'american', descriptive: 'friendly', useCase: 'conversational', description: 'Laid-back young voice with an optimistic warmth', keywords: ['casual', 'laid-back', 'humorous', 'witty', 'sarcastic', 'relaxed', 'charming', 'comedic', 'optimistic'] },

  // ──── MIDDLE-AGED MALE ────
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male', age: 'middle', tone: 'deep', accent: 'american', descriptive: 'deep', useCase: 'narration', description: 'Deep authoritative voice, great for commanders and villains', keywords: ['authoritative', 'commanding', 'powerful', 'intimidating', 'stoic', 'serious', 'stern', 'gruff', 'king', 'leader', 'villain', 'dark', 'brooding', 'deep', 'dominant'] },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male', age: 'middle', tone: 'calm', accent: 'british', descriptive: 'classy', useCase: 'narration', description: 'British male with a calm, refined delivery. Great for scholars and diplomats', keywords: ['calm', 'measured', 'refined', 'scholarly', 'intellectual', 'professor', 'diplomatic', 'polished', 'british', 'steady', 'classy', 'elegant'] },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', gender: 'male', age: 'middle', tone: 'deep', accent: 'american', descriptive: 'deep', useCase: 'narration', description: 'Deep resonant voice ideal for narration and storytelling', keywords: ['deep', 'narrative', 'storyteller', 'narrator', 'documentary', 'gravitas', 'solemn', 'comforting', 'resonant'] },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male', age: 'middle', tone: 'authoritative', accent: 'american', descriptive: 'strong', useCase: 'narration', description: 'Authoritative and wise, suited for leaders, commanders, and elder figures', keywords: ['strong', 'documentary', 'authoritative', 'commander', 'general', 'captain', 'leader', 'wise', 'mature', 'elder', 'sage', 'grandfather'] },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', gender: 'male', age: 'middle', tone: 'raspy', accent: 'transatlantic', descriptive: 'intense', useCase: 'characters', description: 'Raspy, husky voice perfect for rogues, mercenaries, and tricksters', keywords: ['hoarse', 'intense', 'gritty', 'warrior', 'battle-scarred', 'mercenary', 'assassin', 'hunter', 'gruff', 'trickster', 'husky'] },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', gender: 'male', age: 'middle', tone: 'casual', accent: 'australian', descriptive: 'casual', useCase: 'conversational', description: 'Australian male with a confident, casual tone', keywords: ['casual', 'easygoing', 'jovial', 'bartender', 'trader', 'merchant', 'confident', 'energetic', 'deep', 'australian'] },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', gender: 'male', age: 'middle', tone: 'smooth', accent: 'american', descriptive: 'smooth', useCase: 'narration', description: 'Smooth polished voice for nobles, aristocrats, and suave characters', keywords: ['smooth', 'trustworthy', 'suave', 'polished', 'refined', 'noble', 'aristocratic', 'dignified', 'charming', 'debonair'] },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'male', age: 'middle', tone: 'casual', accent: 'american', descriptive: 'ground reporter', useCase: 'conversational', description: 'Relaxed resonant voice, good for travelers and folksy characters', keywords: ['laid-back', 'casual', 'resonant', 'relaxed', 'folksy', 'rustic', 'traveler', 'nomad', 'weathered'] },
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', gender: 'male', age: 'middle', tone: 'neutral', accent: 'american', descriptive: 'confident', useCase: 'narration', description: 'Neutral, informative delivery perfect for matter-of-fact characters', keywords: ['neutral', 'informative', 'reporter', 'professional', 'straightforward', 'matter-of-fact', 'reliable', 'soft', 'gentle'] },

  // ──── YOUNG FEMALE ────
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female', age: 'young', tone: 'gentle', accent: 'american', descriptive: 'soft', useCase: 'narration', description: 'Soft and reassuring, suited for sensitive, poetic, or romantic characters', keywords: ['soft', 'melancholic', 'romantic', 'dreamy', 'poetic', 'sensitive', 'introverted', 'shy', 'quiet', 'tender', 'wistful', 'mature', 'reassuring', 'confident'] },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', gender: 'female', age: 'young', tone: 'bright', accent: 'american', descriptive: 'expressive', useCase: 'conversational', description: 'Bright animated voice for cheerful, bubbly, and youthful characters', keywords: ['playful', 'bright', 'warm', 'cheerful', 'optimistic', 'bubbly', 'perky', 'student', 'teen', 'child', 'animated', 'innocent', 'young'] },
  { id: 'hpp4J3VqNfWAUOO0d1Us', name: 'Bella', gender: 'female', age: 'young', tone: 'warm', accent: 'american', descriptive: 'pleasant', useCase: 'narration', description: 'Warm professional voice for nurturing, elegant, and kind characters', keywords: ['professional', 'warm', 'nurturing', 'compassionate', 'elegant', 'graceful', 'kind', 'motherly', 'sweet', 'hospitable'] },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', gender: 'female', age: 'young', tone: 'energetic', accent: 'american', descriptive: 'upbeat', useCase: 'characters', description: 'Energetic spirited voice for adventurous, bold, and assertive characters', keywords: ['enthusiastic', 'quirky', 'energetic', 'adventurous', 'brave', 'spirited', 'passionate', 'impulsive', 'lively', 'assertive', 'fierce', 'bold', 'warrior', 'rebellious'] },

  // ──── MIDDLE-AGED FEMALE ────
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', gender: 'female', age: 'middle', tone: 'warm', accent: 'british', descriptive: 'warm', useCase: 'narration', description: 'British female with a velvety, theatrical quality. Great for wise women and storytellers', keywords: ['storyteller', 'narrator', 'wise', 'expressive', 'dramatic', 'charismatic', 'engaging', 'mother', 'matriarch', 'velvety', 'theatrical', 'witch', 'sorceress', 'eccentric', 'mystical', 'british'] },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', gender: 'female', age: 'middle', tone: 'authoritative', accent: 'british', descriptive: 'confident', useCase: 'narration', description: 'Confident British female for commanding, regal, and powerful characters', keywords: ['authoritative', 'professional', 'polished', 'commanding', 'regal', 'stern', 'judge', 'confident', 'seductive', 'powerful', 'queen', 'empress', 'leader', 'british'] },

  // ──── NEUTRAL / NARRATOR ────
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'neutral', age: 'young', tone: 'dramatic', accent: 'american', descriptive: 'warm', useCase: 'narration', description: 'Professional and expressive, ideal for audiobook narration', keywords: ['dramatic', 'theatrical', 'expressive', 'charismatic', 'flamboyant', 'trickster', 'cunning', 'mischievous', 'performer', 'storyteller', 'eccentric', 'knowledgeable'] },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'neutral', age: 'middle', tone: 'balanced', accent: 'british', descriptive: 'warm', useCase: 'narration', description: 'Warm captivating British storyteller voice', keywords: ['balanced', 'versatile', 'narrator', 'warm', 'engaging', 'professional', 'captivating', 'storyteller', 'british'] },
];

// Common terms that map to male/female
const MALE_TERMS = ['male', 'man', 'boy', 'he', 'him', 'his', 'king', 'prince', 'lord', 'sir', 'father', 'son', 'brother', 'husband', 'mr', 'gentleman'];
const FEMALE_TERMS = ['female', 'woman', 'girl', 'she', 'her', 'queen', 'princess', 'lady', 'dame', 'mother', 'daughter', 'sister', 'wife', 'mrs', 'ms', 'miss'];

// Common gendered first names for fallback detection
const MALE_NAMES = ['james', 'john', 'robert', 'michael', 'william', 'david', 'richard', 'thomas', 'charles', 'daniel', 'matthew', 'anthony', 'mark', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george', 'edward', 'jack', 'henry', 'samuel', 'alexander', 'peter', 'nick', 'marcus', 'victor', 'felix', 'leo', 'max', 'jake', 'luke', 'ben', 'ryan', 'ethan', 'owen', 'eli', 'finn', 'kai', 'cole', 'drake', 'ash', 'rex', 'vince', 'derek', 'grant', 'wade', 'dean', 'blake', 'troy', 'bruce', 'frank', 'ray', 'carl', 'remy', 'axel', 'zane'];
const FEMALE_NAMES = ['mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen', 'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'emily', 'donna', 'michelle', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia', 'diana', 'catherine', 'alice', 'emma', 'olivia', 'sophia', 'ava', 'mia', 'chloe', 'grace', 'lily', 'rose', 'claire', 'ruby', 'ivy', 'luna', 'aria', 'ella', 'maya', 'elena', 'nora', 'vera', 'lena', 'nova', 'faye', 'jade', 'iris', 'elise', 'selena', 'helena', 'aurora', 'vivian'];

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

  // Fallback: check the character's name against common gendered names
  const firstName = (character.name || '').split(/\s+/)[0].toLowerCase();
  if (MALE_NAMES.includes(firstName)) return 'male';
  if (FEMALE_NAMES.includes(firstName)) return 'female';

  return null;
}

/**
 * Resolves a character's age category from their profile.
 * Parses numeric ages, age-range words, and descriptive text.
 */
function resolveAgeCategory(character: CharacterEntry): AgeCategory | null {
  const char = character.character || {} as any;
  const ageField = (char.age || '').toLowerCase().trim();

  // Try to parse a numeric age
  const numMatch = ageField.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num <= 12) return 'child';
    if (num <= 17) return 'teen';
    if (num <= 30) return 'young';
    if (num <= 55) return 'middle';
    return 'old';
  }

  // Check for age descriptors in the age field
  if (/\b(child|kid|little|infant|toddler|baby)\b/.test(ageField)) return 'child';
  if (/\b(teen|teenager|adolescent|youth)\b/.test(ageField)) return 'teen';
  if (/\b(young|young adult|twenties|early thirties)\b/.test(ageField)) return 'young';
  if (/\b(middle.?aged|middle|forties|fifties|mature|adult)\b/.test(ageField)) return 'middle';
  if (/\b(old|elderly|aged|ancient|elder|senior|venerable)\b/.test(ageField)) return 'old';

  // Scan broader character text for age signals
  const textBag = [
    character.description || '',
    char.role || '',
    ...(char.personality?.traits || []),
    char.backstory || '',
  ].join(' ').toLowerCase();

  if (/\b(child|kid|little boy|little girl|infant|toddler)\b/.test(textBag)) return 'child';
  if (/\b(teen|teenager|adolescent|young boy|young girl|schoolboy|schoolgirl|apprentice)\b/.test(textBag)) return 'teen';
  if (/\b(young man|young woman|youthful)\b/.test(textBag)) return 'young';
  if (/\b(elder|elderly|ancient|old man|old woman|grandpa|grandmother|grandfather|grandma|wizard|sage|crone|patriarch|matriarch)\b/.test(textBag)) return 'old';

  return null;
}

/**
 * Automatically assigns an ElevenLabs TTS voice based on character profile.
 * Gender is a HARD constraint — never assigns a male voice to a female character or vice versa.
 * Age is a STRONG preference — prefers age-matching voices but falls back if needed.
 * The narrator voice is excluded so characters always sound distinct from narration.
 */
export function autoAssignVoice(character: CharacterEntry, excludeVoice?: ElevenLabsVoice): ElevenLabsVoice {
  const char = character.character || {} as any;
  const { role } = char;
  const personality = char.personality || {} as any;

  const resolvedGender = resolveGender(character);
  const resolvedAge = resolveAgeCategory(character);

  // Filter voices by gender — hard gate, and exclude narrator voice
  let candidates: VoiceProfile[];
  if (resolvedGender === 'male') {
    candidates = VOICE_PROFILES.filter(p => p.gender === 'male' || p.gender === 'neutral');
  } else if (resolvedGender === 'female') {
    candidates = VOICE_PROFILES.filter(p => p.gender === 'female' || p.gender === 'neutral');
  } else {
    // Unknown gender — use all voices, let keyword/age matching decide
    candidates = [...VOICE_PROFILES];
  }

  // Never assign the narrator's voice to a character
  if (excludeVoice) {
    candidates = candidates.filter(p => p.id !== excludeVoice);
  }

  // Fallback defaults by gender (for unknown, use Daniel — a versatile middle-aged voice)
  const defaultVoice: ElevenLabsVoice = resolvedGender === 'male' ? DEFAULT_MALE_VOICE
    : resolvedGender === 'female' ? DEFAULT_FEMALE_VOICE
    : DEFAULT_MALE_VOICE; // Daniel — better fallback than neutral-only

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

  // Extract accent hints from character description/backstory
  const accentText = [
    character.description || '',
    char.backstory || '',
    char.nationality || '',
    char.origin || '',
    personality.speechPattern || '',
  ].join(' ').toLowerCase();

  const resolvedAccent = detectAccent(accentText);

  // Score each candidate voice on keyword match + age match + accent + personality
  let bestVoice: ElevenLabsVoice = defaultVoice;
  let bestScore = -1;

  for (const profile of candidates) {
    let score = 0;

    // ── Age matching (strong preference) ──
    if (resolvedAge) {
      if (profile.age === resolvedAge) {
        score += 8;
      } else if (isAdjacentAge(profile.age, resolvedAge)) {
        score += 3;
      } else {
        score -= 4;
      }
    }

    // ── Accent matching (strong signal when present) ──
    if (resolvedAccent) {
      if (profile.accent === resolvedAccent) {
        score += 6; // exact accent match is very valuable
      } else if (isRelatedAccent(profile.accent, resolvedAccent)) {
        score += 2; // related accent (e.g. british/australian are both commonwealth)
      }
    }

    // ── Descriptive/personality trait matching ──
    if (profile.descriptive && signalText.includes(profile.descriptive)) {
      score += 3;
    }

    // ── Keyword matching ──
    for (const keyword of profile.keywords) {
      if (signalText.includes(keyword)) {
        score += 2;
      }
    }

    // ── Use case matching ──
    // Prefer 'characters' voices for non-narrator roles, 'narration' for narrators
    if (profile.useCase === 'characters' && role && role !== 'narrator') {
      score += 1;
    }

    // ── Role-based bonuses ──
    if (role === 'antagonist') {
      if (['Adam', 'Callum', 'Harry', 'Alice', 'Lily'].includes(profile.name)) score += 3;
    }
    if (role === 'protagonist') {
      if (['Liam', 'Chris', 'Sarah', 'Laura', 'Bella'].includes(profile.name)) score += 3;
    }
    if (role === 'supporting') {
      if (['Daniel', 'Eric', 'Jessica', 'Bella', 'River'].includes(profile.name)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVoice = profile.id;
    }
  }

  return bestVoice;
}

// Accent terms to detect from character descriptions
const ACCENT_HINTS: Record<string, string[]> = {
  british: ['british', 'english', 'london', 'oxford', 'cambridge', 'uk', 'england', 'scottish', 'welsh', 'posh', 'refined accent', 'queen\'s english', 'cockney', 'received pronunciation'],
  american: ['american', 'usa', 'new york', 'texas', 'southern', 'midwest', 'california', 'boston'],
  australian: ['australian', 'aussie', 'sydney', 'melbourne', 'outback', 'down under'],
  irish: ['irish', 'ireland', 'dublin', 'celtic'],
  indian: ['indian', 'hindi', 'mumbai', 'delhi', 'south asian'],
  transatlantic: ['transatlantic', 'mid-atlantic', 'old hollywood'],
  french: ['french', 'paris', 'parisian'],
  german: ['german', 'berlin', 'bavarian'],
  spanish: ['spanish', 'castilian', 'madrid'],
  italian: ['italian', 'rome', 'milan'],
  russian: ['russian', 'moscow', 'slavic'],
  african: ['african', 'nigerian', 'kenyan', 'south african'],
};

/** Detect accent from character text */
function detectAccent(text: string): string | null {
  for (const [accent, hints] of Object.entries(ACCENT_HINTS)) {
    for (const hint of hints) {
      if (text.includes(hint)) return accent;
    }
  }
  return null;
}

/** Check if two accents are in the same linguistic family */
function isRelatedAccent(a: string, b: string): boolean {
  const families: string[][] = [
    ['british', 'australian', 'transatlantic', 'irish'],
    ['american'],
    ['french', 'spanish', 'italian'],
    ['german', 'russian'],
  ];
  for (const family of families) {
    if (family.includes(a) && family.includes(b)) return true;
  }
  return false;
}

/** Check if two age categories are adjacent (e.g. young/teen, middle/old) */
function isAdjacentAge(a: AgeCategory, b: AgeCategory): boolean {
  const order: AgeCategory[] = ['child', 'teen', 'young', 'middle', 'old'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  return Math.abs(ai - bi) === 1;
}

/**
 * Returns a human-readable reason for why a voice was chosen.
 */
export function voiceAssignmentReason(character: CharacterEntry, voice: ElevenLabsVoice): string {
  const profile = VOICE_PROFILES.find(p => p.id === voice);
  if (!profile) return '';

  const resolvedGender = resolveGender(character);
  const resolvedAge = resolveAgeCategory(character);
  const genderLabel = resolvedGender || 'unspecified gender';
  const ageLabel = resolvedAge || 'unspecified age';
  const traits = character.character?.personality?.traits?.slice(0, 3).join(', ') || 'general personality';
  const accentLabel = profile.accent ? ` ${profile.accent}` : '';
  const descriptiveLabel = profile.descriptive ? `, ${profile.descriptive}` : '';
  return `${profile.name} —${accentLabel} ${profile.tone} ${profile.age} ${profile.gender} voice${descriptiveLabel} for ${ageLabel} ${genderLabel} character (${traits})`;
}

/**
 * Builds VoiceProfiles from dynamically loaded VoiceInfo (e.g., from server API).
 * This allows user-curated ElevenLabs library voices to participate in auto-assignment.
 */
export function buildProfilesFromVoiceInfo(voices: VoiceInfo[]): VoiceProfile[] {
  return voices.map(v => ({
    id: v.id,
    name: v.name,
    gender: v.gender,
    age: v.age,
    tone: v.tone,
    accent: v.accent || 'american',
    descriptive: v.descriptive || '',
    useCase: v.useCase || 'narration',
    description: v.description || v.desc,
    // Auto-generate keywords from description + tone + descriptive
    keywords: [
      v.tone,
      v.descriptive || '',
      ...(v.description || v.desc || '').toLowerCase().split(/[\s,.;]+/).filter(w => w.length > 3),
    ].filter(Boolean),
  }));
}

/**
 * Auto-assign using a custom set of voices (e.g., from the user's ElevenLabs library).
 * Falls back to the built-in VOICE_PROFILES if no custom voices provided.
 */
export function autoAssignVoiceFromPool(
  character: CharacterEntry,
  voicePool: VoiceInfo[],
  excludeVoice?: ElevenLabsVoice,
): ElevenLabsVoice {
  if (voicePool.length === 0) return autoAssignVoice(character, excludeVoice);

  // Temporarily swap VOICE_PROFILES with dynamic pool
  const dynamicProfiles = buildProfilesFromVoiceInfo(voicePool);
  return autoAssignFromProfiles(character, dynamicProfiles, excludeVoice);
}

/** Core assignment logic extracted for use with any profile set */
function autoAssignFromProfiles(
  character: CharacterEntry,
  profiles: VoiceProfile[],
  excludeVoice?: ElevenLabsVoice,
): ElevenLabsVoice {
  const char = character.character || {} as any;
  const { role } = char;
  const personality = char.personality || {} as any;

  const resolvedGender = resolveGender(character);
  const resolvedAge = resolveAgeCategory(character);

  let candidates: VoiceProfile[];
  if (resolvedGender === 'male') {
    candidates = profiles.filter(p => p.gender === 'male' || p.gender === 'neutral');
  } else if (resolvedGender === 'female') {
    candidates = profiles.filter(p => p.gender === 'female' || p.gender === 'neutral');
  } else {
    candidates = [...profiles];
  }

  if (excludeVoice) {
    candidates = candidates.filter(p => p.id !== excludeVoice);
  }

  const defaultVoice: ElevenLabsVoice = resolvedGender === 'male' ? DEFAULT_MALE_VOICE
    : resolvedGender === 'female' ? DEFAULT_FEMALE_VOICE
    : DEFAULT_MALE_VOICE;

  if (candidates.length === 0) return defaultVoice;

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

  const accentText = [
    character.description || '',
    char.backstory || '',
    char.nationality || '',
    char.origin || '',
    personality.speechPattern || '',
  ].join(' ').toLowerCase();

  const resolvedAccent = detectAccent(accentText);

  let bestVoice: ElevenLabsVoice = defaultVoice;
  let bestScore = -1;

  for (const profile of candidates) {
    let score = 0;

    if (resolvedAge) {
      if (profile.age === resolvedAge) score += 8;
      else if (isAdjacentAge(profile.age, resolvedAge)) score += 3;
      else score -= 4;
    }

    if (resolvedAccent) {
      if (profile.accent === resolvedAccent) score += 6;
      else if (isRelatedAccent(profile.accent, resolvedAccent)) score += 2;
    }

    if (profile.descriptive && signalText.includes(profile.descriptive)) score += 3;

    for (const keyword of profile.keywords) {
      if (signalText.includes(keyword)) score += 2;
    }

    if (profile.useCase === 'characters' && role && role !== 'narrator') score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = profile.id;
    }
  }

  return bestVoice;
}

/** Exported for use in other modules */
export { resolveGender, resolveAgeCategory };
