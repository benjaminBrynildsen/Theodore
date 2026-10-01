# Prompt for the mobile repo

Copy this whole `mobile-port/` folder into the mobile repo as `lib/continuity-port/` (the engine is in `lib/continuity-port/continuity/`). Then start a Claude Code session in the mobile repo and paste everything below the line.

---

I'm bringing the web app's story-continuity upgrade to this mobile app. The goal is for characters, objects, and established details to stay consistent from chapter to chapter instead of drifting or "popping".

I've added a ported module at `lib/continuity-port/continuity/`. It's generated from the Theodore web repo, so **don't edit files inside it**; adapt at the call sites instead. Read `lib/continuity-port/README.md` first; it explains the design and the data contract. In short:

- `buildCanonAndMemory(canon, chapter, allChapters, true)` returns the canon cards plus **CURRENT STATE** (each character's and object's state as of the previous chapter) and **ESTABLISHED FACTS** (details already on the page) for a chapter prompt.
- `formatContinuityBlock(buildContinuityContext(project, allChapters, chapter.id))` returns the story-so-far block: tiered summaries, open threads, recent dialogue, and the previous chapter.
- `buildContinuityExtractionPrompt({ projectTitle, chapter, allChapters, canon })` plus `EXTRACTION_REQUEST` is the post-generation AI call. `applyContinuityExtraction(responseText, proseThatWasSent, latestChapter, canon)` returns `{ metaPatch, memoryChanges }`. `staleNoticeUpdates(chapter, allChapters, memoryChanges)` returns patches for later chapters.
- `needsReextraction(chapter.aiIntentMetadata, prose)` says whether an edit changed the story enough to re-extract. Tag-only and typo-level edits return false.
- All memory lives in `chapter.aiIntentMetadata`, using the same keys as the web app, so memory is shared across devices. `PATCH /api/chapters/:id` **replaces** the whole `aiIntentMetadata`, so always merge into the latest copy of the chapter.

Please do the following:

1. **Explore first.** Find where this app:
   - builds chapter-generation, extend/continue, and edit prompts
   - runs anything after a chapter is generated
   - stores and syncs chapters, including how `aiIntentMetadata` is read and written
   - loads canon entries

   Check whether the app already has its own version of the story-so-far or continuity context, and replace it with the ported one rather than running both. Tell me what you found before making large changes.
2. **Type adapter.** If this app's `Chapter` or canon types differ from `lib/continuity-port/continuity/types.ts`, write a small adapter at the call sites. Don't edit the module.
3. **Prompts.** Add `buildCanonAndMemory(...)` and the continuity block to every chapter-writing prompt (generate, extend/continue, scene generation) and every edit prompt. For extend/continue, also include the last ~6,000 characters of the current draft, with an instruction to continue from its final sentence without repeating. Remove any old canon section it replaces, so profiles aren't sent twice. You can delete `PROMPT.md` from the port folder once you've finished.
4. **Extraction after generation.** When a chapter finishes generating (and after any background rewrite of its prose has finished), run the extraction:
   - Call the existing generate endpoint with `action: 'extract-continuity'` and the `EXTRACTION_REQUEST` settings.
   - Apply the response, merge `metaPatch` into the latest chapter metadata, and save it.
   - Apply the stale-notice patches to later chapters.
   - Handle failures quietly; this is background work.
5. **Refresh after edits.** When a chapter's prose changes (extend, AI edit, manual edit), debounce about 60 seconds. Then, if `needsReextraction` returns true and the user is signed in, re-run step 4. Don't run two extractions for the same chapter at once.
6. **UI (keep it small).** On the chapter screen:
   - If there are non-dismissed `continuityIssues` for the current text (hide them when `needsReextraction` is true), show a compact notice listing them, with Dismiss (set `dismissed: true` on that issue) and Re-check (force step 4).
   - Show `continuityStale` as "Chapter N changed something this chapter relies on", with the same buttons.
7. **Verify.** Run `npx tsx lib/continuity-port/continuity.selftest.ts`, plus this repo's typecheck, lint, and tests. If possible, log one full generation prompt and confirm it contains the CANON, CURRENT STATE, and ESTABLISHED FACTS sections, and no placeholder text like "Guarded but curious" or "[AI will describe".

Constraints:
- Don't change the extraction prompt text or the metadata key names. The web app reads and writes the same data.
- Credits: extraction reads the whole chapter. Don't add extra AI calls beyond one extraction per generation and one per meaningful edit.
- Keep changes focused. Commit on a new branch and summarise what you changed, and anything you couldn't map cleanly, before opening a PR.
