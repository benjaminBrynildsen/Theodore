// ========== Credits System ==========

export type PlanTier = 'free' | 'writer' | 'author' | 'studio';

export interface UserPlan {
  tier: PlanTier;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  renewsAt?: string; // ISO date
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeSubscriptionStatus?: string | null;
  stripeCurrentPeriodEnd?: string | null;
  stripeCancelAtPeriodEnd?: boolean;
  stripePriceTier?: string | null;
}

export interface CreditCost {
  action: CreditAction;
  estimatedCredits: number;
  model: string;
  description: string;
}

export type CreditAction =
  | 'chat-message'
  | 'generate-premise'
  | 'generate-chapter-full'
  | 'generate-chapter-outline'
  | 'generate-dialogue'
  | 'generate-action-skeleton'
  | 'polish-rewrite'
  | 'canon-validation'
  | 'red-team-review'
  | 'plan-project';

export interface CreditTransaction {
  id: string;
  action: CreditAction;
  creditsUsed: number;
  tokensInput: number;
  tokensOutput: number;
  model: string;
  projectId?: string;
  chapterId?: string;
  timestamp: string;
}

// Cost estimates per action (in credits, 1 credit = 1,000 tokens)
export const CREDIT_COSTS: Record<CreditAction, { min: number; max: number; typical: number; label: string }> = {
  'chat-message':              { min: 1,  max: 3,   typical: 2,   label: 'Chat message' },
  'generate-premise':          { min: 2,  max: 5,   typical: 3,   label: 'Generate premise' },
  'generate-chapter-full':     { min: 15, max: 40,  typical: 25,  label: 'Write full chapter' },
  'generate-chapter-outline':  { min: 5,  max: 12,  typical: 8,   label: 'Scene outline' },
  'generate-dialogue':         { min: 8,  max: 20,  typical: 12,  label: 'Dialogue first' },
  'generate-action-skeleton':  { min: 5,  max: 15,  typical: 10,  label: 'Action skeleton' },
  'polish-rewrite':            { min: 10, max: 25,  typical: 15,  label: 'Polish / rewrite' },
  'canon-validation':          { min: 1,  max: 3,   typical: 2,   label: 'Canon validation' },
  'red-team-review':           { min: 3,  max: 8,   typical: 5,   label: 'Red team review' },
  'plan-project':              { min: 5,  max: 15,  typical: 10,  label: 'Plan project' },
};

export const BILLING_COST_PER_CREDIT_USD = 0.0001;
export const BILLING_MARKUP_MULTIPLE = 10;

export const PAID_TIER_CREDITS: Record<'writer' | 'author' | 'studio', number> = {
  writer: 10000,
  author: 30000,
  studio: 100000,
};

function monthlyPriceForCredits(credits: number): string {
  const internalCost = credits * BILLING_COST_PER_CREDIT_USD;
  const retail = internalCost * BILLING_MARKUP_MULTIPLE;
  return `$${Math.round(retail).toLocaleString()}/mo`;
}

export const PLAN_DETAILS: Record<PlanTier, {
  name: string;
  price: string;
  credits: number;
  description: string;
  features: string[];
}> = {
  free: {
    name: 'Free',
    price: '$0',
    credits: 500,
    description: 'Try Theodore',
    features: ['500 credits/month', '1 active project', 'Standard models'],
  },
  writer: {
    name: 'Writer',
    price: monthlyPriceForCredits(PAID_TIER_CREDITS.writer),
    credits: PAID_TIER_CREDITS.writer,
    description: 'For consistent drafting',
    features: ['10,000 credits/month', 'Unlimited projects', 'Model selection', 'Priority generation'],
  },
  author: {
    name: 'Author',
    price: monthlyPriceForCredits(PAID_TIER_CREDITS.author),
    credits: PAID_TIER_CREDITS.author,
    description: 'For high-volume output',
    features: ['30,000 credits/month', 'Unlimited projects', 'Premium models', 'Priority generation', 'Export tools'],
  },
  studio: {
    name: 'Studio',
    price: monthlyPriceForCredits(PAID_TIER_CREDITS.studio),
    credits: PAID_TIER_CREDITS.studio,
    description: 'For teams and heavy production',
    features: ['100,000 credits/month', 'Unlimited projects', 'Fastest queue', 'Priority support', 'Advanced exports'],
  },
};
