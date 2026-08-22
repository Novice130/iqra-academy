'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRemoteParticipants } from '@livekit/components-react';

interface SoloInactivityPromptProps {
  isHost: boolean;
  onLeaveOrEnd: () => void;
  /** Test override in ms (optional) */
  customInitialTimeoutMs?: number;
  customExtensionTimeoutMs?: number;
  customWarningWindowSec?: number;
}

const INITIAL_SOLO_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EXTENSION_SOLO_TIMEOUT_MS = 45 * 60 * 1000; // 45 minutes
const WARNING_WINDOW_SECONDS = 60; // 1 minute to respond

export default function SoloInactivityPrompt({
  isHost,
  onLeaveOrEnd,
  customInitialTimeoutMs,
  customExtensionTimeoutMs,
  customWarningWindowSec,
}: SoloInactivityPromptProps) {
  const remotes = useRemoteParticipants();
  const isSolo = remotes.length === 0;

  const [showPrompt, setShowPrompt] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(customWarningWindowSec ?? WARNING_WINDOW_SECONDS);
  const [hasExtended, setHasExtended] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const initialMs = customInitialTimeoutMs ?? INITIAL_SOLO_TIMEOUT_MS;
  const extensionMs = customExtensionTimeoutMs ?? EXTENSION_SOLO_TIMEOUT_MS;
  const warningSec = customWarningWindowSec ?? WARNING_WINDOW_SECONDS;

  // Reset or start solo timer
  useEffect(() => {
    // Only applies to host/teacher
    if (!isHost) return;

    // If someone joined, dismiss everything and reset
    if (!isSolo) {
      setShowPrompt(false);
      setHasExtended(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    // Teacher is solo: calculate required delay
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

  // Handle 60s countdown when prompt is visible
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
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showPrompt, onLeaveOrEnd]);

  const handleStay = () => {
    setShowPrompt(false);
    setHasExtended(true); // Next time it triggers in 45 minutes
  };

  const handleLeave = () => {
    setShowPrompt(false);
    onLeaveOrEnd();
  };

  if (!showPrompt || !isHost) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-md bg-neutral-900/95 border border-white/10 rounded-2xl p-6 shadow-2xl text-center text-white space-y-5">
        {/* Animated Hourglass / Clock Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
          <svg
            className="w-8 h-8 animate-pulse"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Header & Copy */}
        <div className="space-y-2">
          <h3 className="text-xl font-bold tracking-tight">Are you still there?</h3>
          <p className="text-sm text-neutral-300">
            You are the only person in this meeting. To save resources, this call will automatically close unless you choose to stay.
          </p>
        </div>

        {/* Countdown Ring Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          Leaving in {secondsRemaining}s…
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={handleStay}
            className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 font-semibold text-sm transition shadow-lg shadow-blue-600/20 cursor-pointer"
          >
            Stay in call (+45m)
          </button>
          <button
            type="button"
            onClick={handleLeave}
            className="flex-1 py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800 border border-white/10 font-semibold text-sm text-neutral-300 transition cursor-pointer"
          >
            Leave now
          </button>
        </div>
      </div>
    </div>
  );
}
