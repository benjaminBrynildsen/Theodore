// Meta Pixel helper — thin wrapper around fbq() with type safety.
// The base pixel snippet lives in index.html and fires the initial PageView.
// This module handles SPA route changes and funnel events.

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    twq?: (...args: unknown[]) => void;
  }
}

function fbq(...args: unknown[]) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq(...args);
  }
}

// X (Twitter) Pixel — base config (twq('config','rbssv')) lives in index.html
// and public/go/index.html. X conversion events fire via an event-specific
// tag created in X Ads Manager, of the form `tw-rbssv-XXXXXX`. Fill these in
// once the events exist in Ads Manager; until then the calls no-op so nothing
// breaks and no malformed events are sent.
const X_EVENTS = {
  signUp: 'tw-rbssv-rctgp', // Sign-up conversion event (X Ads Manager)
  subscribe: '',            // Paid-subscription conversion event id (tw-rbssv-…) — not yet created
} as const;

function twq(...args: unknown[]) {
  if (typeof window !== 'undefined' && window.twq) {
    window.twq(...args);
  }
}

/** Fire an X conversion event by its Ads-Manager tag; no-ops if unset. */
function xEvent(eventId: string, params?: Record<string, unknown>) {
  if (!eventId) return;
  twq('event', eventId, params || {});
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
  xEvent(X_EVENTS.signUp);
}

/** User started a free trial / created their first project. */
export function trackStartTrial() {
  fbq('track', 'StartTrial', { value: 0, currency: 'USD' });
}

/** User completed a paid subscription via Stripe. */
export function trackSubscribe(value: number, currency = 'USD') {
  fbq('track', 'Subscribe', { value, currency });
  fbq('track', 'Purchase', { value, currency });
  xEvent(X_EVENTS.subscribe, { value, currency });
}

/** User initiated checkout (clicked upgrade / pricing). */
export function trackInitiateCheckout(value?: number, currency = 'USD') {
  fbq('track', 'InitiateCheckout', { value, currency });
}

/** Generic custom event for anything not covered above. */
export function trackCustom(name: string, params?: Record<string, unknown>) {
  fbq('trackCustom', name, params);
}
