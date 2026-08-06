'use client';

/**
 * Add Student To Call — Teams-style "bring in someone who didn't show up"
 * without leaving the current call. Rings a student directly into the
 * session that's already running (POST /api/calls with the live sessionId).
 */

import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 2000;
const RING_TIMEOUT_MS = 45000;

interface Student {
  studentProfileId: string;
  userId: string;
  name: string;
}

type RowState =
  | { status: 'idle' }
  | { status: 'ringing'; callId: string; startedAt: number }
  | { status: 'joined' }
  | { status: 'declined' }
  | { status: 'no-answer' };

export default function AddStudentToCallButton({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!open || students.length > 0) return;
    fetch('/api/teachers/students')
      .then((r) => r.json())
      .then((data) => setStudents(data.students || []))
      .catch(() => {});
  }, [open, students.length]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const ringing = Object.entries(rowsRef.current).filter(([, s]) => s.status === 'ringing') as [
        string,
        Extract<RowState, { status: 'ringing' }>
      ][];
      if (ringing.length === 0) return;

      for (const [studentProfileId, row] of ringing) {
        if (Date.now() - row.startedAt > RING_TIMEOUT_MS) {
          fetch(`/api/calls/${row.callId}/cancel`, { method: 'POST' }).catch(() => {});
          setRows((prev) => ({ ...prev, [studentProfileId]: { status: 'no-answer' } }));
          continue;
        }
        try {
          const res = await fetch(`/api/calls/${row.callId}`);
          const data = await res.json();
          if (data.status === 'ACCEPTED') {
            setRows((prev) => ({ ...prev, [studentProfileId]: { status: 'joined' } }));
          } else if (data.status === 'DECLINED') {
            setRows((prev) => ({ ...prev, [studentProfileId]: { status: 'declined' } }));
          }
        } catch {
          // Keep polling — a single failed check shouldn't drop the ring.
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const ring = async (student: Student) => {
    setRows((prev) => ({ ...prev, [student.studentProfileId]: { status: 'ringing', callId: '', startedAt: Date.now() } }));
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentProfileId: student.studentProfileId, sessionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.callId) {
        setRows((prev) => ({ ...prev, [student.studentProfileId]: { status: 'idle' } }));
        return;
      }
      setRows((prev) => ({
        ...prev,
        [student.studentProfileId]: { status: 'ringing', callId: data.callId, startedAt: Date.now() },
      }));
    } catch {
      setRows((prev) => ({ ...prev, [student.studentProfileId]: { status: 'idle' } }));
    }
  };

  const cancel = (student: Student) => {
    const row = rowsRef.current[student.studentProfileId];
    if (row?.status === 'ringing' && row.callId) {
      fetch(`/api/calls/${row.callId}/cancel`, { method: 'POST' }).catch(() => {});
    }
    setRows((prev) => ({ ...prev, [student.studentProfileId]: { status: 'idle' } }));
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
      >
        + Add Student
      </button>

      {open && (
        <>
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[85vw] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:top-full sm:translate-x-0 sm:translate-y-0 sm:mt-2 sm:w-64 sm:max-w-none rounded-lg overflow-hidden shadow-2xl"
            style={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <div className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-white/50" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              Ring a student into this call
            </div>
            <div className="max-h-72 overflow-auto">
              {students.length === 0 ? (
                <div className="px-3 py-3 text-sm text-white/50">No students on your roster.</div>
              ) : (
                students.map((s) => {
                  const row = rows[s.studentProfileId] || { status: 'idle' as const };
                  // The Ring button stays available in every state except
                  // while a ring is actually in flight — a teacher must be
                  // able to call a student who missed the first ring again,
                  // and again, without reloading the call.
                  return (
                    <div key={s.studentProfileId} className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-white">
                      <span className="truncate">{s.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {row.status === 'ringing' && (
                          <span className="text-xs text-emerald-400 animate-pulse">Ringing…</span>
                        )}
                        {row.status === 'joined' && <span className="text-xs text-emerald-400">Joined</span>}
                        {row.status === 'declined' && <span className="text-xs text-red-400">Declined</span>}
                        {row.status === 'no-answer' && <span className="text-xs text-white/40">No answer</span>}
                        {row.status === 'ringing' ? (
                          <button
                            onClick={() => cancel(s)}
                            className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
                            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => ring(s)}
                            className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
                            style={{ background: '#10b981', color: '#fff' }}
                          >
                            {row.status === 'idle' ? 'Ring' : 'Ring again'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
