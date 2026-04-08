/**
 * Lightweight currency auto-detection + formatting for display-only pricing.
 *
 * Billing is still USD at Stripe checkout — this is purely to make the
 * pricing page feel native to international visitors (e.g. UK Facebook ad
 * traffic seeing £ instead of $).
 *
 * Strategy:
 *   1. Detect the visitor's region from `Intl.Locale().region` with
 *      `navigator.language` as the source.
 *   2. Map region → display currency (GBP, EUR, CAD, AUD, USD fallback).
 *   3. Apply a static conversion rate (refresh periodically — we don't
 *      want a live FX dependency on the critical path).
 *   4. Render with `Intl.NumberFormat` for proper symbol + grouping.
 */

export type DisplayCurrency = 'USD' | 'GBP' | 'EUR' | 'CAD' | 'AUD';

// Static rates vs USD. Conservative — round UP slightly so we don't
// under-charge after real FX + Stripe conversion fees. Review ~quarterly.
// Last updated: 2026-04-08
const RATES: Record<DisplayCurrency, number> = {
  USD: 1,
  GBP: 0.8,
  EUR: 0.93,
  CAD: 1.38,
  AUD: 1.52,
};

// Eurozone ISO 3166-1 alpha-2 codes.
const EUROZONE = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT',
  'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
]);

function detectRegion(): string | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const langs: string[] = [];
  if (navigator.language) langs.push(navigator.language);
  if (Array.isArray(navigator.languages)) langs.push(...navigator.languages);
  for (const tag of langs) {
    try {
      const region = (new Intl.Locale(tag) as unknown as { region?: string }).region;
      if (region) return region.toUpperCase();
    } catch {
      // fall through
    }
    const parts = tag.split('-');
    if (parts.length > 1) return parts[1]?.toUpperCase();
  }
  return undefined;
}

export function detectDisplayCurrency(): DisplayCurrency {
  const region = detectRegion();
  if (!region) return 'USD';
  if (region === 'GB' || region === 'UK') return 'GBP';
  if (region === 'CA') return 'CAD';
  if (region === 'AU' || region === 'NZ') return 'AUD';
  if (EUROZONE.has(region)) return 'EUR';
  return 'USD';
}

export function formatDisplayPrice(
  usd: number,
  currency: DisplayCurrency = detectDisplayCurrency(),
): string {
  const rate = RATES[currency] ?? 1;
  const converted = usd * rate;
  // Round to whole unit for clean marketing copy ($10 → £8, $30 → £24, etc.)
  const rounded = Math.round(converted);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(rounded);
  } catch {
    return `${currency} ${rounded}`;
  }
}

export function isNonUsdDisplay(currency?: DisplayCurrency): boolean {
  const c = currency ?? detectDisplayCurrency();
  return c !== 'USD';
}
