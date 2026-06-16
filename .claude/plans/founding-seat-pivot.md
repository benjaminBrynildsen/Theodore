# Theodore Web — Scarcity / Founding-Seat Pivot

## Context

Theodore web works well but conversion is poor: free users sign up and never pay. Ben wants to copy the playbook that worked for Wilhelm Cold Brew — turn the front door into a **price-aware email waitlist**, then open a **hard-capped number of paid seats each week**. The thesis: by conditioning the list on the price *before* they ever get access, every person who converts is an intentional, warm, price-accepted buyer — eliminating the free-rider problem.

**Decisions locked with Ben:**
- **Existing users keep everything, untouched.** Only the front door for logged-out / brand-new people changes.
- **Free signup is killed for new users.** New people can only get in by paying.
- **Offer:** one-time **$99 founding price** (reg. $147) = **3 months of Author-tier access** (7,500 credits/mo) **+ a printed, shipped copy of their finished book**.
- **Seat mechanic:** **10 founding seats open per week, first-come, hard cap**, auto-"sold out" at the 10th claim — exactly like Wilhelm's `drops`/`bottle_cap`.

**Outcome:** ads → email-capture landing (price stated up front) → weekly drop email with a buy link → $99 checkout creates the account, grants 3 months access, claims a seat, and records the printed-book entitlement.

## Reference pattern

Wilhelm Cold Brew (`/home/wolfgang/wilhelm-cold-brew`) is the blueprint: `server/db.js:124-161` (`drops`+`orders` schema), `server/checkout.js:304-322` (`finalizePaidOrder` — conditional `UPDATE ... SET status='soldout'` at cap + `WHERE status<>'paid' RETURNING` idempotency). Theodore already has attribution (`server/attribution.ts`, `theodore_attrib` cookie + `utm_*` columns), bulk email (`server/email.ts`, Gmail SMTP + templates + open-tracking + unsubscribe), and an admin dashboard with funnel/email tabs — so ~80% of the plumbing exists. We are porting the *missing* Wilhelm pieces: lead capture, capped weekly drops, and account-creation-on-payment.

---

## Backend

### 1. Schema (`server/schema.ts`) — all additive (safe `db:push`)

New columns on `users` (after the stripe block, ~line 22):
- `foundingStatus text` — null | 'active' | 'expired'
- `foundingExpiresAt timestamp` — grant time + 3 months
- `foundingPeriodEnd timestamp` — end of current 1-month credit window
- `foundingPeriodsUsed integer default 0` — 0..3 monthly refills granted
- `foundingDropId integer` — which seat they hold

Founding users reuse `plan='author'` so all existing credit-gating and `getTierCredits('author')=7500` work unchanged; the 3-month lifecycle lives in the new columns (real `stripeSubscriptionId` stays null). Add a new `plan='expired'` value for the locked post-3-month state.

New tables (mirror Wilhelm):
- `founding_drops` — `id, week (unique 'YYYY-WW'), seatCap default 10, seatsClaimed default 0, opensAt, status (scheduled|live|soldout|closed), priceCents default 9900`
- `founding_orders` — `id, dropId, email, userId, status (pending|paid|overcap_refunded|refunded), stripeSessionId UNIQUE, stripePaymentIntent UNIQUE, amountCents, seatClaimed, paidAt` — the idempotency + claim ledger
- `fulfillment_grants` — `id, userId, type ('printed_book'), status (pending|address_collected|shipped|fulfilled), shippingAddress jsonb, foundingOrderId, fulfilledAt`
- `founding_leads` — `id, email UNIQUE, dropNotifiedAt, createdAt` + attribution columns (reuse `attributionColumns()` from `server/attribution.ts`)

### 2. Lazy 3-month access (`server/auth.ts`) — no cron for credits

There is no recurring `invoice.paid` for a one-time charge, so refills/expiry are driven lazily on the existing auth path. Add `maybeRefreshFounding(user)` called right after `maybeResetFreeCredits` at `auth.ts:224` (the existing per-request rolling-reset hook):
- **Expiry:** `now >= foundingExpiresAt` → set `foundingStatus='expired'`, `plan='expired'`, credits to 0 (NOT free — free is killed). Existing credit gates (`creditsRemaining <= 0`) then lock generation while keeping library read access.
- **Monthly refill:** `now >= foundingPeriodEnd && foundingPeriodsUsed < 3` → refill to `GREATEST(creditsRemaining, 7500)`, advance `foundingPeriodEnd` by a month, `foundingPeriodsUsed++`. **Loop** the advance to catch up dormant users in one call (avoids needing a cron).
- Add `'author'`/`'expired'` handling to `toSafeUser` (`auth.ts:89`) so the client can render an "access ended — rejoin" wall.

Optional lightweight cron (via `CronCreate`) only for "your access expires in 3 days" emails — not for credits.

### 3. Gate new signups (`server/index.ts`) — minimal, env-flippable

Add `const NEW_SIGNUPS_CLOSED = process.env.FOUNDING_MODE === 'true'`. Guard **only the `if (!user)` insert branch** at each of the three account-creation entry points; leave the existing-user `else` branches and all login/reset paths untouched:
- `/api/auth/register` `:1153` insert branch → `403 {code:'FOUNDING_ONLY'}`
- `/api/auth/google` `:1240` insert branch → same
- `/api/auth/apple` `:1349` insert branch → same

The webhook is then the **only** new-account creator (it inserts via `db.insert(users)` directly, bypassing the guard).

### 4. Founding endpoints (`server/index.ts`, near `/api/billing/boost` ~:812)

- `POST /api/founding/waitlist` — validate email, insert-or-ignore into `founding_leads`, stamp attribution via `readAttribution(req)`, fire price-aware welcome email. Rate-limited via existing `takeRateLimitToken`.
- `GET /api/founding/drop/current` — mirror Wilhelm `checkout.js:64`: returns `{available, dropId, priceCents, seatsRemaining}` for the `live` drop, else `{available:false, soldOut, nextDropAt}`.
- `POST /api/founding/checkout` — **no auth** (buyer has no account). Soft-checks a live drop has a seat, then creates a Stripe Checkout `mode='payment'`, `unit_amount: 9900`, `customer_email` prefilled, `shipping_address_collection` on (for the book), `metadata:{type:'founding', dropId, email}`. Insert a `pending` `founding_orders` row keyed on `session.id`. No account/customer created yet. Returns `{url}`.
- `GET /api/founding/order/:session` — success-page poll; returns order status.

### 5. Webhook branch (`server/index.ts` webhook ~:948) — the core

Add a branch **before** the generic `checkout.session.completed` handler, matching `mode==='payment' && metadata.type==='founding'` → `handleFoundingPaid(session)`. Also add `payment_intent.payment_failed` / `checkout.session.expired` → mark order `failed`, and a no-op `charge.refunded` log branch.

`handleFoundingPaid` (idempotent, race-safe):
1. **Claim order once:** `UPDATE founding_orders SET status='paid', stripePaymentIntent=… WHERE stripeSessionId=… AND status='pending' RETURNING`. Empty → already processed, return. (Catches webhook retries + the redundant `payment_intent.succeeded` event.)
2. **Claim seat atomically:** `UPDATE founding_drops SET seatsClaimed = seatsClaimed + 1 WHERE id=… AND seatsClaimed < seatCap RETURNING`. Postgres row-locks the drop row so concurrent webhooks serialize. If empty → **over-cap**: `stripe.refunds.create`, mark order `overcap_refunded`, email "sold out, fully refunded, you're first for next week", return. If `seatsClaimed >= seatCap` after increment → conditional flip to `status='soldout'`.
3. **Account (idempotent on email):** if `getUserByEmail` is null → `db.insert(users)` with `plan='author'`, 7,500 credits, `foundingStatus='active'`, `foundingExpiresAt=+3mo`, `foundingPeriodEnd=+1mo`, `foundingPeriodsUsed=1`, `emailVerifiedAt=now`, `passwordHash=null`. If user exists (existing customer bought in) → stack: bump to author, extend 3 months, `creditsRemaining=GREATEST(current,7500)`.
4. **Fulfillment:** insert `fulfillment_grants{type:'printed_book', shippingAddress: session.shipping_details}`.
5. **Log them in:** for a new passwordless user, `setResetToken` (`auth.ts:270`) and email a "set your password & sign in" link → reuses existing `/api/auth/reset-password` (`:1515`) which mints the session on submit. (Webhook has no buyer browser, so no direct cookie.)

### 6. Email (`server/email.ts`)

Add `sendFoundingWelcome` (price-aware: states $99/3mo/book + "10 seats open weekly, we'll email you"), `sendFoundingSeatLive` (drop-open blast with buy link), `sendFoundingSetPassword` (post-purchase login link), `sendFoundingSoldOutRefund`. Reuse `sendToUser`/template + tracking-pixel/unsubscribe infrastructure.

---

## Frontend

### 7. Front-door gating
- `src/components/views/LandingPage.tsx` — for logged-out visitors, the primary CTA becomes **"Get on the list"** (email capture → `POST /api/founding/waitlist`) with the price stated up front (`$99 · 3 months + your book in print · 10 seats/week`). Keep a small **"Already a member? Sign in"** link → existing `AuthView` login mode. Reuse the not-wired email field already in `src/components/features/PreOrderPage.tsx:62` (`handleNotifyMe`) as the capture component.
- `public/go/index.html` + `public/go2/index.html` (ad landing) — swap the signup CTA for the same email-capture form (keep the Meta/X pixels). This is the workhorse ad target.
- `AuthView.tsx` — register mode shows "signups are invite-only right now — get on the list" when `FOUNDING_ONLY` is returned; login unchanged.

### 8. Buy / sold-out / success views (new, small)
- **Buy view** (when a drop is `live`): seat counter (`7 of 10 taken`), `$99` CTA → `POST /api/founding/checkout` → redirect to Stripe. Reads `GET /api/founding/drop/current`.
- **Sold-out view**: when `soldOut`, show "this week's 10 seats are gone — next 10 open Monday" + stay-on-list confirmation (mirror Wilhelm sold-out demand capture).
- **Success view** (`?billing=founding_success&session_id=…`): poll `GET /api/founding/order/:session`; once `paid`, "Check your email to set your password and start writing."

### 9. Admin (`src/components/admin/`, `server/admin.ts`)
- **New "Founding" tab:** waitlist size + signups-by-ad/source (reuse the conversion query pattern), current drop status + seats claimed, **create/schedule a drop** and **flip to live** (triggers the seat-live blast to leads), founding conversion rate (leads → seats).
- **Fulfillment list:** printed-book grants with shipping address, mark `shipped`/`fulfilled`.
- Extend the existing **Email tab** audience targeting to include `waitlist` (the `founding_leads` list) so Ben can nurture the list with the block composer he already has.

---

## Rollout (sequenced to dodge the 502 risk)

`render.yaml:15` runs `drizzle-kit push --force || true` (90s timeout, swallows failures). All schema changes are additive, but if code deploys before columns exist, founding endpoints 500 with "column does not exist." So:
1. **Deploy schema only first** (step 1), confirm columns/tables exist in the DB.
2. Then deploy backend logic (steps 2–6) with `FOUNDING_MODE` **off** — nothing changes for anyone yet.
3. Deploy frontend (steps 7–9).
4. **Flip `FOUNDING_MODE=true`** to close new free signups and turn the front door into the waitlist. Existing users see no change.
5. Create the first weekly drop, flip it live, blast the list.

Per Ben's standing prefs: this is risky/payments-touching, so deploy via **staging first** and PR-off-main rather than straight to trunk; flag the deploy-timing/502 window before pushing.

## Verification (end-to-end)

- **Schema:** after step 1, confirm new columns/tables via a read query; existing users' `foundingStatus` backfills null (treated as non-founding) — load the app as an existing user, confirm zero behavior change.
- **Gating:** with `FOUNDING_MODE=true`, attempt `/api/auth/register` with a fresh email → expect `403 FOUNDING_ONLY`; log in as an existing user → succeeds.
- **Happy path (Stripe test mode):** waitlist signup → drop live → buy link → pay $99 with test card → webhook creates account, grants 7,500 credits + `foundingStatus='active'`, claims a seat, creates `fulfillment_grants` row, sends set-password email; set password → land in app with full access.
- **Hard cap:** script 12 concurrent test checkouts against a cap-10 drop → exactly 10 `paid`+seated, drop flips `soldout`, 2 `overcap_refunded` with refunds issued; no oversell.
- **Idempotency:** replay the same `checkout.session.completed` event (Stripe CLI `stripe events resend`) → no second account, seat, or email.
- **3-month lifecycle:** manually backdate `foundingPeriodEnd`/`foundingExpiresAt` on a test user, hit an authed endpoint → confirm monthly refill to 7,500, then expiry to `plan='expired'` + 0 credits + locked generation but readable library.
- Run locally on **port 5050** per project convention; use Stripe test keys + `stripe listen` to forward webhooks.
