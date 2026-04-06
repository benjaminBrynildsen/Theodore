// ========== Credits System ==========

export type PlanTier = 'free' | 'writer' | 'author' | 'studio' | 'publisher';

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

// Cost estimates per action (credits)
export const CREDIT_COSTS: Record<CreditAction, { min: number; max: number; typical: number; label: string }> = {
  'chat-message':              { min: 2,  max: 8,   typical: 5,   label: 'Chat message' },
  'generate-premise':          { min: 5,  max: 15,  typical: 10,  label: 'Generate premise' },
  'generate-chapter-full':     { min: 20, max: 60,  typical: 30,  label: 'Write full chapter' },
  'generate-chapter-outline':  { min: 8,  max: 20,  typical: 12,  label: 'Scene outline' },
  'generate-dialogue':         { min: 10, max: 30,  typical: 18,  label: 'Dialogue first' },
  'generate-action-skeleton':  { min: 8,  max: 20,  typical: 12,  label: 'Action skeleton' },
  'polish-rewrite':            { min: 15, max: 40,  typical: 25,  label: 'Polish / rewrite' },
  'canon-validation':          { min: 3,  max: 8,   typical: 5,   label: 'Canon validation' },
  'red-team-review':           { min: 5,  max: 15,  typical: 8,   label: 'Red team review' },
  'plan-project':              { min: 8,  max: 25,  typical: 15,  label: 'Plan project' },
};

export const PAID_TIER_CREDITS: Record<'writer' | 'author' | 'studio' | 'publisher', number> = {
  writer: 2500,
  author: 7500,
  studio: 25000,
  publisher: 50000,
};

export const FREE_TIER_CREDITS = 100;
export const FREE_TIER_NAME = 'Dreamer';

const TIER_PRICES: Record<'writer' | 'author' | 'studio' | 'publisher', number> = {
  writer: 10,
  author: 30,
  studio: 99,
  publisher: 200,
};

export const PLAN_DETAILS: Record<PlanTier, {
  name: string;
  price: string;
  credits: number;
  description: string;
  features: string[];
}> = {
  free: {
    name: FREE_TIER_NAME,
    price: '$0',
    credits: FREE_TIER_CREDITS,
    description: 'Try Theodore',
    features: [`${FREE_TIER_CREDITS} credits/month`, '~3 AI chapters', '1 active project'],
  },
  writer: {
    name: 'Writer',
    price: `$${TIER_PRICES.writer}/mo`,
    credits: PAID_TIER_CREDITS.writer,
    description: 'For consistent drafting',
    features: ['2,500 credits/month', '~83 AI chapters', '~5 audio narrations', 'Unlimited projects'],
  },
  author: {
    name: 'Author',
    price: `$${TIER_PRICES.author}/mo`,
    credits: PAID_TIER_CREDITS.author,
    description: 'For serious writers',
    features: ['7,500 credits/month', '~250 AI chapters', '~15 audio narrations', 'Unlimited projects', 'Premium models'],
  },
  studio: {
    name: 'Studio',
    price: `$${TIER_PRICES.studio}/mo`,
    credits: PAID_TIER_CREDITS.studio,
    description: 'Full production house',
    features: ['25,000 credits/month', '~833 AI chapters', '~50 audio narrations', 'Unlimited projects', 'Priority support'],
  },
  publisher: {
    name: 'Publisher',
    price: `$${TIER_PRICES.publisher}/mo`,
    credits: PAID_TIER_CREDITS.publisher,
    description: 'For publishing houses & prolific authors',
    features: ['50,000 credits/month', '~1,666 AI chapters', '~100 audio narrations', 'Unlimited projects', 'Premium models', 'Priority support', 'Dedicated onboarding'],
  },
};
