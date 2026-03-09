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
    <section className="relative overflow-hidden py-16 lg:py-24" style={{ background: "var(--bg-primary)" }}>
      {/* Subtle gradient accent */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-[0.04]" style={{ background: "var(--accent)", filter: "blur(120px)" }} />

      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <div>
            <h1
              className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-[1.1] mb-6"
              style={{ color: "var(--text-primary)" }}
            >
              Online Quran Classes{" "}
              <br className="hidden sm:block" />
              for Kids — <span style={{ color: "var(--accent)" }}>4 Live{" "}
              Sessions a Week</span>
            </h1>

            <p className="text-lg mb-8 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Structured Qaidah, recitation, and Hifz with certified teachers,
              built around your family&apos;s schedule.
            </p>

            {/* Benefit bullets */}
            <ul className="space-y-3 mb-10">
              {[
                "Start from Noorani Qaida or build fluent recitation.",
                "4 live 30‑min classes/week at fixed times that suit your family.",
                "Weekly progress email with teacher audio notes.",
                "1:1, group, or siblings options — US time zones.",
              ].map((b) => (
                <li key={b} className="flex items-start gap-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
                  <svg className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  {b}
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <a href="#book-assessment" className="btn-primary" style={{ padding: "14px 28px", fontSize: "15px" }}>
                Book a Free Assessment
              </a>
              <a href="#pricing" className="btn-secondary" style={{ padding: "14px 28px", fontSize: "15px" }}>
                See Plans &amp; Pricing
              </a>
            </div>
            <p className="text-xs mt-3" style={{ color: "var(--text-tertiary)" }}>
              15‑minute placement call. No credit card needed.
            </p>
          </div>

          {/* Right: Dashboard mockup */}
          <div className="hidden lg:block">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}

function DashboardMockup() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)" }}>
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
        <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
        <span className="flex-1 text-center text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
          Iqra Academy — Dashboard
        </span>
      </div>

      {/* Dashboard content */}
      <div className="p-5" style={{ background: "var(--bg-primary)" }}>
        {/* Next class */}
        <div className="rounded-xl p-4 mb-4" style={{ background: "var(--accent-light)", border: "1px solid rgba(10,137,103,0.12)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Next Class</span>
            <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>In 2:15:30</span>
          </div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Qaidah — Lesson 8: Connecting Letters</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>Ustadh Ali Rahman · 30 min · 1:1</div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "This Week", value: "1/4" },
            { label: "Streak", value: "3 wks" },
            { label: "Progress", value: "65%" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
              <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{s.value}</div>
              <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Teacher feedback */}
        <div className="rounded-xl p-3.5 flex items-center gap-3" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "var(--accent)" }}>A</div>
          <div className="min-w-0">
            <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Audio Feedback</div>
            <div className="text-[11px] truncate" style={{ color: "var(--text-tertiary)" }}>&quot;Great pronunciation on the Meem today, Aisha!&quot;</div>
          </div>
          <svg className="w-5 h-5 shrink-0" style={{ color: "var(--accent)" }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: TRUST BAR
// ═══════════════════════════════════════════════════════════════════════════════

function TrustBar() {
  return (
    <section style={{ background: "var(--bg-secondary)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {[
            "🎓 Teachers with Ijazah certification",
            "🇺🇸 US time‑zone schedules",
            "👨‍👩‍👧‍👦 200+ families enrolled",
            "💰 Satisfaction guarantee",
          ].map((item) => (
            <span key={item} className="flex items-center gap-1.5 whitespace-nowrap">{item}</span>
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
    "Your child is just starting and you're worried about pronunciation.",
    "They can read letters but struggle to join and read smoothly.",
    "You want a gentle path into memorization without overwhelming them.",
    "You're busy and need fixed, reliable times each week.",
  ];
  const solutions = [
    "Structured Noorani Qaida → Recitation → Hifz tracks.",
    "4x/week short sessions that build habit and confidence.",
    "Patient, kid-friendly teachers who adjust to each child's pace.",
    "Weekly email digest and audio feedback so you always know what's happening.",
  ];

  return (
    <section className="py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Built for families like yours
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            We know what parents go through — because we&apos;re parents too.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
          {/* Problems */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest mb-6" style={{ color: "var(--text-tertiary)" }}>
              This is for your family if…
            </h3>
            <ul className="space-y-4">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#e5484d" }} />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-widest mb-6" style={{ color: "var(--text-tertiary)" }}>
              How our program helps
            </h3>
            <ul className="space-y-4">
              {solutions.map((s) => (
                <li key={s} className="flex items-start gap-3 text-[15px]" style={{ color: "var(--text-secondary)" }}>
                  <svg className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
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
      step: "1",
      title: "Book a Free Assessment",
      desc: "Pick a 15-minute slot that works. Tell us your child's age and experience level.",
    },
    {
      step: "2",
      title: "Meet Your Teacher",
      desc: "A 1:1 assessment call to place your child at the right starting point.",
    },
    {
      step: "3",
      title: "Lock Your Weekly Schedule",
      desc: "Choose 4 fixed 30‑minute slots that fit your family's routine.",
    },
    {
      step: "4",
      title: "Watch Their Recitation Grow",
      desc: "Follow progress through weekly updates, audio feedback, and milestone reports.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 lg:py-24" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            How our Quran program works
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            From first click to consistent classes in under a week
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.step} className="relative text-center lg:text-left">
              <div
                className="w-11 h-11 rounded-full mx-auto lg:mx-0 mb-4 flex items-center justify-center text-base font-bold text-white"
                style={{ background: "var(--accent)" }}
              >
                {s.step}
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{s.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <a href="#book-assessment" className="btn-primary" style={{ padding: "12px 28px" }}>
            Book Your Free Assessment
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
      icon: "📖",
      name: "Qaidah Foundations",
      timeline: "~3–6 months",
      desc: "Arabic letters, vowel marks, joining rules — the building blocks of Quran reading.",
      outcomes: [
        "Recognize and pronounce all 28 Arabic letters.",
        "Read basic words with short vowels, Tanween, Sukoon.",
        "Begin reading from the Mushaf with guidance.",
      ],
    },
    {
      icon: "📕",
      name: "Fluent Recitation with Tajweed",
      timeline: "Ongoing",
      desc: "Correct pronunciation (Makharij), Tajweed rules, and smooth connected reading.",
      outcomes: [
        "Apply Tajweed rules naturally while reading.",
        "Recite with confidence in Salah and at home.",
        "Self-correct common mistakes with teacher feedback.",
      ],
    },
    {
      icon: "🧠",
      name: "Hifz Pathway",
      timeline: "Flexible pace",
      desc: "Structured memorization starting from Juz Amma, with daily revision and retention cycles.",
      outcomes: [
        "Memorize with a sustainable, child-friendly pace.",
        "Build strong retention through guided review.",
        "Track progress through milestones and assessments.",
      ],
    },
  ];

  return (
    <section id="curriculum" className="py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Noorani Qaida to Hifz — a clear roadmap
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            Three structured tracks. Your child starts where they are and progresses at their own pace.
          </p>
        </div>

        {/* Track pipeline visual */}
        <div className="flex items-center justify-center gap-3 mb-12" style={{ color: "var(--text-tertiary)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Qaidah</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Recitation</span>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Hifz</span>
        </div>

        <div className="grid lg:grid-cols-3 gap-5">
          {tracks.map((t) => (
            <div key={t.name} className="card p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{t.name}</h3>
                  <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>{t.timeline}</span>
                </div>
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>{t.desc}</p>
              <ul className="space-y-2">
                {t.outcomes.map((o) => (
                  <li key={o} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {o}
                  </li>
                ))}
              </ul>
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
    <section className="py-20 lg:py-24" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Class mockup */}
          <div className="rounded-2xl overflow-hidden" style={{ boxShadow: "var(--shadow-lg)", border: "1px solid var(--border)" }}>
            <div className="p-1" style={{ background: "var(--bg-primary)" }}>
              {/* Video grid mockup */}
              <div className="grid grid-cols-2 gap-1">
                <div className="aspect-video rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a8967, #0ea47a)" }}>
                  <div className="text-center text-white">
                    <div className="w-12 h-12 rounded-full bg-white/20 mx-auto mb-2 flex items-center justify-center text-lg font-bold">U</div>
                    <div className="text-xs font-medium">Ustadh Ali</div>
                    <div className="text-[10px] opacity-70">Teacher</div>
                  </div>
                </div>
                <div className="aspect-video rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                  <div className="text-center text-white">
                    <div className="w-12 h-12 rounded-full bg-white/20 mx-auto mb-2 flex items-center justify-center text-lg font-bold">A</div>
                    <div className="text-xs font-medium">Aisha</div>
                    <div className="text-[10px] opacity-70">Student</div>
                  </div>
                </div>
              </div>
              {/* Controls bar */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>● Live — 12:30 remaining</span>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--bg-secondary)" }}>🎤</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--bg-secondary)" }}>📷</div>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--bg-secondary)" }}>✋</div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Copy */}
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6" style={{ color: "var(--text-primary)" }}>
              A real classroom, not just a video call
            </h2>
            <ul className="space-y-5">
              {[
                { icon: "📱", text: "One‑tap join from phone, tablet, or laptop — no meeting codes or downloads." },
                { icon: "📞", text: "Teachers can \"call\" your child when class starts, so you never miss a session." },
                { icon: "🔒", text: "Secure, camera-on classrooms built for kids — safe, moderated, no public access." },
                { icon: "📼", text: "Optional session recordings available to you and your child for review." },
              ].map((item) => (
                <li key={item.text} className="flex items-start gap-4">
                  <span className="text-xl mt-0.5">{item.icon}</span>
                  <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{item.text}</p>
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
      desc: "Weekly 30‑min live Quran webinar for up to 20 kids.",
      features: [
        "Listen and follow along live",
        "Q&A in the last 5 minutes",
        "View session recordings",
      ],
      cta: "Join Next Free Session",
      popular: false,
    },
    {
      name: "1:1 Classes",
      price: "$70",
      period: "/mo",
      desc: "4 × 30‑min private classes per week with your child's own teacher.",
      features: [
        "Custom track (Qaida, Recitation, or Hifz)",
        "Teacher audio feedback after each lesson",
        "Community chat access",
        "Weekly progress reports",
      ],
      cta: "Start 1:1 Plan",
      popular: true,
    },
    {
      name: "Group of 3",
      price: "$50",
      period: "/mo",
      desc: "4 × 30‑min small-group classes with 3 matched students.",
      features: [
        "Same age & level peers",
        "Motivation through group learning",
        "Chat access + audio feedback",
        "Weekly progress reports",
      ],
      cta: "Join Group Plan",
      popular: false,
    },
    {
      name: "Siblings Bundle",
      price: "$100",
      period: "/mo",
      desc: "4 classes/week per child for up to 3 siblings under one account.",
      features: [
        "Individual profile per child",
        "Each child gets their own track & teacher",
        "Family progress digest",
        "Observer emails for grandparents",
      ],
      cta: "Enroll Siblings",
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Plans &amp; pricing
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            Simple, transparent pricing. No hidden fees. Cancel anytime.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="card p-6 relative flex flex-col"
              style={plan.popular ? { border: "2px solid var(--accent)", boxShadow: "var(--shadow-md)" } : {}}
            >
              {plan.popular && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold text-white whitespace-nowrap"
                  style={{ background: "var(--accent)" }}
                >
                  Most Popular
                </div>
              )}

              <div className="mb-4">
                <div className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{plan.name}</div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>{plan.price}</span>
                  <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>{plan.period}</span>
                </div>
              </div>

              <p className="text-sm mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>{plan.desc}</p>

              <ul className="space-y-2.5 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <a
                href="#book-assessment"
                className={plan.popular ? "btn-primary w-full" : "btn-secondary w-full"}
                style={{ fontSize: "13px", padding: "10px 16px" }}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Fine print */}
        <div className="text-center mt-8 space-y-1">
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            US‑based billing in USD. Manual monthly payments with optional auto‑pay.
            Free reschedule with 4 hours notice.
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
      detail: "Mother of 3 · Dallas, TX",
      text: "My daughter went from barely knowing the Arabic alphabet to reading full ayahs in 4 months. The weekly audio feedback is a game-changer — I can hear her progress.",
    },
    {
      name: "Yusuf Rahman",
      detail: "Father · Chicago, IL",
      text: "The siblings plan is incredible value. All three of my kids have their own teachers and schedules, and I manage everything from one dashboard.",
    },
    {
      name: "Sarah Mitchell",
      detail: "Mother of 2 · Houston, TX",
      text: "My son used to dread Quran time. Now he asks when his next class is. The teachers are so patient and encouraging — it changed everything.",
    },
    {
      name: "Khalid Ali",
      detail: "Father · New York, NY",
      text: "The fixed schedule is exactly what our family needed. No more 'when is class?' confusion. Same 4 days, same time, every week.",
    },
    {
      name: "Fatima Omar",
      detail: "Mother · Atlanta, GA",
      text: "I love the observer emails. My mother in Pakistan gets weekly updates on her grandchildren's Quran progress. It means the world to her.",
    },
    {
      name: "Ahmed Patel",
      detail: "Father of 2 · San Jose, CA",
      text: "The free webinar convinced us to sign up. Seeing a real teacher, a real schedule, and a real dashboard — not just a Zoom link — sold us.",
    },
  ];

  return (
    <section className="py-20 lg:py-24" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            What parents are saying
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div key={t.name} className="card p-5">
              {/* Stars */}
              <div className="flex gap-0.5 mb-3" style={{ color: "#f59e0b" }}>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.name}</div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t.detail}</div>
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
      icon: "🛡️",
      title: "Safe, supervised classrooms",
      text: "Every teacher is vetted with background checks and Ijazah verification. Classes are monitored and recorded for accountability.",
    },
    {
      icon: "💛",
      title: "Respectful, child‑friendly teachers",
      text: "We match personalities. Shy kids get gentle, patient teachers. Energetic kids get engaging, motivating ones. If it's not a fit, we reassign.",
    },
    {
      icon: "⏰",
      title: "Healthy screen time",
      text: "30 minutes of structured, purposeful learning — not passive scrolling. No ads, no autoplay, no distractions. Just Quran.",
    },
    {
      icon: "💬",
      title: "Moderated chat & recordings",
      text: "Chat is teacher-supervised and disabled during free sessions. Session recordings are only visible to the parent and student.",
    },
  ];

  return (
    <section id="for-parents" className="py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text-primary)" }}>
            Built with your child&apos;s safety in mind
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            We take safety, privacy, and screen time seriously so you can focus on your child&apos;s learning.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          {items.map((item) => (
            <div key={item.title} className="card p-6">
              <div className="text-2xl mb-3">{item.icon}</div>
              <h3 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{item.title}</h3>
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
    <section id="book-assessment" className="py-20 lg:py-24" style={{ background: "var(--bg-secondary)" }}>
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5" style={{ color: "var(--text-primary)" }}>
          Ready to start your child&apos;s Quran journey?
        </h2>
        <p className="text-base leading-relaxed mb-8" style={{ color: "var(--text-secondary)" }}>
          If you want Quran time to be your child&apos;s favorite part of the
          week — not a battle — our 4x/week, 30‑minute live classes are built
          for you. Book a free 15‑minute assessment and we&apos;ll find the
          right teacher and track for your child.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a href="#book-assessment" className="btn-primary" style={{ padding: "14px 36px", fontSize: "15px" }}>
            Book a Free Assessment
          </a>
          <a
            href="mailto:hello@iqra-academy.com"
            className="text-sm font-medium transition-colors hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}
          >
            Have questions? Email us →
          </a>
        </div>
        <p className="text-xs mt-4" style={{ color: "var(--text-tertiary)" }}>
          15‑minute call · No credit card needed · Meet your child&apos;s teacher
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
    <footer style={{ borderTop: "1px solid var(--border)" }}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid sm:grid-cols-3 gap-8 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold" style={{ background: "var(--accent)" }}>ق</div>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Iqra Academy</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
              Live Quran classes for kids, built for families.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Platform</h4>
            <div className="space-y-2.5">
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
            <h4 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-tertiary)" }}>Company</h4>
            <div className="space-y-2.5">
              {[
                { label: "About", href: "/about" },
                { label: "For Teachers", href: "/teachers" },
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
        </div>

        {/* Bottom */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderTop: "1px solid var(--border)" }}>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            © 2026 Iqra Academy. All rights reserved.
          </p>
          <p className="text-xs italic" style={{ color: "var(--text-tertiary)" }}>
            &ldquo;Read! In the name of your Lord who created.&rdquo; — Al-&apos;Alaq 96:1
          </p>
        </div>
      </div>
    </footer>
  );
}
