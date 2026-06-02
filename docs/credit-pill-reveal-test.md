# Credit Pill Reveal Test — scarcity priming hypothesis

**Test started:** 2026-06-02
**Status:** Live in prod (web only)
**Owner:** Ben

## Hypothesis

Constantly showing free users "X / Y credits remaining" in the top bar
triggers scarcity rationing — users see a depleting counter, feel
anxiety, and ration credit-spending behavior even when they have plenty
of surplus. This suppresses engagement *before* they ever hit the cap,
which is exactly the window where the wow-moment (audio gen, multi-voice,
etc.) should be hooking them.

If true, removing the numeric counter while users are still well above
the cap should increase free-tier engagement (credits used per active
user, sessions per week, % who reach key moments like audio playback)
without hurting conversion — and possibly *increase* conversion because
users hit the cap with more invested in the product.

## The intervention

Single change in `src/components/credits/CreditsBadge.tsx`:

- **Free authed users** with **>30% credits remaining** see a generic
  "Free" pill (Sparkles icon + "Free" text). Same destination on tap
  (opens Usage view in settings), no numeric scarcity trigger.
- Once they drop **≤30%**, the original numeric pill returns with the
  full bar + balance, so they get a real warning before hitting zero.
- Guests, paid users, and free users below threshold are unchanged.

Threshold tunable via `PILL_REVEAL_THRESHOLD_PCT` constant in the same
file (currently `30`).

The popup `CreditNudge` (50% / 25% / 10% milestone toasts) is **NOT**
changed in this iteration — keeping it isolated to the persistent pill
so we can attribute any effect to the pill specifically.

## Tracking

- New event `credit_pill_revealed` fires once per session when a free
  user crosses below the threshold and the numeric pill reappears.
  Payload: `{ credits_remaining, credits_total, threshold_pct }`.
- Existing events (audio_play_started, generate-chapter, etc.) carry
  forward and form the engagement comparison.

## Baseline cohort data (the "why" — collected 2026-06-02)

Free users excluding admin accounts, ≥1 day old (n=126):

| Cap | n | Avg used | Median used | % activated | % hit ~cap |
|-----|---|---------|-------------|-------------|-----------|
| 100 | 22 | 32 | 13 | 59% | 18% |
| 250 | 11 | 95 | 57 | **82%** | 27% |
| 500 | 43 | 145 | 31 | 70% | 14% |
| 1000 | 50 | 152 | 29 | 64% | 4% |

Key observations:
- 250→500 cap nearly doubled absolute usage (95 → 145) — strong signal
  that higher headroom relieves rationing.
- 500→1000 only went from 145 → 152 — diminishing returns; users don't
  use much more even with massive cap.
- 250-cap cohort has **highest activation rate** (82%) — small caps
  don't intimidate, they make credits feel meaningful.
- 1000-cap cohort drops to 64% activation — too much makes the resource
  feel cheap, users don't engage.

## What we're watching

Re-run the cohort comparison weekly. Look for:

1. **Average credits used per active free user** (especially the 250-cap
   cohort under the new policy vs the 250-cap cohort pre-experiment).
   Expect to see this rise.
2. **% of free users who reach audio_play_started** in their first 7
   days. Expect to see this rise.
3. **Free → paid conversion rate** (writer/author signups within 14
   days of signup). Hold-or-rise is the success criterion; if it drops,
   we revert.
4. **`credit_pill_revealed` event volume** vs total free users — tells
   us how often the threshold actually fires for real users.

## Reverting

To kill the experiment, revert the commit to `CreditsBadge.tsx` or
set `PILL_REVEAL_THRESHOLD_PCT = 0` so the gate is always open and the
numeric pill always shows. No DB or migration changes needed.

## Mobile

Mobile is **not** included in this iteration. Mobile cohort is too
small (~6 iOS users) to detect a signal, and the mobile credit display
lives in different surfaces (project view, chapter view, generate
controls) — applying the same gate cleanly would require touching
several components. If the web result is positive, we'll port.

## Open questions for follow-up

- Should we also gate the `CreditNudge` 50% threshold toast? Same
  scarcity-priming concern, but it only fires once per period so the
  effect is bounded. Worth a second test if the pill change works.
- Threshold tuning: 30% may be too eager. 20% might let users get
  even more engaged before the warning. A/B the threshold next.
- Does the activation-vs-usage tension above mean a *dynamic* free
  cap is better — start at 250, raise to 500 after first audio gen?
