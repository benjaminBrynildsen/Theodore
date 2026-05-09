// ============================================================================
// Voice Attribution — strict speaker-detection pass for multi-voice audiobook
// generation.
//
// PORTABILITY: This module is written to be copy-pasteable into the mobile
// app (theodore-mobile-app) with minimal changes — it has no Node-only
// imports, no DB ops, no Express coupling. Inputs are plain data; output is
// a Result. Caching and persistence are handled by callers.
//
// The full contract, prompt, and rationale live in docs/VOICE-ATTRIBUTION.md.
// Any tweak to behavior MUST be reflected in the doc so mobile and web stay
// in sync. The spec doc is the source of truth — this code implements it.
// ============================================================================

export type AttributionSegmentType = 'narration' | 'dialogue';

export interface AttributionSegment {
  type: AttributionSegmentType;
  text: string;
  /** Canonical character name (matches the input roster). Required for type='dialogue'. */
  speaker?: string;
}

export interface CharacterRosterEntry {
  /** Canonical name as stored in canon_entries.name. The model returns this verbatim. */
  canonName: string;
  /** Aliases / nicknames / titled forms the model may have used in the prose. */
  aliases?: string[];
  /** 'male' | 'female' | '' — used for he/she pronoun resolution. */
  gender?: string;
}

export interface AttributeOptions {
  /** The chapter prose to attribute. Must be the exact text the audiobook will narrate. */
  prose: string;
  /** Character roster for this chapter (typically pulled from project canon). */
  characters: CharacterRosterEntry[];
  /** Anthropic API key. Caller must supply — no default for portability. */
  apiKey: string;
  /** Model ID. Defaults to claude-opus-4-6 (the production target). Override for cheaper runs. */
  model?: string;
  /** Max retry passes when validation fails. Default 3. */
  maxAttempts?: number;
  /** Timeout per Anthropic call in ms. Default 60_000. */
  timeoutMs?: number;
}

export interface AttributeResult {
  segments: AttributionSegment[];
  /** 'ok' = every quoted line attributed; 'needs-review' = exhausted retries with misses. */
  status: 'ok' | 'needs-review';
  /** Number of Anthropic calls made (1 = first pass succeeded; 2-3 = retries needed). */
  attempts: number;
  /** Model used. */
  model: string;
  /** Quotes that remained unattributed after all retries (only populated if status='needs-review'). */
  unattributedQuotes?: string[];
  /** Total input + output tokens billed across all attempts. */
  tokensIn: number;
  tokensOut: number;
}

const DEFAULT_MODEL = 'claude-opus-4-6';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 60_000;

// ============================================================================
// SYSTEM PROMPT
// ============================================================================
// Source-of-truth lives in docs/VOICE-ATTRIBUTION.md. Keep this string in sync.

const SYSTEM_PROMPT = `You are a strict dialogue attribution engine for an audiobook generator.

Given a chapter of prose and a roster of named characters, you split the prose into NARRATION and DIALOGUE segments and attribute every dialogue line to a character.

INVARIANTS — you MUST satisfy all of these:
1. Every quoted line ("..." or curly-quoted "...") MUST be a dialogue segment with a non-empty speaker. No "unknown", no narrator.
2. Speakers MUST be selected from the provided character roster (use canonName verbatim). Never invent a name, never use an alias as the speaker value.
3. Concatenating all segment.text in order MUST reproduce the input prose verbatim, character-for-character (same whitespace, same punctuation). No paraphrasing, summarizing, or reordering.
4. NARRATION segments include all non-dialogue prose: descriptions, action beats, internal thoughts not in quotes, scene-setting.
5. DIALOGUE segments contain ONLY the spoken text including the surrounding quotation marks. Adjacent attribution clauses ("she said") belong in NARRATION, not DIALOGUE.

ATTRIBUTION RULES (apply in order):
- Direct attribution: \`"text," Mira said.\` → speaker is Mira.
- Action beat attribution: \`Mira pushed the door. "Hello?"\` → speaker is Mira (the actor of the immediately preceding beat).
- Conversational continuation: in alternating dialogue with no action beats, attribute by turn-taking — track who spoke last and alternate to the other party. Reset on a new action beat.
- Pronoun resolution ("he said" / "she said"): use the roster's gender field; if multiple matching-gender characters are in the scene, pick the most recent named speaker of that gender.
- Internal thought rendered with quotes (\`"What was that?" she wondered\`) → still attribute to the thinking character, NOT narrator.
- Letters / journal entries quoted at length → attribute to the writer of the document (named in the surrounding narration).
- Sung lyrics / chants in quotes → attribute to whoever is singing, named in nearby narration.
- If genuinely ambiguous after all rules: pick the most recently named character of the right gender. NEVER leave speaker null/empty.

OUTPUT — STRICT JSON, no prose outside the JSON, no markdown code fences:
{
  "segments": [
    { "type": "narration", "text": "..." },
    { "type": "dialogue", "text": "\\"...\\"", "speaker": "CharacterCanonName" }
  ]
}

Self-check before responding: does every quoted line in the input have a corresponding dialogue segment with a speaker? If not, fix it before you reply.`;

// ============================================================================
// PUBLIC API
// ============================================================================

export async function attributeChapter(opts: AttributeOptions): Promise<AttributeResult> {
  const model = opts.model || DEFAULT_MODEL;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  if (!opts.prose || !opts.prose.trim()) {
    return { segments: [], status: 'ok', attempts: 0, model, tokensIn: 0, tokensOut: 0 };
  }
  if (!opts.apiKey) throw new Error('attributeChapter: apiKey required');

  const expectedQuotes = extractQuotedLines(opts.prose);

  let lastSegments: AttributionSegment[] = [];
  let totalIn = 0;
  let totalOut = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const userMessage = attempt === 1
      ? buildInitialUserMessage(opts.prose, opts.characters)
      : buildRetryUserMessage(opts.prose, opts.characters, lastSegments, missing(expectedQuotes, lastSegments));

    const r = await callAnthropic({
      model,
      apiKey: opts.apiKey,
      system: SYSTEM_PROMPT,
      user: userMessage,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    totalIn += r.tokensIn;
    totalOut += r.tokensOut;

    const parsed = parseSegments(r.text);
    if (!parsed) {
      // Couldn't even parse JSON — try again from scratch.
      lastSegments = [];
      continue;
    }
    lastSegments = parsed;

    const stillMissing = missing(expectedQuotes, lastSegments);
    if (stillMissing.length === 0) {
      return {
        segments: lastSegments,
        status: 'ok',
        attempts: attempt,
        model,
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }
  }

  // Exhausted retries with at least one quote unattributed.
  return {
    segments: lastSegments,
    status: 'needs-review',
    attempts: maxAttempts,
    model,
    unattributedQuotes: missing(expectedQuotes, lastSegments).slice(0, 20),
    tokensIn: totalIn,
    tokensOut: totalOut,
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Extract every quoted dialogue line from raw prose. Handles straight (") and
 * curly (“”) quotes. Excludes single-character quotes (likely
 * apostrophes mis-detected) and trims whitespace inside.
 */
export function extractQuotedLines(prose: string): string[] {
  const out: string[] = [];
  // Both straight and curly. Quote pair must be on the same logical line for
  // sanity (newline ends a quote — long quoted speeches should still be one
  // pair on one line in the prose Theodore generates).
  const re = /[“"]([^”"\n]{1,2000})[”"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prose)) !== null) {
    const inner = m[1].trim();
    if (inner.length < 2) continue; // skip stray single-char quotes
    out.push(normalizeQuoted(m[0]));
  }
  return out;
}

/**
 * Normalize a quoted string for fuzzy matching: strip outer quotes (any kind),
 * collapse whitespace, lowercase, trim. Two quoted lines that differ only in
 * smart-vs-straight quotes or whitespace are considered the same.
 */
function normalizeQuoted(s: string): string {
  return s
    .replace(/^[“"]/, '')
    .replace(/[”"]$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Returns quotes from `expected` that are NOT covered by any dialogue segment in `segments`. */
function missing(expected: string[], segments: AttributionSegment[]): string[] {
  const covered = new Set<string>();
  for (const s of segments) {
    if (s.type !== 'dialogue' || !s.speaker || !s.speaker.trim()) continue;
    covered.add(normalizeQuoted(s.text));
  }
  return expected.filter((q) => !covered.has(q));
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildInitialUserMessage(prose: string, characters: CharacterRosterEntry[]): string {
  return [
    `CHARACTER ROSTER:`,
    JSON.stringify(characters, null, 2),
    ``,
    `CHAPTER PROSE (verbatim — preserve all whitespace and punctuation in NARRATION segments):`,
    `"""`,
    prose,
    `"""`,
  ].join('\n');
}

function buildRetryUserMessage(
  prose: string,
  characters: CharacterRosterEntry[],
  prevSegments: AttributionSegment[],
  missedQuotes: string[],
): string {
  return [
    `Your previous output left ${missedQuotes.length} quoted line(s) unattributed:`,
    ...missedQuotes.slice(0, 30).map((q) => `  • ${q}`),
    ``,
    `Re-emit the FULL segments array. Every quoted line must appear as a dialogue segment with a non-empty speaker chosen from the roster. Pay special attention to the missed lines above — they're often quick exchanges where turn-taking was lost or pronoun resolution failed.`,
    ``,
    `CHARACTER ROSTER:`,
    JSON.stringify(characters, null, 2),
    ``,
    `CHAPTER PROSE:`,
    `"""`,
    prose,
    `"""`,
  ].join('\n');
}

// ============================================================================
// JSON PARSING (tolerant of code-fence wrapping, leading/trailing whitespace)
// ============================================================================

function parseSegments(raw: string): AttributionSegment[] | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let obj: any;
  try { obj = JSON.parse(cleaned); } catch { return null; }
  if (!obj || !Array.isArray(obj.segments)) return null;

  const out: AttributionSegment[] = [];
  for (const s of obj.segments) {
    if (!s || (s.type !== 'narration' && s.type !== 'dialogue')) continue;
    if (typeof s.text !== 'string') continue;
    out.push({
      type: s.type,
      text: s.text,
      speaker: s.type === 'dialogue' && typeof s.speaker === 'string' && s.speaker.trim()
        ? s.speaker.trim()
        : undefined,
    });
  }
  return out;
}

// ============================================================================
// ANTHROPIC CALL (portable — uses fetch, no Node-specific imports)
// ============================================================================

interface AnthropicCall {
  model: string;
  apiKey: string;
  system: string;
  user: string;
  timeoutMs: number;
}
interface AnthropicResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

async function callAnthropic(opts: AnthropicCall): Promise<AnthropicResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 16_000, // chapters can be long; output JSON ~= input prose size
        temperature: 0.1,   // attribution is a deterministic task, low temp
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`Anthropic ${r.status}: ${body.slice(0, 300)}`);
    }
    const json = (await r.json()) as any;
    const text = json?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic returned empty content');
    return {
      text: String(text),
      tokensIn: Number(json?.usage?.input_tokens || 0),
      tokensOut: Number(json?.usage?.output_tokens || 0),
    };
  } finally {
    clearTimeout(timer);
  }
}
