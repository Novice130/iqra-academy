'use client';

/**
 * Host Tools Modal — comprehensive moderation and security controls for hosts.
 *
 * Controls:
 * - Mute all participants (with confirmation)
 * - Lock meeting (prevents new guest knocks / joins)
 * - Participant screen sharing permission
 * - Guest waiting room shortcut
 * - End class for everyone
 */

import React, { useState } from 'react';
import { useHostControls } from './hostControls';
import { HostShieldIcon, MicOffIcon } from './CallIcons';

interface HostToolsModalProps {
  sessionId: string;
  isLocked?: boolean;
  allowParticipantShare?: boolean;
  onLockChange?: (locked: boolean) => void;
  onSharePolicyChange?: (allowed: boolean) => void;
  onEndClassIntent: () => void;
  onClose: () => void;
  onOpenGuests?: () => void;
}

export default function HostToolsModal({
  sessionId,
  isLocked = false,
  allowParticipantShare = true,
  onLockChange,
  onSharePolicyChange,
  onEndClassIntent,
  onClose,
  onOpenGuests,
}: HostToolsModalProps) {
  const { muteAll, setRoomLocked, setAllowParticipantShare } = useHostControls(sessionId);
  const [locked, setLocked] = useState(isLocked);
  const [shareAllowed, setShareAllowed] = useState(allowParticipantShare);
  const [muting, setMuting] = useState(false);
  const [muteSuccess, setMuteSuccess] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const handleToggleLock = async () => {
    const next = !locked;
    setLocked(next);
    onLockChange?.(next);
    await setRoomLocked(next);
  };

  const handleToggleShare = async () => {
    const next = !shareAllowed;
    setShareAllowed(next);
    onSharePolicyChange?.(next);
    await setAllowParticipantShare(next);
  };

  const handleMuteAll = async () => {
    setMuting(true);
    const ok = await muteAll();
    setMuting(false);
    if (ok) {
      setMuteSuccess(true);
      setTimeout(() => setMuteSuccess(false), 3000);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[81] w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl p-6 shadow-2xl animate-fadeIn overflow-y-auto max-h-[85vh]"
        style={{
          background: 'rgba(24, 26, 32, 0.96)',
          backdropFilter: 'blur(36px) saturate(180%)',
          WebkitBackdropFilter: 'blur(36px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* Top Handle for mobile */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3 sm:hidden" />

        <div className="flex items-center justify-between pb-3.5 border-b border-white/10 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <HostShieldIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Host Management Tools</h3>
              <p className="text-[11px] text-white/50">Room security and classroom moderation</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3.5">
          {/* Action 1: Mute All */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                <MicOffIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">Mute All Participants</div>
                <div className="text-[11px] text-white/50">Turn off all student microphones</div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleMuteAll}
              disabled={muting}
              className="px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer active:scale-95 disabled:opacity-50"
              style={{
                background: muteSuccess ? '#10b981' : 'rgba(239, 68, 68, 0.25)',
                color: muteSuccess ? '#ffffff' : '#fca5a5',
                border: muteSuccess ? '1px solid #10b981' : '1px solid rgba(239, 68, 68, 0.4)',
              }}
            >
              {muting ? 'Muting...' : muteSuccess ? '✓ Muted' : 'Mute All'}
            </button>
          </div>

          {/* Action 2: Lock Meeting */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                <span>Lock Meeting</span>
                {locked && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    Locked
                  </span>
                )}
              </div>
              <div className="text-[11px] text-white/50">
                {locked
                  ? 'No new guests or students can join or knock'
                  : 'Allows invited students and guests to join'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleLock}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 cursor-pointer flex items-center ${
                locked ? 'bg-amber-500 justify-end' : 'bg-white/20 justify-start'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Action 3: Participant Screen Share Policy */}
          <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white">Allow Student Screen Sharing</div>
              <div className="text-[11px] text-white/50">
                {shareAllowed ? 'Students can present their screen' : 'Only host can share screen'}
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleShare}
              className={`w-12 h-6 rounded-full transition-colors p-0.5 cursor-pointer flex items-center ${
                shareAllowed ? 'bg-emerald-500 justify-end' : 'bg-white/20 justify-start'
              }`}
            >
              <span className="w-5 h-5 rounded-full bg-white shadow-md" />
            </button>
          </div>

          {/* Action 4: Guest Waiting Room */}
          {onOpenGuests && (
            <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Guest Waiting Room</div>
                <div className="text-[11px] text-white/50">View knocks & admit waiting guests</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGuests();
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white cursor-pointer transition"
              >
                Review Knocks →
              </button>
            </div>
          )}

          {/* Action 5: End Class for Everyone */}
          <div className="p-3.5 rounded-2xl bg-red-500/[0.08] border border-red-500/20 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-red-400">End Class for Everyone</div>
                <div className="text-[11px] text-red-300/70">
                  Disconnects all participants and marks session complete
                </div>
              </div>
              {!confirmEnd ? (
                <button
                  type="button"
                  onClick={() => setConfirmEnd(true)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white cursor-pointer transition active:scale-95"
                >
                  End Class
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEndClassIntent();
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer transition animate-pulse"
                  >
                    Confirm End
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmEnd(false)}
                    className="px-2 py-1.5 rounded-xl text-xs text-white/70 bg-white/10 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
