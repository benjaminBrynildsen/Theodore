# Continuity Engine: Mobile Port Kit

This kit brings the web app's story-continuity upgrade to the Theodore mobile app, so characters, objects, and established details carry from chapter to chapter.

**Web is the source of truth.** Everything in `continuity/` is generated from the web repo. Don't edit it in the mobile repo; change the web source and regenerate it (see *Keeping the two apps in sync*).

## What's in the kit

| File | What it does |
|---|---|
| `continuity/story-memory.ts` | Builds each character's and object's state "as of" any chapter from per-chapter memory. Also picks the relevant canon for a chapter, renders the character, artifact, rule, and event cards, filters out old placeholder text, and builds the **CURRENT STATE** and **ESTABLISHED FACTS** prompt sections. Main entry point: `buildCanonAndMemory()`. |
| `continuity/continuity-extraction.ts` | The post-generation `extract-continuity` call: `buildContinuityExtractionPrompt()`, `EXTRACTION_REQUEST` (model settings), and `applyContinuityExtraction()`, which turns the AI response into the chapter-metadata patch. `staleNoticeUpdates()` flags later chapters when earlier memory changes. |
| `continuity/continuity-context.ts` | Story-so-far block: tiered chapter summaries, open plot threads, recent dialogue, and the previous chapter in full. Entry points: `buildContinuityContext()` and `formatContinuityBlock()`. |
| `continuity/types.ts` | Canon types (identical to web) plus the minimal `Chapter` shape the engine reads. |
| `continuity/index.ts` | Re-exports everything. |
| `continuity.selftest.ts` | `npx tsx continuity.selftest.ts` checks the port works. |
| `PROMPT.md` | A ready-to-paste prompt for a Claude Code session in the mobile repo that does the integration. |

The engine is plain TypeScript with no React, store, or network imports, so it runs in React Native as is.

## The data contract (why both apps must use the same code)

Memory is stored on each chapter in `aiIntentMetadata`. That's a JSONB column (`ai_intent_metadata`) that the API returns and saves unchanged, so memory extracted on either device is available on both. The keys:

| Key | Written by | Read by |
|---|---|---|
| `summary`, `richSummary` | extraction | story-so-far tiers, premise cascade |
| `openedThreads`, `resolvedThreadIds` | extraction (thread ids stay stable across re-extraction) | open-threads block |
| `characterState`, `artifactState`, `facts` | extraction | CURRENT STATE / ESTABLISHED FACTS, canon cards |
| `continuityIssues` | extraction (the author's dismissals are kept) | contradictions UI |
| `continuitySourceHash`, `continuitySourceSig`, `continuitySourceLength`, `continuityExtractedAt` | extraction | `needsReextraction()`, which decides whether an edit needs a new extraction |
| `continuityStale` | `staleNoticeUpdates()` | "an earlier chapter changed" notice |

⚠️ `PATCH /api/chapters/:id` **replaces** the whole `aiIntentMetadata` object. Always merge the patch into the **latest** copy of the chapter; never send an old copy. The web app does this in `patchChapterMeta()`.

## Integration points in the mobile app

1. **After a chapter is generated:** build the extraction prompt, call the AI with `EXTRACTION_REQUEST` (`action: 'extract-continuity'`, `temperature: 0.2`, `maxTokens: 3000`), then call `applyContinuityExtraction()`. Merge `metaPatch` into the chapter's metadata and save it. For each `staleNoticeUpdates()` entry, merge `{ continuityStale }` into that later chapter.
2. **After prose changes** (extend, edits, rewrites): wait about 60 seconds after the text stops changing. Then, if `needsReextraction(meta, prose)` is true, run step 1 again. Skip this for guests (20 AI calls/hour); guests only re-extract when they tap a manual Re-check.
3. **Every chapter-writing and editing prompt** should include:
   - `buildCanonAndMemory(canon, chapter, allChapters, true)`: canon cards plus CURRENT STATE and ESTABLISHED FACTS
   - `formatContinuityBlock(buildContinuityContext(project, allChapters, chapter.id))`: the story so far
   - for Extend or continue: the tail of the current draft (web uses the last 6,000 characters)
4. **Optional UI:** show `continuityIssues` (not dismissed) and `continuityStale` on the chapter screen, with Re-check and Dismiss.

## Server

The API change that makes this reliable is in the web repo's `server/index.ts` (`LOCK_EXEMPT_ACTIONS`). Background analysis calls, including `extract-continuity`, no longer compete for the one-generation-at-a-time lock that used to return 429. It takes effect for both apps once that server is deployed. Nothing on the server is needed for mobile beyond that.

## Keeping the two apps in sync

In the web repo:

```bash
npm run build:mobile-port        # regenerates docs/mobile-port/continuity/
npm run test:story-memory        # web tests
npx tsx docs/mobile-port/continuity.selftest.ts
```

Then copy `docs/mobile-port/continuity/` over the mobile app's `lib/continuity-port/continuity/`. Longer term, see "Connecting the repos" below.

## Connecting the repos (options)

1. **Copy the kit (this approach).** Simple, with no build changes. The generated-file header and the self-test keep drift visible.
2. **Shared package.** Move `continuity/` into a small package (a git submodule, or a private npm/GitHub package) that both apps import. This removes the copying step.
3. **Server-side.** Have the API build the continuity blocks and run extraction itself (for example `POST /api/chapters/:id/continuity`). Both apps then call one endpoint, and there's no client logic to keep in sync. This is the most robust option, but it's a bigger change.
