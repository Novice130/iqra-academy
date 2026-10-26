/**
 * @fileoverview Curriculum (lesson_content) management for org admins.
 *
 * WHY THIS EXISTS: teachers record progress against `lesson_content` rows,
 * but only db/seed.ts ever created any, so a real org had nothing to record
 * against. This is the write side the admin curriculum page and API use.
 *
 * Lessons are never deleted. `progress_records.lesson_id` references them, and
 * a family's history must keep pointing at the lesson the child actually did,
 * so "removing" a lesson means `is_active = false`: it drops out of the
 * teacher's picker and the progress totals, and every past record still
 * resolves.
 *
 * Ordering: `(org_id, track, sort_order)` is unique and the index is not
 * deferrable, so a swap goes through a temporary negative value, and every
 * write to a track holds an advisory lock on (org, track) so two admins
 * appending or reordering at once can't collide on the same position.
 *
 * @module lib/admin-curriculum
 */

import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { lessonContent, progressRecords } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type Track = (typeof lessonContent.track.enumValues)[number];
export type Lesson = typeof lessonContent.$inferSelect;

export interface CurriculumLesson {
  id: string;
  track: Track;
  sortOrder: number;
  title: string;
  description: string | null;
  objectives: string[];
  estimatedMinutes: number;
  isActive: boolean;
  /** Distinct students with a completed record for this lesson. */
  completedCount: number;
}

/** Every lesson in the org, inactive included, in track then lesson order. */
export async function listCurriculum(orgId: string): Promise<CurriculumLesson[]> {
  const rows = await db
    .select({
      lesson: lessonContent,
      completed: sql<number>`(select count(distinct ${progressRecords.studentProfileId})::int from ${progressRecords} where ${progressRecords.lessonId} = ${lessonContent.id} and ${progressRecords.isCompleted} = true)`,
    })
    .from(lessonContent)
    .where(eq(lessonContent.orgId, orgId))
    .orderBy(asc(lessonContent.track), asc(lessonContent.sortOrder));

  return rows.map(({ lesson: l, completed }) => ({
    id: l.id,
    track: l.track,
    sortOrder: l.sortOrder,
    title: l.title,
    description: l.description,
    objectives: l.objectives ?? [],
    estimatedMinutes: l.estimatedMinutes,
    isActive: l.isActive,
    completedCount: Number(completed) || 0,
  }));
}

/** Serialise writes to one org's track until the transaction ends. */
async function lockTrack(tx: Tx, orgId: string, track: Track): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`curriculum:${orgId}:${track}`}))`);
}

/**
 * Loads a lesson the caller may change. `orgId` null means SUPER_ADMIN: any
 * org. An ORG_ADMIN asking for another org's lesson gets "not found", not
 * "forbidden", so ids can't be probed across orgs.
 */
export async function findLessonForAdmin(id: string, orgId: string | null): Promise<Lesson> {
  const lesson = await db.query.lessonContent.findFirst({
    where: and(eq(lessonContent.id, id), orgId ? eq(lessonContent.orgId, orgId) : undefined),
  });
  if (!lesson) throw new NotFoundError("Lesson");
  return lesson;
}

export const trackSchema = z.enum(lessonContent.track.enumValues);

const title = z.string().trim().min(1, "Give the lesson a title").max(200);
const description = z
  .string()
  .trim()
  .max(2000)
  .nullable()
  .transform((v) => v || null);
const objectives = z.array(z.string().trim().min(1).max(300)).max(20);
const estimatedMinutes = z.number().int().min(5, "At least 5 minutes").max(240, "At most 240 minutes");

/** A new lesson's fields, as the API accepts them. */
export const lessonFieldsSchema = z.object({
  title,
  description: description.optional().transform((v) => v ?? null),
  objectives: objectives.optional().transform((v) => v ?? []),
  estimatedMinutes: estimatedMinutes.optional().transform((v) => v ?? 30),
});

/**
 * An edit: only the fields sent change. No defaults here, so leaving a field
 * out never resets it.
 */
export const lessonEditSchema = z.object({
  title: title.optional(),
  description: description.optional(),
  objectives: objectives.optional(),
  estimatedMinutes: estimatedMinutes.optional(),
});

export type LessonFields = z.output<typeof lessonFieldsSchema>;

/** Appends a lesson at the end of the track. */
export async function createLesson(orgId: string, track: Track, fields: LessonFields): Promise<Lesson> {
  return db.transaction(async (tx) => {
    await lockTrack(tx, orgId, track);
    // Inactive lessons still hold their position in the unique index.
    const [last] = await tx
      .select({ sortOrder: lessonContent.sortOrder })
      .from(lessonContent)
      .where(and(eq(lessonContent.orgId, orgId), eq(lessonContent.track, track)))
      .orderBy(desc(lessonContent.sortOrder))
      .limit(1);
    const [row] = await tx
      .insert(lessonContent)
      .values({ orgId, track, sortOrder: (last?.sortOrder ?? 0) + 1, ...fields })
      .returning();
    return row;
  });
}

export async function updateLesson(lesson: Lesson, fields: Partial<LessonFields>): Promise<Lesson> {
  const [row] = await db
    .update(lessonContent)
    .set(fields)
    .where(and(eq(lessonContent.id, lesson.id), eq(lessonContent.orgId, lesson.orgId)))
    .returning();
  return row;
}

export async function setLessonActive(lesson: Lesson, isActive: boolean): Promise<Lesson> {
  const [row] = await db
    .update(lessonContent)
    .set({ isActive })
    .where(and(eq(lessonContent.id, lesson.id), eq(lessonContent.orgId, lesson.orgId)))
    .returning();
  return row;
}

/**
 * Swaps the lesson with its neighbour in the track. Returns the neighbour's id,
 * or null when the lesson is already first/last (nothing changes).
 */
export async function moveLesson(lesson: Lesson, direction: "up" | "down"): Promise<string | null> {
  return db.transaction(async (tx) => {
    await lockTrack(tx, lesson.orgId, lesson.track);
    // Re-read under the lock: the position may have moved since the caller loaded it.
    const [current] = await tx
      .select({ sortOrder: lessonContent.sortOrder })
      .from(lessonContent)
      .where(and(eq(lessonContent.id, lesson.id), eq(lessonContent.orgId, lesson.orgId)));
    if (!current) throw new NotFoundError("Lesson");

    const sameTrack = and(eq(lessonContent.orgId, lesson.orgId), eq(lessonContent.track, lesson.track));
    const [neighbour] = await tx
      .select({ id: lessonContent.id, sortOrder: lessonContent.sortOrder })
      .from(lessonContent)
      .where(
        and(
          sameTrack,
          direction === "up"
            ? lt(lessonContent.sortOrder, current.sortOrder)
            : gt(lessonContent.sortOrder, current.sortOrder)
        )
      )
      .orderBy(direction === "up" ? desc(lessonContent.sortOrder) : asc(lessonContent.sortOrder))
      .limit(1);
    if (!neighbour) return null;

    // Park the lesson on a value no real lesson uses, then swap.
    await tx.update(lessonContent).set({ sortOrder: -current.sortOrder - 1 }).where(eq(lessonContent.id, lesson.id));
    await tx.update(lessonContent).set({ sortOrder: current.sortOrder }).where(eq(lessonContent.id, neighbour.id));
    await tx.update(lessonContent).set({ sortOrder: neighbour.sortOrder }).where(eq(lessonContent.id, lesson.id));
    return neighbour.id;
  });
}
