# Multi-Voice Narration — Theodore (Web + Mobile)

This is the single source of truth for multi-voice audiobook narration across
both Theodore platforms. When tuning either client, update this doc first and
keep both `theodore-web/src/lib/character-voices.ts` and
`theodore-mobile-app/lib/character-voices.ts` in sync.

Last revision: 2026-05-11 (Phase 3 — expanded voice library).

---

## What it does

When multi-voice is on for a project, each named character speaks with their
own dedicated Grok TTS voice. The narrator handles all prose, the protagonist
gets a unique voice, antagonists and supporting characters get their own, and
even side characters can be voiced — we now have enough voices in the xAI
library that most novels won't run out.

When multi-voice is off (or the user is on the free tier), the narrator reads
everything in a single voice.

---

## Tier gating

Multi-voice is a paid feature. Available to **Writer ($10/mo) and up**:

| Tier | Multi-voice |
|------|-------------|
| Free | ❌ Single voice only |
| Writer | ✅ |
| Author | ✅ |
| Studio | ✅ |
| Publisher | ✅ |

Enforced server-side in `theodore-web/server/tts.ts` — any client request with
`multiVoice: true` from a user whose `user.plan` is not a paid tier
(`isPaidPlanTier()` returns false) is rejected with `402 Payment Required` and
an `error` of `multi_voice_requires_paid_tier`. The client is expected to gate
the UI but the server is the source of truth.

---

## Voice library — 17 Grok voices

All Grok TTS, all English (the 5 originals are multilingual but used as
English here). Source of truth for IDs/names/genders lives in
`theodore-web/server/tts.ts:GROK_VOICES`.

### Multilingual originals (5)

| Voice | ID | Gender | Description |
|-------|-----|--------|-------------|
| Leo | `grok:leo` | male | Authoritative — **default narrator + fallback** |
| Rex | `grok:rex` | male | Confident & clear |
| Sal | `grok:sal` | male | Smooth & grounded |
| Eve | `grok:eve` | female | Energetic & bright |
| Ara | `grok:ara` | female | Warm & inviting |

### Library voices (12, English-only subset)

| Voice | ID | Gender | Accent | Description |
|-------|-----|--------|--------|-------------|
| Liam | `grok:6a41d324` | male | en-US | Steady |
| Emma | `grok:d11249e6` | female | en-US | Mature & wise |
| Henry | `grok:f15c6a6a` | male | en-GB | Grounded |
| Olivia | `grok:bedd6226` | female | en-GB | Young & bright |
| Sean | `grok:a7b78b05` | male | en-IE | Warm |
| Niamh | `grok:355dca53` | female | en-IE | Lyrical |
| Marc | `grok:5d695b41` | male | en-ZA | Measured |
| Thandi | `grok:135ff7ec` | female | en-ZA | Warm |
| Daniel | `grok:96819d0bd28d` | male | en | Clear |
| James | `grok:78a495fdbb39` | male | en | Youthful |
| Grace | `grok:f8cf5c2c78d4` | female | en | Young & bright |
| Claire | `grok:79f3a8b96d43` | female | en | Poised |

Voice IDs returned by `GET https://api.x.ai/v1/tts/voices` (filtered to
`language` starting with `en`). xAI publishes 80+ voices across 28 languages —
expand the English subset here only when adding new English variants.

---

## Voice pools

Two ordered gender pools. Order = assignment priority — character ranked #1 in
a gender gets pool index 0, #2 gets pool index 1, and so on. We intentionally
put the multilingual originals first because Phase-1 projects (mobile, pre
2026-05) were assigned only those — keeping them at the head of the pool means
existing audiobooks keep their original voices on re-render.

**Male pool (8):** Rex, Sal, Henry, Liam, Sean, Marc, Daniel, James

**Female pool (8):** Eve, Ara, Olivia, Emma, Niamh, Thandi, Grace, Claire

**Narrator:** Leo. Also the fallback for:
- Any character ranked beyond pool index 7 in their gender.
- Any character whose gender is `neutral` (or unknown).
- All non-named-character prose (narration, action beats, attribution).

Why fall back to narrator instead of wrapping the pool? With 8 slots per
gender (16 named characters total), almost no novel exhausts the pool. When it
does, the most important character should NOT share their voice with a deep
side character — listener confusion would be worse than a few side characters
sharing the narrator's voice.

---

## Importance ranking

Determines which character gets pool index 0 (most distinctive voice) vs. n.

### Primary signal — Haiku `mainCharacter` flag

During outline extraction (ImagineChat → canon seeding), Haiku stamps each
character with:
- `mainCharacter: boolean` — true for protagonist/antagonist/supporting roles
- `gender: 'male' | 'female' | 'neutral'`

Both persist onto the canon entry's `data` jsonb blob.

For projects with this signal, ranking is:
1. Filter to `mainCharacter: true`.
2. Sort by canon array order (creation order ≈ Haiku's importance order).
3. Split by gender, take top 8 of each pool.

### Legacy fallback — role-based + dialogue counting

Older projects don't have the flag. Web and mobile differ slightly here:

- **Web (`theodore-web/src/lib/character-voices.ts`):** uses `character.role`
  enum from Theodore's outline pipeline — `protagonist` > `antagonist` >
  `supporting` > everything else. Within same role, canon array order.
- **Mobile (`theodore-mobile-app/lib/character-voices.ts`):** if no flag, runs
  regex-based dialogue-line counting across all chapters with prose + a
  batched Haiku gender classification, then ranks by line count.

Both paths produce the same shape: `VoiceAssignment[]`, one per character,
with `voice` set to a pool entry or the narrator when fallback.

---

## Server protocol

Web and mobile send the same shape to `POST /api/tts/generate`:

```ts
{
  chapterId: string,
  prose: string,
  narratorVoice: 'grok:leo',           // any grok:* ID
  multiVoice: true,
  characterVoices: {                    // character name → grok:* voice
    'Mara':   'grok:rex',
    'Olivia': 'grok:eve',
    // ... only non-fallback characters; narrator-fallback chars are omitted
  },
  characterDescriptions: { ... },       // optional, used by some providers
  knownCharacters: ['Mara','Olivia'],   // names parsed by parseDialogue
  characterAliases: { 'Mara': ['Mar'] },
  characterGenders: { 'Mara': 'female' },
}
```

The Grok multi-voice branch in `theodore-web/server/tts.ts`:
1. Verifies caller is on a paid tier — else 402.
2. Runs `parseDialogue` to split the prose into segments tagged with speaker.
3. For each segment, picks the speaker's mapped voice (or narrator).
4. Runs each segment's text through the xAI audio-tag injector
   (`server/grok-tag-injector.ts`) so `[laugh]`/`<whisper>` tags land on the
   right voice.
5. Calls `callGrokTTS(segmentText, voice)` in parallel, concatenates the MP3
   buffers in order, returns the combined audio.

---

## Web vs. Mobile differences

| Concern | Web | Mobile |
|---------|-----|--------|
| Single source of voice IDs | `server/tts.ts` `GROK_VOICES` | `lib/character-voices.ts` constants |
| Importance signal | role enum (legacy) + mainCharacter flag (going forward) | mainCharacter flag (primary) + dialogue-count fallback |
| Feature flag | `FEATURES.MULTI_VOICE_ENABLED` in `src/lib/feature-flags.ts` | always on for Grok provider |
| Tier gate | UI hides toggle for free users; server returns 402 | UI hides toggle for free users; server returns 402 |
| Voice preview | static `/voice-previews/<voiceId>.mp3` route | uses same backend endpoint |

---

## Phase history

- **Phase 1 (2026-04-25, mobile):** Locked Grok-only, 5 voices. Top-2 male
  (Rex/Sal), top-2 female (Eve/Ara), rest fallback to Leo.
- **Phase 2 (2026-04-25, mobile + server):** Server-side multi-voice Grok
  branch in `theodore-web/server/tts.ts` — parses dialogue, segments, parallel
  TTS, concatenated MP3.
- **Phase 3 (2026-05-11, this revision):** Expanded library to 17 voices,
  pools widened to 8 per gender. Web gets multi-voice (was disabled prior).
  Writer-tier gate added.

---

## Tuning checklist

Touching multi-voice? Update in this order:

1. This doc. State the change + rationale before code.
2. `theodore-web/server/tts.ts` `GROK_VOICES` (the IDs/names source of truth).
3. `theodore-web/src/lib/character-voices.ts` — web assignment.
4. `theodore-mobile-app/lib/character-voices.ts` — mobile assignment.
5. UI metadata — `GROK_VOICE_META` (web), voice picker components, etc.
6. Re-test the full chain: voice picker → multi-voice toggle → chapter
   generation → confirm correct voices land in the audio.
