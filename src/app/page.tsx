/**
 * Landing Page — Iqra Academy
 *
 * High-converting single-page design for parent enrollment.
 * Primary CTA: Book a free assessment call.
 * Secondary: Understand plans, curriculum, and safety.
 *
 * SEO target keywords:
 *   "online Quran classes for kids"
 *   "online Noorani Qaida for kids"
 *   "Quran memorization classes online"
 */

import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/landing/Nav";
import FAQ from "@/components/landing/FAQ";

// ── SEO Metadata ──────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Online Quran Classes for Kids – 4 Live Sessions a Week | Iqra Academy",
  description:
    "Live Quran classes for kids aged 5–15 with certified teachers. Noorani Qaida, Tajweed & Hifz. 4 sessions/week, US time zones. Book a free assessment today.",
  openGraph: {
    title: "Online Quran Classes for Kids | Iqra Academy",
    description:
      "Live 1:1 and group Quran lessons for children. Qaidah, recitation, and memorization with certified teachers.",
    type: "website",
    locale: "en_US",
    url: "https://quran.learnnovice.com",
    siteName: "Iqra Academy",
  },
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <TrustBar />
        <ProblemsWeSolve />
        <HowItWorks />
        <Curriculum />
        <LiveClassExperience />
        <Pricing />
        <Testimonials />
        <ForParents />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: HERO
// ═══════════════════════════════════════════════════════════════════════════════

function Hero() {
  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #faf9f4 0%, #f0ede6 45%, #eaf5f0 100%)",
        minHeight: "88vh",
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* Decorative blobs */}
      <div
        className="absolute top-0 right-0 pointer-events-none"
        style={{
          width: "700px",
          height: "700px",
          background: "radial-gradient(circle, rgba(11,110,79,0.10) 0%, transparent 65%)",
          transform: "translate(30%, -25%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 pointer-events-none"
        style={{
          width: "500px",
          height: "500px",
          background: "radial-gradient(circle, rgba(200,132,26,0.07) 0%, transparent 65%)",
          transform: "translate(-25%, 30%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-6 py-20 lg:py-28 w-full">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-20 items-center">
          {/* Left: Copy */}
          <div className="animate-in-delay-1">
            {/* Trust badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-8"
              style={{
                background: "var(--accent-subtle)",
                color: "var(--accent)",
                border: "1px solid var(--border-accent)",
              }}
            >
              <span
                className="w-2 h-2 rounded-full pulse"
                style={{ background: "var(--accent)" }}
              />
              200+ Families Learning With Us
            </div>

            <h1
              className="font-bold tracking-tight leading-[1.05] mb-6"
              style={{
                fontSize: "clamp(2.5rem, 5vw, 3.75rem)",
                color: "var(--text-primary)",
              }}
            >
              Online Quran Classes{" "}
              <br className="hidden sm:block" />
              for Kids —{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, var(--accent) 0%, #0ea47a 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                4 Live Sessions<br className="hidden sm:block" /> a Week
              </span>
            </h1>

            <p
              className="text-xl leading-relaxed mb-8"
              style={{ color: "var(--text-secondary)", maxWidth: "480px" }}
            >
              Certified teachers. Fixed weekly schedule. Built around your
              family&apos;s routine — not ours.
            </p>

            {/* Benefit bullets */}
            <ul className="space-y-3.5 mb-10">
              {[
                "Start from Noorani Qaida or build fluent recitation",
                "4 live 30\u2011min classes/week at fixed times that suit your family",
                "Weekly progress email with teacher audio notes",
                "1:1, group, or siblings options \u2014 US time zones",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-3 text-base"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <div className="check-icon mt-0.5">
                    <svg
                      className="w-3 h-3"
                      style={{ color: "var(--accent)" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  {b}
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#book-assessment"
                className="btn-primary"
                style={{ padding: "16px 32px", fontSize: "16px", borderRadius: "14px" }}
              >
                Book a Free Assessment
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </a>
              <a
                href="#pricing"
                className="text-base font-semibold transition-colors hover:opacity-70"
                style={{ color: "var(--text-secondary)" }}
              >
                See Plans &amp; Pricing \u2192
              </a>
            </div>
            <p className="text-sm mt-3" style={{ color: "var(--text-tertiary)" }}>
              15\u2011minute placement call \u00b7 No credit card needed
            </p>
          </div>

          {/* Right: Dashboard mockup */}
          <div className="hidden lg:block animate-in-delay-2">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardMockup() {
  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        boxShadow: "var(--shadow-xl)",
        border: "1px solid var(--border)",
        transform: "perspective(1200px) rotateY(-5deg) rotateX(3deg)",
      }}
    >
      {/* Window chrome */}
      <div
        className="flex items-center gap-2 px-5 py-3.5"
        style={{
          background: "#1a1a1a",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
        <span
          className="flex-1 text-center text-[11px] font-medium"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          Iqra Academy \u2014 Student Dashboard
        </span>
      </div>

      {/* Dashboard content */}
      <div className="p-5" style={{ background: "#ffffff" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-base font-semibold" style={{ color: "#1a1a1a" }}>
              Good morning, Aisha! \U0001f44b
            </div>
            <div className="text-xs" style={{ color: "#9ca3af" }}>
              Monday \u00b7 3 classes this week
            </div>
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, var(--accent), #0ea47a)" }}
          >
            A
          </div>
        </div>

        {/* Next class banner */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{
            background: "linear-gradient(135deg, #0b6e4f 0%, #0ea47a 100%)",
            color: "white",
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
              Next Class
            </span>
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.18)" }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full pulse"
                style={{ background: "white" }}
              />
              In 2h 15m
            </div>
          </div>
          <div className="text-sm font-bold mb-0.5">Qaidah \u2014 Lesson 8: Connecting Letters</div>
          <div className="text-xs opacity-70">Ustadh Ali Rahman \u00b7 30 min \u00b7 1:1 Session</div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[
            { label: "This Week", value: "1/4", color: "#0b6e4f" },
            { label: "Streak", value: "3 wks", color: "#c8841a" },
            { label: "Progress", value: "65%", color: "#6366f1" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-3 text-center"
              style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
            >
              <div className="text-sm font-bold" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="text-[10px]" style={{ color: "#9ca3af" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div
          className="rounded-xl p-3.5 mb-3"
          style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: "#374151" }}>
              Qaidah Track Progress
            </span>
            <span className="text-xs font-bold" style={{ color: "#0b6e4f" }}>
              65%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#e5e7eb" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: "65%",
                background: "linear-gradient(90deg, #0b6e4f, #0ea47a)",
              }}
            />
          </div>
        </div>

        {/* Teacher feedback */}
        <div
          className="rounded-xl p-3 flex items-center gap-3"
          style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #0b6e4f, #0ea47a)" }}
          >
            U
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold" style={{ color: "#374151" }}>
              Audio Feedback from Ustadh Ali
            </div>
            <div className="text-[10px] truncate" style={{ color: "#9ca3af" }}>
              &quot;Excellent pronunciation on Meem today!&quot;
            </div>
          </div>
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-subtle)" }}
          >
            <svg
              className="w-3.5 h-3.5"
              style={{ color: "var(--accent)" }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: TRUST BAR
// ═══════════════════════════════════════════════════════════════════════════════

function TrustBar() {
  const items = [
    {
      label: "Ijazah-certified teachers",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
    },
    {
      label: "US time\u2011zone schedules",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "200+ families enrolled",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: "Satisfaction guarantee",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      ),
    },
    {
      label: "Safe, moderated classrooms",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
  ];

  return (
    <section
      style={{
        background: "#ffffff",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 py-7">
        <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-12">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-2.5 text-sm font-medium whitespace-nowrap"
              style={{ color: "var(--text-secondary)" }}
            >
              <div style={{ color: "var(--accent)" }}>{item.icon}</div>
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: PROBLEMS WE SOLVE
// ═══════════════════════════════════════════════════════════════════════════════

function ProblemsWeSolve() {
  const problems = [
    "Your child is just starting Quran and you\u2019re worried about pronunciation.",
    "They can read letters but struggle to join and read smoothly.",
    "You want a gentle path into memorization without overwhelming them.",
    "You\u2019re busy and need fixed, reliable times each week.",
  ];
  const solutions = [
    "Structured Noorani Qaida \u2192 Recitation \u2192 Hifz tracks for every level.",
    "4x/week short sessions that build habit, fluency, and confidence.",
    "Patient, kid-friendly teachers who adjust pace to each child.",
    "Weekly email digest and teacher audio feedback so you stay informed.",
  ];

  return (
    <section className="py-20 lg:py-28" style={{ background: "var(--bg-primary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="section-label justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            Built for Families Like Yours
          </div>
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            We get it \u2014 because we\u2019re parents too
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            Every concern you have about Quran education, we\u2019ve thought about and built a solution for.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Problems */}
          <div className="rounded-2xl p-8" style={{ background: "#fff7f7", border: "1px solid #fecaca" }}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#fee2e2" }}>
                <svg className="w-4 h-4" style={{ color: "#ef4444" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "#ef4444" }}>
                This is for your family if\u2026
              </h3>
            </div>
            <ul className="space-y-4">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-3 text-base" style={{ color: "#374151" }}>
                  <div className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0" style={{ background: "#fecaca" }}>
                    <div className="w-2 h-2 rounded-full" style={{ background: "#ef4444" }} />
                  </div>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="rounded-2xl p-8" style={{ background: "#f0faf5", border: "1px solid #a7f3d0" }}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--accent-light)" }}>
                <svg className="w-4 h-4" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>
                How our program helps
              </h3>
            </div>
            <ul className="space-y-4">
              {solutions.map((s) => (
                <li key={s} className="flex items-start gap-3 text-base" style={{ color: "#374151" }}>
                  <div className="check-icon mt-0.5">
                    <svg className="w-3 h-3" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: HOW IT WORKS
// ═══════════════════════════════════════════════════════════════════════════════

function HowItWorks() {
  const steps = [
    {
      step: "01",
      title: "Book a Free Assessment",
      desc: "Pick a 15-minute slot that works. Tell us your child\u2019s age and experience level \u2014 no obligations.",
      iconPath: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
      color: "#0b6e4f",
      bg: "var(--accent-subtle)",
    },
    {
      step: "02",
      title: "Meet Your Teacher",
      desc: "A 1:1 placement call to find the right starting point \u2014 Qaidah, Recitation, or Hifz.",
      iconPath: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
      color: "#3b82f6",
      bg: "#eff6ff",
    },
    {
      step: "03",
      title: "Lock Your Schedule",
      desc: "Choose 4 fixed 30-minute weekly slots that fit your family\u2019s routine \u2014 same time every week.",
      iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      color: "#c8841a",
      bg: "#fef9ee",
    },
    {
      step: "04",
      title: "Watch Them Grow",
      desc: "Follow progress through weekly updates, teacher audio feedback, and milestone reports.",
      iconPath: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
      color: "#0ea47a",
      bg: "#f0fdf4",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 lg:py-28" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="section-label justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Simple Process
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            How our Quran program works
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            From your first click to consistent weekly classes in under a week
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s) => (
            <div key={s.step} className="card p-6" style={{ background: "#ffffff" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>
                Step {s.step}
              </div>
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                style={{ background: s.bg, color: s.color }}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.iconPath} />
                </svg>
              </div>
              <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a href="#book-assessment" className="btn-primary" style={{ padding: "14px 32px", fontSize: "15px" }}>
            Book Your Free Assessment
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: CURRICULUM & TRACKS
// ═══════════════════════════════════════════════════════════════════════════════

function Curriculum() {
  const tracks = [
    {
      number: "1",
      name: "Qaidah Foundations",
      timeline: "~3\u20136 months",
      headerGradient: "linear-gradient(135deg, #0b6e4f 0%, #0ea47a 100%)",
      iconColor: "#0b6e4f",
      icon: "\U0001f4d6",
      desc: "Arabic letters, vowel marks, and joining rules \u2014 the core building blocks of Quran reading.",
      outcomes: [
        "Recognize and pronounce all 28 Arabic letters",
        "Read words with short vowels, Tanween, and Sukoon",
        "Begin reading from the Mushaf with confidence",
      ],
    },
    {
      number: "2",
      name: "Fluent Recitation with Tajweed",
      timeline: "Ongoing",
      headerGradient: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
      iconColor: "#3b82f6",
      icon: "\U0001f4d5",
      desc: "Correct Makharij, Tajweed rules, and smooth connected reading for confident recitation.",
      outcomes: [
        "Apply Tajweed rules naturally while reading",
        "Recite with confidence in Salah and at home",
        "Self-correct common mistakes through teacher guidance",
      ],
    },
    {
      number: "3",
      name: "Hifz Pathway",
      timeline: "Flexible pace",
      headerGradient: "linear-gradient(135deg, #c8841a 0%, #d97706 100%)",
      iconColor: "#c8841a",
      icon: "\U0001f9e0",
      desc: "Structured memorization starting from Juz Amma, with daily revision and retention cycles.",
      outcomes: [
        "Memorize with a sustainable, child-friendly pace",
        "Build strong retention through guided review",
        "Track milestones with teacher and parent reports",
      ],
    },
  ];

  return (
    <section id="curriculum" className="py-20 lg:py-28" style={{ background: "var(--bg-primary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="section-label justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Clear Roadmap
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Noorani Qaida to Hifz \u2014 a clear roadmap
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            Three structured tracks. Your child starts where they are and progresses at their own pace.
          </p>
        </div>

        {/* Roadmap indicator */}
        <div className="flex items-center justify-center gap-3 mb-12 flex-wrap">
          {["Qaidah", "\u2192", "Recitation", "\u2192", "Hifz"].map((item, i) => (
            <span
              key={i}
              className={item === "\u2192" ? "text-sm" : "text-sm font-semibold px-3 py-1 rounded-full"}
              style={item === "\u2192" ? { color: "var(--text-tertiary)" } : { background: "var(--accent-subtle)", color: "var(--accent)" }}
            >
              {item}
            </span>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {tracks.map((t) => (
            <div key={t.name} className="card overflow-hidden flex flex-col">
              <div className="p-5" style={{ background: t.headerGradient, color: "white" }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest opacity-75">Track {t.number}</div>
                  <span className="text-2xl">{t.icon}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{t.name}</h3>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>
                  {t.timeline}
                </span>
              </div>
              <div className="p-5 flex-1">
                <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>{t.desc}</p>
                <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-tertiary)" }}>Outcomes</div>
                <ul className="space-y-2.5">
                  {t.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: t.iconColor }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: LIVE CLASS EXPERIENCE
// ═══════════════════════════════════════════════════════════════════════════════

function LiveClassExperience() {
  return (
    <section className="py-20 lg:py-28" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Class UI mockup */}
          <div className="rounded-3xl overflow-hidden" style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
              <div className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
              <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
              <span className="flex-1 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                Iqra Academy \u2014 Live Classroom
              </span>
            </div>
            <div className="p-2 bg-gray-900">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="aspect-video rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0b6e4f 0%, #0ea47a 100%)" }}>
                  <div className="text-center text-white">
                    <div className="w-14 h-14 rounded-full bg-white/20 mx-auto mb-2 flex items-center justify-center text-xl font-bold">U</div>
                    <div className="text-xs font-semibold">Ustadh Ali</div>
                    <div className="text-[10px] opacity-60">Teacher</div>
                  </div>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ background: "rgba(0,0,0,0.4)" }}>
                    <span className="w-1.5 h-1.5 rounded-full pulse" style={{ background: "#22c55e" }} />
                    Teaching
                  </div>
                </div>
                <div className="aspect-video rounded-xl flex items-center justify-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}>
                  <div className="text-center text-white">
                    <div className="w-14 h-14 rounded-full bg-white/20 mx-auto mb-2 flex items-center justify-center text-xl font-bold">A</div>
                    <div className="text-xs font-semibold">Aisha</div>
                    <div className="text-[10px] opacity-60">Student</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full pulse" style={{ background: "#ef4444" }} />
                  <span className="text-xs font-semibold text-white">Live \u00b7 12:30 remaining</span>
                </div>
                <div className="flex items-center gap-2">
                  {["\U0001f3a4", "\U0001f4f7", "\u270b", "\U0001f4ac"].map((icon) => (
                    <div key={icon} className="w-8 h-8 rounded-full flex items-center justify-center text-xs" style={{ background: "rgba(255,255,255,0.1)" }}>
                      {icon}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Copy */}
          <div>
            <div className="section-label mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Live Classroom
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>
              A real classroom, not just a video call
            </h2>
            <ul className="space-y-5">
              {[
                { emoji: "\U0001f4f1", text: "One\u2011tap join from phone, tablet, or laptop \u2014 no meeting codes or downloads required." },
                { emoji: "\U0001f4de", text: "Teachers can \u201ccall\u201d your child when class starts, so you never miss a session." },
                { emoji: "\U0001f512", text: "Secure, camera-on classrooms built for kids \u2014 safe, moderated, and private." },
                { emoji: "\U0001f4fc", text: "Optional recordings available after each session \u2014 great for revision and review." },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0" style={{ background: "var(--accent-subtle)", border: "1px solid var(--border-accent)" }}>
                    {item.emoji}
                  </div>
                  <p className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: PRICING
// ═══════════════════════════════════════════════════════════════════════════════

function Pricing() {
  const plans = [
    {
      name: "Free Webinar",
      price: "$0",
      period: "/mo",
      desc: "Weekly 30\u2011min live Quran webinar open to up to 20 kids.",
      features: ["Listen and follow along live", "Q&A in the last 5 minutes", "View session recordings"],
      notIncluded: ["No 1:1 feedback", "No custom track"],
      cta: "Join Next Free Session",
      popular: false,
      highlight: false,
    },
    {
      name: "1:1 Classes",
      price: "$70",
      period: "/mo",
      desc: "4 \u00d7 30\u2011min private classes per week with your child\u2019s dedicated teacher.",
      features: ["Custom track (Qaida, Recitation, or Hifz)", "Teacher audio feedback after each lesson", "Community chat access", "Weekly progress reports", "Reschedule with 4-hr notice"],
      notIncluded: [],
      cta: "Start 1:1 Plan",
      popular: true,
      highlight: true,
    },
    {
      name: "Group of 3",
      price: "$50",
      period: "/mo",
      desc: "4 \u00d7 30\u2011min small-group classes with 3 age/level-matched students.",
      features: ["Same age & level peers", "Motivation through group dynamic", "Community chat + audio feedback", "Weekly progress reports"],
      notIncluded: [],
      cta: "Join Group Plan",
      popular: false,
      highlight: false,
    },
    {
      name: "Siblings Bundle",
      price: "$100",
      period: "/mo",
      desc: "4 classes/week per child for up to 3 siblings under one account.",
      features: ["Individual profile per child", "Each child has their own track & teacher", "Family progress digest", "Observer emails for grandparents"],
      notIncluded: [],
      cta: "Enroll Siblings",
      popular: false,
      highlight: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 lg:py-28" style={{ background: "var(--bg-primary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="section-label justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Plans &amp; Pricing
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Simple, transparent pricing
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            No hidden fees. No long-term contracts. Cancel anytime.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={plan.highlight ? "card-accent" : "card"}
              style={{ padding: "0", overflow: "hidden", display: "flex", flexDirection: "column", position: "relative" }}
            >
              {plan.popular && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-[11px] font-bold text-white whitespace-nowrap z-10"
                  style={{ background: "var(--accent)" }}
                >
                  \u2b50 Most Popular
                </div>
              )}
              <div
                className="p-5 pb-4"
                style={{ borderBottom: "1px solid var(--border)", background: plan.highlight ? "var(--accent-subtle)" : undefined }}
              >
                <div className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: plan.highlight ? "var(--accent)" : "var(--text-tertiary)" }}>
                  {plan.name}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-4xl font-bold" style={{ color: "var(--text-primary)" }}>{plan.price}</span>
                  <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>{plan.period}</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{plan.desc}</p>
              </div>
              <div className="p-5 flex-1">
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                  {plan.notIncluded.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-tertiary)" }}>
                      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-5 pt-2">
                <a
                  href="#book-assessment"
                  className={plan.highlight ? "btn-primary w-full" : "btn-secondary w-full"}
                  style={{ fontSize: "14px", padding: "11px 16px", textAlign: "center", display: "flex", justifyContent: "center" }}
                >
                  {plan.cta}
                </a>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            US\u2011based billing in USD \u00b7 Manual monthly payments with optional auto\u2011pay \u00b7 Free reschedule with 4-hour notice
          </p>
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: TESTIMONIALS
// ═══════════════════════════════════════════════════════════════════════════════

function Testimonials() {
  const testimonials = [
    {
      name: "Amina Hassan",
      detail: "Mother of 3 \u00b7 Dallas, TX",
      initials: "AH",
      color: "#0b6e4f",
      text: "My daughter went from barely knowing the Arabic alphabet to reading full ayahs in 4 months. The weekly audio feedback is a game-changer \u2014 I can hear her progress.",
    },
    {
      name: "Yusuf Rahman",
      detail: "Father \u00b7 Chicago, IL",
      initials: "YR",
      color: "#3b82f6",
      text: "The siblings plan is incredible value. All three of my kids have their own teachers and schedules, and I manage everything from one clean dashboard.",
    },
    {
      name: "Sarah Mitchell",
      detail: "Mother of 2 \u00b7 Houston, TX",
      initials: "SM",
      color: "#8b5cf6",
      text: "My son used to dread Quran time. Now he asks when his next class is. The teachers are so patient and encouraging \u2014 it genuinely changed everything.",
    },
    {
      name: "Khalid Ali",
      detail: "Father \u00b7 New York, NY",
      initials: "KA",
      color: "#c8841a",
      text: "The fixed schedule is exactly what our family needed. No more \u2018when is class?\u2019 confusion. Same 4 days, same time, every week \u2014 we love the routine.",
    },
    {
      name: "Fatima Omar",
      detail: "Mother \u00b7 Atlanta, GA",
      initials: "FO",
      color: "#ef4444",
      text: "The observer emails are such a thoughtful feature. My mother in Pakistan gets weekly updates on her grandchildren\u2019s Quran progress \u2014 it means the world to her.",
    },
    {
      name: "Ahmed Patel",
      detail: "Father of 2 \u00b7 San Jose, CA",
      initials: "AP",
      color: "#0ea5e9",
      text: "The free webinar sold us immediately. Seeing a real teacher, a real schedule, and a real dashboard \u2014 not just a Zoom link \u2014 was exactly what we needed.",
    },
  ];

  return (
    <section className="py-20 lg:py-28" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="section-label justify-center">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Parent Reviews
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            What parents are saying about us
          </h2>
          <p className="text-lg" style={{ color: "var(--text-secondary)" }}>Real families, real results</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div key={t.name} className="card p-6 flex flex-col" style={{ background: "#ffffff" }}>
              <div className="flex gap-0.5 mb-4" style={{ color: "#f59e0b" }}>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm leading-relaxed mb-5 flex-1" style={{ color: "var(--text-secondary)" }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: t.color }}>
                  {t.initials}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.detail}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: FOR PARENTS — SAFETY
// ═══════════════════════════════════════════════════════════════════════════════

function ForParents() {
  const items = [
    {
      iconPath: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
      color: "#0b6e4f",
      bg: "var(--accent-subtle)",
      title: "Safe, supervised classrooms",
      text: "Every teacher is vetted with background checks and Ijazah verification. Classes are monitored and recorded for accountability. Your child is never alone or unsupervised.",
    },
    {
      iconPath: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
      color: "#ec4899",
      bg: "#fdf2f8",
      title: "Respectful, child-friendly teachers",
      text: "We match teacher personality to your child. Shy kids get gentle, patient teachers. Energetic kids get engaging, motivating ones. Not the right fit? We reassign at no cost.",
    },
    {
      iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
      color: "#c8841a",
      bg: "#fef9ee",
      title: "Healthy screen time",
      text: "30 minutes of structured, purposeful learning \u2014 not passive scrolling. No ads, no autoplay, no distractions. Just focused Quran time that ends when class ends.",
    },
    {
      iconPath: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
      color: "#6366f1",
      bg: "#f5f3ff",
      title: "Moderated chat & recordings",
      text: "Chat is teacher-supervised and disabled during free sessions. Session recordings are only visible to the enrolled parent and student \u2014 never shared publicly.",
    },
  ];

  return (
    <section id="for-parents" className="py-20 lg:py-28" style={{ background: "var(--bg-primary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="section-label justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            For Parents
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Built with your child&apos;s safety in mind
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            We take safety, privacy, and screen time seriously so you can focus on your child&apos;s learning.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {items.map((item) => (
            <div key={item.title} className="card p-6" style={{ background: "#ffffff" }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: item.bg, color: item.color }}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.iconPath} />
                </svg>
              </div>
              <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>{item.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11: FINAL CTA
// ═══════════════════════════════════════════════════════════════════════════════

function FinalCTA() {
  return (
    <section
      id="book-assessment"
      className="py-20 lg:py-28 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0b6e4f 0%, #085c3f 50%, #0b4f3b 100%)" }}
    >
      <div
        className="absolute top-0 right-0 pointer-events-none"
        style={{ width: "500px", height: "500px", background: "radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)", transform: "translate(30%, -30%)" }}
      />
      <div
        className="absolute bottom-0 left-0 pointer-events-none"
        style={{ width: "400px", height: "400px", background: "radial-gradient(circle, rgba(200,132,26,0.12) 0%, transparent 70%)", transform: "translate(-20%, 30%)" }}
      />

      <div className="max-w-3xl mx-auto px-6 text-center relative">
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-8"
          style={{ background: "rgba(200,132,26,0.2)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
        >
          \U0001f3af Start your child\u2019s journey today
        </div>

        <h2
          className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6 leading-[1.1]"
          style={{ color: "#ffffff" }}
        >
          Ready to make Quran time your child&apos;s favorite part of the week?
        </h2>

        <p
          className="text-lg leading-relaxed mb-10"
          style={{ color: "rgba(255,255,255,0.75)", maxWidth: "600px", margin: "0 auto 2.5rem" }}
        >
          If you want Quran time to be a highlight \u2014 not a battle \u2014 our
          4x/week, 30-minute live classes are built for you. Book a free
          15-minute assessment and we\u2019ll find the right teacher and
          track for your child.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
          <a href="#book-assessment" className="btn-gold" style={{ padding: "16px 36px", fontSize: "16px", borderRadius: "14px" }}>
            Book a Free Assessment
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
          <a href="mailto:hello@iqra-academy.com" className="text-base font-medium transition-opacity hover:opacity-70" style={{ color: "rgba(255,255,255,0.7)" }}>
            Have questions? Email us \u2192
          </a>
        </div>

        <p className="text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          15\u2011minute call \u00b7 No credit card needed \u00b7 Meet your child&apos;s teacher
        </p>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOOTER
// ═══════════════════════════════════════════════════════════════════════════════

function Footer() {
  return (
    <footer style={{ background: "var(--bg-primary)", borderTop: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: "linear-gradient(135deg, var(--accent), #0ea47a)" }}>
                \u0642
              </div>
              <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>Iqra Academy</span>
            </div>
            <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
              Live Quran classes for kids, built for busy families in the US.
            </p>
            <a href="#book-assessment" className="btn-primary text-sm" style={{ padding: "10px 20px" }}>
              Book Free Assessment
            </a>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Platform</h4>
            <div className="space-y-3">
              {[
                { label: "How It Works", href: "#how-it-works" },
                { label: "Curriculum", href: "#curriculum" },
                { label: "Pricing", href: "#pricing" },
                { label: "For Parents", href: "#for-parents" },
                { label: "FAQ", href: "#faq" },
              ].map((link) => (
                <a key={link.label} href={link.href} className="block text-sm transition-colors hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Company</h4>
            <div className="space-y-3">
              {[
                { label: "About", href: "/about" },
                { label: "For Teachers", href: "/teachers" },
                { label: "Blog", href: "/blog" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms of Service", href: "/terms" },
                { label: "Contact", href: "mailto:hello@iqra-academy.com" },
              ].map((link) => (
                <Link key={link.label} href={link.href} className="block text-sm transition-colors hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Get in Touch</h4>
            <a href="mailto:hello@iqra-academy.com" className="flex items-center gap-2 text-sm hover:opacity-70 transition-opacity" style={{ color: "var(--text-secondary)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              hello@iqra-academy.com
            </a>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>\u00a9 2026 Iqra Academy. All rights reserved.</p>
          <p className="text-xs italic text-center" style={{ color: "var(--text-tertiary)" }}>
            &ldquo;Read! In the name of your Lord who created.&rdquo; \u2014 Al-\u02bfAlaq 96:1
          </p>
        </div>
      </div>
    </footer>
  );
}
