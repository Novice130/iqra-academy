"use client";

/**
 * Sticky Navigation — Landing Page
 *
 * Client component for:
 * - Mobile hamburger menu toggle (useState)
 * - Scroll-aware background transition (useEffect)
 */

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 backdrop-blur-xl transition-all duration-200"
      style={{
        background: scrolled
          ? "rgba(250,249,244,0.92)"
          : "rgba(250,249,244,0.75)",
        borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        boxShadow: scrolled ? "var(--shadow-sm)" : "none",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold"
            style={{
              background: "linear-gradient(135deg, var(--accent), #0ea47a)",
            }}
          >
            ق
          </div>
          <span
            className="text-[15px] font-bold"
            style={{ color: "var(--text-primary)" }}
          >
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
          <a
            href="#book-assessment"
            className="btn-primary"
            style={{ padding: "9px 18px", fontSize: "13px", borderRadius: "10px" }}
          >
            Book Free Assessment
          </a>
        </div>

        {/* Mobile — CTA + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          <a
            href="#book-assessment"
            className="btn-primary"
            style={{ padding: "8px 14px", fontSize: "12px", borderRadius: "10px" }}
          >
            Book Free Call
          </a>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
            style={{
              color: "var(--text-primary)",
              background: menuOpen ? "var(--bg-secondary)" : "transparent",
            }}
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
          className="md:hidden px-6 pb-5 space-y-1 animate-in"
          style={{
            background: "rgba(250,249,244,0.98)",
            borderTop: "1px solid var(--border)",
          }}
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
              className="block py-3 text-sm font-medium border-b last:border-0"
              style={{
                color: "var(--text-secondary)",
                borderColor: "var(--border)",
              }}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-3">
            <a
              href="#book-assessment"
              className="btn-primary w-full"
              onClick={() => setMenuOpen(false)}
              style={{ fontSize: "14px", padding: "12px 16px", display: "flex", justifyContent: "center" }}
            >
              Book a Free Assessment
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
