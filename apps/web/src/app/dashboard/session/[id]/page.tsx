'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Student');
  const [isModerator, setIsModerator] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [teacherIdentity, setTeacherIdentity] = useState<string | null>(null);
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  const joinedRef = useRef(false);

  const attemptJoin = useCallback(async () => {
    if (joinedRef.current) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/join`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to join session');
      }
      const data = await res.json();

      // The server can point a student at the room their teacher is actually
      // in — follow it instead of opening a room of our own.
      if (data.redirectSessionId) {
        joinedRef.current = true;
        router.replace(`/dashboard/session/${data.redirectSessionId}`);
        return;
      }

      // Class hasn't started. No token by design, so there's no room to sit
      // alone in; the lobby keeps asking.
      if (data.waiting) {
        setWaiting({
          sessionTitle: data.sessionTitle ?? null,
          teacherName: data.teacherName ?? null,
          scheduledStart: data.scheduledStart ?? null,
        });
        return;
      }

      joinedRef.current = true;
      setWaiting(null);
      setToken(data.jwt || data.token); // accept either jwt or token
      setServerUrl(data.serverUrl || 'wss://meet.novicetutor.com');
      setIsModerator(!!data.isModerator);
      setIsHost(!!data.isHost);
      setTeacherIdentity(data.teacherIdentity ?? null);
      if (data.userName) {
        setUserName(data.userName);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (!sessionId) return;
    attemptJoin();
  }, [sessionId, attemptJoin]);

  // Keep asking while we're in the lobby. The moment the teacher starts — this
  // session or another one — the next poll picks up a token or a redirect.
  useEffect(() => {
    if (!waiting) return;
    const interval = setInterval(attemptJoin, LOBBY_POLL_MS);
    return () => clearInterval(interval);
  }, [waiting, attemptJoin]);

  // The pre-join choices double as the "has joined" flag — there's no room
  // to render until the user has actually picked their devices.
  const handleJoin = (picked: JoinChoices) => {
    setChoices(picked);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mb-4" />
        <p className="text-slate-400">Loading session credentials...</p>
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
      />
    );
  }

  return <PreJoinScreen userName={userName} onJoin={handleJoin} />;
}
