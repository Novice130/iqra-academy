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

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl"
      style={{
        background: "rgba(255,255,255,0.85)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{ background: "var(--accent)" }}
          >
            ق
          </div>
          <span className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Iqra Academy
          </span>
        </Link>

        {/* Center links — desktop */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: "How It Works", href: "#how-it-works" },
            { label: "Curriculum", href: "#curriculum" },
            { label: "Pricing", href: "#pricing" },
            { label: "For Parents", href: "#for-parents" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] font-medium transition-colors hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right — desktop */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-[13px] font-medium transition-colors hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
          >
            Log In
          </Link>
          <a href="#book-assessment" className="btn-primary" style={{ padding: "8px 18px", fontSize: "13px" }}>
            Book Free Assessment
          </a>
        </div>

        {/* Mobile — hamburger + CTA */}
        <div className="flex md:hidden items-center gap-3">
          <a href="#book-assessment" className="btn-primary" style={{ padding: "7px 14px", fontSize: "12px" }}>
            Book Free Call
          </a>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-primary)" }}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div
          className="md:hidden px-6 pb-4 space-y-1"
          style={{ background: "rgba(255,255,255,0.95)", borderTop: "1px solid var(--border)" }}
        >
          {[
            { label: "How It Works", href: "#how-it-works" },
            { label: "Curriculum", href: "#curriculum" },
            { label: "Pricing", href: "#pricing" },
            { label: "For Parents", href: "#for-parents" },
            { label: "Log In", href: "/login" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block py-2.5 text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
