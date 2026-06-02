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

## Boundary table (v4 — current)

v4 (2026-06-02): dropped `[long-pause]` entirely (Grok was reading it as literal text), tripled every count, and stripped the literal dots from ellipsis output.

| # | Boundary | `addTTSPacing` newlines | Grok tags |
|---|---|---|---|
| 1 | Paragraph break (`\n\n+`) | `nl(10) + — + nl(10)` | `[pause]` × 18 |
| 2 | Sentence boundary (`[.!?]\s+[A-Z]`) | `snl(8)` | `[pause]` × 6 |
| 3 | Narration → dialogue | `nl(10)` before quote | `[pause]` × 6 before quote |
| 4 | Dialogue → narration | `nl(10)` after quote | `[pause]` × 6 after quote |
| 5 | Speaker change (back-and-forth) | (handled by #3+#4) | `[pause]` × 6 appended to outgoing segment ([tts.ts:1746](../server/tts.ts)) |
| 6 | Em-dash (`\s*—\s*`) | `nl(8) + — + nl(8)` | `[pause]` × 6 after |
| 7 | Ellipsis (`...` / `…`) | `nl(15)` — dots stripped | `[pause]` × 18, dots stripped |
| 8 | Semicolon (`;\s+`) | `nl(8)` | `[pause]` × 6 |
| 9 | Scene break (`***` / `---` / `___` on own line) | `nl(15) + — + nl(15)` | `[pause]` × 36 |
| 10 | Chapter intro (em-dash + 4+ newlines + capital, end of announcement) | Falls into #1 (paragraph break) | `[pause]` × 27 (explicit rule, em-dash dropped) |

**Why no `[long-pause]` anymore:** Ben heard "long pause" being read aloud in Grok output, meaning Grok wasn't recognizing the tag and was reading it as text. Switched to multiple `[pause]` tags everywhere — roughly 3 × `[pause]` ≈ one prior `[long-pause]` in duration. Safer and verified to work.

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
