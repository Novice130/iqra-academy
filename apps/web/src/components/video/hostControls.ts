'use client';

/**
 * Host-only participant actions, shared by the on-tile ⋮ menu and the People
 * panel so the two can't drift apart.
 *
 * Note the asymmetry: muting is a server call (LiveKit will force-mute a
 * published track), but *unmuting* is a request sent over the data channel
 * that the participant has to accept themselves. LiveKit blocks server-forced
 * unmute by design — a server shouldn't be able to switch someone's mic on
 * silently — so "ask to unmute" is the only honest option.
 */

import { useCallback } from 'react';
import { useRoomContext } from '@livekit/components-react';

export const UNMUTE_REQUEST_TOPIC = 'unmute-request';

export function useHostControls(sessionId: string) {
  const room = useRoomContext();

  /** Force-mute a published track — works for a camera track too. */
  const muteTrack = useCallback(
    (identity: string, trackSid: string) => {
      fetch(`/api/sessions/${sessionId}/mute-participant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, trackSid, muted: true }),
      }).catch(() => {});
    },
    [sessionId]
  );

  const askToUnmute = useCallback(
    (identity: string) => {
      room.localParticipant
        .publishData(new TextEncoder().encode('unmute'), {
          destinationIdentities: [identity],
          topic: UNMUTE_REQUEST_TOPIC,
          reliable: true,
        })
        .catch(() => {});
    },
    [room]
  );

  const rename = useCallback(
    (identity: string, name: string) => {
      fetch(`/api/sessions/${sessionId}/participant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity, name }),
      }).catch(() => {});
    },
    [sessionId]
  );

  return { muteTrack, askToUnmute, rename };
}
