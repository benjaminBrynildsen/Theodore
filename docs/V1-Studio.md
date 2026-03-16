# V1 Audio Studio — Rules & Architecture

_Theodore's audiobook production engine. All rules governing how audio scenes are mixed, layered, and generated._

---

## Audio Layer Types

| Layer | Position | Description |
|-------|----------|-------------|
| **Intro SFX** | `start` | One-shot sound that plays ONCE before narration begins |
| **Background SFX** | `background` | Ambient loops that play continuously through the entire scene |
| **Inline SFX** | `inline` | Spot sound effects placed at specific moments in the prose |
| **Outro SFX** | `end` | Sound that plays near the end of the scene |
| **Narration** | — | TTS voice reading prose (narrator + character dialogue) |

---

## Timing & Sequencing

### Scene Playback Order
1. **Intro SFX** plays first (one-shot, full duration, no loop)
2. **Narration** starts at `max(introDuration, 5 seconds)` — whichever is longer
3. **Background SFX** starts after intro ends (delayed by `introDelayMs`)
4. **Inline SFX** fire at their marked positions in the prose (also shifted by intro delay)
5. **Outro SFX** starts 5 seconds before narration ends

### Key Timing Rules
- Intro SFX is **never looped or trimmed** — plays its full generated length once
- If intro is shorter than 5s, narration still waits 5s (minimum gap)
- If intro is longer than 5s, narration waits for it to finish
- All other layers (inline, outro, bg) are shifted forward by the intro duration

---

## Volume Levels

| Layer | Volume | Notes |
|-------|--------|-------|
| **Narration** | `1.0` (100%) | Full volume, always on top |
| **Intro SFX** | `0.60` (60%) | Prominent but not overpowering |
| **Background SFX** | `0.40` (40%) | Subtle ambient bed |
| **Inline SFX** | `0.50` (50%) | Noticeable spot effects |
| **Outro SFX** | `0.60` (60%) | Same as intro |

---

## Background SFX Rules

- Generated at **15 seconds** duration
- Prompt prefixed with: `"Clean, clear, high-quality ambient sound: {prompt}"`
- **Seamless looping** — no silence gaps between repetitions
- Short crossfade (1.5s fade-in/out) at clip boundaries for smooth loops
- Looped enough times to cover full narration + buffer
- 2s fade-in at start, 3s fade-out at end
- All BG tracks play **simultaneously** (layered, not alternating)
- Compressed with `acompressor=threshold=-20dB:ratio=4:makeup=4dB`

---

## Intro SFX Rules

- Generated at **4 seconds** duration
- Prompt prefixed with: `"Single one-shot sound effect, not looping: {prompt}"`
- AI suggestion prompt explicitly requests **singular sound events** (e.g., "a car door slamming shut", "a rooster crowing once") — NOT ambient/looping sounds
- Plays once, full length, no loop, no trim
- 1.5s fade-in, 1.5s fade-out
- Compressed with acompressor

---

## Inline SFX Rules

- Generated at **4 seconds** duration
- Placed in prose with `{sfx:description}` tags
- Tags go **BEFORE** the text they accompany (sound plays during narration)
- Overlaid at the timestamp of the speech segment they precede
- **No inline SFX in the first paragraph** — the intro SFX already covers the opening
- 3-8 tags per scene maximum
- Only distinct, one-off sounds (door slam, footsteps, glass breaking)
- NOT ambient sounds (rain, wind, crowd noise — those are background SFX)

### SFX Tagger AI Rules
1. Insert `{sfx:description}` BEFORE the action text
2. Only tag distinct, one-off sounds
3. Keep descriptions short (2-4 words)
4. Good: footsteps, punches, gunshots, door creaks, glass breaking, phone ringing
5. Bad: rain, wind, crowd noise, traffic, music (these are ambient/background)
6. Preserve ALL existing text exactly
7. 3-8 tags per scene max — only the most impactful moments
8. Leave existing `{sfx:}` tags unchanged
9. **No tags in the first paragraph** (intro SFX handles opening)

---

## Outro SFX Rules

- Delayed to start **5 seconds before narration ends**
- 2s fade-out
- 60% volume
- Compressed with acompressor

---

## Audio Processing Pipeline

### FFmpeg Filter Chain (per BG track)
```
aloop → atrim → acompressor → volume → afade(in) → afade(out)
```

### FFmpeg Filter Chain (intro)
```
asetpts → acompressor → volume → afade(in) → afade(out)
```

### FFmpeg Filter Chain (inline)
```
acompressor → volume → adelay
```

### Final Mix
```
amix=inputs=N:duration=first:dropout_transition=0:normalize=0
```
- `duration=first` = output length matches narration (first input)
- `normalize=0` = no volume redistribution when tracks end (prevents distortion)
- `dropout_transition=0` = no crossfade when inputs drop out

---

## SFX Generation

- Provider: **ElevenLabs** Sound Generation API (`POST /v1/sound-generation`)
- Background clips: 15s
- All other clips: 4s
- Auto-generated on-demand if `audioUrl` is missing or file doesn't exist on disk
- Generated in parallel to minimize wait time

---

## AI SFX Suggestion (per scene)

After scene decomposition, AI suggests:
- **1 intro** — a singular ONE-SHOT sound event (2-4s) that establishes the scene
- **1-3 background** — ambient/environmental loops

### Intro Prompt Guidance (to AI)
> Must NOT be a looping/ambient sound. Think: a specific sound event, not ongoing atmosphere.
> Examples: "a single car door slamming shut", "a rooster crowing once at dawn", "the clink of a glass being set on a bar"

### Background Prompt Guidance (to AI)
> Ambient/environmental sounds that LOOP throughout the scene.
> Examples: "gentle rain", "distant traffic", "crackling fireplace"

---

## Post-Generation Pipeline

Runs automatically after chapter generation (no buttons):

1. **Entity Scan** — AI-refined character/location extraction (parallel with step 2)
2. **Scene Decomposition** — breaks prose into scenes with titles/summaries
3. **Prose Splitting** — distributes existing prose across decomposed scenes
4. **Dialogue Tagging** — marks character dialogue with `[Character Name]` tags
5. **SFX Tagging** — inserts `{sfx:description}` inline tags
6. **SFX Suggestion** — AI picks intro + background SFX per scene
7. **Sync** — writes tagged scene prose back to chapter

### Post-Edit Pipeline (lightweight)
After inline edits, a debounced (3s) lightweight pipeline runs:
1. Re-scan entities only
2. Re-tag dialogue on the edited scene only
3. No full scene decomposition

---

## Known Constraints

- **Ephemeral storage**: Audio files in `uploads/` are wiped on every Render deploy (needs R2/S3 migration)
- **ElevenLabs API key required** for SFX generation — throws error if missing, caller catches gracefully
- **Rate limiting**: Scene tagging processes scenes sequentially to avoid API rate limits

---

_V1 — March 2026_
