"use client";

/**
 * Register Page — Clean, minimal signup form
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import Spinner from "@/components/Spinner";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // Someone who is already signed in has no business seeing this form.
  useEffect(() => {
    let cancelled = false;
    authClient.getSession().then(({ data }) => {
      if (!cancelled && data?.session) router.replace("/dashboard");
    }).catch(() => {
      // Offline or session check failed — show form
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      errorRef.current?.focus();
    }
  }, [error]);

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Please fill out all fields (password must be at least 8 characters).");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data, error: authError } = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: name.trim(),
      });

      if (authError) {
        setError(authError.message || "We couldn't create that account.");
        setLoading(false);
        return;
      }

      if (data) {
        setRedirecting(true);
        window.location.href = "/dashboard";
        return;
      }

      setError("Something went wrong. Please try again.");
      setLoading(false);
    } catch {
      setError("Can't reach Novice Tutor. Check your connection and try again.");
      setLoading(false);
    }
  };

  if (redirecting) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
        style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
      >
        <span style={{ color: "var(--accent)" }}>
          <Spinner size={28} />
        </span>
        <p className="text-sm">Setting up your account…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: "var(--bg-secondary)" }}
    >
      <div className="w-full max-w-[420px] animate-in">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-8">
            <img
              src="/logo.png?v=3"
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
            Create account
          </h1>
          <p
            className="text-sm mt-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Start your Quran journey today
          </p>
        </div>

        <div className="card p-6">
          {/* Google first — less friction */}
          <button
            type="button"
            disabled={googleLoading || loading}
            onClick={async () => {
              setGoogleLoading(true);
              setError("");
              try {
                const res = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: "/dashboard",
                });
                if (res?.error) {
                  setError(res.error.message || "Google Sign-Up is currently unavailable. Please sign up with email and password.");
                  setGoogleLoading(false);
                }
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : "Couldn't start Google sign-up. Try your email and password.";
                setError(msg);
                setGoogleLoading(false);
              }
            }}
            className="btn-secondary w-full mb-4"
          >
            {googleLoading ? (
              <>
                <Spinner /> Connecting to Google…
              </>
            ) : (
              <>
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
                Sign up with Google
              </>
            )}
          </button>

          <div className="relative my-4">
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
                or with email
              </span>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            {error && (
              <div
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="p-3 rounded-lg text-sm font-medium outline-none"
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
                htmlFor="name"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Full name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                required
                className="input"
              />
            </div>

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
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              onClick={(e) => handleRegister(e)}
              disabled={loading}
              className="btn-primary w-full cursor-pointer"
              style={{ marginTop: "8px" }}
            >
              {loading ? (
                <>
                  <Spinner /> Creating account…
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>
        </div>

        <p
          className="text-center text-sm mt-6"
          style={{ color: "var(--text-secondary)" }}
        >
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium"
            style={{ color: "var(--accent)" }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
