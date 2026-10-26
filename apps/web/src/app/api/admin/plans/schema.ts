/**
 * @fileoverview Body schemas for creating and editing a plan, shared by
 * api/admin/plans and api/admin/plans/[id]. Ranges are sanity bounds, not
 * business rules: a typo of $12,000 a month should be refused, not saved.
 *
 * The patch schema is built from the bare fields rather than
 * `planSchema.partial()`: zod 4 applies `.default()` inside an optional, so a
 * partial of the create schema would reset currency and isActive on every edit.
 */

import { z } from "zod";

const fields = {
  name: z.string().trim().min(1, "Give the plan a name").max(80),
  description: z.string().trim().max(500),
  tier: z.enum(["FREE", "INDIVIDUAL", "GROUP", "SIBLINGS"]),
  priceInCents: z.number().int().min(0).max(1_000_000),
  currency: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/, "Use a three-letter currency code"),
  classesPerWeek: z.number().int().min(0).max(14),
  maxStudents: z.number().int().min(1).max(20),
  sessionType: z.enum(["INDIVIDUAL", "GROUP", "SIBLINGS", "WEBINAR"]),
  isActive: z.boolean(),
};

export const planSchema = z.object({
  ...fields,
  description: fields.description.optional(),
  currency: fields.currency.default("usd"),
  isActive: fields.isActive.default(true),
});

export const planPatchSchema = z
  .object({
    name: fields.name.optional(),
    description: fields.description.optional(),
    tier: fields.tier.optional(),
    priceInCents: fields.priceInCents.optional(),
    currency: fields.currency.optional(),
    classesPerWeek: fields.classesPerWeek.optional(),
    maxStudents: fields.maxStudents.optional(),
    sessionType: fields.sessionType.optional(),
    isActive: fields.isActive.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { message: "Nothing to update." });
