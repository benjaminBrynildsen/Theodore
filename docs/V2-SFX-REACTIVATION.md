# V2: Re-enable Sound Effects (SFX)

> Disabled in V1 (commit `c6a763b`, 2026-03-24). All code preserved behind a feature flag.

## How to Re-enable

**One-line change:**

```ts
// src/lib/feature-flags.ts
export const FEATURES = {
  SFX_ENABLED: true,  // ← flip this from false to true
} as const;
```

That's it. Build and deploy.

## What Gets Re-enabled

| Feature | File(s) |
|---------|---------|
| Inline `{sfx:description}` tagging in prose | `src/lib/post-generation-pipeline.ts`, `src/components/views/ChapterView.tsx` |
| Background/ambient SFX planning | `src/lib/post-generation-pipeline.ts`, `src/components/features/AudiobookPanel.tsx` |
| Intro/outro scene sounds | `src/lib/post-generation-pipeline.ts` |
| SFX badges in chapter view | `src/components/views/ChapterView.tsx` (SceneSFXBadges) |
| SFX badges in audiobook panel | `src/components/features/AudiobookPanel.tsx` (SceneSFXBadges) |
| "Inline SFX" + "Plan Sounds" buttons | `src/components/features/AudiobookPanel.tsx` |
| SFX status indicator | `src/components/features/AudiobookPanel.tsx` |
| SFX availability API check | `src/components/features/AudiobookPanel.tsx` (calls `/api/sfx/status`) |
| Auto-ambient SFX from emotion analysis | `src/components/features/AudiobookPanel.tsx` |

## What Was NOT Touched (always active)

- Narrator voices + TTS generation
- Voice direction tags (`[sigh]`, `[whisper]`, etc.)
- Character dialogue tags (`[CharacterName]`)
- Server-side SFX endpoints (just won't be called while disabled)
- `SceneSFX` type + `sfx` field on Scene interface (data model unchanged)

## Files Modified

- `src/lib/feature-flags.ts` — **the toggle** (created for this)
- `src/lib/post-generation-pipeline.ts` — SFX tagging + ambient generation gated
- `src/components/views/ChapterView.tsx` — SFX buttons hidden, inline badges hidden, SceneSFXBadges gated
- `src/components/features/AudiobookPanel.tsx` — batch SFX, plan SFX, SFX status, SFX badges all gated

## Server Side

No server changes needed. The SFX endpoints (`/api/sfx/*`) still exist and work — they just aren't called by the UI when the flag is off. When you flip the flag, everything reconnects automatically.
