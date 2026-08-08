"use client";

/**
 * Login Page — Clean, Apple-inspired design
 * Email + password, Google Sign-In, minimal visual noise.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import Spinner from "@/components/Spinner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // Someone who is already signed in has no business seeing this form. They
  // reach it by pressing Back after logging in — this page stays in history
  // because the sign-in above navigates with `window.location.href` — and a
  // login form appearing is indistinguishable from having been logged out.
  // In the Android app, where Back is a hardware button, it read as the app
  // signing people out on its own. `replace`, not `push`: putting the login
  // page back on the stack is the whole problem.
  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then(({ data }) => {
      if (!cancelled && data?.session) router.replace("/dashboard");
    }).catch(() => {
      // Offline or the session endpoint is unhappy — show the form. Being
      // asked to log in again is a far better failure than a blank page.
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await authClient.signIn.email({
        email,
        password,
      });

      if (authError) {
        setError(authError.message || "That email and password don't match.");
        setLoading(false);
        return;
      }

      if (data) {
        // Deliberately stays true. The old code cleared it in a `finally`,
        // so the button snapped back to "Sign In" and *then* the browser
        // began a full-page load of the dashboard — which is server-rendered
        // and hits the database, so on a phone it can be several seconds of a
        // screen that looks like the tap did nothing. Handing over to a
        // "Signing you in…" screen keeps something moving until the dashboard
        // paints.
        setRedirecting(true);
        // Two frames before navigating. Assigning location in the same tick
        // starts the unload before React has painted, so the "Signing you in…"
        // screen never appears — measured, not assumed. One rAF fires before
        // paint; the second is after it.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.location.href = "/dashboard";
          })
        );
        return;
      }

      // Neither data nor error: nothing to act on, and silently leaving a
      // spinner up is the failure mode this whole change is about.
      setError("Something went wrong. Please try again.");
      setLoading(false);
    } catch {
      setError("Can't reach Novice Tutor. Check your connection and try again.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  // Covers the gap between "credentials accepted" and the dashboard painting.
  if (redirecting) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
        style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
      >
        <span style={{ color: "var(--accent)" }}>
          <Spinner size={28} />
        </span>
        <p className="text-sm">Signing you in…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="w-full max-w-sm animate-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8">
            <img
              src="/logo.png"
              alt="Novice Tutor"
              className="w-12 h-12 object-contain"
            />
            <span
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Novice Tutor
            </span>
          </Link>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Sign in
          </h1>
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Welcome back — continue your Quran journey
          </p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            {/* role=alert so a screen reader announces it, and scrolled into
                view because on a phone with the keyboard up the top of the
                form is often off-screen — an error nobody sees is the same as
                no error at all. */}
            {error && (
              <div
                ref={errorRef}
                role="alert"
                className="p-3 rounded-lg text-sm font-medium"
                style={{
                  background: "#fef2f2",
                  color: "#dc2626",
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Password
                </label>
                {/* There is no self-serve reset yet. Until there is, this
                    says so — a control that does nothing when tapped is worse
                    than one that explains itself. */}
                <button
                  type="button"
                  onClick={() => setShowForgot((v) => !v)}
                  className="text-xs font-medium"
                  style={{ color: "var(--accent)" }}
                  aria-expanded={showForgot}
                >
                  Forgot?
                </button>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="input"
              />
              {showForgot && (
                <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                  Message your teacher on WhatsApp and we&apos;ll reset it for you.
                  Password reset by email is coming soon.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
              style={{ marginTop: "8px" }}
            >
              {loading ? (
                <>
                  <Spinner /> Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div
                className="w-full"
                style={{ borderTop: "1px solid var(--border)" }}
              />
            </div>
            <div className="relative flex justify-center">
              <span
                className="px-3 text-xs"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--text-tertiary)",
                }}
              >
                or
              </span>
            </div>
          </div>

          {/* Google */}
          <button
            disabled={googleLoading || loading}
            onClick={async () => {
              // Google navigates away, so this state normally ends with the
              // page unloading. It matters for the second or two before that,
              // and for when the call fails and the page stays put.
              setGoogleLoading(true);
              setError("");
              try {
                await authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/dashboard",
                });
              } catch {
                setError("Couldn't start Google sign-in. Try your email and password.");
                setGoogleLoading(false);
              }
            }}
            className="btn-secondary w-full"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            {googleLoading ? "Opening Google…" : "Continue with Google"}
          </button>
        </div>

        <p
          className="text-center text-sm mt-6"
          style={{ color: "var(--text-secondary)" }}
        >
          {"Don't have an account? "}
          <Link
            href="/register"
            className="font-medium"
            style={{ color: "var(--accent)" }}
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
