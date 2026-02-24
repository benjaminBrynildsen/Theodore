export type PaidPlanTier = 'writer' | 'author' | 'studio';

export interface BillingTierConfig {
  tier: PaidPlanTier;
  name: string;
  credits: number;
  estimatedApiCostUsd: number;
  priceUsd: number;
  priceCents: number;
  markupMultiple: number;
  summary: string;
}

const COST_PER_CREDIT_USD = Number(process.env.CREDIT_COST_PER_CREDIT_USD || '0.0001');
const MARKUP_MULTIPLE = Number(process.env.BILLING_MARKUP_MULTIPLE || '10');

const TIER_CREDITS: Record<PaidPlanTier, number> = {
  writer: 10000,
  author: 30000,
  studio: 100000,
};

const TIER_LABELS: Record<PaidPlanTier, string> = {
  writer: 'Writer',
  author: 'Author',
  studio: 'Studio',
};

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function toCents(usd: number): number {
  return Math.max(50, Math.round(usd * 100));
}

function buildTier(tier: PaidPlanTier): BillingTierConfig {
  const credits = TIER_CREDITS[tier];
  const estimatedApiCostUsd = roundUsd(credits * COST_PER_CREDIT_USD);
  const priceUsd = roundUsd(estimatedApiCostUsd * MARKUP_MULTIPLE);
  const priceCents = toCents(priceUsd);
  return {
    tier,
    name: TIER_LABELS[tier],
    credits,
    estimatedApiCostUsd,
    priceUsd,
    priceCents,
    markupMultiple: MARKUP_MULTIPLE,
    summary: `${credits.toLocaleString()} credits / month`,
  };
}

const ORDERED_TIERS: PaidPlanTier[] = ['writer', 'author', 'studio'];

export const BILLING_TIERS: Record<PaidPlanTier, BillingTierConfig> = {
  writer: buildTier('writer'),
  author: buildTier('author'),
  studio: buildTier('studio'),
};

export function isPaidPlanTier(value: string): value is PaidPlanTier {
  return value === 'writer' || value === 'author' || value === 'studio';
}

export function getPaidTierConfig(tier: string): BillingTierConfig | null {
  if (!isPaidPlanTier(tier)) return null;
  return BILLING_TIERS[tier];
}

export function listPaidTierConfigs(): BillingTierConfig[] {
  return ORDERED_TIERS.map((tier) => BILLING_TIERS[tier]);
}

export function getStripePriceIdForTier(tier: PaidPlanTier): string | null {
  const map: Record<PaidPlanTier, string | undefined> = {
    writer: process.env.STRIPE_PRICE_WRITER,
    author: process.env.STRIPE_PRICE_AUTHOR,
    studio: process.env.STRIPE_PRICE_STUDIO,
  };
  return map[tier] || null;
}

let stripeClientPromise: Promise<any | null> | null = null;

export async function getStripeClient(): Promise<any | null> {
  if (stripeClientPromise) return stripeClientPromise;
  stripeClientPromise = (async () => {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (!secret) return null;
    const stripeModule = await import('stripe').catch(() => null);
    if (!stripeModule) return null;
    const StripeCtor = (stripeModule as any).default || stripeModule;
    return new StripeCtor(secret, { apiVersion: '2024-06-20' });
  })();
  return stripeClientPromise;
}
