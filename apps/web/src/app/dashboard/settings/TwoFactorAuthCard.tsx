"use client";

/**
 * Two-Factor Authentication (2FA) Card for Settings
 *
 * Supports:
 * 1. Google Authenticator / TOTP Apps (Google Authenticator, Microsoft Authenticator, 1Password)
 * 2. Email OTP verification codes
 * 3. Backup recovery codes
 */

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Spinner from "@/components/Spinner";

export default function TwoFactorAuthCard() {
  const { data: session } = authClient.useSession();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Setup states
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [step, setStep] = useState<"password" | "method" | "totp" | "email" | "backup">("password");

  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Check initial 2FA status from session / user
  useEffect(() => {
    if (session?.user) {
      setEnabled((session.user as any).twoFactorEnabled ?? false);
      setLoading(false);
    }
  }, [session]);

  const handleStartSetup = () => {
    setPassword("");
    setError(null);
    setSuccess(null);
    setVerifyCode("");
    setStep("password");
    setSetupModalOpen(true);
  };

  const handleVerifyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);

    try {
      const res = await authClient.twoFactor.enable({
        password,
      });

      if (res.error) {
        setError(res.error.message || "Incorrect password. Please try again.");
        setBusy(false);
        return;
      }

      if (res.data) {
        setTotpURI(res.data.totpURI || "");
        // Extract secret parameter from totpURI (e.g. otpauth://totp/...?secret=XXXX)
        try {
          const url = new URL(res.data.totpURI);
          setTotpSecret(url.searchParams.get("secret") || "");
        } catch {
          setTotpSecret("");
        }
        setBackupCodes(res.data.backupCodes || []);
        setStep("method");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to initialize two-factor authentication.");
    } finally {
      setBusy(false);
    }
  };

  const handleSendEmailOTP = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await authClient.twoFactor.sendOtp();
      if (res.error) {
        setError(res.error.message || "Failed to send verification email.");
      } else {
        setSuccess("Verification code sent to your email!");
        setStep("email");
      }
    } catch (err: any) {
      setError(err?.message || "Could not send verification email.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyTOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const res = await authClient.twoFactor.verifyTotp({
        code: verifyCode.trim(),
      });

      if (res.error) {
        setError(res.error.message || "Invalid 6-digit code. Please try again.");
        setBusy(false);
        return;
      }

      setEnabled(true);
      setStep("backup");
    } catch (err: any) {
      setError(err?.message || "Failed to verify authenticator code.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyEmailOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyCode.trim()) return;
    setBusy(true);
    setError(null);

    try {
      const res = await authClient.twoFactor.verifyOtp({
        code: verifyCode.trim(),
      });

      if (res.error) {
        setError(res.error.message || "Invalid verification code.");
        setBusy(false);
        return;
      }

      setEnabled(true);
      setStep("backup");
    } catch (err: any) {
      setError(err?.message || "Failed to verify email code.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);

    try {
      const res = await authClient.twoFactor.disable({
        password,
      });

      if (res.error) {
        setError(res.error.message || "Incorrect password. Could not disable 2FA.");
        setBusy(false);
        return;
      }

      setEnabled(false);
      setDisableModalOpen(false);
      setPassword("");
    } catch (err: any) {
      setError(err?.message || "Failed to disable two-factor authentication.");
    } finally {
      setBusy(false);
    }
  };

  const copyBackupCodes = () => {
    if (backupCodes.length === 0) return;
    const text = backupCodes.join("\n");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (loading) return null;

  return (
    <>
      <section className="card mb-6">
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                Two-Factor Authentication (2FA)
              </h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                Add an extra layer of security to your account using Google Authenticator or Email verification.
              </p>
            </div>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold shrink-0"
              style={{
                background: enabled ? "rgba(16, 185, 129, 0.15)" : "rgba(156, 163, 175, 0.15)",
                color: enabled ? "#059669" : "var(--text-secondary)",
                border: enabled ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border)",
              }}
            >
              {enabled ? "✓ Enabled" : "Disabled"}
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {enabled ? "Your account is protected with 2FA" : "Protect your account with 2FA"}
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {enabled
                  ? "When signing in, you will be asked to enter a verification code from Google Authenticator or your email."
                  : "We recommend enabling 2FA to prevent unauthorized access to your student profile, invoices, and classes."}
              </div>
            </div>

            <div className="shrink-0">
              {enabled ? (
                <button
                  type="button"
                  onClick={() => {
                    setPassword("");
                    setError(null);
                    setDisableModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer hover:bg-red-500/10 text-red-600 border border-red-500/20"
                >
                  Turn off 2FA
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartSetup}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white transition cursor-pointer shadow-md hover:brightness-110"
                  style={{ background: "var(--accent)" }}
                >
                  Enable 2FA
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* SETUP MODAL */}
      {setupModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl p-6 shadow-2xl animate-fadeIn relative max-h-[90vh] overflow-y-auto"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Set up Two-Factor Authentication
              </h3>
              <button
                type="button"
                onClick={() => setSetupModalOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs transition cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
                ✕ {error}
              </div>
            )}
            {success && (
              <div className="mb-4 p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                ✓ {success}
              </div>
            )}

            {/* STEP 1: Enter Password */}
            {step === "password" && (
              <form onSubmit={handleVerifyPassword} className="space-y-4">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Please enter your current account password to begin two-factor authentication setup.
                </p>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                    Account Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="input w-full"
                    autoFocus
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSetupModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !password}
                    className="btn-primary px-5 py-2 text-xs font-semibold"
                  >
                    {busy ? <Spinner size={14} /> : "Continue"}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: Choose Method (Google Authenticator vs Email) */}
            {step === "method" && (
              <div className="space-y-4">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Choose how you want to receive your two-factor verification codes:
                </p>

                <div className="grid gap-3">
                  {/* Option A: Google Authenticator / App */}
                  <button
                    type="button"
                    onClick={() => {
                      setVerifyCode("");
                      setError(null);
                      setStep("totp");
                    }}
                    className="flex items-start gap-3.5 p-4 rounded-2xl border text-left transition cursor-pointer hover:border-[#059669]"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-lg shrink-0">
                      📱
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        Google Authenticator / TOTP App (Recommended)
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        Use Google Authenticator, Microsoft Authenticator, 1Password, or Authy on your phone.
                      </div>
                    </div>
                  </button>

                  {/* Option B: Email OTP */}
                  <button
                    type="button"
                    onClick={handleSendEmailOTP}
                    disabled={busy}
                    className="flex items-start gap-3.5 p-4 rounded-2xl border text-left transition cursor-pointer hover:border-[#059669]"
                    style={{
                      background: "var(--bg-secondary)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-lg shrink-0">
                      ✉️
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                        Email Verification Code (OTP)
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        Receive a 6-digit one-time code sent to your registered email ({session?.user?.email}).
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3A: TOTP / Google Authenticator Screen */}
            {step === "totp" && (
              <form onSubmit={handleVerifyTOTP} className="space-y-4">
                <div className="p-4 rounded-2xl space-y-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
                  <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    1. Scan or enter key in your Authenticator app
                  </div>

                  {totpSecret && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                        Secret key (for manual entry):
                      </span>
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/20 border border-white/10 font-mono text-xs text-emerald-400 select-all">
                        <span>{totpSecret}</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(totpSecret).catch(() => {});
                            setSuccess("Secret key copied!");
                            setTimeout(() => setSuccess(null), 2000);
                          }}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] text-white cursor-pointer"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  )}

                  {totpURI && (
                    <div className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      Open <strong>Google Authenticator</strong> &rarr; Tap <strong>+</strong> &rarr; Choose <strong>Enter a setup key</strong> &rarr; Enter Account: <code>{session?.user?.email}</code> and Key: <code>{totpSecret}</code>.
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                    2. Enter the 6-digit code from Google Authenticator
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="input w-full text-center tracking-widest font-mono text-lg"
                    autoFocus
                  />
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setStep("method")}
                    className="px-4 py-2 rounded-xl text-xs font-semibold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    &larr; Back
                  </button>
                  <button
                    type="submit"
                    disabled={busy || verifyCode.length < 6}
                    className="btn-primary px-5 py-2 text-xs font-semibold"
                  >
                    {busy ? <Spinner size={14} /> : "Verify and Enable"}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3B: Email OTP Screen */}
            {step === "email" && (
              <form onSubmit={handleVerifyEmailOTP} className="space-y-4">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  We sent a 6-digit verification code to <strong>{session?.user?.email}</strong>. Enter it below to activate 2FA:
                </p>

                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                    Email Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="input w-full text-center tracking-widest font-mono text-lg"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleSendEmailOTP}
                    disabled={busy}
                    className="text-xs font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    Resend code
                  </button>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setStep("method")}
                      className="px-4 py-2 rounded-xl text-xs font-semibold"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      &larr; Back
                    </button>
                    <button
                      type="submit"
                      disabled={busy || verifyCode.length < 6}
                      className="btn-primary px-5 py-2 text-xs font-semibold"
                    >
                      {busy ? <Spinner size={14} /> : "Verify and Enable"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* STEP 4: Backup Recovery Codes */}
            {step === "backup" && (
              <div className="space-y-4">
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
                  <span>✓</span>
                  <span>Two-Factor Authentication is now enabled!</span>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    Save your Backup Recovery Codes
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    If you ever lose access to your phone or email, you can use these one-time backup codes to sign in. Save them in a safe place:
                  </p>

                  <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-black/20 border border-white/10 font-mono text-xs text-white">
                    {backupCodes.map((code, idx) => (
                      <div key={idx} className="p-1.5 rounded bg-white/5 text-center">
                        {code}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={copyBackupCodes}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>{copied ? "✓ Copied to clipboard" : "📋 Copy all backup codes"}</span>
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setSetupModalOpen(false)}
                    className="btn-primary px-6 py-2.5 text-xs font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISABLE MODAL */}
      {disableModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl p-6 shadow-2xl animate-fadeIn relative"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <h3 className="text-base font-bold mb-1 text-red-600">
              Turn off Two-Factor Authentication
            </h3>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              Enter your password to disable 2FA. This will remove two-step verification protection from your account.
            </p>

            {error && (
              <div className="mb-4 p-3 rounded-xl text-xs font-semibold bg-red-500/10 text-red-600 border border-red-500/20">
                ✕ {error}
              </div>
            )}

            <form onSubmit={handleDisable2FA} className="space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: "var(--text-secondary)" }}>
                  Account Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input w-full"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisableModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !password}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition cursor-pointer"
                >
                  {busy ? <Spinner size={14} /> : "Turn off 2FA"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
