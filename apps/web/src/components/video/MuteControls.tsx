'use client';

/**
 * Mute Controls — teacher can force-mute a student's mic instantly.
 * LiveKit deliberately does NOT allow a server-forced unmute (a server
 * shouldn't be able to secretly turn on someone's mic) — so "unmute" is
 * a request sent over the data channel that the student has to accept
 * themselves, same pattern as Zoom's "ask to unmute".
 */

import { useEffect, useState } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import { useRoomContext, useTracks, useLocalParticipant } from '@livekit/components-react';

const UNMUTE_REQUEST_TOPIC = 'unmute-request';

export default function MuteControls({
  sessionId,
  isModerator,
}: {
  sessionId: string;
  isModerator: boolean;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const [open, setOpen] = useState(false);
  const [unmuteRequested, setUnmuteRequested] = useState(false);

  // Every participant listens for a request addressed to them — the accept
  // action is theirs alone to take, LiveKit has no server-side equivalent.
  useEffect(() => {
    const handler = (
      _payload: Uint8Array,
      _participant: unknown,
      _kind: unknown,
      topic?: string
    ) => {
      if (topic === UNMUTE_REQUEST_TOPIC) setUnmuteRequested(true);
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room]);

  const acceptUnmute = async () => {
    setUnmuteRequested(false);
    await localParticipant.setMicrophoneEnabled(true).catch(() => {});
  };

  const askToUnmute = (identity: string) => {
    room.localParticipant
      .publishData(new TextEncoder().encode('unmute'), {
        destinationIdentities: [identity],
        topic: UNMUTE_REQUEST_TOPIC,
        reliable: true,
      })
      .catch(() => {});
  };

  const muteParticipant = async (identity: string, trackSid: string) => {
    await fetch(`/api/sessions/${sessionId}/mute-participant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity, trackSid, muted: true }),
    }).catch(() => {});
  };

  const remoteMics = micTracks.filter((t) => !t.participant.isLocal && t.publication);

  return (
    <>
      {unmuteRequested && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl"
          style={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.15)' }}
        >
          <span className="text-sm text-white">Your teacher asked you to unmute.</span>
          <button
            onClick={acceptUnmute}
            className="px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
            style={{ background: '#10b981', color: '#fff' }}
          >
            Unmute
          </button>
          <button
            onClick={() => setUnmuteRequested(false)}
            className="px-3 py-1.5 rounded text-xs font-medium cursor-pointer text-white/60"
          >
            Dismiss
          </button>
        </div>
      )}

      {isModerator && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)' }}
          >
            🎙 Mics
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
                  Manage mics
                </div>
                <div className="max-h-72 overflow-auto">
                  {remoteMics.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-white/50">No one else has joined yet.</div>
                  ) : (
                    remoteMics.map((t) => {
                      const muted = t.publication!.isMuted;
                      return (
                        <div key={t.participant.identity} className="flex items-center justify-between gap-3 px-3 py-3 text-sm text-white">
                          <span className="truncate">{t.participant.name || t.participant.identity}</span>
                          {muted ? (
                            <button
                              onClick={() => askToUnmute(t.participant.identity)}
                              className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
                              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
                            >
                              Ask to unmute
                            </button>
                          ) : (
                            <button
                              onClick={() => muteParticipant(t.participant.identity, t.publication!.trackSid)}
                              className="shrink-0 px-3 py-1.5 rounded text-xs font-semibold cursor-pointer"
                              style={{ background: '#ef4444', color: '#fff' }}
                            >
                              Mute
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
