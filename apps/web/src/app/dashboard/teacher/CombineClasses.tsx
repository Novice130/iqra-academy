'use client';

/**
 * "These two are back to back — teach them together?"
 *
 * Renders nothing at all when there is nothing to suggest, which is most
 * days. A permanently visible panel reading "no classes can be combined"
 * would be a box on the dashboard whose only job is to say no.
 *
 * The teacher picks which time survives rather than the server picking the
 * earlier one: whose family gets moved is a judgement about two households,
 * not a rule. Both buttons say the time out loud for that reason.
 *
 * Suggestions come from GET /api/sessions/merge and are re-fetched after a
 * merge, because combining one pair changes what else is adjacent.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LocalTime from '@/components/LocalTime';

interface SessionSummary {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  students: string[];
}

interface Candidate {
  earlier: SessionSummary;
  later: SessionSummary;
  gapMinutes: number;
}

export default function CombineClasses() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions/merge');
      if (!res.ok) return;
      const data = (await res.json()) as { candidates?: Candidate[] };
      setCandidates(data.candidates ?? []);
    } catch {
      // A suggestion panel that cannot load is not worth an error message on
      // somebody's dashboard. It stays hidden.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function combine(c: Candidate, keep: SessionSummary, merge: SessionSummary) {
    const movedNames = merge.students.join(', ');
    const ok = window.confirm(
      `Teach ${[...keep.students, ...merge.students].join(', ')} together in one class?\n\n` +
        `${movedNames} will be moved to the ${new Date(keep.scheduledStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} slot, and told.`
    );
    if (!ok) return;

    setBusy(c.earlier.id);
    setError(null);
    setDone(null);
    try {
      const res = await fetch('/api/sessions/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: keep.id, mergeId: merge.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "That didn't go through.");

      setCandidates((cs) => cs.filter((x) => x.earlier.id !== c.earlier.id));
      setDone(`Combined — ${[...keep.students, ...merge.students].join(', ')} now share one class.`);
      // The schedule above this panel is server-rendered, so it needs telling.
      router.refresh();
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  if (candidates.length === 0 && !done) return null;

  return (
    <div className="mb-8">
      <h2
        className="text-sm font-semibold uppercase tracking-widest mb-4"
        style={{ color: 'var(--text-tertiary)' }}
      >
        Back-to-back classes
      </h2>

      {error && (
        <div
          className="mb-3 px-4 py-3 rounded-lg text-sm"
          style={{ background: '#fee2e2', color: '#991b1b' }}
        >
          {error}
        </div>
      )}
      {done && (
        <div
          className="mb-3 px-4 py-3 rounded-lg text-sm"
          style={{ background: '#dcfce7', color: '#166534' }}
        >
          {done}
        </div>
      )}

      {candidates.map((c) => (
        <div key={c.earlier.id} className="card p-4 mb-3">
          <div className="text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            <strong>{c.earlier.students.join(', ')}</strong> at{' '}
            <LocalTime iso={c.earlier.scheduledStart} />, then{' '}
            <strong>{c.later.students.join(', ')}</strong> at{' '}
            <LocalTime iso={c.later.scheduledStart} />
          </div>
          <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {c.gapMinutes <= 0
              ? 'They overlap. Teaching them together frees the clash.'
              : `${c.gapMinutes} minutes apart. Teaching them together saves you half an hour.`}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => combine(c, c.earlier, c.later)}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'var(--accent)', opacity: busy ? 0.6 : 1 }}
            >
              {busy === c.earlier.id ? 'Combining…' : (
                <>
                  Combine at <LocalTime iso={c.earlier.scheduledStart} />
                </>
              )}
            </button>
            <button
              onClick={() => combine(c, c.later, c.earlier)}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                opacity: busy ? 0.6 : 1,
              }}
            >
              Combine at <LocalTime iso={c.later.scheduledStart} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
