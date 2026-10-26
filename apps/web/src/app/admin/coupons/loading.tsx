/** Loading state for /admin/coupons. */
import { PageSkeleton } from "../_components/ui";

export default function CouponsLoading() {
  return <PageSkeleton stats={3} rows={6} />;
}
