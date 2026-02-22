import { create } from 'zustand';
import type { UserPlan, CreditTransaction, PlanTier } from '../types/credits';
import { generateId } from '../lib/utils';

interface CreditsState {
  plan: UserPlan;
  transactions: CreditTransaction[];
  showUpgradeModal: boolean;
  showSettingsModal: boolean;

  // Actions
  spendCredits: (amount: number, action: CreditTransaction['action'], meta?: Partial<CreditTransaction>) => boolean;
  canAfford: (amount: number) => boolean;
  setPlan: (tier: PlanTier, credits: number) => void;
  setByokKey: (key: string) => void;
  setShowUpgradeModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;

  // Stripe-ready hooks
  getStripeCheckoutData: () => { tier: PlanTier; customerId?: string };
  handleStripeWebhook: (event: string, data: any) => void;
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  plan: {
    tier: 'writer',
    creditsTotal: 10000,
    creditsUsed: 65,
    creditsRemaining: 9935,
    renewsAt: new Date(Date.now() + 22 * 86400000).toISOString(),
  },
  transactions: [],
  showUpgradeModal: false,
  showSettingsModal: false,

  spendCredits: (amount, action, meta = {}) => {
    const { plan } = get();
    
    // BYOK users don't spend credits
    if (plan.tier === 'byok') {
      set((s) => ({
        transactions: [...s.transactions, {
          id: generateId(),
          action,
          creditsUsed: 0,
          tokensInput: meta.tokensInput || 0,
          tokensOutput: meta.tokensOutput || 0,
          model: meta.model || 'byok',
          projectId: meta.projectId,
          chapterId: meta.chapterId,
          timestamp: new Date().toISOString(),
        }],
      }));
      return true;
    }

    if (plan.creditsRemaining < amount) {
      set({ showUpgradeModal: true });
      return false;
    }

    set((s) => ({
      plan: {
        ...s.plan,
        creditsUsed: s.plan.creditsUsed + amount,
        creditsRemaining: s.plan.creditsRemaining - amount,
      },
      transactions: [...s.transactions, {
        id: generateId(),
        action,
        creditsUsed: amount,
        tokensInput: meta.tokensInput || amount * 800,
        tokensOutput: meta.tokensOutput || amount * 200,
        model: meta.model || 'claude-sonnet',
        projectId: meta.projectId,
        chapterId: meta.chapterId,
        timestamp: new Date().toISOString(),
      }],
    }));
    return true;
  },

  canAfford: (amount) => {
    const { plan } = get();
    return plan.tier === 'byok' || plan.creditsRemaining >= amount;
  },

  setPlan: (tier, credits) => {
    set((s) => ({
      plan: {
        ...s.plan,
        tier,
        creditsTotal: credits,
        creditsRemaining: credits - s.plan.creditsUsed,
      },
    }));
  },

  setByokKey: (key) => {
    set((s) => ({
      plan: { ...s.plan, tier: 'byok', byokApiKey: key },
    }));
  },

  setShowUpgradeModal: (show) => set({ showUpgradeModal: show }),
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),

  // Stripe-ready: returns data needed for Stripe Checkout Session
  getStripeCheckoutData: () => {
    const { plan } = get();
    return { tier: plan.tier, customerId: plan.stripeCustomerId };
  },

  // Stripe-ready: processes webhook events
  // In production, this would be called from your backend after verifying the webhook
  handleStripeWebhook: (event, data) => {
    switch (event) {
      case 'checkout.session.completed':
        set((s) => ({
          plan: {
            ...s.plan,
            stripeCustomerId: data.customerId,
            stripeSubscriptionId: data.subscriptionId,
          },
        }));
        break;
      case 'customer.subscription.updated':
        // Handle plan changes
        break;
      case 'customer.subscription.deleted':
        set((s) => ({
          plan: { ...s.plan, tier: 'free', creditsTotal: 500, creditsRemaining: 500 - s.plan.creditsUsed },
        }));
        break;
      case 'invoice.payment_succeeded':
        // Reset credits on renewal
        set((s) => ({
          plan: { ...s.plan, creditsUsed: 0, creditsRemaining: s.plan.creditsTotal },
        }));
        break;
    }
  },
}));
