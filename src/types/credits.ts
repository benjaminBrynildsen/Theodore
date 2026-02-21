// ========== Credits System ==========

export type PlanTier = 'free' | 'writer' | 'author' | 'byok';

export interface UserPlan {
  tier: PlanTier;
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  renewsAt?: string; // ISO date
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  byokApiKey?: string; // encrypted, for BYOK users
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
    price: '$12/mo',
    credits: 10000,
    description: 'For serious writers',
    features: ['10,000 credits/month', 'Unlimited projects', 'All models', 'Priority generation'],
  },
  author: {
    name: 'Author',
    price: '$29/mo',
    credits: 30000,
    description: 'For professionals',
    features: ['30,000 credits/month', 'Unlimited projects', 'Premium models', 'Priority generation', 'Export tools'],
  },
  byok: {
    name: 'Bring Your Key',
    price: '$5/mo',
    credits: 0,
    description: 'Use your own API key',
    features: ['Unlimited usage', 'Your API costs', 'All features', 'Platform fee only'],
  },
};
