/**
 * Ad-hoc allowlist of student accounts that should never see dollar price
 * figures in the dashboard/billing UI (org-admin request, not tied to a
 * plan or role — just these specific accounts).
 */
const HIDDEN_PRICING_EMAILS = new Set([
  "bkyt@test.com",
  "sobur@test.com",
  "malek@test.com",
]);

export function shouldHidePricing(email: string | null | undefined): boolean {
  return !!email && HIDDEN_PRICING_EMAILS.has(email.toLowerCase());
}
