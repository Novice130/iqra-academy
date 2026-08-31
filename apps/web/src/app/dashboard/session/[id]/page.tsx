'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import PreJoinScreen, { type JoinChoices } from '@/components/video/PreJoinScreen';
import LiveKitRoom from '@/components/video/LiveKitRoom';
import LocalTime from '@/components/LocalTime';

/** How often the lobby re-asks whether the teacher has started. */
const LOBBY_POLL_MS = 5000;

interface Waiting {
  sessionTitle: string | null;
  teacherName: string | null;
  scheduledStart: string | null;
}

export default function SessionRoomPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = params.id as string;

  /**
   * Answering a ringing call means "put me in the call" — the way it does on
   * every phone. Making someone pick a microphone first is fine when they
   * chose to open a class, and wrong when a teacher is already sitting there
   * waiting for them.
   *
   * Devices are left at the browser default and both tracks start on; anything
   * they want to change is one tap away on the control bar.
   */
  // Default to instant direct join for seamless 1-click class entry
  const showPreview = searchParams.get('preview') === '1';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Participant');
  const [isModerator, setIsModerator] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [teacherIdentity, setTeacherIdentity] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  /** Our own LiveKit identity, sent back on leaving so the right attendance row closes. */
  const [identity, setIdentity] = useState<string | null>(null);
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  const [joining, setJoining] = useState(false);
  const joinedRef = useRef(false);

  const attemptJoin = useCallback(async (opts?: { connecting?: boolean; force?: boolean }) => {
    if (joinedRef.current && !opts?.force) return false;
    try {
      const res = await fetch(
        `/api/sessions/${sessionId}/join${opts?.connecting ? '?connecting=1' : ''}`
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error || 'Failed to join session';
        if (msg.toLowerCase().includes('ended') || msg.toLowerCase().includes('already ended')) {
          joinedRef.current = true;
          router.replace('/dashboard');
          return false;
        }
        throw new Error(msg);
      }
      const data = await res.json();

      // The server can point a student at the room their teacher is actually
      // in — follow it instead of opening a room of our own.
      if (data.redirectSessionId) {
        joinedRef.current = true;
        router.replace(`/dashboard/session/${data.redirectSessionId}`);
        return false;
      }

      // Class hasn't started. No token by design, so there's no room to sit
      // alone in; the lobby keeps asking.
      if (data.waiting) {
        setWaiting({
          sessionTitle: data.sessionTitle ?? null,
          teacherName: data.teacherName ?? null,
          scheduledStart: data.scheduledStart ?? null,
        });
        return false;
      }

      joinedRef.current = true;
      setWaiting(null);
      setToken(data.jwt || data.token); // accept either jwt or token
      setServerUrl(data.serverUrl || 'wss://meet.novicetutor.com');
      setIsModerator(!!data.isModerator);
      setIsHost(!!data.isHost);
      setTeacherIdentity(data.teacherIdentity ?? null);
      setTeacherName(data.teacherName ?? null);
      setJoinCode(data.joinCode ?? null);
      setSessionTitle(data.sessionTitle ?? null);
      setIdentity(data.identity ?? null);
      if (data.userName) {
        setUserName(data.userName);
      }
      if (!showPreview) {
        setChoices({ videoEnabled: true, audioEnabled: true });
      }
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [sessionId, router, showPreview]);

  useEffect(() => {
    if (!sessionId) return;
    // Connect immediately in a single fast roundtrip
    attemptJoin({ connecting: !showPreview });
  }, [sessionId, showPreview, attemptJoin]);

  // Keep asking while we're in the lobby. The moment the teacher starts — this
  // session or another one — the next poll picks up a token or a redirect.
  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(() => attemptJoin({ connecting: !showPreview }), LOBBY_POLL_MS);
    return () => clearInterval(interval);
  }, [waiting, showPreview, attemptJoin]);

  // The pre-join choices double as the "has joined" flag when preview is enabled
  const handleJoin = async (picked: JoinChoices) => {
    setJoining(true);
    const ready = await attemptJoin({ connecting: true, force: true });
    if (!ready) {
      setJoining(false);
      return;
    }
    setChoices(picked);
  };

  if (loading || joining) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen font-sans" style={{ background: '#131417' }}>
        <div
          className="mb-5 w-14 h-14 rounded-full"
          style={{
            border: '3.5px solid rgba(138,180,248,0.22)',
            borderTopColor: '#8ab4f8',
            animation: 'lk-spin 800ms linear infinite',
          }}
        />
        <h2 className="text-base font-semibold text-white tracking-tight mb-1">
          {loading ? 'Starting class…' : 'Connecting to classroom…'}
        </h2>
        <p className="text-xs text-neutral-400">Setting up audio and video devices</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-4 font-sans">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
          <svg className="w-16 h-16 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-2xl font-bold mb-2">Failed to Join Class</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-all cursor-pointer"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Only for a class that isn't due yet. Once the room opens — an hour before
  // the slot — anyone attending walks straight in, first arrival included.
  if (waiting) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6" style={{ background: '#131417' }}>
        <div
          className="w-full max-w-sm rounded-2xl p-7 text-center"
          style={{ background: '#202124', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <div
            className="mx-auto mb-4 w-12 h-12 rounded-full"
            style={{
              border: '3px solid rgba(138,180,248,0.25)',
              borderTopColor: '#8ab4f8',
              animation: 'lk-spin 900ms linear infinite',
            }}
          />
          <h1 className="text-lg font-semibold text-white">This class isn&apos;t open yet</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
            {waiting.sessionTitle || 'Your class'}
            {waiting.teacherName ? ` with ${waiting.teacherName}` : ''} opens an hour before it starts. Keep
            this page open and you&apos;ll go straight in — whether or not anyone else is there yet.
          </p>
          {waiting.scheduledStart && (
            <p className="text-sm mt-4" style={{ color: '#8ab4f8' }}>
              Scheduled for <LocalTime iso={waiting.scheduledStart} mode="weekday-time" withZone />
            </p>
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-6 w-full py-3 rounded-full text-sm font-semibold cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#e8eaed' }}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!token || !serverUrl) return null;

  if (choices) {
    return (
      <LiveKitRoom
        token={token}
        url={serverUrl}
        sessionId={sessionId}
        isModerator={isModerator}
        isHost={isHost}
        choices={choices}
        teacherIdentity={teacherIdentity}
        teacherName={teacherName}
        joinCode={joinCode}
        sessionTitle={sessionTitle}
        identity={identity}
      />
    );
  }

  return (
    <PreJoinScreen
      userName={userName}
      recipientName={teacherName}
      recipientEmail={teacherIdentity}
      sessionTitle={sessionTitle}
      joinCode={joinCode}
      onJoin={handleJoin}
    />
  );
}

