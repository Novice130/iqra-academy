/**
 * @fileoverview Money formatting, shared by the invoice API and the admin UI.
 *
 * Amounts are stored as integer cents everywhere. Never show these strings in
 * the student app or in push text — see lib/pricing-visibility.ts.
 *
 * @module lib/money
 */

/** "$120.00". Falls back to "120.00 XYZ" for a currency Intl doesn't know. */
export function money(cents: number, currency = "usd"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
