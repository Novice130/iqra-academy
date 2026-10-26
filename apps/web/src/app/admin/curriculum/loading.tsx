/** Loading state for /admin/curriculum. */
import { PageSkeleton } from "../_components/ui";

export default function CurriculumLoading() {
  return <PageSkeleton stats={4} rows={6} />;
}
