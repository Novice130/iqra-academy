'use client';

/**
 * Device Switcher — pick camera / microphone / speaker mid-call.
 *
 * WHY NOT LIVEKIT'S BUILT-IN MENU: ControlBar's device chevrons render their
 * popup *inside* `.lk-control-bar`, and that bar is `overflow-x: auto` here so
 * its buttons stay reachable on a narrow phone (see globals.css). An
 * overflow container clips absolutely-positioned children, so the menu came
 * out as a sliver trapped inside the bar — no z-index fixes that. This panel
 * lives in the top bar instead, which doesn't clip, and works the same on
 * desktop and phone.
 */

import { useCallback, useEffect, useState } from 'react';
import { useMediaDeviceSelect, useRoomContext } from '@livekit/components-react';

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

function DeviceList({
  kind,
  label,
}: {
  kind: MediaDeviceKind;
  label: string;
}) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });

  if (devices.length === 0) return null;

  return (
    <div className="px-2 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40">
        {label}
      </div>
      {devices.map((d, i) => {
        const active = d.deviceId === activeDeviceId;
        return (
          <button
            key={d.deviceId || i}
            type="button"
            onClick={() => setActiveMediaDevice(d.deviceId)}
            className="w-full text-left px-2 py-2 rounded text-xs cursor-pointer truncate"
            style={{ background: active ? '#10b981' : 'transparent', color: '#fff' }}
          >
            {active ? '✓ ' : ''}
            {d.label || `${label} ${i + 1}`}
          </button>
        );
      })}
    </div>
  );
}

export default function DeviceSwitcher() {
  const [open, setOpen] = useState(false);
  const cycleCamera = useCycleCamera();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
        style={{
          background: open ? '#10b981' : 'rgba(255,255,255,0.1)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
        }}
      >
        Devices
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[85vw] max-w-xs sm:absolute sm:left-auto sm:right-0 sm:top-full sm:translate-x-0 sm:translate-y-0 sm:mt-2 sm:w-72 sm:max-w-none rounded-lg overflow-hidden shadow-2xl max-h-[70vh] overflow-y-auto"
            style={{ background: '#1a1d24', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Devices
              </span>
              <button
                type="button"
                onClick={() => {
                  cycleCamera();
                  setOpen(false);
                }}
                className="px-2 py-1 rounded text-[11px] font-semibold cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
              >
                🔄 Flip camera
              </button>
            </div>
            <DeviceList kind="videoinput" label="Camera" />
            <DeviceList kind="audioinput" label="Microphone" />
            <DeviceList kind="audiooutput" label="Speaker" />
          </div>
        </>
      )}
    </div>
  );
}
