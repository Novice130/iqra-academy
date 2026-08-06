'use client';

/**
 * People panel — one sidebar for everything that used to be a separate
 * button in the top bar: who's here, spotlight, mute / ask-to-unmute, and
 * ringing a student into the running call.
 *
 * Consolidating these matters as much as the styling did: five floating
 * controls over the video is what made the call screen feel like a toolbar
 * demo instead of a classroom.
 */

import { useEffect, useRef, useState } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import { useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';

const UNMUTE_REQUEST_TOPIC = 'unmute-request';
const POLL_INTERVAL_MS = 2000;
const RING_TIMEOUT_MS = 45000;

/** Same helper as CustomVideoConference — identities carry a device suffix. */
function baseIdentity(identity: string | null | undefined): string | null {
  return identity ? identity.split('#')[0] : null;
}

/**
 * LiveKit deliberately has no server-forced unmute (a server shouldn't be
 * able to switch someone's mic on silently), so "ask to unmute" is a data
 * message and the person decides. Mounted for everyone, not just students.
 */
export function UnmuteRequestToast() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [asked, setAsked] = useState(false);

  useEffect(() => {
    const handler = (
      _payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string
    ) => {
      if (topic === UNMUTE_REQUEST_TOPIC) setAsked(true);
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room]);

  if (!asked) return null;

  return (
    <div
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
      style={{ background: '#202124', border: '1px solid rgba(255,255,255,0.15)' }}
    >
      <span className="text-sm text-white">Your teacher asked you to unmute.</span>
      <button
        onClick={() => {
          setAsked(false);
          localParticipant.setMicrophoneEnabled(true).catch(() => {});
        }}
        className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
        style={{ background: '#8ab4f8', color: '#202124' }}
      >
        Unmute
      </button>
      <button
        onClick={() => setAsked(false)}
        className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer text-white/60"
      >
        Dismiss
      </button>
    </div>
  );
}

interface RosterStudent {
  studentProfileId: string;
  userId: string;
  name: string;
}

type RingState =
  | { status: 'idle' }
  | { status: 'ringing'; callId: string; startedAt: number }
  | { status: 'joined' }
  | { status: 'declined' }
  | { status: 'no-answer' };

function RingStudents({ sessionId }: { sessionId: string }) {
  const [students, setStudents] = useState<RosterStudent[]>([]);
  const [rows, setRows] = useState<Record<string, RingState>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    fetch('/api/teachers/students')
      .then((r) => r.json())
      .then((d) => setStudents(d.students || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const ringing = Object.entries(rowsRef.current).filter(([, s]) => s.status === 'ringing') as [
        string,
        Extract<RingState, { status: 'ringing' }>
      ][];
      for (const [id, row] of ringing) {
        if (Date.now() - row.startedAt > RING_TIMEOUT_MS) {
          fetch(`/api/calls/${row.callId}/cancel`, { method: 'POST' }).catch(() => {});
          setRows((p) => ({ ...p, [id]: { status: 'no-answer' } }));
          continue;
        }
        if (!row.callId) continue;
        try {
          const res = await fetch(`/api/calls/${row.callId}`);
          const data = await res.json();
          if (data.status === 'ACCEPTED') setRows((p) => ({ ...p, [id]: { status: 'joined' } }));
          else if (data.status === 'DECLINED') setRows((p) => ({ ...p, [id]: { status: 'declined' } }));
        } catch {
          // Transient failure — keep polling.
        }
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const ring = async (s: RosterStudent) => {
    setRows((p) => ({ ...p, [s.studentProfileId]: { status: 'ringing', callId: '', startedAt: Date.now() } }));
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentProfileId: s.studentProfileId, sessionId }),
      });
      const data = await res.json();
      if (!res.ok || !data.callId) {
        setRows((p) => ({ ...p, [s.studentProfileId]: { status: 'idle' } }));
        return;
      }
      setRows((p) => ({
        ...p,
        [s.studentProfileId]: { status: 'ringing', callId: data.callId, startedAt: Date.now() },
      }));
    } catch {
      setRows((p) => ({ ...p, [s.studentProfileId]: { status: 'idle' } }));
    }
  };

  const stop = (s: RosterStudent) => {
    const row = rowsRef.current[s.studentProfileId];
    if (row?.status === 'ringing' && row.callId) {
      fetch(`/api/calls/${row.callId}/cancel`, { method: 'POST' }).catch(() => {});
    }
    setRows((p) => ({ ...p, [s.studentProfileId]: { status: 'idle' } }));
  };

  if (students.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        Ring a student into this call
      </div>
      {students.map((s) => {
        const row = rows[s.studentProfileId] || { status: 'idle' as const };
        return (
          <div key={s.studentProfileId} className="flex items-center justify-between gap-3 py-2 text-sm text-white">
            <span className="truncate">{s.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              {row.status === 'ringing' && <span className="text-xs text-emerald-400 animate-pulse">Ringing…</span>}
              {row.status === 'joined' && <span className="text-xs text-emerald-400">Joined</span>}
              {row.status === 'declined' && <span className="text-xs text-red-400">Declined</span>}
              {row.status === 'no-answer' && <span className="text-xs text-white/40">No answer</span>}
              {/* Always ringable again — a missed ring is the normal case. */}
              {row.status === 'ringing' ? (
                <button
                  onClick={() => stop(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                  style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => ring(s)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                  style={{ background: '#8ab4f8', color: '#202124' }}
                >
                  {row.status === 'idle' ? 'Ring' : 'Ring again'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PeoplePanel({
  sessionId,
  isModerator,
  spotlightIdentity,
  onSpotlight,
  onClose,
}: {
  sessionId: string;
  isModerator: boolean;
  spotlightIdentity: string | null;
  onSpotlight: (identity: string | null) => void;
  onClose: () => void;
}) {
  const room = useRoomContext();
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

  // One row per person (not per device) — someone on a phone and a laptop is
  // still one participant in the list.
  const seen = new Set<string>();
  const people = cameraTracks
    .filter((t) => {
      const base = baseIdentity(t.participant.identity)!;
      if (seen.has(base)) return false;
      seen.add(base);
      return true;
    })
    .map((t) => {
      const mic = micTracks.find((m) => m.participant.identity === t.participant.identity);
      return {
        identity: t.participant.identity,
        base: baseIdentity(t.participant.identity)!,
        name: t.participant.name || baseIdentity(t.participant.identity)!,
        isLocal: t.participant.isLocal,
        micMuted: mic?.publication?.isMuted ?? true,
        micSid: mic?.publication?.trackSid,
      };
    });

  const askToUnmute = (identity: string) => {
    room.localParticipant
      .publishData(new TextEncoder().encode('unmute'), {
        destinationIdentities: [identity],
        topic: UNMUTE_REQUEST_TOPIC,
        reliable: true,
      })
      .catch(() => {});
  };

  const mute = (identity: string, trackSid: string) => {
    fetch(`/api/sessions/${sessionId}/mute-participant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, trackSid, muted: true }),
    }).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-[60] sm:static sm:z-auto sm:w-[340px] sm:shrink-0 flex flex-col"
      style={{ background: '#202124', borderLeft: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div
        className="flex items-center justify-between px-4 h-14 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        <span className="text-sm font-semibold text-white">People ({people.length})</span>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full cursor-pointer text-white/70 hover:text-white"
          style={{ background: 'rgba(255,255,255,0.08)' }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {people.map((p) => {
          const spotlighted = p.base === baseIdentity(spotlightIdentity);
          return (
            <div key={p.identity} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="text-sm text-white truncate">
                  {p.name}
                  {p.isLocal && <span className="text-white/40"> (you)</span>}
                </div>
                <div className="text-[11px] text-white/40">{p.micMuted ? 'Muted' : 'Speaking'}</div>
              </div>
              {isModerator && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => onSpotlight(spotlighted ? null : p.base)}
                    className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
                    style={{
                      background: spotlighted ? '#8ab4f8' : 'rgba(255,255,255,0.1)',
                      color: spotlighted ? '#202124' : '#fff',
                    }}
                  >
                    {spotlighted ? '★ Spotlit' : 'Spotlight'}
                  </button>
                  {!p.isLocal &&
                    (p.micMuted ? (
                      <button
                        onClick={() => askToUnmute(p.identity)}
                        className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
                      >
                        Ask to unmute
                      </button>
                    ) : (
                      <button
                        onClick={() => p.micSid && mute(p.identity, p.micSid)}
                        className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
                        style={{ background: '#ea4335', color: '#fff' }}
                      >
                        Mute
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}

        {isModerator && <RingStudents sessionId={sessionId} />}
      </div>
    </div>
  );
}
