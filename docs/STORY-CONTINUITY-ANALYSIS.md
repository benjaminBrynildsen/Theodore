# Story Continuity: Where It Stands & What's Left

> Scope: how Theodore carries characters, artifacts, and plot state from chapter to chapter, what `main` already does, and what's still causing pop points.
> Audited against `main` @ `d48752e` (2026-06-16). Other branches were checked for unmerged continuity work and have none. `develop`'s 31 extra commits are UI, audio, and monetization only.
> Date: 2026-09-30

---

## TL;DR

`main` already has a solid **plot memory**:
- `src/lib/continuity-context.ts` gives every generation path tiered story-so-far summaries, open threads, a recent-dialogue log, and the previous chapter in full.
- `post-generation-pipeline.ts` extracts summaries and threads after each chapter and cascades premise changes to unwritten chapters.

What's still missing is **character and object memory**:
- Nothing tracks where people are, what they know, how they look, or who holds which artifact.
- Character profiles still contain generic placeholders labelled "established facts".
- The summary extractor only reads the first 8,000 characters of a chapter and never re-runs after Extend.

That's where the remaining pop points come from. Plot threads carry over well; physical details, artifacts, and who-knows-what don't.

---

## 1. Already done on `main` (don't rebuild)

| Capability | Where | Commit |
|---|---|---|
| Tiered story-so-far: 1-liners → rich summaries → summary + tail → previous chapter in full | `continuity-context.ts` | `cf172c1` |
| Open narrative threads (opened/resolved per chapter) | `continuity-context.ts`, `post-generation-pipeline.ts` | `cf172c1` |
| Recent dialogue log (last 3 chapters) | `continuity-context.ts` | `cf172c1` |
| Continuity block wired into chapter, extend, scene, selection-edit, scene-edit, and children's page prompts | `prompt-builder.ts` | `cf172c1` |
| Extend sees the current draft (last 6k chars) and cleans the seam | `ChapterView.tsx` `handleExtend` | `8d961d9` |
| Premise cascade: unwritten chapters' premises updated when a written chapter diverges | `post-generation-pipeline.ts` `cascadePremiseUpdates` | `4e2f363`, `03858f2` |
| Real character appearance from the planning chat (`visualDescription`) | `ChatCreation.tsx` | `e8eb33e` |
| Name-variety fixes (no recycled or overused names) | `ChatCreation.tsx`, scaffold | `869585e`, `041a0a8` |
| AI entity refinement to reduce noisy auto-detected canon | `ai-entity-refine.ts` | `ed63712`, `5f9a2ca` |

---

## 2. Remaining gaps (ranked by impact)

### G1. The continuity extractor never sees most of the chapter 🔴
`runContinuityExtraction` sends `chapter.prose.slice(0, 8000)`. The default chapter target is 2,500 words (about 14k characters), and the 5,000-word option is about 28k characters. So the extractor usually reads only the **first 30–60%**. Its RICH_SUMMARY is explicitly asked for "what STATE the chapter ends in", which is the most important handoff fact, **and it never sees the ending.** It fills that in, and the invented ending state then becomes memory for every later chapter.

It also runs at the default temperature of 0.8, while the other analytical passes in the same file use 0.1–0.3.

### G2. Extend and manual edits don't refresh continuity 🔴
`runPostGenerationPipeline` is called only from `handleGenerate` (`ChapterView.tsx:482`). After Extend, which is how long chapters get finished, the stored summary and threads still describe only the first chunk. Human edits go through `schedulePostEditPipeline`, which only runs the entity scan. So the most-edited chapters have the most outdated memory.

### G3. No memory of character and artifact *state* 🔴 main cause of the remaining pop points
The extractor produces plot summary and threads only. Nothing records:
- where each character is and who they're with
- **what each character knows** (and doesn't know yet)
- relationship changes
- physical changes (injury, haircut, new scar)
- **artifact holder, location, and condition**
- small fixed facts established in prose (eye colour, a car model, a pet's name, a scar)

The canon schema has fields for most of these (`storyState`, `relationships[].currentState`, `artifact.history.currentOwner`), but only manual edits in the canon panel ever change them. Detail from the last ~3 chapters survives through the prose tails. Anything older is only in a 1-line summary, so it gets re-invented.

Thread `character` values are free text and aren't linked to canon entries.

### G4. Placeholder canon is still sent as "established facts" 🔴
`autoFillCharacter` (`ai-autofill.ts:21`) still gives every character:
- traits `Determined, Guarded, Observant`
- age `Early 30s`
- emotional state `Guarded but curious`
- speech pattern `"Tends to be precise with words…"`
- inner voice `"Self-critical but quietly hopeful…"`

`autoFillLocation` still writes `atmosphere: "[AI will describe the mood…]"`. `buildCanonContext` prints all of this under **"CANON (established facts — do not contradict)"**. Appearance is fixed now, but the identical traits and speech patterns still pull every character's voice toward the same person, and "Early 30s" is wrong for a child or a grandparent.

The canon panel's **Auto-fill** button is also still a mock: it builds a prompt, logs it, waits 1.5s, and applies the same placeholders (`CanonDetailPanel.tsx:697`).

### G5. Canon selection is narrow and the cards are thin 🟠
`buildCanonContext` (`prompt-builder.ts:286`) is unchanged since before `cf172c1`:
- Only `premise.characters` decides who gets a full card. `chapter.referencedCanonIds`, which the entity scan maintains, isn't used. A character who appeared in the last two chapters but isn't listed in this premise is left out.
- When no name matches, it falls back to dumping all canon.
- Character cards leave out **pronouns**, distinguishing features, quirks, **knowledge state**, **secrets**, arc position (want/need/current state), and inner voice.
- **Artifacts, systems, rules, and events are sent as name + description only.** Holder, location, condition, abilities, limitations, and a rule's `statement` never reach the model.

### G6. No verification pass, and written chapters never go stale 🟠
The premise cascade handles **unwritten** chapters. Nothing checks new prose against established facts, and when Chapter 3 is rewritten, chapters 4 and later that were written on the old version aren't flagged. The `out-of-alignment` status exists but is never set from prose. `PlotHoleDetector`, `ChapterRecapGenerator`, `TimelineVisualizer`, and `CharacterRelationshipMap` are still mocks.

### G7. Small stuff 🟡
- `fromDb` in `store/canon.ts` has no `'media'` case, so media entries lose their data after a DB reload.
- `buildOutlineContext` (titles plus the ±1 premise) still runs next to the richer continuity block. It's mostly redundant now and could be cut to the next chapter's premise only, which saves tokens.

---

## 3. Proposed fixes

The approach is to **extend the pattern that already exists**. The `extract-continuity` pass already runs after every generation and stores its results in `chapter.aiIntentMetadata` with no schema migration. Add state and facts to that same call, then have `continuity-context.ts` fold them into two new prompt sections. There's no new pipeline and no new store.

### Phase 1: fix the extractor and stop the bleeding (small)
1. **Extractor reads the whole chapter** (G1). Send the full prose, or the first 6k plus the last 8k for very long chapters, so the ending is always included. Set `temperature: 0.2`.
2. **Re-run extraction after Extend and after edits** (G2). Call `runContinuityExtraction` (and the cascade) from the extend completion handler and from `schedulePostEditPipeline`, debounced. Run extraction only, not scene decomposition.
3. **No placeholders in prompts** (G4). Have `autoFill*` leave unknown fields empty instead of inventing generic values. As a safety net, `buildCanonContext` should skip any value that starts with `[AI will` or matches the known default strings, so existing projects are cleaned up too.
4. **Wider selection, richer cards** (G5). Take the union of `premise.characters`, this chapter's `referencedCanonIds`, and the previous two chapters' `referencedCanonIds`. Match on first-name and alias tokens. Add pronouns, distinguishing features, quirks, knowledge state, secrets (marked "reader doesn't know yet" where relevant), and arc current state. For artifacts add holder, location, condition, abilities, and limitations. For rules add the `statement`.
5. **`fromDb` media case** (G7).

### Phase 2: state and fact memory (the main remaining fix)
Add three sections to the existing extraction prompt and parser:

```
CHARACTER_STATE:            (only characters who appear or change)
- Maya | location: the cabin loft | with: Scott | mood: shaken, defiant
       | learned: Kelly's texts were to Tim | physical: split lip
ARTIFACT_STATE:
- The brass key | holder: Tim | location: his coat pocket | condition: bent
FACTS:                      (small concrete details now fixed in the story)
- Tim: drives a green 1987 Corolla with a cracked windshield
- The cabin: the kitchen window doesn't latch
```

Store these as `aiIntentMetadata.characterState`, `.artifactState`, and `.facts`, keyed by canon id where the name resolves, with the name as fallback. Then in `continuity-context.ts`:
- **`CURRENT STATE (as of end of Ch N-1)`**: fold the per-chapter state in chapter order, so the latest state per entity wins, for entities relevant to this chapter. Because the fold stops at the current chapter, regenerating Chapter 5 uses Chapter 4's state, not Chapter 12's.
- **`ESTABLISHED FACTS (never contradict)`**: all facts about entities in this chapter, from any earlier chapter. They're 1 line each and cheap, and they're the most direct defence against pop points.

Optional follow-up: show the folded state read-only in the canon panel ("As of Ch 7: at the harbour, knows about the letter"), and add an "accept into profile" button that writes it into `storyState` or `facts`. The author stays in control and the profile stays current.

### Phase 3: verification and staleness (G6)
1. **Continuity check after generation:** a low-temperature call that compares the new prose with ESTABLISHED FACTS and CURRENT STATE, and returns contradictions with the quoted passage and a suggested fix. Show the results in `ImpactPanel` in place of the mock `PlotHoleDetector`.
2. **Staleness for written chapters:** store a hash of the state and facts each chapter was generated from. When an earlier chapter's extraction changes the fold, mark later written chapters `out-of-alignment` and offer to re-check them. This is the counterpart to the premise cascade for chapters that already have prose.

### Phase 4: profile quality and arcs
1. Make the **Auto-fill** button real: one AI call using `buildAutoFillPrompt`, which already exists, plus the planning conversation and chapter summaries. Use it at creation time too, so each character gets distinct traits and a distinct voice.
2. **Arc waypoints:** map each major character's `arc.startingState → endingState` onto chapters, and include "arc position at this chapter" on the character card, so development moves continuously instead of resetting.

---

## 4. Suggested order

| Step | Effort | Impact | Notes |
|---|---|---|---|
| P1.1 extractor reads whole chapter | XS | 🔴 | One-line slice change plus temperature |
| P1.2 re-extract after extend and edits | S | 🔴 | Reuses existing functions |
| P1.3 no placeholder canon | S | 🔴 | Also fixes existing projects via the prompt filter |
| P1.4 selection and richer cards | M | 🔴 | Only `buildCanonContext` |
| P1.5 media `fromDb` | XS | 🟡 | |
| P2 state and fact memory | M | 🔴 | Extends the existing extract-continuity pass |
| P3 verification and staleness | M–L | 🟠 | |
| P4 real auto-fill and arc waypoints | M | 🟠 | |

Phase 1 and Phase 2 together should close most of the gap between "the plot carries over" and "the characters and objects carry over."
