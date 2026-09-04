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
export const CAMERA_REQUEST_TOPIC = 'camera-request';

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

  /** Same story as unmute: a camera can be forced off but never back on. */
  const askForCamera = useCallback(
    (identity: string) => {
      room.localParticipant
        .publishData(new TextEncoder().encode('camera'), {
          destinationIdentities: [identity],
          topic: CAMERA_REQUEST_TOPIC,
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

  /**
   * Drops someone from the call. Per-connection, like muting: removing the
   * phone somebody joined on twice leaves their laptop where it is. LiveKit
   * disconnects them; nothing stops them rejoining from their dashboard, so
   * this is "leave the room now", not a ban.
   */
  const removeParticipant = useCallback(
    (identity: string) => {
      fetch(`/api/sessions/${sessionId}/participant?identity=${encodeURIComponent(identity)}`, {
        method: 'DELETE',
      }).catch(() => {});
    },
    [sessionId]
  );

  /** Mute all remote participants in the room */
  const muteAll = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/host-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'muteAll' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [sessionId]);

  /** Lock or unlock the room to block new guest knocks/joins */
  const setRoomLocked = useCallback(
    async (locked: boolean) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/host-tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'lock', value: locked }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [sessionId]
  );

  /** Toggle whether non-hosts can share their screen */
  const setAllowParticipantShare = useCallback(
    async (allow: boolean) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/host-tools`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'participantShare', value: allow }),
        });
        return res.ok;
      } catch {
        return false;
      }
    },
    [sessionId]
  );

  return {
    muteTrack,
    askToUnmute,
    askForCamera,
    rename,
    removeParticipant,
    muteAll,
    setRoomLocked,
    setAllowParticipantShare,
  };
}
