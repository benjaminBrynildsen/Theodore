const ARTICLE_PREFIX = /^(?:the|a|an)\s+/i;

const TIME_WORDS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'spring', 'summer', 'autumn', 'fall', 'winter',
  'today', 'tomorrow', 'yesterday', 'midnight', 'noon',
]);

const GENERIC_ROLE_TOKENS = new Set([
  'detective', 'inspector', 'officer', 'agent', 'captain', 'commander',
  'doctor', 'dr', 'professor', 'teacher', 'king', 'queen', 'prince', 'princess',
  'lord', 'lady', 'sir', 'madam', 'duke', 'duchess', 'chief', 'guard', 'guardian',
  'hunter', 'warden', 'pilot', 'narrator', 'witness', 'gardener', 'archivist',
  'priest', 'monk',
]);

const ALIAS_PRONE_ROLE_TOKENS = new Set([
  'detective', 'inspector', 'officer', 'agent', 'captain', 'commander',
  'doctor', 'dr', 'professor', 'chief', 'warden', 'pilot',
]);

const NON_ENTITY_SINGLE_TOKENS = new Set([
  'theodore', 'ai',
  'story', 'novel', 'book', 'chapter', 'chapters',
  'project', 'plan', 'outline', 'outlines', 'metadata',
  'settings', 'conversation',
  'title', 'premise', 'length', 'tone', 'pacing',
  'character', 'characters', 'location', 'locations', 'system', 'systems',
  'artifact', 'artifacts', 'event', 'events',
  'question', 'questions', 'notes', 'note',
  ...Array.from(TIME_WORDS),
]);

const NON_ENTITY_TAIL_TOKENS = new Set([
  'question', 'questions', 'note', 'notes',
  'outline', 'outlines', 'plan', 'plans',
  'metadata', 'detail', 'details', 'info', 'information',
  'prompt', 'prompts',
  'draft', 'drafts',
  'chapter', 'chapters',
  'scene', 'scenes',
]);

function normalizeToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/(^[^a-z-]+|[^a-z-]+$)/g, '')
    .replace(/(?:'s|s')$/, '');
}

function normalizedTokens(name: string): string[] {
  return sanitizeEntityName(name)
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

export function sanitizeEntityName(raw: string): string {
  return String(raw || '')
    .replace(/[’]/g, "'")
    .replace(/^[\s"'`([{]+|[\s"'`)\]}.,!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(ARTICLE_PREFIX, '')
    .trim();
}

export function normalizeEntityKey(name: string): string {
  return normalizedTokens(name).join(' ');
}

export function normalizeCharacterKey(name: string): string {
  const tokens = normalizedTokens(name);
  if (tokens.length > 1 && GENERIC_ROLE_TOKENS.has(tokens[0])) {
    tokens.shift();
  }
  return tokens.join(' ');
}

export function normalizeEntityKeyForType(
  type: 'character' | 'location' | 'system' | 'artifact',
  name: string,
): string {
  if (type === 'character') return normalizeCharacterKey(name) || normalizeEntityKey(name);
  return normalizeEntityKey(name);
}

export function isGenericRoleCharacterName(name: string): boolean {
  const tokens = normalizedTokens(name);
  return tokens.length === 1 && GENERIC_ROLE_TOKENS.has(tokens[0]);
}

export function getGenericRoleToken(name: string): string | null {
  const tokens = normalizedTokens(name);
  if (tokens.length === 1 && GENERIC_ROLE_TOKENS.has(tokens[0])) return tokens[0];
  return null;
}

export function getLeadingRoleToken(name: string): string | null {
  const tokens = normalizedTokens(name);
  if (tokens.length > 1 && GENERIC_ROLE_TOKENS.has(tokens[0])) return tokens[0];
  return null;
}

export function isAliasProneRoleToken(role: string): boolean {
  return ALIAS_PRONE_ROLE_TOKENS.has(role.toLowerCase());
}

export function isLikelyEntityNoise(name: string): boolean {
  const sanitized = sanitizeEntityName(name);
  if (!sanitized) return true;

  const key = normalizeEntityKey(sanitized);
  if (!key) return true;
  if (NON_ENTITY_SINGLE_TOKENS.has(key)) return true;
  if (TIME_WORDS.has(key)) return true;

  const tokens = key.split(/\s+/);
  const tail = tokens[tokens.length - 1];
  if (NON_ENTITY_TAIL_TOKENS.has(tail)) return true;

  if (/(?:'s|s')\s+(?:question|questions|note|notes|outline|outlines|plan|plans|metadata|chapter|chapters|scene|scenes|draft|drafts)\b/i.test(sanitized)) {
    return true;
  }
  if (/^(?:chapter|book|novel)\s+\d+$/i.test(sanitized)) {
    return true;
  }

  return false;
}

export function isLikelyCharacterNoise(name: string): boolean {
  if (isLikelyEntityNoise(name)) return true;
  const tokens = normalizeEntityKey(name).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  return NON_ENTITY_TAIL_TOKENS.has(tokens[tokens.length - 1]);
}
