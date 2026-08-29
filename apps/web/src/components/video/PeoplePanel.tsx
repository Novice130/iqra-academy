'use client';

/**
 * People panel — Modern Apple iOS style sidebar / sheet:
 * Frosted glass background, participant roster with mic/speaking states,
 * spotlight, mute, student volume sliders, student ringing, and invite links.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import { useLocalParticipant, useRoomContext, useTracks } from '@livekit/components-react';
import { useHostControls, UNMUTE_REQUEST_TOPIC, CAMERA_REQUEST_TOPIC } from './hostControls';
import { CameraIcon, MicIcon } from './CallIcons';
import VolumeSlider from './VolumeSlider';
import { copyTextToClipboard } from '@/lib/clipboard';

const POLL_INTERVAL_MS = 5000;
const RING_TIMEOUT_MS = 45000;

function baseIdentity(identity: string | null | undefined): string | null {
  return identity ? identity.split('#')[0] : null;
}

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
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 backdrop-blur-xl"
      style={{ background: 'rgba(10, 12, 16, 0.65)' }}
    >
      <div
        className="w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl animate-fadeIn"
        style={{
          background: 'rgba(28, 30, 36, 0.94)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        }}
      >
        <div
          className="mx-auto mb-4 w-16 h-16 rounded-full flex items-center justify-center text-white"
          style={{
            background: isMic
              ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
              : 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
            boxShadow: isMic
              ? '0 8px 24px rgba(16, 185, 129, 0.4)'
              : '0 8px 24px rgba(0, 122, 255, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          {isMic ? <MicIcon className="w-7 h-7" /> : <CameraIcon className="w-7 h-7" />}
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">
          {isMic ? 'Your teacher asked you to unmute' : 'Your teacher asked for your camera'}
        </h2>
        <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
          {isMic
            ? 'Turn your microphone on so the class can hear your recitation.'
            : 'Turn your camera on so the teacher can see you.'}
        </p>
        <div className="flex gap-2.5 mt-6">
          <button
            onClick={() => setRequest(null)}
            className="flex-1 py-2.5 rounded-2xl text-xs font-semibold cursor-pointer bg-white/10 text-neutral-300 hover:bg-white/15 transition"
          >
            Not now
          </button>
          <button
            onClick={accept}
            className="flex-1 py-2.5 rounded-2xl text-xs font-bold text-white cursor-pointer transition active:scale-95"
            style={{
              background: isMic
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
              boxShadow: isMic
                ? '0 4px 14px rgba(16, 185, 129, 0.4)'
                : '0 4px 14px rgba(0, 122, 255, 0.4)',
            }}
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
          // Keep polling
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
    <div className="mt-5 pt-4 border-t border-white/10">
      <div className="px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">
        Ring a student into class
      </div>
      <div className="space-y-1.5">
        {students.map((s) => {
          const row = rows[s.studentProfileId] || { status: 'idle' as const };
          return (
            <div
              key={s.studentProfileId}
              className="flex items-center justify-between gap-3 p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.06] text-xs text-white"
            >
              <span className="truncate font-medium">{s.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                {row.status === 'ringing' && <span className="text-[11px] text-emerald-400 font-semibold animate-pulse">Ringing…</span>}
                {row.status === 'joined' && <span className="text-[11px] text-emerald-400 font-semibold">Joined</span>}
                {row.status === 'declined' && <span className="text-[11px] text-red-400 font-semibold">Declined</span>}
                {row.status === 'no-answer' && <span className="text-[11px] text-white/40">No answer</span>}
                {row.status === 'ringing' ? (
                  <button
                    onClick={() => stop(s)}
                    className="px-3 py-1 rounded-full text-xs font-semibold cursor-pointer bg-white/15 text-white hover:bg-white/20"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => ring(s)}
                    className="px-3 py-1 rounded-full text-xs font-semibold cursor-pointer bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-600/30"
                  >
                    {row.status === 'idle' ? 'Ring' : 'Ring again'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InviteGuest({
  sessionId,
  joinCode,
  sessionTitle,
  teacherName,
}: {
  sessionId: string;
  joinCode?: string | null;
  sessionTitle?: string | null;
  teacherName?: string | null;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const meetingInfo = useMemo(() => {
    const rawCode = (joinCode || sessionId || '').trim();
    const digitsOnly = rawCode.replace(/\D/g, '');
    let displayMeetingId = rawCode;
    let urlCode = rawCode;

    if (digitsOnly.length === 12) {
      displayMeetingId = `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)} ${digitsOnly.slice(6, 9)} ${digitsOnly.slice(9, 12)}`;
      urlCode = `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`;
    } else {
      const alphaOnly = rawCode.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (alphaOnly.length === 12) {
        displayMeetingId = `${alphaOnly.slice(0, 4)} ${alphaOnly.slice(4, 8)} ${alphaOnly.slice(8, 12)}`;
        urlCode = `${alphaOnly.slice(0, 4)}-${alphaOnly.slice(4, 8)}-${alphaOnly.slice(8, 12)}`;
      }
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://novicetutor.com';
    const inviteUrl = `${baseUrl}/join/${urlCode}`;
    const fullInvitation = `Join Novice Tutor Live Class\nTopic: ${sessionTitle || 'Quran & Islamic Studies'}\n${teacherName ? `Teacher: ${teacherName}\n` : ''}Meeting ID: ${displayMeetingId}\nInvite Link: ${inviteUrl}\n\n* Note: Anyone with this link or code can request to join. Guests wait in the waiting room until the host admits them.`;

    return {
      displayMeetingId,
      inviteUrl,
      fullInvitation,
    };
  }, [joinCode, sessionId, sessionTitle, teacherName]);

  const copy = async (text: string, key: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  return (
    <div className="pb-4 mb-3 border-b border-white/10 space-y-3">
      <div className="px-1 text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
        <span>Invite Guest / Share Class</span>
        <span className="text-[10px] text-white/40 normal-case font-normal">Zoom-style access</span>
      </div>

      {/* 1. Meeting ID / Join Code */}
      <div className="p-3 rounded-2xl bg-white/[0.05] border border-white/[0.08] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Meeting ID / Code</span>
          <button
            type="button"
            onClick={() => copy(meetingInfo.displayMeetingId, 'id')}
            className="px-2.5 py-1 rounded-xl text-[11px] font-semibold cursor-pointer transition active:scale-95"
            style={{
              background: copiedKey === 'id' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.12)',
              color: copiedKey === 'id' ? '#6ee7b7' : '#ffffff',
            }}
          >
            {copiedKey === 'id' ? '✓ Copied ID' : 'Copy ID'}
          </button>
        </div>
        <div className="text-base font-bold font-mono tracking-wider text-emerald-400 select-all">
          {meetingInfo.displayMeetingId}
        </div>
      </div>

      {/* 2. Guest Join Link (Visible URL & Copy Button) */}
      <div className="p-3 rounded-2xl bg-white/[0.05] border border-white/[0.08] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Guest Join Link</span>
          <button
            type="button"
            onClick={() => copy(meetingInfo.inviteUrl, 'link')}
            className="px-2.5 py-1 rounded-xl text-[11px] font-semibold cursor-pointer transition active:scale-95"
            style={{
              background: copiedKey === 'link' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(59, 130, 246, 0.35)',
              color: copiedKey === 'link' ? '#6ee7b7' : '#93c5fd',
            }}
          >
            {copiedKey === 'link' ? '✓ Copied Link' : 'Copy Link'}
          </button>
        </div>
        <input
          type="text"
          readOnly
          value={meetingInfo.inviteUrl}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          className="w-full px-2.5 py-1.5 rounded-xl text-xs font-mono bg-black/40 text-white/80 border border-white/10 focus:outline-none focus:border-blue-400 select-all cursor-pointer"
        />
      </div>

      {/* 3. Copy Full Invitation Button */}
      <button
        type="button"
        onClick={() => copy(meetingInfo.fullInvitation, 'all')}
        className="w-full py-2.5 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 shadow-md"
        style={{
          background:
            copiedKey === 'all'
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.85), rgba(5, 150, 105, 0.85))'
              : 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
          boxShadow: copiedKey === 'all' ? '0 4px 14px rgba(16, 185, 129, 0.35)' : '0 4px 14px rgba(0, 122, 255, 0.35)',
        }}
      >
        <span>{copiedKey === 'all' ? '✓ Full Invitation Copied!' : '📋 Copy Full Invitation'}</span>
      </button>

      <p className="px-1 text-[11px] leading-relaxed text-white/40">
        🛡️ Anyone can enter this code or link. Guests wait in the waiting room until you admit them.
      </p>
    </div>
  );
}

export default function PeoplePanel({
  sessionId,
  joinCode,
  sessionTitle,
  teacherName,
  isModerator,
  spotlightIdentity,
  onSpotlight,
  volumes,
  onVolume,
  onClose,
}: {
  sessionId: string;
  joinCode?: string | null;
  sessionTitle?: string | null;
  teacherName?: string | null;
  isModerator: boolean;
  spotlightIdentity: string | null;
  onSpotlight: (identity: string | null) => void;
  volumes: Record<string, number>;
  onVolume: (base: string, volume: number) => void;
  onClose: () => void;
}) {
  const { muteTrack, askToUnmute, removeParticipant } = useHostControls(sessionId);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });

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
    <>
      <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" onPointerDown={onClose} onClick={onClose} />
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-[84px] sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[71] flex flex-col rounded-3xl overflow-hidden shadow-2xl animate-fadeIn"
        style={{
          width: 'min(94vw, 440px)',
          maxHeight: '75vh',
          background: 'rgba(20, 22, 28, 0.92)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 h-14 shrink-0"
          style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white tracking-tight">People in Class</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              {people.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer text-white/70 hover:text-white bg-white/10 hover:bg-white/15 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
          {isModerator && (
            <InviteGuest
              sessionId={sessionId}
              joinCode={joinCode}
              sessionTitle={sessionTitle}
              teacherName={teacherName}
            />
          )}

        {people.map((p) => {
          const spotlighted = p.base === baseIdentity(spotlightIdentity);
          return (
            <div
              key={p.identity}
              className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.06] space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white truncate">
                    {p.name}
                    {p.isLocal && <span className="text-white/40"> (you)</span>}
                  </div>
                  <div className="text-[11px] font-medium" style={{ color: p.micMuted ? '#fca5a5' : '#6ee7b7' }}>
                    {p.micMuted ? 'Muted' : 'Speaking'}
                  </div>
                </div>

                {isModerator && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onSpotlight(spotlighted ? null : p.base)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer transition"
                      style={{
                        background: spotlighted ? '#007aff' : 'rgba(255, 255, 255, 0.1)',
                        color: '#fff',
                        boxShadow: spotlighted ? '0 2px 8px rgba(0, 122, 255, 0.35)' : 'none',
                      }}
                    >
                      {spotlighted ? '★ Spotlit' : 'Spotlight'}
                    </button>

                    {!p.isLocal &&
                      (p.micMuted ? (
                        <button
                          onClick={() => askToUnmute(p.identity)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer bg-white/10 text-white hover:bg-white/15"
                        >
                          Ask unmute
                        </button>
                      ) : (
                        <button
                          onClick={() => p.micSid && muteTrack(p.identity, p.micSid)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer bg-red-600 text-white hover:bg-red-500"
                        >
                          Mute
                        </button>
                      ))}

                    {!p.isLocal &&
                      (confirmRemove === p.identity ? (
                        <button
                          onClick={() => {
                            removeParticipant(p.identity);
                            setConfirmRemove(null);
                          }}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer bg-red-600 text-white"
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirmRemove(p.identity)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-semibold cursor-pointer bg-white/10 text-red-400 hover:bg-red-500/20"
                        >
                          Remove
                        </button>
                      ))}
                  </div>
                )}
              </div>

              {isModerator && !p.isLocal && (
                <div className="pt-1">
                  <VolumeSlider
                    value={volumes[p.base] ?? 1}
                    onChange={(v) => onVolume(p.base, v)}
                    label={p.name}
                    compact
                  />
                </div>
              )}
            </div>
          );
        })}

        {isModerator && <RingStudents sessionId={sessionId} />}
      </div>
    </div>
    </>
  );
}
