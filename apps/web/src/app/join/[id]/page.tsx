'use client';

/**
 * Guest join page — the share link. No account, no login.
 *
 * Deliberately outside /dashboard so it isn't behind the auth guard. The
 * link alone gets you nowhere: you knock, the host admits you, and only then
 * does the server hand out a LiveKit token (see /api/guest/join).
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import PreJoinScreen, { type JoinChoices } from '@/components/video/PreJoinScreen';
import LiveKitRoom from '@/components/video/LiveKitRoom';

const POLL_INTERVAL_MS = 2500;

type Stage = 'form' | 'waiting' | 'denied' | 'admitted' | 'error';

export default function GuestJoinPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [stage, setStage] = useState<Stage>('form');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [teacherIdentity, setTeacherIdentity] = useState<string | null>(null);
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  const requestIdRef = useRef<string | null>(null);

  // Poll our own request until the host answers.
  useEffect(() => {
    if (stage !== 'waiting') return;
    let cancelled = false;

    const poll = async () => {
      if (!requestIdRef.current) return;
      try {
        const res = await fetch(`/api/guest/join?requestId=${requestIdRef.current}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.status === 'ADMITTED' && data.token) {
          setToken(data.token);
          setServerUrl(data.serverUrl);
          setTeacherIdentity(data.teacherIdentity ?? null);
          setStage('admitted');
        } else if (data.status === 'DENIED' || data.status === 'EXPIRED') {
          setStage('denied');
        }
      } catch {
        // Keep waiting — a dropped poll isn't a refusal.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [stage]);

  const knock = async () => {
    setMessage(null);
    try {
      const res = await fetch('/api/guest/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Could not ask to join.');
        setStage('error');
        return;
      }
      requestIdRef.current = data.requestId;
      setMessage(
        data.teacherName ? `${data.teacherName} will let you in shortly.` : 'The host will let you in shortly.'
      );
      setStage('waiting');
    } catch {
      setMessage('Could not reach the classroom. Check your connection and try again.');
      setStage('error');
    }
  };

  if (stage === 'admitted' && token && serverUrl) {
    if (!choices) return <PreJoinScreen userName={name} onJoin={setChoices} />;
    return (
      <LiveKitRoom
        token={token}
        url={serverUrl}
        sessionId={sessionId}
        isModerator={false}
        // A guest is never the host: leaving must not end the class.
        isHost={false}
        choices={choices}
        teacherIdentity={teacherIdentity}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#131417' }}>
      <div
        className="w-full max-w-sm rounded-2xl p-7 text-center"
        style={{ background: '#202124', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <img src="/logo.png" alt="Novice Tutor" className="w-12 h-12 object-contain mx-auto mb-4" />

        {stage === 'waiting' ? (
          <>
            <div
              className="mx-auto mb-4 w-12 h-12 rounded-full"
              style={{ border: '3px solid rgba(138,180,248,0.25)', borderTopColor: '#8ab4f8', animation: 'lk-spin 900ms linear infinite' }}
            />
            <h1 className="text-lg font-semibold text-white">Asking to be let in…</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {message}
            </p>
          </>
        ) : stage === 'denied' ? (
          <>
            <h1 className="text-lg font-semibold text-white">You weren&apos;t let in</h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>
              The host didn&apos;t admit you to this class.
            </p>
            <button
              onClick={() => setStage('form')}
              className="mt-6 w-full py-3 rounded-full text-sm font-semibold cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#e8eaed' }}
            >
              Ask again
            </button>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-white">Join the class</h1>
            <p className="text-sm mt-1 mb-5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Enter your name. The host will let you in.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim().length >= 2) knock();
              }}
              placeholder="Your name"
              className="w-full px-3.5 py-3 rounded-xl text-sm"
              style={{ background: '#2a2d33', color: '#e8eaed', border: '1px solid rgba(255,255,255,0.14)' }}
            />
            {message && stage === 'error' && (
              <p className="text-xs mt-3" style={{ color: '#f6a6a0' }}>
                {message}
              </p>
            )}
            <button
              onClick={knock}
              disabled={name.trim().length < 2}
              className="mt-4 w-full py-3 rounded-full text-sm font-semibold cursor-pointer disabled:opacity-40"
              style={{ background: '#8ab4f8', color: '#202124' }}
            >
              Ask to join
            </button>
          </>
        )}
      </div>
    </div>
  );
}
