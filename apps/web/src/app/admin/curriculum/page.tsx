/**
 * @fileoverview /admin/curriculum — the lessons teachers record progress
 * against, per track, with how many students completed each.
 *
 * Until this page existed only db/seed.ts created lessons, so an org without
 * seed data had nothing for teachers to record. Lessons are per org and
 * ordered within a track, so the page always shows exactly one org: an
 * ORG_ADMIN's own, or for a SUPER_ADMIN whichever `?org=` names (their own by
 * default), picked with a plain GET form that works without JavaScript.
 */

import { asc } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { organizations } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin-page";
import { listCurriculum } from "@/lib/admin-curriculum";
import { PageHeader, StatCard, StatGrid, btn, input, label } from "../_components/ui";
import CurriculumDesk from "./CurriculumDesk";
import { TRACKS } from "./shared";

export const dynamic = "force-dynamic";

export default async function AdminCurriculumPage(props: { searchParams?: Promise<{ org?: string }> }) {
  const searchParams = await props.searchParams;
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/curriculum");

    const orgs = admin.isSuperAdmin
      ? await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .orderBy(asc(organizations.name))
      : [];
    const requested = searchParams?.org;
    const orgId = admin.isSuperAdmin && requested && orgs.some((o) => o.id === requested) ? requested : admin.orgId;

    const lessons = await listCurriculum(orgId);
    const active = lessons.filter((l) => l.isActive);
    const completions = active.reduce((n, l) => n + l.completedCount, 0);
    const emptyTracks = TRACKS.length - new Set(active.map((l) => l.track)).size;

    return (
      <div className="space-y-6">
        <PageHeader
          title="Curriculum"
          description="The lessons in each track. Teachers mark these complete for their students."
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Curriculum" }]}
        />

        {admin.isSuperAdmin && orgs.length > 1 && (
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="w-full sm:w-72">
              <label htmlFor="curriculum-org" className={label}>
                Organization
              </label>
              <select id="curriculum-org" name="org" defaultValue={orgId} className={input}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={btn.secondary}>
              Show
            </button>
          </form>
        )}

        <StatGrid>
          <StatCard label="Active lessons" value={active.length} />
          <StatCard label="Inactive lessons" value={lessons.length - active.length} hint="Hidden from teachers" />
          <StatCard label="Completions" value={completions} hint="Across active lessons" />
          <StatCard
            label="Tracks without lessons"
            value={emptyTracks}
            tone={emptyTracks > 0 ? "warning" : "neutral"}
            hint={emptyTracks > 0 ? "Teachers can't record these" : "Every track has lessons"}
          />
        </StatGrid>

        <CurriculumDesk orgId={orgId} lessons={lessons} />
      </div>
    );
  });
}
