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
  // Common English words that get capitalized at sentence starts
  'he', 'she', 'they', 'them', 'we', 'you', 'it', 'i',
  'his', 'her', 'my', 'your', 'our', 'their', 'its',
  'this', 'that', 'these', 'those', 'there', 'here', 'where', 'when',
  'who', 'what', 'which', 'how', 'why',
  'only', 'just', 'even', 'still', 'also', 'too', 'very', 'quite',
  'not', 'no', 'yes', 'maybe', 'perhaps', 'never', 'always',
  'good', 'bad', 'great', 'much', 'more', 'most', 'less', 'least',
  'first', 'last', 'next', 'new', 'old', 'other', 'another',
  'some', 'any', 'all', 'every', 'each', 'both', 'few', 'many',
  'plus', 'minus', 'part', 'half', 'whole',
  'now', 'then', 'soon', 'later', 'once', 'again',
  'up', 'down', 'out', 'in', 'off', 'on', 'back', 'away',
  'well', 'right', 'left', 'long', 'far', 'close', 'near',
  'something', 'nothing', 'everything', 'anything', 'someone', 'everyone',
  'nobody', 'everybody', 'somewhere', 'anywhere', 'nowhere',
  'could', 'would', 'should', 'might', 'must', 'shall', 'will',
  'been', 'being', 'had', 'has', 'have', 'did', 'does', 'was', 'were',
  'said', 'asked', 'told', 'replied', 'thought', 'knew', 'felt', 'looked',
  'got', 'made', 'came', 'went', 'took', 'gave', 'saw', 'heard',
  'enough', 'almost', 'already', 'though', 'although', 'however',
  'but', 'and', 'or', 'so', 'yet', 'nor', 'for',
  'with', 'from', 'into', 'about', 'after', 'before', 'between', 'through',
  'above', 'below', 'over', 'under', 'around', 'along',
  'sure', 'like', 'way', 'thing', 'things', 'kind', 'sort', 'lot',
  'time', 'day', 'night', 'morning', 'evening', 'afternoon',
  'year', 'years', 'month', 'months', 'week', 'weeks', 'hour', 'hours',
  'man', 'woman', 'boy', 'girl', 'people', 'person', 'child', 'children',
  'hand', 'head', 'face', 'eye', 'eyes', 'voice', 'door', 'room',
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
  type: 'character' | 'location' | 'system' | 'artifact' | 'media',
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
