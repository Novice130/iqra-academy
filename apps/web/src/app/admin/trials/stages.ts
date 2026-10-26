/**
 * @fileoverview Trial pipeline vocabulary, shared by the page, its table and
 * PATCH /api/admin/trials. Pure — no db import — so the client table can use it.
 *
 * A trial is an ordinary session row with `isTrial` (see api/trials). Most of
 * its pipeline stage is *derived*: from the session status, whether the
 * student was in the room, and whether the family went on to pay or book.
 * Only the follow-up — "we called them", "they said no" — is something a
 * person records, because nothing else in the system can know it.
 */

import type { Tone } from "../_components/ui";

export const TRIAL_FOLLOW_UPS = ["NONE", "CONTACTED", "DECLINED"] as const;
export type TrialFollowUp = (typeof TRIAL_FOLLOW_UPS)[number];

/** The `metadata.op` on the audit row that records a follow-up. */
export const TRIAL_FOLLOW_UP_OP = "trial.status";

export const TRIAL_STAGES = [
  "UPCOMING",
  "IN_CLASS",
  "NEEDS_OUTCOME",
  "ATTENDED",
  "CONVERTED",
  "NO_SHOW",
  "CANCELLED",
  "DECLINED",
] as const;
export type TrialStage = (typeof TRIAL_STAGES)[number];

export const STAGE_META: Record<TrialStage, { label: string; tone: Tone; hint: string }> = {
  UPCOMING: { label: "Upcoming", tone: "info", hint: "Scheduled and not started yet." },
  IN_CLASS: { label: "In class", tone: "success", hint: "The trial's class time is now." },
  NEEDS_OUTCOME: {
    label: "Needs outcome",
    tone: "warning",
    hint: "Time has passed but nobody marked it and no student joined.",
  },
  ATTENDED: { label: "Attended", tone: "info", hint: "Came to the trial; not paying or booked yet." },
  CONVERTED: { label: "Converted", tone: "success", hint: "This child has a regular class booked since, or the family took out its first plan." },
  NO_SHOW: { label: "No-show", tone: "danger", hint: "Marked as a no-show." },
  CANCELLED: { label: "Cancelled", tone: "neutral", hint: "The trial was cancelled." },
  DECLINED: { label: "Declined", tone: "neutral", hint: "Recorded as not going ahead." },
};

export const FOLLOW_UP_LABEL: Record<TrialFollowUp, string> = {
  NONE: "No follow-up",
  CONTACTED: "Contacted",
  DECLINED: "Declined",
};
