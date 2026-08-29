'use client';

/**
 * Join Meeting Page — Zoom-style enter meeting ID / code page.
 *
 * Allows any student, parent, or guest to enter their 12-digit Meeting ID / Code
 * or paste a meeting link, enter their name, and immediately join the live class.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Spinner from '@/components/Spinner';
import { authClient } from '@/lib/auth-client';

function extractAndFormatCode(input: string): { cleanId: string; displayFormatted: string } {
  let cleaned = input.trim();

  // If user pasted a full URL (e.g. https://novicetutor.com/join/482-910-374-819 or /join/...)
  if (cleaned.includes('/join/')) {
    cleaned = cleaned.split('/join/').pop()?.split('?')[0]?.split('#')[0] || cleaned;
  } else if (cleaned.includes('/session/')) {
    cleaned = cleaned.split('/session/').pop()?.split('?')[0]?.split('#')[0] || cleaned;
  }

  cleaned = decodeURIComponent(cleaned).trim();

  const digitsOnly = cleaned.replace(/\D/g, '');
  if (digitsOnly.length === 12) {
    return {
      cleanId: `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`,
      displayFormatted: `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)} ${digitsOnly.slice(6, 9)} ${digitsOnly.slice(9, 12)}`,
    };
  }

  const alphaOnly = cleaned.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (alphaOnly.length === 12) {
    return {
      cleanId: `${alphaOnly.slice(0, 4)}-${alphaOnly.slice(4, 8)}-${alphaOnly.slice(8, 12)}`,
      displayFormatted: `${alphaOnly.slice(0, 4)} ${alphaOnly.slice(4, 8)} ${alphaOnly.slice(8, 12)}`,
    };
  }

  return {
    cleanId: cleaned,
    displayFormatted: cleaned,
  };
}

export default function JoinMeetingPage() {
  const router = useRouter();
  const [meetingCode, setMeetingCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load previously saved name from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedName = localStorage.getItem('novice_last_guest_name');
      if (savedName) setName(savedName);
    } catch {}

    // Check if user is logged in
    authClient
      .getSession()
      .then(({ data }) => {
        if (data?.user?.name && !name) {
          setName(data.user.name);
        }
      })
      .catch(() => {});
  }, []);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    setError(null);

    // If typing digits only, auto-format with spaces for Zoom-like feel
    const digitsOnly = rawVal.replace(/\D/g, '');
    if (digitsOnly.length > 0 && !rawVal.includes('http') && !rawVal.includes('/') && !/[a-zA-Z]/.test(rawVal)) {
      let formatted = '';
      for (let i = 0; i < Math.min(digitsOnly.length, 12); i++) {
        if (i > 0 && i % 3 === 0) formatted += ' ';
        formatted += digitsOnly[i];
      }
      setMeetingCode(formatted);
    } else {
      setMeetingCode(rawVal);
    }
  };

  const handleJoin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    const { cleanId } = extractAndFormatCode(meetingCode);
    const trimmedName = name.trim();

    if (!cleanId) {
      setError('Please enter a valid Meeting ID or link.');
      return;
    }

    if (!trimmedName || trimmedName.length < 2) {
      setError('Please enter your name.');
      return;
    }

    // Save name for convenience
    try {
      localStorage.setItem('novice_last_guest_name', trimmedName);
      localStorage.setItem(
        `guest_session_${cleanId}`,
        JSON.stringify({ name: trimmedName, admittedAt: 0 })
      );
    } catch {}

    setLoading(true);
    router.push(`/join/${encodeURIComponent(cleanId)}`);
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 font-sans" style={{ background: '#111317' }}>
      {/* Top Brand Header */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between py-2">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-white/10 border border-white/20 p-1 flex items-center justify-center">
            <img src="/logo.png?v=3" alt="Novice Tutor" className="w-full h-full object-contain" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Novice Tutor</span>
        </Link>

        <Link
          href="/login"
          className="text-xs font-semibold text-white/70 hover:text-white px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors"
        >
          Sign In
        </Link>
      </div>

      {/* Main Join Card */}
      <div className="w-full max-w-md mx-auto my-auto py-8">
        <div
          className="rounded-3xl p-6 sm:p-8 shadow-2xl animate-fadeIn text-left"
          style={{
            background: 'rgba(28, 30, 36, 0.94)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            boxShadow: '0 28px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          }}
        >
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center mx-auto mb-3 text-blue-400 text-xl font-bold shadow-inner">
              📹
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Join a Meeting / Class
            </h1>
            <p className="text-xs text-white/50 mt-1">
              Enter your meeting ID or paste the invite link to enter
            </p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            {/* Meeting ID or Link */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                Meeting ID or Invite Link
              </label>
              <input
                type="text"
                value={meetingCode}
                onChange={handleCodeChange}
                placeholder="e.g. 482 910 374 819 or paste link"
                autoFocus
                className="w-full px-4 py-3.5 rounded-2xl text-sm sm:text-base font-mono bg-black/40 text-white border border-white/15 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all placeholder:text-white/30 placeholder:font-sans"
              />
              <span className="text-[10px] text-white/40 mt-1 block">
                Enter the 12-digit number provided by your teacher
              </span>
            </div>

            {/* Your Name */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="Enter your full name"
                className="w-full px-4 py-3.5 rounded-2xl text-sm sm:text-base bg-black/40 text-white border border-white/15 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all placeholder:text-white/30"
              />
            </div>

            {error && (
              <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs leading-relaxed animate-fadeIn">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !meetingCode.trim() || !name.trim()}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white cursor-pointer transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              style={{
                background: 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
                boxShadow: '0 6px 20px rgba(0, 122, 255, 0.4)',
              }}
            >
              {loading ? (
                <>
                  <Spinner /> Joining…
                </>
              ) : (
                'Join Class'
              )}
            </button>
          </form>

          {/* Quick instructions / Help */}
          <div className="mt-6 pt-5 border-t border-white/10 text-center space-y-2">
            <p className="text-[11px] text-white/45">
              By clicking &ldquo;Join Class&rdquo;, you agree to our{' '}
              <Link href="/terms" className="text-white/70 underline hover:text-white">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="text-white/70 underline hover:text-white">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center py-4 text-[11px] text-white/40">
        Novice Tutor &copy; {new Date().getFullYear()} · Live Quran & Academic Tutoring Platform
      </div>
    </div>
  );
}
