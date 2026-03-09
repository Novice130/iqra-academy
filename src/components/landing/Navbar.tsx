"use client";

import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-100 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white font-bold shadow-sm select-none">
            ق
          </div>
          <span className="text-lg font-bold text-gray-900">Iqra Academy</span>
        </a>

        {/* Center links – desktop */}
        <div className="hidden md:flex items-center gap-7">
          {[
            { label: "How it works", href: "#how-it-works" },
            { label: "Curriculum", href: "#curriculum" },
            { label: "Pricing", href: "#pricing" },
            { label: "For parents", href: "#for-parents" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 hover:text-emerald-700 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right – desktop */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="#login"
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Login
          </a>
          <a
            href="#book"
            className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 transition-colors shadow-sm"
          >
            Book Free Assessment
          </a>
        </div>

        {/* Mobile: CTA + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          <a
            href="#book"
            className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors"
          >
            Book Free Assessment
          </a>
          <button
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
            className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {open ? (
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

      {/* Mobile dropdown */}
      {open && (
        <div className="md:hidden bg-white border-t border-stone-100 px-4 py-4 flex flex-col gap-2">
          {[
            { label: "How it works", href: "#how-it-works" },
            { label: "Curriculum", href: "#curriculum" },
            { label: "Pricing", href: "#pricing" },
            { label: "For parents", href: "#for-parents" },
            { label: "Login", href: "#login" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block text-sm font-medium text-gray-700 hover:text-emerald-700 py-1.5 border-b border-stone-50 last:border-0 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}
