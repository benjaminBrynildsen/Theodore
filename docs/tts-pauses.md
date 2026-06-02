# TTS Pause Playbook

**Last update:** 2026-06-02 (pause-iteration v3)
**Scope:** server-side prose-to-TTS preprocessing
**Files:** `server/tts.ts` (`addTTSPacing`), `server/grok-tag-injector.ts` (`injectPauseTags`, `injectGrokAudioTags`)

## Two pause systems run depending on the engine

| Engine | Function | Mechanism |
|---|---|---|
| OpenAI / Fish | `addTTSPacing` | Stacked `\n` newlines — TTS reads them as breath/silence. |
| **Grok (both narrator-only AND multi-voice)** | `injectPauseTags` + `injectGrokAudioTags` | Explicit `[pause]` / `[long-pause]` xAI tags. |
| ElevenLabs | (no injector) | Quality is high enough that natural punctuation suffices. |

A given chapter only goes through ONE engine. Don't mix the two pause schemes.

**Note (v3):** Grok narrator-only used to share `addTTSPacing` (newlines) with OpenAI, but the newline approach under-paused on Grok. Now both Grok paths use the same tag-based injector.

## Boundary table (v6 — current)

v6 (2026-06-02): xAI's docs explicitly say "Combine tags with punctuation — produces more natural results than stacking tags." We cap stacks at 2× per location. `[long-pause]` is back as a valid single tag — the v3/v4 failure mode was *stacking* it (which got rendered as the literal phrase "long pause"), not the tag itself. Sentence-boundary and semicolon tag injection are DROPPED; we rely on punctuation alone there per xAI guidance.

| # | Boundary | `addTTSPacing` newlines | Grok tags |
|---|---|---|---|
| 1 | Paragraph break (`\n\n+`) | `nl(10) + — + nl(10)` | `[pause]` × 2 |
| 2 | Sentence boundary | `snl(8)` | (dropped — punctuation only) |
| 3 | Narration → dialogue | `nl(10)` before quote | `[breath]` × 1 before quote |
| 4 | Dialogue → narration | `nl(10)` after quote | `[pause]` × 2 after quote |
| 5 | Speaker change (back-and-forth) | (handled by #3+#4) | `[breath]` × 1 appended to outgoing segment ([tts.ts:1746](../server/tts.ts)) |
| 6 | Em-dash (`\s*—\s*`) | `nl(8) + — + nl(8)` | `[pause]` × 2 after |
| 7 | Ellipsis (`...` / `…`) | `nl(15)` — dots stripped | `[long-pause]` × 2, dots stripped |
| 8 | Semicolon | `nl(8)` | (dropped — punctuation only) |
| 9 | Scene break | `nl(15) + — + nl(15)` | `[long-pause]` × 2 |
| 10 | Chapter intro (em-dash + 4+ newlines + capital, end of announcement) | Falls into #1 | `[long-pause]` × 2 (em-dash dropped) |

**Density:** ~80–100 tags per chapter (vs v4 ~1000+, v5 ~150).

**Why `[breath]` on dialogue transitions:** more natural conversational rhythm than silence. The audible inhale reads as a human speaker preparing to speak / handing off the floor.

## History

- **v1 (pre-2026-06-02):** Boundaries at nl(5–7), no scene break handling, no `[pause]` tags on Grok multi-voice (only dialogue cues + speaker-change pause).
- **v2 (2026-06-02):** Bumped every newline boundary +2 tier, added scene-break rule, added explicit `[pause]` injection for Grok multi-voice. Ben felt chapters were running fast on both web and iOS.
- **v3:** Doubled all Grok tag counts, tripled chapter intro. Stacks of 2–3 tags everywhere.
- **v4:** Dropped `[long-pause]` (heard as literal text), tripled v3 counts (18, 27, 36 per location). Hit the failure mode hard — Grok hallucinated "Chapter 5" audio at every dense `[pause]` cluster and chunks bloated past Grok's 15K char limit.
- **v5 (emergency rollback):** Cut everything to 1× per location. Solved the hallucinations but pacing felt slightly tight.
- **v6 (current):** 2× cap per stack, `[long-pause]` re-introduced (single/paired only, never deep stacks), sentence-boundary and semicolon tags dropped per xAI's "use punctuation" guidance, `[breath]` on dialogue/speaker transitions.

Order of operations in `addTTSPacing`:
1. **Scene break (#9)** — runs BEFORE asterisk strip and paragraph collapse, otherwise the `***` markers get eaten.
2. Strip asterisks.
3. Paragraph break (#1).
4. Sentence boundary (#2).
5. Narration → dialogue (#3).
6. Dialogue → narration (#4).
7. Dialogue comma attribution.
8. Em-dash (#6).
9. Semicolon (#8).
10. Ellipsis (#7).

Order matters for #3 because the regex pattern looks for the newlines step #2 just inserted (so `dlgMatch` has to track `snl(8)` exactly: non-rushed 8, rushed 21).

## "Rushed voices" multiplier

Some OpenAI voices (alloy, etc — see `RUSHED_VOICES` in `tts.ts`) read too fast at baseline, so:
- `nl(count)` returns `\n × (count*2 + 2)` for rushed, `\n × count` otherwise.
- `snl(count)` returns `\n × (count*2 + 5)` for rushed, `\n × count` otherwise.

Fable and Grok voices use the baseline; alloy-class get the bump.

## Idempotency

`injectPauseTags` is called ONCE at the whole-prose level before segmentation (see `tts.ts:1657`). Calling it twice would stack `[pause][pause]` — don't.

`callGrokTTS` (used per-segment) calls only `injectGrokAudioTags`, which works on dialogue cues inside quotes and is roughly safe to re-run. It does NOT call `injectPauseTags`.

## Tuning

If pacing still feels rushed:
- Bump the multipliers in the table above (one tier each time).
- For Grok specifically, consider adding `<slow>` wraps on narration paragraphs above a length threshold. Not done yet.

If pacing feels too slow:
- Drop the sentence-boundary `[pause]` (#2 Grok side) — that's the most frequent tag and the cheapest to remove.
- Or revert the newline counts on #2/#6/#8 back to v1 (subtract 2 from each).

## History

- **v1 (pre-2026-06-02):** Boundaries at nl(5–7), no scene break handling, no `[pause]` tags on Grok multi-voice (only dialogue cues + speaker-change pause).
- **v2 (2026-06-02):** This document. Bumped every newline boundary +2 tier, added scene-break rule, added explicit pause tag injection for Grok multi-voice. Ben felt chapters were running fast on both web and iOS.
