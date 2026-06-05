export type PaidPlanTier = 'writer' | 'author' | 'studio' | 'publisher';

export interface BillingTierConfig {
  tier: PaidPlanTier;
  name: string;
  credits: number;
  priceUsd: number;
  priceCents: number;
  summary: string;
}

// ========== Plan Definitions ==========
// Credits priced at ~$0.004 each (Writer tier)
// All actions profitable at every tier (see pricing/PRICING-MODEL.md)

const TIER_CONFIG: Record<PaidPlanTier, { name: string; credits: number; priceUsd: number }> = {
  writer: { name: 'Writer', credits: 2500, priceUsd: 10 },
  author: { name: 'Author', credits: 7500, priceUsd: 49 },
  studio: { name: 'Studio', credits: 25000, priceUsd: 99 },
  publisher: { name: 'Publisher', credits: 50000, priceUsd: 200 },
};

export const FREE_TIER_CREDITS = 300;
export const FREE_TIER_NAME = 'Dreamer';
export const FREE_TIER_RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30d rolling

// ========== One-time Credit Boosts ==========
// Premium-priced one-time top-ups (no subscription). Granted credits land in
// the user's normal `creditsRemaining` pool; the GREATEST(...) refill rule in
// the webhook/reset paths preserves any unspent boost across monthly cycles.
export interface BoostPack {
  id: string;
  priceUsd: number;
  priceCents: number;
  credits: number;
}

const BOOST_PACK_DEFS: Array<{ id: string; priceUsd: number; credits: number }> = [
  { id: 'boost_5', priceUsd: 5, credits: 800 },
  { id: 'boost_10', priceUsd: 10, credits: 1800 },
  { id: 'boost_20', priceUsd: 20, credits: 4000 },
];

export const BOOST_PACKS: BoostPack[] = BOOST_PACK_DEFS.map((p) => ({
  ...p,
  priceCents: Math.round(p.priceUsd * 100),
}));

export function getBoostPack(id: string): BoostPack | null {
  return BOOST_PACKS.find((p) => p.id === id) || null;
}

// ========== Credit Costs Per Action ==========
// TTS is character-based; others are flat

/** TTS: credits per 1,000 characters of prose */
export const TTS_CREDITS_PER_1K_CHARS = 100;

/** Calculate TTS credits from character count */
export function ttsCreditCost(characterCount: number): number {
  return Math.max(TTS_CREDITS_PER_1K_CHARS, Math.ceil(characterCount / 1000) * TTS_CREDITS_PER_1K_CHARS);
}

/** Music generation: flat per track */
export const MUSIC_CREDITS_PER_TRACK = 100;

/** Sound effect generation: flat per generation */
export const SFX_CREDITS_PER_GEN = 40;

/** Image generation: flat per image */
export const IMAGE_CREDITS_PER_GEN = 25;

// ========== Tier Helpers ==========

function buildTier(tier: PaidPlanTier): BillingTierConfig {
  const cfg = TIER_CONFIG[tier];
  return {
    tier,
    name: cfg.name,
    credits: cfg.credits,
    priceUsd: cfg.priceUsd,
    priceCents: Math.round(cfg.priceUsd * 100),
    summary: `${cfg.credits.toLocaleString()} credits / month`,
  };
}

const ORDERED_TIERS: PaidPlanTier[] = ['writer', 'author', 'studio', 'publisher'];

export const BILLING_TIERS: Record<PaidPlanTier, BillingTierConfig> = {
  writer: buildTier('writer'),
  author: buildTier('author'),
  studio: buildTier('studio'),
};

export function isPaidPlanTier(value: string): value is PaidPlanTier {
  return value === 'writer' || value === 'author' || value === 'studio' || value === 'publisher';
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
    publisher: process.env.STRIPE_PRICE_PUBLISHER,
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
