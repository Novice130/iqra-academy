'use client';

/**
 * SoloInactivityPrompt — Apple modal style inactivity prompt:
 * Checks if teacher is alone for 30m, offers 45m extension or clean departure.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useRemoteParticipants, useRoomContext } from '@livekit/components-react';

interface SoloInactivityPromptProps {
  isHost: boolean;
  onLeaveOrEnd: () => void;
  customInitialTimeoutMs?: number;
  customExtensionTimeoutMs?: number;
  customWarningWindowSec?: number;
}

const INITIAL_SOLO_TIMEOUT_MS = 30 * 60 * 1000;
const EXTENSION_SOLO_TIMEOUT_MS = 45 * 60 * 1000;
const WARNING_WINDOW_SECONDS = 60;

export default function SoloInactivityPrompt({
  isHost,
  onLeaveOrEnd,
  customInitialTimeoutMs,
  customExtensionTimeoutMs,
  customWarningWindowSec,
}: SoloInactivityPromptProps) {
  const remotes = useRemoteParticipants();
  const room = useRoomContext();
  const isSolo = remotes.length === 0;

  const [showPrompt, setShowPrompt] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(customWarningWindowSec ?? WARNING_WINDOW_SECONDS);
  const [hasExtended, setHasExtended] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const initialMs = customInitialTimeoutMs ?? INITIAL_SOLO_TIMEOUT_MS;
  const extensionMs = customExtensionTimeoutMs ?? EXTENSION_SOLO_TIMEOUT_MS;
  const warningSec = customWarningWindowSec ?? WARNING_WINDOW_SECONDS;

  useEffect(() => {
    if (!isHost) return;

    if (!isSolo) {
      setShowPrompt(false);
      setHasExtended(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    const delay = hasExtended ? extensionMs : initialMs;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setShowPrompt(true);
      setSecondsRemaining(warningSec);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isHost, isSolo, hasExtended, initialMs, extensionMs, warningSec]);

  useEffect(() => {
    if (!showPrompt) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          onLeaveOrEnd();
          room.disconnect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showPrompt, onLeaveOrEnd, room]);

  const handleStay = () => {
    setShowPrompt(false);
    setHasExtended(true);
  };

  const handleLeave = () => {
    setShowPrompt(false);
    onLeaveOrEnd();
    room.disconnect();
  };

  if (!showPrompt || !isHost) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xl bg-black/60 animate-fadeIn">
      <div
        className="relative w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl text-center text-white space-y-5"
        style={{
          background: 'rgba(28, 30, 36, 0.94)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        }}
      >
        <div
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center text-amber-400"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(217, 119, 6, 0.15) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            boxShadow: '0 8px 24px rgba(245, 158, 11, 0.25)',
          }}
        >
          <svg className="w-8 h-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <div className="space-y-1.5">
          <h3 className="text-xl font-bold tracking-tight">Are you still teaching?</h3>
          <p className="text-xs text-neutral-300 leading-relaxed max-w-sm mx-auto">
            You are the only person in this meeting. To save resources, this call will close automatically unless you choose to stay.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          Auto-closing in {secondsRemaining}s…
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handleStay}
            className="flex-1 py-3 px-4 rounded-2xl font-bold text-xs sm:text-sm text-white transition active:scale-95 cursor-pointer shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
              boxShadow: '0 4px 16px rgba(0, 122, 255, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            Stay in call (+45m)
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="flex-1 py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10 font-semibold text-xs sm:text-sm text-neutral-200 transition cursor-pointer"
          >
            Leave now
          </button>
        </div>
      </div>
    </div>
  );
}
