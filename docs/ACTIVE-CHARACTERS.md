# Active Characters — Concept

## Context

Theodore currently produces a finished audiobook you listen to passively. "Active Characters" flips one character in the cast from AI-authored into listener-voiced: during playback, the audiobook pauses at designated beats, the listener speaks that character's dialogue aloud, and the story incorporates what they said going forward.

This turns the listener from audience into cast. It also differentiates Theodore from every other AI writing tool by pairing its existing generation engine with real-time participation — something no static audiobook can do.

The concept is strong because Theodore already ships the hard parts: rich per-character state (emotion, knowledge, relationships), multi-voice TTS via ElevenLabs, streaming prose generation via Claude/OpenAI, and a working Web Speech API capture path in `DictationMode`. What's missing is the orchestration that ties them together at listen-time.

---

## The Core Loop

1. **Author**: When creating a book, the creator picks one canon character and marks them **Active**. The AI treats that character as the listener's avatar — it still shapes personality, arc, and constraints, but leaves specific dialogue moments unfilled.
2. **Approach**: Playback streams along. A short distance before an upcoming **Open Beat** (say, 15–20 seconds out), the system silently *arms*: opens the websocket to the fast-lane model, warms the mic permission, preloads the beat's prompt context. No UI change yet — the listener hears nothing unusual.
3. **Cue**: The narrator reaches the setup line that hands off to the active character ("Mira turned to me, waiting."). The instant the last word ends, a soft, pleasant chime plays and the mic goes live. No modal, no "tap to speak" — the chime is the only signal, tuned to feel like part of the sound design rather than a system alert.
4. **Speak**: The listener talks. The fast-lane model is already connected; transcript streams server-side in real time. Voice-activity detection closes the beat when they stop (or after a max window). The listener's raw mic audio is recorded and saved to the playthrough.
5. **Flow**: Because the model was pre-warmed, reaction prose starts streaming within a beat of silence. TTS streams on top of that. From the listener's POV, they spoke and the story kept going — no visible pause, no "processing" state. Under the hood, character state mutations are applied to the canon entry for this playthrough.
6. **Propagate**: Updated state flows into the prompt for the next chapter's generation, so the color and consequences of what was said reach forward through the book.

---

## Locked Design Decisions

- **Depth: Steered.** Dialogue mutates the active character's emotion, knowledge, relationships, and allegiance. Downstream scenes and chapters reflect it via Theodore's existing prompt architecture (the `DEEP` slot for focal characters). Plot rails hold; the color and consequences shift.
- **Reactions: Live-streamed, pre-warmed.** A fast-lane model (Grok-class, or any low-latency streaming provider) generates the reaction in real time over websocket. The pipeline is armed *before* the beat hits so there is no cold-start when the listener finishes speaking.
- **Voice: Listener's own, seamless.** The listener's mic audio is the character's audio — no re-synthesis pause. From their POV, they hear the setup, they speak, the story continues. The audio is captured and saved to the playthrough, but the perceived experience is unbroken narrative flow.
- **Count: Exactly one active character per book.**
- **Book type: new first-class option at creation.** Theodore currently offers Novel and Children's Book as book types. We add a third: **Active Character Book**, displayed with a **BETA** tag in the book-type picker. Picking it unlocks the active-character authoring flow, enforces that one character is marked Active, and enables the Open Beat generation pass during chapter creation. Novel and Children's Book remain unchanged. The beta tag stays until latency and UX are proven in the wild.
- **STT provider: Grok Speech only.** For this book type, the ONLY transcription path is Grok Speech (xAI). No Web Speech API fallback, no Whisper fallback in the MVP. Keeps the stack focused on one pipeline we fully tune for latency.
- **Beat authoring: AI auto-places, author edits.** The generator picks 2–3 natural speaking moments per chapter during book creation. The author can move, rewrite, or delete each cue in the book editor.
- **Silence handling: silence is a choice.** If the listener says nothing through a beat, the fast-lane model generates a reaction that treats the silence as characterization ("Mira waited. I had nothing to say."). Story keeps flowing, hesitation becomes part of the arc.
- **Persistence: tagged-persistent with reset.** After a beat plays, it's marked as "played" in the user's view of the book — they can see the line they said and what state mutations it caused. Mutations persist across listens by default. The listener can reset an individual beat or reset the whole active-character playthrough to start clean.

---

## Archived Alternatives (for reference)

The three forks that got us here. Each had a low-effort and a high-effort version.

### 1. Depth of influence

| Level | What changes | Cost | Feel |
|---|---|---|---|
| **Acknowledged** | Other characters react ("You really said that?") but the plot rails stay fixed | Low — only the reaction beat is live-generated | Like karaoke for books — fun, low-stakes |
| **Steered** | Updates character state (emotion, allegiance, knowledge); downstream prose reflects it | Medium — next chapter regenerated before play | True agency, within the story's arc |
| **Branched** | Whole scenes or chapters fork based on what was said | High — multiple large generations, heavy credit spend | Closest to interactive fiction / a game |

A sensible default is **Steered** — it's the version Theodore's existing prompt architecture is already built for. The prompt builder already does "DEEP for focal characters, LIGHT for mentioned entities"; the active character's live-updated state slots in cleanly.

### 2. Pre-generated vs. live regeneration?

- **Pre-generated w/ slots**: The book is generated once with Open Beats marked, plus pre-written reaction paragraphs per beat that reference a few anticipated dialogue directions. Fastest playback, cheapest. Tradeoff: feels scripted if you give an unexpected line.
- **Live-generated reactions**: When the listener finishes speaking, the server calls `/api/generate/stream` + TTS to produce a fresh reaction, then resumes playback. Rich, unpredictable. Tradeoff: 5–15s latency after each beat, meaningful credit spend per listen.
- **Hybrid**: Pre-generate reactions for common intents (e.g. "agrees," "refuses," "deflects"); live-generate only when the utterance falls outside those buckets. Best of both but harder to build.

Live-generated is the most magical but risks killing pacing. A workable MVP is pre-generated slots with 2–3 anticipated branches per beat, using embeddings to match the actual utterance to the closest branch.

### 3. Whose voice plays back the listener's line?

- **Their own voice**: The transcript is just metadata; the actual audio captured from the mic is mixed into the final track. Deeply personal — every playthrough is unique. But it breaks consistency if the listener's voice doesn't match the character's described age/accent, and creates a privacy/storage problem.
- **Re-synthesized**: Listener's line is transcribed, then spoken back by the character's assigned ElevenLabs voice. Consistent with the rest of the book. Feels more like a novel, less like a performance.
- **Optional per book**: Author sets it; "performance mode" vs. "polished mode."

Re-synthesized is the safer default for a general audience. Own-voice is a killer feature for kids' books, gifts, and shared reading.

---

## The Pre-Warm Timeline

The single most important engineering idea in this concept. Latency kills the "story just continues" illusion, so the system races ahead of the listener.

```
t - 20s   |  Beat is 20s away in playback. Scheduler fires an "arm" event.
          |  - Open websocket to fast-lane LLM (Grok-class).
          |  - Send system prompt + scene context + active character state.
          |  - Request mic permission (if not already live this session).
          |  - No UI change. Book keeps playing.
t -  3s   |  Narrator's setup line begins. Streaming STT provider handshake completes.
          |  Chime audio asset is preloaded and queued.
t =  0    |  Setup line's last word ends. Chime plays immediately (no gap),
          |  mic goes hot the same frame. No modal.
t +  Xs   |  Listener speaks. Transcript streams server-side token-by-token.
t +  Xs + 400ms  |  VAD detects end-of-speech (or listener taps "done"/"pass").
          |  Server sends the final transcript to the already-connected LLM.
t +  Xs + 500ms  |  First reaction tokens arrive. TTS streams concurrently.
t +  Xs + 1s     |  Reaction audio begins playing. No gap perceptible to listener.
          |  In parallel: character state mutations saved to playthrough.
```

The perceived gap between the listener stopping and the story continuing is a few hundred ms — equivalent to a natural breath pause between speakers.

**Fallback if latency overruns:** the beat includes a tiny pre-rendered "bridge" — a non-committal sound from a nearby character (a hum, a footstep, a pointed silence with music) — that buys 1–2 seconds while live generation catches up. Authored at book-creation time.

---

## The Seamless Own-Voice UX

What the listener experiences:

- No mic icon, no "tap to speak" button, no modal. A soft, pleasant chime plays the instant the narrator's last setup word ends — zero gap — and the mic opens on the same frame. The chime is the only handoff signal; it should feel composed (part of the sound design) rather than system-y (like a notification).
- Their voice is recorded but they don't see a waveform or timer. The cue that they're being heard is the narrative itself — the next line references what they said.
- Their actual recorded audio becomes part of *this playthrough's* audio artifact. If they re-listen, they hear themselves. If they share the book with someone else, that person starts fresh with their own voice.
- No "retry this line" in the moment. If they want a do-over, they can scrub back in the audio timeline and re-record that beat — handled as a playthrough-level edit afterward.

What they don't see (but is happening):

- Websocket streams transcript, character state updates, and reaction prose.
- Reaction TTS is generated in streaming mode so the first syllable plays while the rest is still being synthesized.
- A background job writes the beat's transcript + audio blob + state mutations to the playthrough row.

---

## Data Model Additions

Grounded in existing schema at `server/schema.ts` and `src/types/canon.ts`:

- **`canonEntries.character.isActive`** (bool) on the character JSON. Marks the listener-voiced character.
- **`canonEntries.character.activeProfile`** (object) on the character JSON. Constraints the AI uses around this character: archetype, register, dialogue length bounds, what they know/don't know, guardrails for how far the listener can push the plot.
- **`chapters.scenes[].openBeats[]`** (new, inside existing `scenes` jsonb): `{ beatId, cueText, setupAudioMarkerMs, bridgeAudioUrl, maxSpeakMs, intentHints[], stateMutationRules[] }`. `bridgeAudioUrl` is the fallback hum/filler; `stateMutationRules` tells the post-beat classifier what dimensions of character state this beat is allowed to move.
- **`playthroughs`** (new table): `{ id, userId, projectId, startedAt, endedAt, transcript[], audioSegments[], stateMutations[] }`. `audioSegments` holds URLs to the listener's saved clips per beat. Each beat entry is tagged `played`/`reset` so the history UI can show the user what they said, what it changed, and offer a per-beat or whole-playthrough reset.
- **`activeBookGenerationHints`** on the project: prompt additions used by the generator so it structures beats and leaves space for the listener ("this character's next speaking turn must be writable as an Open Beat").
- **`projects.subtype`** gains a new enum value: `active-character`. Gates the authoring UI, the beat-placement pass, and the playback websocket handshake. Novel and children's-book subtypes behave unchanged.

No character-schema migration — these fields slot into existing JSON blobs. Only `playthroughs` is net-new at the table level.

---

## Server Architecture Changes

Theodore is REST-only today. This feature needs:

- **New websocket layer** (e.g. `ws` or Socket.io on the existing Express server). One socket per active playthrough.
- **`/ws/playthrough`**: handles the full beat lifecycle — `arm`, `speech-start`, `transcript-chunk`, `speech-end`, `reaction-chunk`, `tts-chunk`, `state-update`.
- **Fast-lane provider module** in `server/ai.ts`. Adds Grok (or equivalent) alongside the existing Anthropic/OpenAI providers. Used exclusively for reaction generation; main book generation stays on Claude/OpenAI for quality.
- **Streaming STT**: Grok Speech only for Active Character Books. Audio from the client mic is streamed over the playthrough websocket to the server, forwarded to Grok Speech, and transcripts stream back. The existing `DictationMode`'s Web Speech API path is *not* reused here — it's kept for the dictation-during-writing feature, separate from playback. No cross-browser fallback for MVP; we accept the constraint to keep latency tuning focused on one pipeline.

---

## Playback Client Changes

`src/components/features/AudiobookPanel.tsx` + `src/store/audio.ts`:

- **Arm scheduler**: subscribes to `audio.currentTime`; 20s before any `setupAudioMarkerMs`, opens the playthrough socket and sends `arm`.
- **Handoff listener**: when playback crosses the setup marker, plays the preloaded chime, opens the mic stream, and pipes audio through the socket — all on the same frame as the last setup word ending. Zero-gap alignment is critical; the chime must be preloaded as an AudioBuffer (not streamed) and scheduled against the narrator audio's end timestamp.
- **Gap manager**: when the setup audio ends, if reaction audio isn't ready within 300ms, plays the beat's `bridgeAudioUrl` to cover the gap.
- **Transcript / state reconciliation**: when `state-update` arrives from the server, patches `useCanonStore` for the in-memory playthrough view.
- **Audio mixer**: concatenates narrator audio, listener mic audio, reaction TTS audio into the playthrough's saved track so the full performance can be replayed later.

---

## MVP Cut

A shippable first version that keeps the magic intact:

- New book type at creation: **Active Character Book** (alongside Novel and Children's Book).
- One active character per book. Author marks them as part of the Active Character Book creation flow.
- AI places 2–3 Open Beats per chapter during generation; author can edit cue text and `stateMutationRules`.
- Playback arms 15s before each beat, plays the preloaded chime on setup-line end, opens mic the same frame.
- **Grok Speech** for STT (exclusive, no fallback). **Grok** for fast-lane reaction prose. **ElevenLabs** streaming for reaction TTS.
- Bridge audio covers any latency overrun.
- Listener's mic audio saved to the playthrough; state mutations applied and persist across listens, per-beat resettable.
- Next chapter's generation uses the mutated state. (Between-chapter regen is fine; in-chapter regen is deferred.)

---

## Playthrough History UI

Because beats are tagged/persistent with a reset affordance, the book needs a new surface:

- **In the book's reading view**: each chapter lists its Open Beats. Played beats show the listener's transcribed line, a mini-waveform of their saved audio, and a short list of state mutations ("Mira's trust +1, you now know about the locked cellar"). Unplayed beats show a greyed cue.
- **Per-beat reset**: tapping a played beat offers "reset this moment" — clears the mutation, marks it unplayed, so it re-fires on next listen.
- **Whole-playthrough reset**: a single action on the book page to wipe all beats and restore the canonical character state.
- **Share mode**: when a book is shared with another user, the other user starts with their own empty playthrough; the original's history is not visible.

---

## Resolved Remaining Decisions

- **Author test-drive: yes.** The chapter editor gets a "rehearse this beat" affordance that spins up a throwaway playthrough — same websocket pipeline, same chime, same capture — but the state mutations don't persist to the author's canon or to any real playthrough. Lets the author feel the timing of cues before shipping the book.
- **Kid-mode vs. adult-mode: not yet.** MVP ships one sound design (single chime, one bridge-audio style). A per-book "warmth" / tone control is a fast-follow, not MVP scope.
- **State mutation visibility: prose-only.** Internal representation stays stat-like (`trust +1`, `knows: cellar`), but the playthrough history UI renders them as prose fragments ("Mira trusts you a little more. You know about the locked cellar now."). Game-y numbers would break the literary frame.
- **Sharing a played book: recipient starts empty.** The original playthrough is private to the listener who made it. If they want to share their performance, a separate "export this listen as audio" action produces a single mixed MP3; the recipient opening the book itself always begins with a blank slate.
- **Credits / pricing: deferred.** Grok Speech + Grok reaction generation are affordable enough that functionality comes first. Revisit pricing model once latency and UX are proven.

---

## Open Questions Worth Discussing

(None blocking MVP — everything above is decided.)
