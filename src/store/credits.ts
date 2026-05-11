import { create } from 'zustand';
import type { UserPlan, CreditTransaction, PlanTier } from '../types/credits';
import { generateId } from '../lib/utils';

export type UpgradeReason = 'generic' | 'audio_cap';

export interface UsageReceipt {
  id: string;
  action: string;
  creditsUsed: number;
  shownAt: number;
}

interface CreditsState {
  plan: UserPlan;
  transactions: CreditTransaction[];
  showUpgradeModal: boolean;
  upgradeReason: UpgradeReason;
  showSettingsModal: boolean;
  lastReceipt: UsageReceipt | null;
  dismissReceipt: () => void;

  // Actions
  spendCredits: (amount: number, action: CreditTransaction['action'], meta?: Partial<CreditTransaction>) => boolean;
  canAfford: (amount: number) => boolean;
  setPlan: (tier: PlanTier, credits: number) => void;
  setShowUpgradeModal: (show: boolean, reason?: UpgradeReason) => void;
  setShowSettingsModal: (show: boolean) => void;
  hydrateFromUser: (user: {
    plan?: string | null;
    creditsRemaining?: number | null;
    creditsTotal?: number | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    stripeSubscriptionStatus?: string | null;
    stripeCurrentPeriodEnd?: string | null;
    stripeCancelAtPeriodEnd?: boolean | null;
    stripePriceTier?: string | null;
  } | null) => void;
  setTransactions: (transactions: CreditTransaction[]) => void;
  recordUsage: (usage: {
    action: CreditTransaction['action'];
    creditsUsed: number;
    tokensInput: number;
    tokensOutput: number;
    model: string;
    projectId?: string;
    chapterId?: string;
    creditsRemaining?: number | null;
  }) => void;

  // Stripe-ready hooks
  getStripeCheckoutData: () => { tier: PlanTier; customerId?: string };
  handleStripeWebhook: (event: string, data: any) => void;
}

export const useCreditsStore = create<CreditsState>((set, get) => ({
  plan: {
    tier: 'free',
    creditsTotal: 200,
    creditsUsed: 0,
    creditsRemaining: 200,
  },
  transactions: [],
  showUpgradeModal: false,
  upgradeReason: 'generic',
  showSettingsModal: false,
  lastReceipt: null,
  dismissReceipt: () => set({ lastReceipt: null }),

  spendCredits: (amount, action, meta = {}) => {
    const { plan } = get();

    if (plan.creditsRemaining < amount) {
      set({ showUpgradeModal: true, upgradeReason: 'generic' });
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
    return plan.creditsRemaining >= amount;
  },

  setPlan: (tier, credits) => {
    set((s) => ({
      plan: {
        ...s.plan,
        tier,
        creditsTotal: credits,
        creditsRemaining: Math.max(0, credits - s.plan.creditsUsed),
      },
    }));
  },

  setShowUpgradeModal: (show, reason = 'generic') => set({ showUpgradeModal: show, upgradeReason: show ? reason : 'generic' }),
  setShowSettingsModal: (show) => set({ showSettingsModal: show }),

  hydrateFromUser: (user) => {
    if (!user) {
      set({
        plan: {
          tier: 'free',
          creditsTotal: 200,
          creditsUsed: 0,
          creditsRemaining: 200,
          renewsAt: undefined,
          stripeCustomerId: undefined,
          stripeSubscriptionId: undefined,
          stripeSubscriptionStatus: null,
          stripeCurrentPeriodEnd: null,
          stripeCancelAtPeriodEnd: false,
          stripePriceTier: null,
        },
        transactions: [],
      });
      return;
    }

    const rawTier = String(user.plan || 'free');
    const tier: PlanTier =
      rawTier === 'writer' || rawTier === 'author' || rawTier === 'studio' || rawTier === 'publisher' || rawTier === 'free'
        ? rawTier
        : 'free';
    const creditsTotal = Math.max(0, Number(user.creditsTotal ?? 100));
    const creditsRemaining = Math.max(0, Number(user.creditsRemaining ?? creditsTotal));
    set((s) => ({
      plan: {
        ...s.plan,
        tier,
        creditsTotal,
        creditsRemaining,
        creditsUsed: Math.max(0, creditsTotal - creditsRemaining),
        renewsAt: user.stripeCurrentPeriodEnd || s.plan.renewsAt,
        stripeCustomerId: user.stripeCustomerId || undefined,
        stripeSubscriptionId: user.stripeSubscriptionId || undefined,
        stripeSubscriptionStatus: user.stripeSubscriptionStatus ?? null,
        stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd ?? null,
        stripeCancelAtPeriodEnd: Boolean(user.stripeCancelAtPeriodEnd),
        stripePriceTier: user.stripePriceTier ?? null,
      },
    }));
  },

  setTransactions: (transactions) => set({ transactions }),

  recordUsage: (usage) => {
    set((s) => {
      const nextRemaining = usage.creditsRemaining == null
        ? s.plan.creditsRemaining
        : Math.max(0, usage.creditsRemaining);
      const nextTotal = s.plan.creditsTotal;
      const receipt: UsageReceipt | null =
        usage.creditsUsed > 0
          ? {
              id: generateId(),
              action: usage.action,
              creditsUsed: usage.creditsUsed,
              shownAt: Date.now(),
            }
          : s.lastReceipt;
      return {
        plan: {
          ...s.plan,
          creditsRemaining: nextRemaining,
          creditsUsed: Math.max(0, nextTotal - nextRemaining),
        },
        transactions: [...s.transactions, {
          id: generateId(),
          action: usage.action,
          creditsUsed: usage.creditsUsed,
          tokensInput: usage.tokensInput,
          tokensOutput: usage.tokensOutput,
          model: usage.model,
          projectId: usage.projectId,
          chapterId: usage.chapterId,
          timestamp: new Date().toISOString(),
        }],
        lastReceipt: receipt,
      };
    });
  },

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
          plan: { ...s.plan, tier: 'free', creditsTotal: 200, creditsRemaining: 200 - s.plan.creditsUsed },
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
