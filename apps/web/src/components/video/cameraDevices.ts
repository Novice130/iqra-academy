'use client';

/**
 * Camera device helpers.
 *
 * Device *selection* lives in the control bar's mic/camera carets now
 * (CallControlBar), Google Meet style. What's left here is the pair of hooks
 * both that menu and the tap-to-flip gesture on the self-view need.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';

/**
 * Whether the device has more than one camera — i.e. whether "flip" means
 * anything here. A single-webcam laptop shouldn't advertise it.
 */
export function useHasMultipleCameras() {
  const [multiple, setMultiple] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setMultiple(devices.filter((d) => d.kind === 'videoinput').length > 1);
        }
      } catch {
        // enumerateDevices can reject before permission is granted.
      }
    };
    check();
    navigator.mediaDevices?.addEventListener?.('devicechange', check);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', check);
    };
  }, []);

  return multiple;
}

/**
 * Cycles to the next camera — front/back on a phone. Exposed as a hook so
 * the self-view tile can trigger it on tap.
 */
export function useCycleCamera() {
  const room = useRoomContext();

  return useCallback(async () => {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === 'videoinput'
      );
      if (devices.length < 2) return;
      const current = room.getActiveDevice('videoinput');
      const index = devices.findIndex((d) => d.deviceId === current);
      const next = devices[(index + 1) % devices.length];
      await room.switchActiveDevice('videoinput', next.deviceId);
    } catch {
      // Device switching can fail (device in use, permission revoked) — the
      // existing camera keeps running, which is the safe outcome.
    }
  }, [room]);
}
