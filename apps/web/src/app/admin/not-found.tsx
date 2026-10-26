import Link from "next/link";
import { EmptyState, Panel, btn } from "./_components/ui";

export default function AdminNotFound() {
  return (
    <Panel>
      <EmptyState
        title="Page not found"
        body="This admin page doesn't exist, or the record it points to has been removed."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/admin" className={btn.primary}>
              Back to overview
            </Link>
            <Link href="/dashboard" className={btn.secondary}>
              Dashboard home
            </Link>
          </div>
        }
      />
    </Panel>
  );
}
