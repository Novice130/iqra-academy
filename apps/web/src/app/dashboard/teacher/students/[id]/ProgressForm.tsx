'use client';

/**
 * @fileoverview "Add progress" form on the teacher's student page.
 *
 * Posts to /api/teachers/progress, then refreshes the server page so the
 * entries list, the curriculum % and the family's progress page all read the
 * same row. Re-recording a lesson updates its entry (one row per lesson).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { btn, input, label } from '@/app/admin/_components/ui';
import { formatInZone, useViewerTimeZone } from '@/components/LocalTime';

export interface LessonOption {
  id: string;
  title: string;
  sortOrder: number;
}

export interface SessionOption {
  id: string;
  scheduledStart: string;
}

export default function ProgressForm({
  studentProfileId,
  lessons,
  sessions,
}: {
  studentProfileId: string;
  lessons: LessonOption[];
  sessions: SessionOption[];
}) {
  const router = useRouter();
  const timeZone = useViewerTimeZone();
  const [lessonId, setLessonId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [completed, setCompleted] = useState(true);
  const [score, setScore] = useState('');
  const [notes, setNotes] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (lessons.length === 0) {
    return (
      <div className="card p-5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        No lessons are set up for this student&apos;s track yet, so progress cannot be recorded. Ask an admin to add the
        curriculum.
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    if (!lessonId) {
      setError('Choose a lesson.');
      return;
    }
    const scoreNum = score.trim() === '' ? null : Number(score);
    if (scoreNum !== null && (!Number.isInteger(scoreNum) || scoreNum < 1 || scoreNum > 100)) {
      setError('Score must be a whole number from 1 to 100.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/teachers/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentProfileId,
          lessonId,
          sessionId: sessionId || undefined,
          completed,
          score: scoreNum,
          notes: notes.trim() || undefined,
          feedbackAudioUrl: sessionId && audioUrl.trim() ? audioUrl.trim() : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.details?.[0]?.message || data.error || data.message || 'Could not save the entry.');
        return;
      }
      const title = lessons.find((l) => l.id === lessonId)?.title ?? 'Lesson';
      setSaved(`Saved: ${title}.`);
      setLessonId('');
      setScore('');
      setNotes('');
      setAudioUrl('');
      router.refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-5 space-y-3" aria-label="Add progress">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Add progress</h3>

      <div>
        <label htmlFor="pf-lesson" className={label}>Lesson</label>
        <select id="pf-lesson" className={input} value={lessonId} onChange={(e) => setLessonId(e.target.value)} required>
          <option value="">Choose a lesson</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>{l.sortOrder}. {l.title}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pf-status" className={label}>Status</label>
          <select
            id="pf-status"
            className={input}
            value={completed ? 'done' : 'progress'}
            onChange={(e) => setCompleted(e.target.value === 'done')}
          >
            <option value="done">Completed</option>
            <option value="progress">In progress</option>
          </select>
        </div>
        <div>
          <label htmlFor="pf-score" className={label}>Score (1-100, optional)</label>
          <input
            id="pf-score"
            className={input}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="pf-session" className={label}>Class (optional)</label>
        <select id="pf-session" className={input} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Not linked to a class</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>{formatInZone(s.scheduledStart, 'date-time', false, timeZone || 'UTC')}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="pf-notes" className={label}>Notes for the family (optional)</label>
        <textarea
          id="pf-notes"
          className={`${input} h-auto py-2`}
          rows={3}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {sessionId && (
        <div>
          <label htmlFor="pf-audio" className={label}>Audio feedback link (optional)</label>
          <input
            id="pf-audio"
            className={input}
            type="url"
            placeholder="https://"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
          />
        </div>
      )}

      {completed ? null : (
        <p className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          In-progress entries show here and to admins; the family&apos;s progress page lists completed lessons.
        </p>
      )}

      {error && <p role="alert" className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      {saved && <p role="status" className="text-xs" style={{ color: 'var(--color-success)' }}>{saved}</p>}

      <button type="submit" className={btn.primary} disabled={saving}>
        {saving ? 'Saving...' : 'Save entry'}
      </button>
    </form>
  );
}
