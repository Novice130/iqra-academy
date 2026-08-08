/**
 * Whether to show money figures to someone.
 *
 * Families do not see amounts anywhere in the app: fees are agreed and
 * invoiced directly (WhatsApp, then email), so a dollar figure on the
 * dashboard is at best a second source of truth and at worst contradicts the
 * invoice a parent is actually holding. They see whether they are subscribed;
 * that is the part that governs whether classes run.
 *
 * It also keeps the iOS build clear of App Store guideline 3.1.1: an app that
 * shows no prices and sells nothing in-app is not doing commerce. (One-to-one
 * tutoring is exempt under 3.1.3(d) "Person-to-Person Experiences" in any
 * case, but group plans are one-to-many and are not — so showing nothing is
 * the safer shape.)
 *
 * Staff still see real figures; they have a business to run. An unknown or
 * missing role hides, because guessing wrong in that direction is harmless.
 */
const STAFF_ROLES = new Set(["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]);

export function shouldHidePricing(role: string | null | undefined): boolean {
  return !role || !STAFF_ROLES.has(role);
}

/**
 * The only billing state a family is shown.
 *
 * One word each, deliberately: "Not subscribed" wraps onto two lines in the
 * dashboard's stat tile at phone width, and a wrapped status reads as an
 * error message.
 */
export function subscriptionLabel(isSubscribed: boolean): string {
  return isSubscribed ? "Subscribed" : "Unsubscribed";
}
