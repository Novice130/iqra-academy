"use client";

/**
 * Sticky Navigation — Landing Page
 *
 * Client component because it needs:
 * - Mobile hamburger menu toggle (useState)
 * - Scroll-aware background change (could add later)
 */

import { useState } from "react";
import Link from "next/link";

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { label: "How It Works", href: "#how-it-works" },
    { label: "Curriculum", href: "#curriculum" },
    { label: "Pricing", href: "#pricing" },
    { label: "For Parents", href: "#for-parents" },
  ];

  return (
    <nav className="sticky top-0 z-50 px-4 pt-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="glass-panel rounded-[1.75rem] px-4 sm:px-5">
          <div className="flex h-[72px] items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 shrink-0">
              <img
                src="/logo.png"
                alt="NoviceTutor"
                className="h-10 w-10 rounded-2xl object-cover shadow-sm"
              />
              <div>
                <div
                  className="text-[15px] font-semibold tracking-tight"
                  style={{ color: "var(--text-primary)" }}
                >
                  NoviceTutor
                </div>
                <div
                  className="hidden text-xs sm:block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Online Quran & Academic Tutoring
                </div>
              </div>
            </Link>

            <div className="hidden md:flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-2 py-2">
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-100"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-3">
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-slate-100"
                style={{ color: "var(--text-secondary)" }}
              >
                Log In
              </Link>
              <Link href="/register" className="btn-primary">
                Register
              </Link>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <Link
                href="/login"
                className="rounded-full px-3 py-1.5 text-xs font-semibold border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
              >
                Log In
              </Link>
              <Link
                href="/register"
                className="btn-primary"
                style={{ padding: "8px 12px", fontSize: "12px" }}
              >
                Register
              </Link>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
                aria-label="Toggle menu"
              >
                {menuOpen ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {menuOpen && (
            <div className="border-t border-slate-200 pb-4 pt-2 md:hidden">
              <div className="space-y-1.5 rounded-[1.5rem] bg-white/70 p-2">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-slate-100"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {link.label}
                  </a>
                ))}
                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block text-center rounded-2xl px-4 py-2.5 text-sm font-semibold border border-slate-200 bg-white text-slate-800"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMenuOpen(false)}
                    className="block text-center btn-primary"
                    style={{ width: "100%", padding: "10px 16px" }}
                  >
                    Register / Start Free Trial
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
