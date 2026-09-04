'use client';

/**
 * Guest join page — the share link. No account, no login.
 *
 * Deliberately outside /dashboard so it isn't behind the auth guard. The
 * link alone gets you nowhere: you knock, the host admits you, and only then
 * does the server hand out a LiveKit token (see /api/guest/join).
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import Spinner from '@/components/Spinner';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { JoinChoices } from '@/components/video/PreJoinScreen';
import LiveKitRoom from '@/components/video/LiveKitRoom';
import { authClient } from '@/lib/auth-client';

const POLL_INTERVAL_MS = 4000;
/** Matches the server's knock window — past this the request is EXPIRED anyway. */
const WAIT_TIMEOUT_MS = 10 * 60 * 1000;

type Stage = 'form' | 'waiting' | 'denied' | 'admitted' | 'error';

export default function GuestJoinPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id as string;
  const sessionId = typeof rawId === 'string' ? decodeURIComponent(rawId).trim() : '';

  const displayMeetingId = useMemo(() => {
    if (!sessionId) return '';
    const digitsOnly = sessionId.replace(/\D/g, '');
    if (digitsOnly.length >= 10) {
      return `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 7)} ${digitsOnly.slice(7, 10)}`;
    }
    const alphaOnly = sessionId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (alphaOnly.length >= 10) {
      return `${alphaOnly.slice(0, 3)} ${alphaOnly.slice(3, 7)} ${alphaOnly.slice(7, 10)}`;
    }
    return sessionId;
  }, [sessionId]);

  const [canonicalSessionId, setCanonicalSessionId] = useState(sessionId);
  const [sessionTitle, setSessionTitle] = useState<string | null>(null);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('form');
  const [name, setName] = useState('');
  const [knocking, setKnocking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [teacherIdentity, setTeacherIdentity] = useState<string | null>(null);
  const [choices, setChoices] = useState<JoinChoices | null>(null);
  const [deniedReason, setDeniedReason] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  // Once we hold a token the answer is final: a poll already in flight must
  // not drag us back out of the room when the server retires the used request.
  const settledRef = useRef(false);

  // If user is already logged in with an account, send them straight to class
  useEffect(() => {
    authClient
      .getSession()
      .then(({ data }) => {
        if (data?.session && sessionId) {
          router.replace(`/dashboard/session/${sessionId}`);
        }
      })
      .catch(() => {});
  }, [sessionId, router]);

  // Check if this guest was previously admitted for this session
  useEffect(() => {
    if (typeof window === 'undefined' || !sessionId) return;
    try {
      const saved = localStorage.getItem(`guest_session_${sessionId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.name) {
          setName(parsed.name);
          // If admitted within the last 4 hours, auto-join immediately!
          if (parsed.admittedAt && Date.now() - parsed.admittedAt < 4 * 60 * 60 * 1000) {
            knock(parsed.name);
          }
        }
      }
    } catch {}
  }, [sessionId]);

  // Poll our own request until the host answers.
  useEffect(() => {
    if (stage !== 'waiting') return;
    let cancelled = false;
    const startedAt = Date.now();

    const giveUp = (reason: string) => {
      if (cancelled || settledRef.current) return;
      settledRef.current = true;
      setDeniedReason(reason);
      setStage('denied');
    };

    const poll = async () => {
      if (!requestIdRef.current || settledRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch(`/api/guest/join?requestId=${requestIdRef.current}`);
        if (res.status === 404 || res.status === 410) {
          giveUp('This class is no longer available.');
          return;
        }
        if (!res.ok) {
          if (Date.now() - startedAt > WAIT_TIMEOUT_MS) {
            giveUp('We couldn’t reach the classroom. Try the link again.');
          }
          return;
        }
        const data = await res.json();
        if (cancelled || settledRef.current) return;
        if (data.status === 'ADMITTED' && data.token) {
          settledRef.current = true;
          setToken(data.token);
          setServerUrl(data.serverUrl);
          if (data.sessionId) setCanonicalSessionId(data.sessionId);
          setTeacherIdentity(data.teacherIdentity ?? null);
          setChoices({ videoEnabled: true, audioEnabled: true });
          setStage('admitted');
          try {
            localStorage.setItem(
              `guest_session_${sessionId}`,
              JSON.stringify({ name: data.userName || name, admittedAt: Date.now() })
            );
          } catch {}
        } else if (data.status === 'DENIED') {
          giveUp('The host didn’t admit you to this class.');
        } else if (data.status === 'EXPIRED') {
          giveUp('Nobody answered. The host may have stepped away — try again.');
        } else if (Date.now() - startedAt > WAIT_TIMEOUT_MS) {
          giveUp('Nobody answered. The host may have stepped away — try again.');
        }
      } catch {
        if (Date.now() - startedAt > WAIT_TIMEOUT_MS) {
          giveUp('We couldn’t reach the classroom. Try the link again.');
        }
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [stage, name, sessionId]);

  const knock = async (customName?: string) => {
    const candidateName = (customName || name).trim();
    if (!candidateName) return;
    setMessage(null);
    setDeniedReason(null);
    settledRef.current = false;
    setKnocking(true);
    try {
      const res = await fetch('/api/guest/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, name: candidateName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Could not ask to join.');
        setStage('error');
        return;
      }

      if (data.sessionId) setCanonicalSessionId(data.sessionId);

      // If already admitted (e.g. rejoining with the same link), enter immediately!
      if (data.status === 'ADMITTED' && data.token) {
        settledRef.current = true;
        setToken(data.token);
        setServerUrl(data.serverUrl);
        setTeacherIdentity(data.teacherIdentity ?? null);
        setChoices({ videoEnabled: true, audioEnabled: true });
        setStage('admitted');
        try {
          localStorage.setItem(
            `guest_session_${sessionId}`,
            JSON.stringify({ name: candidateName, admittedAt: Date.now() })
          );
        } catch {}
        return;
      }

      requestIdRef.current = data.requestId;
      if (data.sessionTitle) setSessionTitle(data.sessionTitle);
      if (data.teacherName) setTeacherName(data.teacherName);
      setMessage(
        data.teacherName ? `${data.teacherName} will let you in shortly.` : 'The host will let you in shortly.'
      );
      setStage('waiting');
    } catch {
      setMessage('Could not reach the classroom. Check your connection and try again.');
      setStage('error');
    } finally {
      setKnocking(false);
    }
  };

  if (stage === 'admitted' && token && serverUrl) {
    return (
      <LiveKitRoom
        token={token}
        url={serverUrl}
        sessionId={canonicalSessionId || sessionId}
        joinCode={canonicalSessionId || sessionId}
        sessionTitle={sessionTitle}
        teacherName={teacherName}
        isModerator={false}
        // A guest is never the host: leaving must not end the class.
        isHost={false}
        choices={choices || { videoEnabled: true, audioEnabled: true }}
        teacherIdentity={teacherIdentity}
        onLeave={() => {
          settledRef.current = false;
          requestIdRef.current = null;
          setToken(null);
          setServerUrl(null);
          setChoices(null);
          setMessage(null);
          setStage('form');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#131417' }}>
      <div
        className="w-full max-w-sm rounded-3xl p-7 text-center shadow-2xl"
        style={{
          background: 'rgba(28, 30, 36, 0.94)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        }}
      >
        <img src="/logo.png?v=3" alt="Novice Tutor" className="w-12 h-12 object-contain mx-auto mb-3" />

        {stage === 'waiting' ? (
          <>
            <div
              className="mx-auto mb-4 w-12 h-12 rounded-full"
              style={{ border: '3px solid rgba(138,180,248,0.25)', borderTopColor: '#8ab4f8', animation: 'lk-spin 900ms linear infinite' }}
            />
            <h1 className="text-lg font-bold text-white tracking-tight">Asking to be let in…</h1>
            {displayMeetingId && (
              <p className="text-xs font-mono text-emerald-400 mt-1">
                Meeting ID: {displayMeetingId}
              </p>
            )}
            <p className="text-sm mt-2 text-white/60">
              {message}
            </p>
          </>
        ) : stage === 'denied' ? (
          <>
            <h1 className="text-lg font-bold text-white tracking-tight">You weren&apos;t let in</h1>
            <p className="text-sm mt-1 text-white/60">
              {deniedReason ?? 'The host didn’t admit you to this class.'}
            </p>
            <button
              onClick={() => {
                settledRef.current = false;
                requestIdRef.current = null;
                setDeniedReason(null);
                setStage('form');
              }}
              className="mt-6 w-full py-3 rounded-2xl text-sm font-semibold cursor-pointer transition active:scale-95 bg-white/10 text-white hover:bg-white/15"
            >
              Ask again
            </button>
            <div className="mt-4">
              <Link href="/join" className="text-xs text-white/50 hover:text-white/80 transition-colors">
                Enter a different meeting ID →
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-white tracking-tight">Join the class</h1>
            {displayMeetingId && (
              <div className="my-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/20 text-emerald-400 text-xs font-mono font-semibold">
                <span className="text-white/50 font-sans">Meeting ID:</span>
                <span>{displayMeetingId}</span>
              </div>
            )}
            <p className="text-xs mt-1 mb-5 text-white/60">
              Enter your name. The host will let you in.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim().length >= 2) knock();
              }}
              placeholder="Your full name"
              autoFocus
              className="w-full px-4 py-3 rounded-2xl text-sm bg-black/40 text-white border border-white/15 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all placeholder:text-white/30"
            />
            {message && stage === 'error' && (
              <p className="text-xs mt-3 text-red-300">
                {message}
              </p>
            )}
            <button
              onClick={() => knock()}
              disabled={name.trim().length < 2 || knocking}
              className="mt-4 w-full py-3 rounded-2xl text-sm font-bold text-white cursor-pointer transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
                boxShadow: '0 4px 14px rgba(0, 122, 255, 0.4)',
              }}
            >
              {knocking ? (
                <>
                  <Spinner /> Asking…
                </>
              ) : (
                'Ask to join'
              )}
            </button>
            <div className="mt-5 pt-4 border-t border-white/10">
              <Link href="/join" className="text-xs text-white/50 hover:text-white/80 transition-colors">
                Have a different meeting code? Join another class →
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
