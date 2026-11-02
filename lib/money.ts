/**
 * Money formatting. All money is stored as integer cents (never floats);
 * this is the single display path, so amounts can't drift between views.
 */
export function formatMoney(
  priceCents: number | null,
  priceType: string,
  labels: { quote: string; hourlySuffix: string; fixedSuffix: string }
): string {
  if (priceCents === null || priceType === 'quote') return labels.quote;
  const amount = (priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2);
  const suffix =
    priceType === 'hourly'
      ? labels.hourlySuffix
      : priceType === 'fixed'
        ? labels.fixedSuffix
        : '';
  return `${amount}${suffix}`;
}

/** Convert integer cents back to an editable decimal string ("49.99"). */
export function centsToInput(priceCents: number | null): string {
  if (priceCents === null) return '';
  return (priceCents / 100).toFixed(2).replace(/\.?0+$/, '');
}
