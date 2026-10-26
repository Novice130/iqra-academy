'use client';

/**
 * @fileoverview Recent progress entries on the teacher's student page.
 *
 * `deletableIds` is decided on the server (lib/progress canDeleteEntry) so the
 * button only appears where the API would allow it; the API re-checks anyway.
 * Delete uses an inline confirm step rather than window.confirm.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, btn } from '@/app/admin/_components/ui';
import LocalTime from '@/components/LocalTime';
import type { ProgressEntry } from '@/lib/progress';

export default function ProgressEntries({
  entries,
  deletableIds,
}: {
  entries: ProgressEntry[];
  deletableIds: string[];
}) {
  const router = useRouter();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const deletable = new Set(deletableIds);

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/teachers/progress/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({ id, message: data.error || data.message || 'Could not delete the entry.' });
        return;
      }
      setConfirmId(null);
      router.refresh();
    } catch {
      setError({ id, message: 'Network error. Try again.' });
    } finally {
      setBusyId(null);
    }
  }

  if (entries.length === 0) {
    return (
      <div className="card p-8 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
        No progress recorded yet. Entries you add appear here and on the family&apos;s progress page.
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Recent progress entries">
      {entries.map((r) => (
        <li key={r.id} className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
            <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
              {r.lessonTitle ?? 'Lesson'}
            </span>
            <Badge tone={r.isCompleted ? 'success' : 'info'}>{r.isCompleted ? 'Completed' : 'In progress'}</Badge>
          </div>

          {r.teacherNotes && (
            <p className="text-xs mb-2 leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
              {r.teacherNotes}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>
              {r.score !== null ? `Score ${r.score}` : 'No score'}
              {r.recordedByName ? ` · ${r.recordedByName}` : ''}
            </span>
            <LocalTime iso={r.updatedAt} mode="date-time" />
          </div>

          {deletable.has(r.id) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {confirmId === r.id ? (
                <>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Delete this entry?</span>
                  <button type="button" className={btn.danger} disabled={busyId === r.id} onClick={() => remove(r.id)}>
                    {busyId === r.id ? 'Deleting...' : 'Delete'}
                  </button>
                  <button type="button" className={btn.ghost} disabled={busyId === r.id} onClick={() => setConfirmId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className={btn.ghost} onClick={() => { setError(null); setConfirmId(r.id); }}>
                  Delete
                </button>
              )}
            </div>
          )}
          {error?.id === r.id && (
            <p role="alert" className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{error.message}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
