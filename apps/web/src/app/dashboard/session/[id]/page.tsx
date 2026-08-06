'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PreJoinScreen from '@/components/video/PreJoinScreen';
import LiveKitRoom from '@/components/video/LiveKitRoom';

export default function SessionRoomPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('Student');
  const [isModerator, setIsModerator] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [showRoom, setShowRoom] = useState(false);

  useEffect(() => {
    async function fetchToken() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/join`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to join session');
        }
        const data = await res.json();
        // The server can point a student at the room their teacher is
        // actually in (see the join route) — follow it instead of opening a
        // room of our own.
        if (data.redirectSessionId) {
          router.replace(`/dashboard/session/${data.redirectSessionId}`);
          return;
        }
        setToken(data.jwt || data.token); // accept either jwt or token
        setServerUrl(data.serverUrl || 'wss://meet.novicetutor.com');
        setIsModerator(!!data.isModerator);
        setIsHost(!!data.isHost);
        if (data.userName) {
          setUserName(data.userName);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (sessionId) {
      fetchToken();
    }
  }, [sessionId, router]);

  const handleJoin = () => {
    setShowRoom(true);
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

  if (!token || !serverUrl) return null;

  if (showRoom) {
    return <LiveKitRoom token={token} url={serverUrl} sessionId={sessionId} isModerator={isModerator} isHost={isHost} />;
  }

  return <PreJoinScreen userName={userName} onJoin={handleJoin} />;
}
