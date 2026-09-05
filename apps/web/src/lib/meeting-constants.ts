/**
 * @fileoverview Single source of truth for class and meeting time constants.
 *
 * Safe for both client and server bundles: zero database or backend dependencies.
 *
 * @module lib/meeting-constants
 */

/** How early anyone may open the room. (60 minutes before scheduled start) */
export const EARLY_JOIN_MS = 60 * 60 * 1000; // T-60

/** How long after the scheduled start the slot still counts as "now". (180 minutes) */
export const LATE_JOIN_MS = 3 * 60 * 60 * 1000; // T+180

/** A class already running belongs to today, not to a tab someone left open. (6 hours) */
export const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Rows within this much of each other are the same occurrence. Wide enough to
 * absorb a 1-on-1 booked five minutes off the group slot, narrow enough not to
 * swallow the next class. (90 minutes)
 */
export const SIBLING_WINDOW_MS = 90 * 60 * 1000; // 90m

/** Resolver lookup windows around now (aliased to prevent drift) */
export const SCHEDULED_BEFORE_MS = EARLY_JOIN_MS; // T-60
export const SCHEDULED_AFTER_MS = LATE_JOIN_MS; // T+180
