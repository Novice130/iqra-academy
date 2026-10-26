/**
 * @fileoverview The root administrator account.
 *
 * One account is permanently protected: it cannot be deleted, demoted or have
 * its email changed, by anyone including itself. It used to be spelled out as
 * a string literal in four places, two of them client components; this is the
 * one copy. Safe to import from client code — it holds no secret, the address
 * is already shown in the protection error.
 *
 * @module lib/root-admin
 */

export const ROOT_ADMIN_EMAIL = "syedamer130@gmail.com";

export function isRootAdminEmail(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === ROOT_ADMIN_EMAIL;
}
