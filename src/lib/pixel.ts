// Meta Pixel helper — thin wrapper around fbq() with type safety.
// The base pixel snippet lives in index.html and fires the initial PageView.
// This module handles SPA route changes and funnel events.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function fbq(...args: unknown[]) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq(...args);
  }
}

/** Fire on every SPA "view" change (store-based navigation). */
export function trackPageView() {
  fbq('track', 'PageView');
}

/** User viewed a specific content type (project, chapter, landing page, etc). */
export function trackViewContent(params: {
  content_name: string;
  content_category?: string;
}) {
  fbq('track', 'ViewContent', params);
}

/** Guest or returning user completed sign-up / account creation. */
export function trackCompleteRegistration() {
  fbq('track', 'CompleteRegistration', { status: true });
}

/** User started a free trial / created their first project. */
export function trackStartTrial() {
  fbq('track', 'StartTrial', { value: 0, currency: 'USD' });
}

/** User completed a paid subscription via Stripe. */
export function trackSubscribe(value: number, currency = 'USD') {
  fbq('track', 'Subscribe', { value, currency });
  fbq('track', 'Purchase', { value, currency });
}

/** User initiated checkout (clicked upgrade / pricing). */
export function trackInitiateCheckout(value?: number, currency = 'USD') {
  fbq('track', 'InitiateCheckout', { value, currency });
}

/** Generic custom event for anything not covered above. */
export function trackCustom(name: string, params?: Record<string, unknown>) {
  fbq('trackCustom', name, params);
}
