// CoffeeWalletButton — Apple Pay / Google Pay one-tap for the boost flow.
//
// Lives inside an <Elements stripe={...}> wrapper so it can use Stripe.js
// hooks. Renders Stripe's PaymentRequestButtonElement on platforms that
// support a wallet (iOS/macOS Safari → Apple Pay, Chrome with Google Pay
// → Google Pay). On platforms without either, calls onFallback so the
// parent modal can show a "Pay with card →" button that routes through
// the existing Stripe Checkout flow.
//
// Payment lifecycle:
//   1. Parent passes the selected pack id (default 'boost_10' = $10/1.8k).
//   2. On mount, build a PaymentRequest with that pack's amount and ping
//      canMakePayment to decide between the wallet button vs fallback.
//   3. When the pack id changes, call .update() to keep the wallet sheet
//      showing the right amount (cheaper than recreating PaymentRequest).
//   4. On wallet confirm, hit /api/billing/payment-intent for a fresh
//      client_secret, then confirmCardPayment with the wallet's
//      PaymentMethod. Webhook handles the server-side credit grant.

import { useEffect, useState } from 'react';
import { PaymentRequestButtonElement, useStripe } from '@stripe/react-stripe-js';
import type { PaymentRequest as StripePaymentRequest } from '@stripe/stripe-js';
import { CreditCard, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';
import { track as jTrack } from '../../lib/journey';
import * as pixel from '../../lib/pixel';

interface BoostPack { id: string; priceUsd: number; priceCents: number; credits: number }

interface Props {
  packs: BoostPack[];
  selectedPackId: string;
  /** Called after a successful wallet payment. Server-side webhook will grant
   *  credits; parent should refresh user state and close the modal. */
  onSuccess: (granted: { packId: string; credits: number }) => void;
  /** Called when the platform has no wallet (Firefox/Windows etc.) — parent
   *  should render its own Stripe-Checkout-redirect button instead. */
  onNoWallet: () => void;
  /** Called when wallet payment fails (declined, network, etc.). */
  onError: (msg: string) => void;
}

export function CoffeeWalletButton({ packs, selectedPackId, onSuccess, onNoWallet, onError }: Props) {
  const stripe = useStripe();
  const [paymentRequest, setPaymentRequest] = useState<StripePaymentRequest | null>(null);
  const [checked, setChecked] = useState(false);   // canMakePayment resolved?
  const [busy, setBusy] = useState(false);          // mid-payment

  const selectedPack = packs.find((p) => p.id === selectedPackId) || packs[0];

  // Create the PaymentRequest once Stripe is ready. We don't recreate on
  // selectedPackId change — instead .update() the existing instance below.
  useEffect(() => {
    if (!stripe || !selectedPack) return;
    const pr = stripe.paymentRequest({
      country: 'US',
      currency: 'usd',
      total: {
        label: `Theodore — ${selectedPack.credits.toLocaleString()} credits`,
        amount: selectedPack.priceCents,
      },
      requestPayerName: false,
      requestPayerEmail: false,
    });
    pr.canMakePayment().then((result) => {
      setChecked(true);
      if (result) {
        setPaymentRequest(pr);
      } else {
        // No Apple Pay / Google Pay available — fall back to card button.
        onNoWallet();
      }
    });
    // We only want to (re)create the PaymentRequest if Stripe itself changes
    // (which happens once on load). Pack updates flow through the .update()
    // effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

  // Keep the wallet sheet amount in sync as the user clicks different packs.
  useEffect(() => {
    if (!paymentRequest || !selectedPack) return;
    paymentRequest.update({
      total: {
        label: `Theodore — ${selectedPack.credits.toLocaleString()} credits`,
        amount: selectedPack.priceCents,
      },
    });
  }, [paymentRequest, selectedPack]);

  // Wire the wallet "paymentmethod" event: when the user confirms via Face
  // ID / fingerprint / Google Pay sheet, this fires with a PaymentMethod we
  // attach to a fresh server-created PaymentIntent.
  useEffect(() => {
    if (!paymentRequest || !stripe) return;
    const handler = async (ev: any) => {
      setBusy(true);
      try {
        jTrack('boost_clicked', {
          packId: selectedPack.id,
          amount: selectedPack.priceUsd,
          source: 'upgrade_modal_wallet',
        });
        // 1. Create a server-side PaymentIntent for this exact pack.
        const intent = await api.billingPaymentIntent({ packId: selectedPack.id });
        // 2. Confirm it with the wallet-issued PaymentMethod (handleActions:
        //    false because the wallet UI already handled any 3DS-like flow).
        const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(
          intent.clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false },
        );
        if (confirmError) {
          ev.complete('fail');
          onError(confirmError.message || 'Payment failed.');
          return;
        }
        // 3. Dismiss the wallet sheet successfully. Stripe webhook is what
        //    actually credits the user — we just close the modal & let the
        //    next /api/auth/me refresh pick up the new balance.
        ev.complete('success');
        if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture')) {
          pixel.trackSubscribe(selectedPack.priceUsd);
          pixel.trackCustom('BoostPurchased', {
            packId: selectedPack.id,
            amount: selectedPack.priceUsd,
            source: 'upgrade_modal_wallet',
          });
          jTrack('boost_purchased', {
            packId: selectedPack.id,
            amount: selectedPack.priceUsd,
            mode: 'wallet',
            source: 'upgrade_modal_wallet',
          });
          onSuccess({ packId: selectedPack.id, credits: selectedPack.credits });
        } else if (paymentIntent && paymentIntent.status === 'requires_action') {
          // Wallet shouldn't normally need additional action since wallets
          // handle 3DS inline. If it does, surface the failure.
          ev.complete('fail');
          onError('Authentication required — try card checkout instead.');
        }
      } catch (e: any) {
        ev.complete('fail');
        onError(e?.message || 'Payment failed.');
      } finally {
        setBusy(false);
      }
    };
    paymentRequest.on('paymentmethod', handler);
    return () => {
      paymentRequest.off('paymentmethod', handler);
    };
  }, [paymentRequest, stripe, selectedPack, onSuccess, onError]);

  // Loading state while canMakePayment resolves (usually <100ms but we
  // show a placeholder so the layout doesn't jump).
  if (!checked) {
    return (
      <div className="w-full h-12 rounded-xl bg-white/[0.06] border border-white/10 flex items-center justify-center">
        <Loader2 size={16} className="animate-spin text-white/40" />
      </div>
    );
  }

  // No wallet on this platform → parent already got the onNoWallet() signal
  // and will render its own fallback. Render nothing here.
  if (!paymentRequest) return null;

  return (
    <div className="relative">
      <PaymentRequestButtonElement
        options={{
          paymentRequest,
          style: {
            paymentRequestButton: {
              type: 'default',
              theme: 'light',
              height: '48px',
            },
          },
        }}
      />
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 backdrop-blur-sm pointer-events-none">
          <Loader2 size={18} className="animate-spin text-white" />
        </div>
      )}
    </div>
  );
}

// Fallback button for browsers without a wallet — redirects to Stripe Checkout
// via the existing /api/billing/boost flow. Same UX as our previous boost
// implementation; just no Face ID magic.
export function CoffeeCardFallbackButton({
  packId,
  busy,
  onClick,
}: {
  packId: string;
  busy: boolean;
  onClick: (packId: string) => void;
}) {
  return (
    <button
      onClick={() => onClick(packId)}
      disabled={busy}
      className="w-full h-12 rounded-xl bg-white text-black font-semibold text-sm inline-flex items-center justify-center gap-2 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {busy ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <>
          <CreditCard size={16} />
          <span>Pay with Card</span>
        </>
      )}
    </button>
  );
}
