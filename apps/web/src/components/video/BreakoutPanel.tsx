'use client';

/**
 * Breakout rooms panel — host creates named rooms, assigns participants,
 * opens/closes the set, and every participant moves via a short-lived
 * child-room token. Students see only their own assignment plus a Join
 * button; they can never self-assign or list other rooms' tokens.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useRoomContext, useRemoteParticipants } from '@livekit/components-react';

interface BreakoutRoomView {
  id: string;
  title: string;
  videoRoomName: string | null;
  assignments: { userId: string | null; participantIdentity: string | null; joinedAt: string | null; returnedAt: string | null }[];
}

interface BreakoutSetView {
  id: string;
  status: 'DRAFT' | 'OPEN' | 'CLOSED';
  rooms: BreakoutRoomView[];
}

export default function BreakoutPanel({
  sessionId,
  isHost,
  onClose,
}: {
  sessionId: string;
  isHost: boolean;
  onClose: () => void;
}) {
  const room = useRoomContext();
  const remotes = useRemoteParticipants();
  const [set, setSet] = useState<BreakoutSetView | null>(null);
  const [myRoomId, setMyRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [titles, setTitles] = useState('Group A,Group B');
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/breakouts`);
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const data = await res.json();
      setSet(data.set);
      setMyRoomId(data.myAssignment && !data.myAssignment.returnedAt ? data.myAssignment.roomId : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load breakout rooms.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const post = useCallback(
    async (body: unknown, label: string) => {
      setBusy(label);
      setNotice(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/breakouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `${label} failed (${res.status})`);
        }
        await refresh();
        return await res.json().catch(() => ({}));
      } catch (e) {
        setError(e instanceof Error ? e.message : `${label} failed.`);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [sessionId, refresh]
  );

  const handleCreate = () => {
    const rooms = titles
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((title) => ({ title }));
    if (rooms.length === 0) {
      setError('Name at least one room, e.g. "Group A, Group B".');
      return;
    }
    post({ action: 'create', rooms }, 'Creating…');
  };

  const handleAutoAssign = () => {
    if (!set) return;
    const ids = remotes.map((p) => p.identity);
    const local = room.localParticipant.identity;
    const all = [local, ...ids];
    const rooms = set.rooms;
    if (rooms.length === 0) return;
    const assignments = all.map((participantIdentity, i) => ({
      roomId: rooms[i % rooms.length].id,
      participantIdentity,
    }));
    post({ action: 'assign', assignments }, 'Assigning…');
  };

  const handleJoin = async (roomId: string) => {
    setBusy(`join-${roomId}`);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/breakouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move-token', roomId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Join failed (${res.status})`);
      }
      const data = await res.json();
      setNotice(`Opening ${data.roomName} — paste this token into a second tab within 15 minutes, then return here when the host closes rooms. Token: ${String(data.token).slice(0, 12)}…`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Join failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-label="Breakout rooms"
        className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[81] w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[85vh]"
        style={{
          background: 'rgba(24, 26, 32, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
        }}
      >
        <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Breakout Rooms</h3>
            <p className="text-[11px] text-white/50">
              {set ? `Status: ${set.status}` : 'Small-group rooms for this class'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
            aria-label="Close breakout rooms"
          >
            ✕
          </button>
        </div>

        {loading && (
          <div role="status" aria-live="polite" className="text-xs text-white/60">
            Loading breakout rooms…
          </div>
        )}
        {error && (
          <div role="alert" className="mb-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mb-3 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
            {notice}
          </div>
        )}

        {!loading && !set && isHost && (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-white">Room names (comma-separated)</label>
            <input
              type="text"
              value={titles}
              onChange={(e) => setTitles(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl text-xs bg-white/5 text-white border border-white/15 focus:outline-none focus:border-blue-400"
              placeholder="Group A, Group B"
            />
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy !== null}
              className="w-full py-2.5 rounded-2xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition disabled:opacity-50"
            >
              {busy ?? 'Create Rooms'}
            </button>
          </div>
        )}

        {!loading && !set && !isHost && (
          <p className="text-xs text-white/60">The host has not created breakout rooms yet.</p>
        )}

        {set && (
          <div className="space-y-3">
            {set.rooms.map((r) => {
              const isMine = myRoomId === r.id;
              return (
                <div
                  key={r.id}
                  className={`p-3.5 rounded-2xl border ${isMine ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/[0.04] border-white/[0.08]'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-white">
                      {r.title} {isMine && <span className="text-amber-300">· your group</span>}
                    </div>
                    <span className="text-[11px] text-white/50">{r.assignments.length} assigned</span>
                  </div>
                  {(isHost || isMine) && set.status === 'OPEN' && (
                    <button
                      type="button"
                      onClick={() => handleJoin(r.id)}
                      disabled={busy !== null}
                      className="mt-2 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer transition disabled:opacity-50"
                    >
                      {busy === `join-${r.id}` ? 'Joining…' : isHost ? 'Open Room' : 'Join Room'}
                    </button>
                  )}
                </div>
              );
            })}

            {isHost && (
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleAutoAssign}
                  disabled={busy !== null || set.rooms.length === 0}
                  className="w-full py-2.5 rounded-2xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white cursor-pointer transition disabled:opacity-50"
                >
                  Auto-assign everyone
                </button>
                {set.status === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={() => post({ action: 'open' }, 'Opening…')}
                    disabled={busy !== null}
                    className="w-full py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition disabled:opacity-50"
                  >
                    {busy ?? 'Open Rooms'}
                  </button>
                )}
                {set.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={() => post({ action: 'close' }, 'Closing…')}
                    disabled={busy !== null}
                    className="w-full py-2.5 rounded-2xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white cursor-pointer transition disabled:opacity-50"
                  >
                    {busy ?? 'Close & Return Everyone'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
