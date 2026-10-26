/**
 * @fileoverview Filter form for /admin/audit.
 *
 * A plain GET form: submitting it puts the filters in the URL, the server
 * page reads them back, and it all works with JavaScript off. Changing a
 * filter drops `page`, because page 4 of the old result means nothing for
 * the new one.
 */

import Link from "next/link";
import { btn, humanize, input, label } from "../_components/ui";

export interface AuditFilterValues {
  action: string;
  actor: string;
  target: string;
  from: string;
  to: string;
}

export default function AuditFilters({
  values,
  actions,
  zoneLabel,
  active,
}: {
  values: AuditFilterValues;
  actions: readonly string[];
  /** The zone the date fields are read in, so nobody has to guess. */
  zoneLabel: string;
  active: boolean;
}) {
  return (
    <form method="get" action="/admin/audit" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end" role="search" aria-label="Filter the audit log">
      <div className="lg:col-span-1">
        <label htmlFor="audit-action" className={label}>Action</label>
        <select id="audit-action" name="action" defaultValue={values.action} className={input}>
          <option value="">Any action</option>
          {actions.map((a) => (
            <option key={a} value={a}>{humanize(a)}</option>
          ))}
        </select>
      </div>
      <div className="lg:col-span-1">
        <label htmlFor="audit-actor" className={label}>Actor</label>
        <input id="audit-actor" name="actor" type="search" defaultValue={values.actor} placeholder="Name or email" maxLength={100} className={input} />
      </div>
      <div className="lg:col-span-1">
        <label htmlFor="audit-target" className={label}>Target contains</label>
        <input id="audit-target" name="target" type="search" defaultValue={values.target} placeholder="e.g. session:" maxLength={200} className={input} />
      </div>
      <div>
        <label htmlFor="audit-from" className={label}>From</label>
        <input id="audit-from" name="from" type="date" defaultValue={values.from} className={input} aria-describedby="audit-zone" />
      </div>
      <div>
        <label htmlFor="audit-to" className={label}>To</label>
        <input id="audit-to" name="to" type="date" defaultValue={values.to} className={input} aria-describedby="audit-zone" />
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`${btn.primary} flex-1`}>Filter</button>
        {active && (
          <Link href="/admin/audit" className={btn.secondary}>Clear</Link>
        )}
      </div>
      <p id="audit-zone" className="text-xs text-[var(--text-tertiary)] sm:col-span-2 lg:col-span-6">
        Dates are whole days in {zoneLabel}, both ends included.
      </p>
    </form>
  );
}
