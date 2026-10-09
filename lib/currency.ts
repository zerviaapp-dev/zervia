/**
 * Multi-currency support for Zervia.
 *
 * Design:
 * - CAD is the BASE currency: all stored money (listing prices are stored
 *   in the provider's local currency; subscription constants, points value,
 *   and fees are denominated in CAD) and conversions go through CAD.
 * - A user's billing currency comes from their country (profile.country
 *   for customers, providers.country for providers):
 *     CA -> CAD, US -> USD, PH -> PHP. Anything else -> CAD.
 * - Points have a FIXED CAD value: 100 pts = $1 CAD. Display converts
 *   that to the viewer's currency; the underlying value never floats.
 * - Exchange rates below are a static launch snapshot. Production MUST
 *   replace them with a live rate feed (e.g. open.er-api.com), refreshed
 *   daily and cached — see the NOTE on CAD_TO.
 */

export type Currency = 'cad' | 'usd' | 'php';

export const SUPPORTED_CURRENCIES: readonly Currency[] = ['cad', 'usd', 'php'];

/** Fallback when the country is unknown or unmapped. */
export const DEFAULT_CURRENCY: Currency = 'cad';

/** Base currency: subscription constants, points value, fees. */
export const BASE_CURRENCY: Currency = 'cad';

/**
 * Country (ISO 3166-1 alpha-2) -> billing currency.
 * Unlisted countries fall back to CAD (DEFAULT_CURRENCY).
 */
const COUNTRY_CURRENCY: Record<string, Currency> = {
  CA: 'cad',
  US: 'usd',
  PH: 'php',
};

/** Billing currency for a user, from their ISO country code. */
export function currencyForCountry(countryCode: string | null | undefined): Currency {
  if (!countryCode) return DEFAULT_CURRENCY;
  return COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? DEFAULT_CURRENCY;
}

/** Type guard for currency strings coming from the database. */
export function isCurrency(value: string | null | undefined): value is Currency {
  return (
    value === 'cad' || value === 'usd' || value === 'php'
  );
}

/** Normalize a stored currency string, falling back to CAD. */
export function asCurrency(value: string | null | undefined): Currency {
  return isCurrency(value) ? value : DEFAULT_CURRENCY;
}

/**
 * NOTE (production): approximate static rates — 1 CAD buys X units.
 * Replace with a daily-refreshed live feed before real money moves in
 * non-CAD currencies. When rates update, only this table changes;
 * every conversion flows through convertCurrency().
 */
const CAD_TO: Record<Currency, number> = {
  cad: 1,
  usd: 0.74, // 1 CAD ≈ 0.74 USD
  php: 43, // 1 CAD ≈ ₱43
};

/** Convert integer cents from one currency to another (rounds to whole cents). */
export function convertCurrency(
  amountCents: number,
  from: Currency,
  to: Currency
): number {
  if (from === to) return amountCents;
  const inCad = from === 'cad' ? amountCents : Math.round(amountCents / CAD_TO[from]);
  return to === 'cad' ? inCad : Math.round(inCad * CAD_TO[to]);
}

/** Shorthand: CAD-base amount (tiers, points value, fees) -> viewer's currency. */
export function convertCadCents(cadCents: number, to: Currency): number {
  return convertCurrency(cadCents, 'cad', to);
}

/**
 * Points -> CAD cents. 1 point = 1 cent CAD, FIXED — the points economy
 * never floats with FX; only the display converts.
 */
export function pointsToCadCents(points: number): number {
  return Math.round(points);
}

/** Points -> viewer's currency, in cents. */
export function pointsToCents(points: number, currency: Currency): number {
  return convertCadCents(pointsToCadCents(points), currency);
}

const INTL_CURRENCY: Record<Currency, string> = {
  cad: 'CAD',
  usd: 'USD',
  php: 'PHP',
};

/**
 * Format integer cents as money, e.g. "CA$19.00", "$14.04", "₱817".
 * Uses Intl so symbols/locales stay correct; the CAD code prefix keeps
 * CAD and USD visually distinct.
 */
export function formatCurrency(
  amountCents: number,
  currency: Currency,
  locale: string = 'en'
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: INTL_CURRENCY[currency],
  }).format(amountCents / 100);
}

/**
 * Listing price for a viewer: converts the provider-currency amount into
 * the viewer's currency, then applies the existing quote/hour/job suffix
 * labels. Falls back to the provider's own formatting when both match.
 */
export function formatListingPrice(
  priceCents: number | null,
  priceType: string,
  listingCurrency: Currency,
  viewerCurrency: Currency,
  labels: { quote: string; hourlySuffix: string; fixedSuffix: string },
  locale: string = 'en'
): string {
  if (priceCents === null || priceType === 'quote') return labels.quote;
  const converted = convertCurrency(priceCents, listingCurrency, viewerCurrency);
  const amount = formatCurrency(converted, viewerCurrency, locale);
  const suffix =
    priceType === 'hourly'
      ? labels.hourlySuffix
      : priceType === 'fixed'
        ? labels.fixedSuffix
        : '';
  return `${amount}${suffix}`;
}

/**
 * Points cash value for display, e.g. "≈ $2.00" / "≈ ₱86".
 * Intended next to a points balance — never used for charging.
 */
export function formatPointsValue(
  points: number,
  currency: Currency,
  locale: string = 'en'
): string {
  return `≈ ${formatCurrency(pointsToCents(points, currency), currency, locale)}`;
}
