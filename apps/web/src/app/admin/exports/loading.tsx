/** Loading state for /admin/exports. */
import { PageSkeleton } from "../_components/ui";

export default function ExportsLoading() {
  return <PageSkeleton stats={0} rows={5} />;
}
