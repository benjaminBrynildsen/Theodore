// Client-side mirror of server/billing.ts:isPaidPlanTier. Source of truth lives
// server-side; this helper is only for UI gating (show/hide upgrade prompts,
// disable paid-tier toggles). Never use this to actually authorize an action
// — the server checks the plan again before performing paid work.

const PAID_PLANS = new Set(['writer', 'author', 'studio', 'publisher']);

export function isPaidPlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  return PAID_PLANS.has(plan);
}
