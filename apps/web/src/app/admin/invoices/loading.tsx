/** Loading state for /admin/invoices. */
import { PageSkeleton } from "../_components/ui";

export default function InvoicesLoading() {
  return <PageSkeleton stats={4} rows={6} />;
}
