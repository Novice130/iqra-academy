/** Loading state for /admin/plans. */
import { PageSkeleton } from "../_components/ui";

export default function PlansLoading() {
  return <PageSkeleton stats={5} rows={6} />;
}
