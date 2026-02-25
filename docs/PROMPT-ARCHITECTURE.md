# Theodore Prompt Architecture v1.0

> This document defines the prompt structure, context injection strategy, and versioning system for Theodore's AI generation engine. Each version ships as a named release (e.g., Theodore v1.0, v1.1) and can be iterated independently of the app UI.

---

## Prompt Structure (per generation call)

### 1. SYSTEM ROLE (~50 tokens, fixed)
```
You are Theodore v1.0, an expert fiction writer and story architect.
You are writing a [genre/subtype] titled "[title]".
```

### 2. CRAFT RULES (~300 tokens, fixed per version)
The core writing intelligence. This is what makes Theodore *Theodore* — upgraded with each version.

**Dialogue:**
- Natural speech: fragments, interruptions, trailing off mid-thought
- Characters cut each other off (even with em dash off in narration, dialogue interruptions use —)
- Subtext over exposition — characters rarely say exactly what they mean
- Distinct speech patterns per character (cadence, vocabulary, verbal tics)
- "Said" is invisible — use it 80% of the time, action beats > attribution tags
- No monologuing — cap dialogue at 2-3 sentences before a beat or interruption
- Dialogue should reveal character, advance plot, or create tension — ideally all three

**Pacing:**
- First introduction of character/place: slow down, sensory detail, let reader settle in
- Once established: tighten up, trust the reader's memory
- Action sequences: short sentences, fragments, minimal description
- Emotional beats: longer sentences, internal reflection, breathing room
- Vary paragraph length as a pacing tool — one-sentence paragraph after a long block hits different
- Enter scenes late, leave early

**Character Introductions:**
- Show through action first, describe second
- Physical details woven into movement, not a police report
- Reveal personality through interaction with the world
- Name + one vivid detail on first appearance, fill in rest naturally over next few pages

**Scene Construction:**
- Every scene needs tension — even quiet ones (unspoken feelings, time pressure, secrets)
- Ground each scene in a specific sensory detail within first 2 sentences
- End chapters on a micro-hook — question, revelation, or shift

**Prose Quality:**
- Specificity over generality — "a 1987 Corolla with a cracked windshield" not "an old car"
- One strong metaphor per page max — don't oversaturate
- Avoid "began to" / "started to" — just do the thing
- Cut "very," "really," "just," "quite" — find the right word instead
- No em dashes in narration (default) — use commas, semicolons, or separate sentences
- Show don't tell — but know when telling is more efficient (transitions, time skips)

### 3. WRITING STYLE (from user settings, ~100 tokens)
```
Punctuation: [em dash off, smart quotes on, oxford comma on, ellipsis: ...]
Prose: [active voice preferred, contractions allowed, said-bookisms: light]
Paragraphs: [mixed length, scene breaks: ***, chapter start: normal]
```

### 4. STORY SKELETON (smart-compressed, ~200-400 tokens)
Scales with book length. Written chapters get 2-sentence summaries. Unwritten chapters get purpose only.

```
Ch 1: "Maya discovers the letter" (written)
  → Maya finds a letter from her dead mother revealing a family secret. She decides to visit Larch Street.
Ch 2: "Scott confronts Kelly" (written)
  → Scott finds suspicious texts on Kelly's phone. The argument escalates but Kelly deflects.
Ch 3: "The cabin" (written)
  → Maya arrives at the cabin and meets Scott. They circle each other warily, old wounds surfacing.
→ Ch 4: "Fallout" ← WRITING NOW
Ch 5: "Tim's secret" (unwritten) — Purpose: Tim's role in the affair is revealed
Ch 6: "Resolution" (unwritten) — Purpose: Maya forces a family reckoning
```

### 5. ACTIVE CANON — DEEP (smart-filtered, ~150 tokens per entity)
Only entities tagged in THIS chapter's premise get full profiles.

```
## Scott (DEEP — focal character this chapter)
- Personality: stoic, dry humor, avoids vulnerability
- Speech: short sentences, deflects with sarcasm, rarely asks questions
- Emotional state: angry, hasn't slept, running on adrenaline
- Relationships: Kelly (strained, suspects affair), Maya (protective older brother)
- Arc position: just learned about the texts, hasn't confronted directly yet
- Physical: broad shoulders, fidgets with his watch when anxious

## Kelly (DEEP — focal character this chapter)
- Personality: warm exterior, conflict-avoidant, compartmentalizes
- Speech: over-explains when nervous, uses "honestly" as a tell
- Emotional state: terrified of being caught, loves Scott but feels trapped
- Relationships: Scott (guilty), Tim (complicated), Maya (wary of her)
- Arc position: knows Scott suspects but doesn't know how much

## The Cabin (DEEP — primary location)
- Atmosphere: isolated, creaking wood, fire dying, snow outside
- Sensory: pine smell, cold draft from kitchen window, orange firelight
- Condition: old family property, hasn't been maintained
```

### 6. REFERENCED CANON — LIGHT (~30 tokens per entity)
Mentioned but not starring. Just enough so the AI doesn't contradict.

```
- Tim: Scott's college friend, involved with Kelly, currently in the city
- Maya: Scott's younger sister, arrived at cabin yesterday, emotionally guarded
```

### 7. PREVIOUS CHAPTER BRIDGE (~200 tokens)
Last 3 paragraphs of the previous chapter — the exact emotional/narrative handoff point.

```
[Last 3 paragraphs of Chapter 3]
```

### 8. CHAPTER BLUEPRINT (~150-200 tokens)
The detailed instructions for THIS chapter.

```
Purpose: Scott and Kelly's confrontation breaks open
Emotional arc: tension → eruption → hollow silence
Key beats:
  - Scott finds the texts on Kelly's phone
  - Kelly deflects, tries to redirect
  - It escalates — voices raise
  - One of them walks out into the snow
Sensory anchor: cold cabin, fire dying, phone screen glow
Setup/Payoff: Ch 2's locked phone pays off here
Open threads: Tim's involvement (light touch, don't resolve yet)
Constraints: Kelly doesn't admit it yet — she's not ready
Characters present: Scott, Kelly (Maya overhears from upstairs)
```

### 9. GENERATION INSTRUCTION (~50 tokens)
```
Write the opening chunk of this chapter (1,000-1,500 words).
End on a continuation beat so the next chunk picks up naturally.
Do not summarize — write finished prose.
```

---

## Smart Filtering Logic

```
For each chapter generation:

1. Parse chapter.premise.characters → DEEP canon lookup
2. Parse chapter.premise text for entity name mentions → LIGHT canon lookup
3. Scan previous chapter's last 1000 chars for entity names → add as LIGHT if not already DEEP
4. Everything else → excluded from prompt

Token budget:
├── Fixed overhead (role + craft + style): ~450 tokens
├── Skeleton: ~200-400 tokens (scales with chapters written)
├── Deep canon: ~150 tokens × focal entities (usually 2-4)
├── Light canon: ~30 tokens × mentioned entities (usually 1-3)
├── Bridge: ~200 tokens (last 3 paragraphs)
├── Blueprint: ~200 tokens
├── Instruction: ~50 tokens
└── TOTAL INPUT: ~1,400 - 2,200 tokens
    → Leaves maximum context window for output generation
```

---

## Accumulation System (post-generation)

After each chapter is generated or edited:

1. **Auto-summarize** → 2-sentence summary stored on chapter object → feeds into SKELETON
2. **Auto-update canon states** → character emotional states, locations, relationship changes
3. **Thread tracking** → plot threads marked as opened / advanced / resolved
4. **Entity extraction** → new characters/places auto-detected and added to canon as drafts

---

## Versioning

Each version of this architecture ships as a named release:

| Version | Codename | Focus |
|---------|----------|-------|
| v1.0 | First Draft | Core prompt structure, smart filtering, craft rules |
| v1.1 | — | Improved dialogue naturalness, better pacing detection |
| v1.2 | — | Scene-level emotional arc tracking |
| v2.0 | — | Multi-model pipeline (outline on fast model, prose on premium) |

The version number is embedded in the system prompt so output quality can be tracked and compared across versions.

**Upgrade path:** When a new version ships, existing projects can opt-in or stay on their current version. New projects always get the latest.

---

## Comparison: Current vs. v1.0

| Aspect | Current | v1.0 |
|--------|---------|------|
| Context filtering | All canon entries sent | Only relevant entities, tiered depth |
| Previous chapter | Last 2000 raw chars | Last 3 paragraphs (cleaner handoff) |
| Craft rules | Basic style toggles | Full dialogue/pacing/prose intelligence |
| Post-generation | Manual canon updates | Auto-summary, auto-state updates |
| Input tokens | ~3,000-5,000 (wasteful) | ~1,400-2,200 (surgical) |
| Relevance density | Low (lots of noise) | High (every token earns its place) |

---

*Last updated: 2025-02-24*
*Architecture author: Oscar (Theodore dev)*
