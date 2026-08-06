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
import { useHostControls, UNMUTE_REQUEST_TOPIC, CAMERA_REQUEST_TOPIC } from './hostControls';
import { CameraIcon, MicIcon } from './CallIcons';

const POLL_INTERVAL_MS = 2000;
const RING_TIMEOUT_MS = 45000;

/** Same helper as CustomVideoConference — identities carry a device suffix. */
function baseIdentity(identity: string | null | undefined): string | null {
  return identity ? identity.split('#')[0] : null;
}

/**
 * LiveKit can force a mic or camera *off* but never back on — a server
 * shouldn't be able to switch someone's camera on silently. So both are
 * requests sent over the data channel, and the person decides.
 *
 * A centred modal rather than the small corner toast this started as: a
 * student mid-lesson, usually on a phone, simply never noticed a chip in the
 * corner. The backdrop is deliberately light — it dims the call enough to
 * pull the eye without blacking out the teacher mid-sentence.
 */
export function MediaRequestModal() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [request, setRequest] = useState<'mic' | 'camera' | null>(null);

  useEffect(() => {
    const handler = (
      _payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string
    ) => {
      if (topic === UNMUTE_REQUEST_TOPIC) setRequest('mic');
      if (topic === CAMERA_REQUEST_TOPIC) setRequest('camera');
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room]);

  if (!request) return null;

  const isMic = request === 'mic';

  const accept = () => {
    setRequest(null);
    if (isMic) localParticipant.setMicrophoneEnabled(true).catch(() => {});
    else localParticipant.setCameraEnabled(true).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-6"
      style={{ background: 'rgba(20,22,28,0.38)' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl"
        style={{ background: '#202124', border: '1px solid rgba(255,255,255,0.14)', animation: 'lk-pop-in 220ms ease-out' }}
      >
        <div
          className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(138,180,248,0.18)', color: '#8ab4f8', animation: 'lk-pulse 1.4s ease-in-out infinite' }}
        >
          {isMic ? <MicIcon className="w-7 h-7" /> : <CameraIcon className="w-7 h-7" />}
        </div>
        <h2 className="text-lg font-semibold text-white">
          {isMic ? 'Your teacher asked you to unmute' : 'Your teacher asked you to turn on your camera'}
        </h2>
        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {isMic
            ? 'Turn your microphone on so everyone can hear you.'
            : 'Turn your camera on so everyone can see you.'}
        </p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => setRequest(null)}
            className="flex-1 py-2.5 rounded-full text-sm font-medium cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#e8eaed' }}
          >
            Not now
          </button>
          <button
            onClick={accept}
            className="flex-1 py-2.5 rounded-full text-sm font-semibold cursor-pointer"
            style={{ background: '#8ab4f8', color: '#202124' }}
          >
            {isMic ? 'Unmute' : 'Turn on camera'}
          </button>
        </div>
      </div>
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

/**
 * The guest link belongs with the other ways of getting someone into the
 * room, not in a menu of unrelated options — inviting a stranger and ringing
 * a student are the same job. Host only: /join needs no account, so the link
 * is the door, unlike the old /dashboard one which was useless without one.
 */
function InviteGuest({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/join/${sessionId}`;

  const copy = () => {
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="pb-3 mb-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        Add someone to this class
      </div>
      <button
        onClick={copy}
        className="w-full py-2.5 rounded-full text-xs font-semibold cursor-pointer"
        style={{ background: copied ? 'rgba(138,180,248,0.2)' : '#8ab4f8', color: copied ? '#8ab4f8' : '#202124' }}
      >
        {copied ? '✓ Guest link copied' : 'Copy guest invite link'}
      </button>
      <p className="mt-2 px-1 text-[11px] leading-4 text-white/40">
        Anyone with this link asks to join and waits for you to let them in. No account needed.
      </p>
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
  const { muteTrack, askToUnmute, removeParticipant } = useHostControls(sessionId);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
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
        {isModerator && <InviteGuest sessionId={sessionId} />}

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
                        onClick={() => p.micSid && muteTrack(p.identity, p.micSid)}
                        className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
                        style={{ background: '#ea4335', color: '#fff' }}
                      >
                        Mute
                      </button>
                    ))}
                  {/* Two taps here too — same reasoning as the tile menu. */}
                  {!p.isLocal &&
                    (confirmRemove === p.identity ? (
                      <button
                        onClick={() => {
                          removeParticipant(p.identity);
                          setConfirmRemove(null);
                        }}
                        className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
                        style={{ background: '#ea4335', color: '#fff' }}
                      >
                        Confirm remove
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(p.identity)}
                        className="px-2.5 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer"
                        style={{ background: 'rgba(255,255,255,0.1)', color: '#f6a6a0' }}
                      >
                        Remove
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
