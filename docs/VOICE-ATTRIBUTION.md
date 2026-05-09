# Voice Attribution — Spec & Contract

> **This doc is the source of truth.** Both `theodore-web/server/voice-attribution.ts` and the eventual `theodore-mobile-app` port implement what's defined here. **Any tweak made during testing MUST be reflected in this file** so the two apps don't drift.

---

## Why this exists

Theodore's multi-voice audiobook generation needs to know which character is speaking each quoted line so the right TTS voice plays each segment. The original implementation (regex + heuristics in `tts.ts:splitProseIntoSegments`) attributes correctly when prose has explicit `Mira said,` patterns nearby — but breaks down on:

- Back-and-forth banter where speakers alternate without attribution clauses
- Action-beat-only attribution (`Mira pushed the door. "Hello?"`)
- Pronoun resolution across long character introductions (`he said` when both characters are male)
- Internal thoughts in quotes
- Letters / journal entries quoted at length

When attribution returns null, the dialogue line falls through to the **narrator** voice — which is exactly the user-visible bug ("the narrator often voices things, it's confusing").

The fix is a dedicated post-generation attribution pass with Opus 4.6 + a strict validator, cached per chapter.

---

## Contract (TypeScript)

```ts
type AttributionSegmentType = 'narration' | 'dialogue';

interface AttributionSegment {
  type: AttributionSegmentType;
  text: string;          // verbatim slice of the prose
  speaker?: string;      // canonical character name; required for type='dialogue'
}

interface CharacterRosterEntry {
  canonName: string;     // matches canon_entries.name in the DB
  aliases?: string[];    // nicknames, titled forms ("Mr. Moreno"), first-name only
  gender?: 'male' | 'female' | '';
}

interface AttributeOptions {
  prose: string;
  characters: CharacterRosterEntry[];
  apiKey: string;
  model?: string;        // default 'claude-opus-4-6'
  maxAttempts?: number;  // default 3
  timeoutMs?: number;    // default 60_000
}

interface AttributeResult {
  segments: AttributionSegment[];
  status: 'ok' | 'needs-review';
  attempts: number;
  model: string;
  unattributedQuotes?: string[];  // populated only on 'needs-review'
  tokensIn: number;
  tokensOut: number;
}

async function attributeChapter(opts: AttributeOptions): Promise<AttributeResult>;
```

---

## Invariants (the model MUST satisfy these)

1. **Every quoted line is attributed.** Every `"..."` or `“...”` substring in the prose appears as a `type: 'dialogue'` segment with a non-empty `speaker`. No "unknown", no narrator-as-speaker.
2. **Speaker uses canonical name.** The model picks from the provided roster's `canonName` values verbatim. Aliases and nicknames are inputs only — never outputs.
3. **Lossless concatenation.** Joining all `segment.text` in order reproduces the input prose character-for-character. No paraphrasing, no summarizing, no reordering.
4. **Quote ownership is exclusive.** Only `type: 'dialogue'` segments contain the quotation marks. Adjacent attribution clauses (`she said`) belong in `type: 'narration'`.

---

## System prompt (verbatim)

```
You are a strict dialogue attribution engine for an audiobook generator.

Given a chapter of prose and a roster of named characters, you split the prose into NARRATION and DIALOGUE segments and attribute every dialogue line to a character.

INVARIANTS — you MUST satisfy all of these:
1. Every quoted line ("..." or curly-quoted "...") MUST be a dialogue segment with a non-empty speaker. No "unknown", no narrator.
2. Speakers MUST be selected from the provided character roster (use canonName verbatim). Never invent a name, never use an alias as the speaker value.
3. Concatenating all segment.text in order MUST reproduce the input prose verbatim, character-for-character (same whitespace, same punctuation). No paraphrasing, summarizing, or reordering.
4. NARRATION segments include all non-dialogue prose: descriptions, action beats, internal thoughts not in quotes, scene-setting.
5. DIALOGUE segments contain ONLY the spoken text including the surrounding quotation marks. Adjacent attribution clauses ("she said") belong in NARRATION, not DIALOGUE.

ATTRIBUTION RULES (apply in order):
- Direct attribution: `"text," Mira said.` → speaker is Mira.
- Action beat attribution: `Mira pushed the door. "Hello?"` → speaker is Mira (the actor of the immediately preceding beat).
- Conversational continuation: in alternating dialogue with no action beats, attribute by turn-taking — track who spoke last and alternate to the other party. Reset on a new action beat.
- Pronoun resolution ("he said" / "she said"): use the roster's gender field; if multiple matching-gender characters are in the scene, pick the most recent named speaker of that gender.
- Internal thought rendered with quotes (`"What was that?" she wondered`) → still attribute to the thinking character, NOT narrator.
- Letters / journal entries quoted at length → attribute to the writer of the document (named in the surrounding narration).
- Sung lyrics / chants in quotes → attribute to whoever is singing, named in nearby narration.
- If genuinely ambiguous after all rules: pick the most recently named character of the right gender. NEVER leave speaker null/empty.

OUTPUT — STRICT JSON, no prose outside the JSON, no markdown code fences:
{
  "segments": [
    { "type": "narration", "text": "..." },
    { "type": "dialogue", "text": "\"...\"", "speaker": "CharacterCanonName" }
  ]
}

Self-check before responding: does every quoted line in the input have a corresponding dialogue segment with a speaker? If not, fix it before you reply.
```

---

## User message (initial pass)

```
CHARACTER ROSTER:
[<roster JSON>]

CHAPTER PROSE (verbatim — preserve all whitespace and punctuation in NARRATION segments):
"""
<prose>
"""
```

## User message (retry pass)

```
Your previous output left N quoted line(s) unattributed:
  • <quote 1>
  • <quote 2>
  ...

Re-emit the FULL segments array. Every quoted line must appear as a dialogue segment with a non-empty speaker chosen from the roster. Pay special attention to the missed lines above — they're often quick exchanges where turn-taking was lost or pronoun resolution failed.

CHARACTER ROSTER:
[<roster JSON>]

CHAPTER PROSE:
"""
<prose>
"""
```

---

## Validation algorithm

```
expectedQuotes = extract every "..." | “...” substring from raw prose,
                 normalize (strip outer quotes, collapse whitespace, lowercase)

for attempt in 1..maxAttempts:
    response = call Opus with the user message for this attempt
    segments = parse JSON; bail if invalid (counts as a failed attempt)
    coveredQuotes = { normalize(seg.text) for seg in segments
                      if seg.type == 'dialogue' and seg.speaker is non-empty }
    missing = expectedQuotes - coveredQuotes
    if missing is empty:
        return { segments, status: 'ok', attempts: attempt }

# Exhausted retries
return { segments: lastValid, status: 'needs-review', unattributedQuotes: missing }
```

**Fallback behavior** (caller's responsibility): on `status: 'needs-review'`, the audio-generation pipeline should fall back to the existing regex splitter so audio still generates — just less reliably. The chapter is flagged for manual review in the admin UI.

---

## Model + cost

- **Model:** `claude-opus-4-6` (per Ben 2026-05-09; reasoning capacity matters more than cost for accuracy here).
- **Temperature:** `0.1` (attribution is deterministic; low temp tightens behavior).
- **max_tokens:** `16000` (output JSON is roughly the same size as input prose).
- **Per-chapter cost:** ~$0.05 (5k input + 5k output tokens × Opus 4.6 pricing). Multi-pass averages ~$0.07.
- **Latency:** 5–15 seconds for the first attribution pass on a typical 3000-word chapter.

---

## Caching strategy

Result lives in `chapters.voiceAttribution` (jsonb). Cache shape:

```json
{
  "segments": [...],
  "status": "ok" | "needs-review",
  "attempts": 1,
  "model": "claude-opus-4-6",
  "attributedAt": "2026-05-09T17:00:00Z",
  "unattributedQuotes": [...]   // only present on needs-review
}
```

**When attribution runs:**

- **Lazy** — on first audio-gen request for a chapter where `voiceAttribution IS NULL`. Avoids cost for chapters that never get narrated.
- **Forced** — admin "Re-attribute chapter" action OR when `chapters.prose` has been edited since `attributedAt` (cache stale).

**When attribution does NOT run:**

- When the project has 0 characters in canon (no roster → fallback splitter only).
- When `MULTI_VOICE_ENABLED` is false on the platform (web ships with attribution but uses single-narrator playback; mobile uses attribution + multi-voice). Attribution still runs because cleaner narration/dialogue separation benefits single-voice rendering too (paced reads, tone shifts).

---

## Mobile port notes

The module file (`server/voice-attribution.ts`) is intentionally portable:

- Uses `fetch` — works in React Native.
- No Node-only imports (`crypto`, `fs`, etc.).
- No DB / Express coupling — pure function.
- Returns plain data; caller handles caching.

**To port:**

1. Copy `voice-attribution.ts` into the mobile codebase (e.g. `theodore-mobile-app/src/lib/voice-attribution.ts`). No code changes required.
2. Mobile typically reads cached attribution from the chapter row already (server returns it on chapter fetch). If mobile needs to *trigger* attribution itself, it calls `attributeChapter(...)` with the same shape.
3. Recommended: mobile reads the cache; the SERVER does the actual attribution call. This way Opus calls happen in one place, billing is consistent, and the cache is shared. Mobile only re-implements the function if mobile-only attribution is required (rare).

---

## Change log

> **Update this section every time the prompt, validation, or caching strategy changes.** The mobile port reads from here.

| Date | Change | Why |
|------|--------|-----|
| 2026-05-09 | Initial implementation. Opus 4.6, max 3 attempts, strict every-quote-attributed invariant, lazy attribution on first audio gen. | Ben's spec — current regex splitter mis-routes dialogue to narrator. |
