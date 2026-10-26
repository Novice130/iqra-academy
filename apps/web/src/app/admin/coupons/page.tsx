/**
 * @fileoverview /admin/coupons — list, create and deactivate discount codes.
 *
 * A coupon only works through Stripe (its `stripeCouponId` is what a
 * subscription is created with), so when Stripe isn't configured the page
 * says so and the create form is switched off rather than left to fail
 * after the admin has filled it in.
 */

import { desc, sql } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { couponRedemptions, coupons } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { isStripeConfigured } from "@/lib/stripe";
import { PageHeader, StatCard, StatGrid } from "../_components/ui";
import CouponDesk from "./CouponDesk";
import { couponState, type CouponRow } from "./shared";

export const dynamic = "force-dynamic";

export default async function AdminCouponsPage() {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/coupons");

    const rows = await db
      .select({
        coupon: coupons,
        redemptions: sql<number>`(select count(*)::int from ${couponRedemptions} where ${couponRedemptions.couponId} = ${coupons.id})`,
      })
      .from(coupons)
      .where(orgFilter(admin, coupons.orgId))
      .orderBy(desc(coupons.createdAt));

    const list: CouponRow[] = rows.map(({ coupon: c, redemptions }) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      discountPercent: c.discountPercent,
      discountAmountCents: c.discountAmountCents,
      duration: c.duration,
      durationInMonths: c.durationInMonths,
      maxRedemptions: c.maxRedemptions,
      redemptions,
      validUntil: c.validUntil?.toISOString() ?? null,
      isActive: c.isActive,
      inStripe: !!c.stripeCouponId,
      applicableTiers: c.applicableTiers ?? [],
      createdAt: c.createdAt.toISOString(),
    }));

    const now = Date.now();
    const usable = list.filter((c) => couponState(c, now) === "ACTIVE").length;
    const redeemed = list.reduce((n, c) => n + c.redemptions, 0);
    const configured = isStripeConfigured();

    return (
      <div className="space-y-6">
        <PageHeader
          title="Coupons"
          description="Discount codes applied to Stripe subscriptions."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Coupons" }]}
        />

        <StatGrid>
          <StatCard label="Usable now" value={usable} tone={usable > 0 ? "success" : "neutral"} />
          <StatCard label="All coupons" value={list.length} />
          <StatCard label="Redemptions" value={redeemed} hint="Families who used a code" />
        </StatGrid>

        {!configured && (
          <div role="status" className="rounded-xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 px-4 py-3 text-sm text-[var(--text-primary)]">
            <span className="font-semibold">Stripe is not set up on this server.</span> Coupons are applied through Stripe,
            so new ones can&apos;t be created until STRIPE_SECRET_KEY is configured. Existing coupons that live in Stripe
            can&apos;t be deactivated either.
          </div>
        )}

        <CouponDesk coupons={list} stripeReady={configured} />
      </div>
    );
  });
}
