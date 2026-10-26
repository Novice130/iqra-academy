/** @fileoverview Skeleton for /admin/system while its health checks run. */

import { PageSkeleton } from "../_components/ui";

export default function SystemLoading() {
  return <PageSkeleton stats={6} rows={5} />;
}
