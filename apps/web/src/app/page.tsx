import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import AnimatedSections from "@/components/AnimatedSections";

/* ── SEO Metadata ────────────────────────────────────────────────────────── */

export const metadata: Metadata = {
  title: "Online Quran Classes for Kids | Live 1-on-1 | Iqra Academy",
  description:
    "Enroll your child in live online Quran classes. Noorani Qaida, Tajweed & Hifz with certified teachers. Flexible US schedules. Start your free trial today.",
  keywords:
    "online quran classes for kids, learn quran online, noorani qaida online, tajweed classes, hifz program, quran tutor",
  openGraph: {
    title: "Online Quran Classes for Kids | Iqra Academy",
    description:
      "Live 1-on-1 Quran classes. Certified teachers. Flexible schedules. Free trial.",
    type: "website",
    url: "https://iqra-academy.com",
  },
};

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AnimatedSections>
          <TrustBar />
          <WhyChooseUs />
          <Courses />
          <HowItWorks />
          <Pricing />
          <Testimonials />
          <FAQ />
          <CTA />
        </AnimatedSections>
      </main>
      <Footer />
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   NAVBAR
   ═════════════════════════════════════════════════════════════════════════════ */

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--color-cream)]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 flex items-center justify-center">
            <img
              src="/logo.png"
              className="w-full h-full object-contain"
              alt="Logo"
            />
          </div>
          <span className="text-lg font-bold text-[var(--color-charcoal)]">
            Iqra <span className="text-[var(--color-gold)]">Academy</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <a
            href="#courses"
            className="text-sm font-medium text-[var(--color-gray)] hover:text-[var(--color-sage-dark)] transition-colors"
          >
            Courses
          </a>
          <a
            href="#pricing"
            className="text-sm font-medium text-[var(--color-gray)] hover:text-[var(--color-sage-dark)] transition-colors"
          >
            Fee
          </a>
          <a
            href="#faq"
            className="text-sm font-medium text-[var(--color-gray)] hover:text-[var(--color-sage-dark)] transition-colors"
          >
            FAQ
          </a>
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--color-gray)] hover:text-[var(--color-sage-dark)] transition-colors"
          >
            Login
          </Link>
          <a
            href="#cta"
            className="bg-[var(--color-sage)] hover:bg-[var(--color-sage-dark)] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-all hover:-translate-y-0.5"
          >
            Start Free Trial
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   HERO — clear value prop, emotional headline, single CTA
   ═════════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="bg-gradient-to-br from-[var(--color-warm-bg)] via-white to-[var(--color-cream)]">
      <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          {/* Copy */}
          <div>
            <p className="inline-block bg-[var(--color-cream)] text-[var(--color-sage-dark)] text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              🎓 Trusted by 200+ families in the US
            </p>

            <h1 className="text-4xl lg:text-5xl font-extrabold text-[var(--color-charcoal)] leading-tight">
              Your Child&apos;s Quran Journey <br className="hidden sm:block" />
              <span className="text-[var(--color-sage)]">Starts Here.</span>
            </h1>

            <p className="mt-6 text-lg text-[var(--color-gray)] leading-relaxed max-w-lg">
              Live 1-on-1 classes with certified Quran teachers. From the Arabic
              alphabet to Tajweed and Hifz — on a schedule that fits your
              family.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#cta"
                className="bg-[var(--color-sage)] hover:bg-[var(--color-sage-dark)] text-white font-semibold px-8 py-3.5 rounded-lg transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                Start Free Trial
              </a>
              <a
                href="#courses"
                className="border-2 border-[var(--color-cream)] hover:border-[var(--color-sage-light)] text-[var(--color-charcoal)] font-semibold px-8 py-3.5 rounded-lg transition-colors"
              >
                View Courses
              </a>
            </div>

            <div className="mt-8 flex items-center gap-6 text-sm text-[var(--color-gray)]">
              <span className="flex items-center gap-1.5">
                ✅ No credit card
              </span>
              <span className="flex items-center gap-1.5">
                ✅ Cancel anytime
              </span>
            </div>
          </div>

          {/* Image */}
          <div className="relative">
            <div className="absolute -inset-3 bg-[var(--color-cream)] rounded-3xl rotate-2 opacity-60" />
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-[var(--color-sage)]/10">
              <Image
                src="/hero.png"
                alt="A child happily learning Quran online with a friendly teacher"
                width={600}
                height={500}
                className="w-full h-auto object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   TRUST BAR — social proof strip
   ═════════════════════════════════════════════════════════════════════════════ */

function TrustBar() {
  return (
    <section className="bg-[var(--color-sage-dark)] py-5">
      <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white/90 text-sm font-medium">
        <span>🌍 Serving US & Canada</span>
        <span>📅 Fixed Weekly Schedules</span>
        <span>👩‍🏫 Male & Female Tutors</span>
        <span>📜 Ijazah-Certified Teachers</span>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   WHY CHOOSE US
   ═════════════════════════════════════════════════════════════════════════════ */

function WhyChooseUs() {
  const features = [
    {
      icon: "🎓",
      title: "Qualified Teachers",
      desc: "Certified tutors with Ijazah and years of experience teaching children.",
    },
    {
      icon: "👤",
      title: "Private 1-on-1 Classes",
      desc: "Dedicated attention so your child learns at their own pace.",
    },
    {
      icon: "👩‍🏫",
      title: "Choose Your Tutor",
      desc: "Male and female tutors available — you pick who your child learns with.",
    },
    {
      icon: "📅",
      title: "Your Schedule, Your Way",
      desc: "Choose class days and times that work for your family's routine.",
    },
    {
      icon: "🌍",
      title: "Learn From Home",
      desc: "No commute. All your child needs is a tablet, laptop, or phone.",
    },
    {
      icon: "📜",
      title: "Completion Certificate",
      desc: "Students receive a certificate once they finish their Quran course.",
    },
  ];

  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-sage-dark)]">
            Why Parents Choose Iqra Academy
          </h2>
          <p className="mt-4 text-[var(--color-gray)] text-lg max-w-xl mx-auto">
            We make Quran education simple, safe, and effective.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-[var(--color-warm-bg)] border border-[var(--color-cream)] rounded-2xl p-7 text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-lg font-bold text-[var(--color-sage-dark)] mb-2">
                {f.title}
              </h3>
              <p className="text-[var(--color-gray)] text-sm leading-relaxed">
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   COURSES — clear program cards
   ═════════════════════════════════════════════════════════════════════════════ */

function Courses() {
  const courses = [
    {
      title: "Noorani Qaida",
      level: "Beginner",
      desc: "Master the Arabic alphabet, correct pronunciation (Makharij), and letter joining rules. The best starting point for children new to Quran reading.",
      highlights: [
        "Arabic letter recognition",
        "Correct pronunciation",
        "Joining rules",
        "Short surah readiness",
      ],
      color: "border-l-[#6ba3d6]",
    },
    {
      title: "Quran Reading with Tajweed",
      level: "Intermediate",
      desc: "Learn to recite the Quran with proper Tajweed rules — Ghunnah, Qalqalah, Madd — and build confident, fluent reading from the Mushaf.",
      highlights: [
        "Core Tajweed rules",
        "Fluent recitation",
        "Listening & correction",
        "Mushaf reading",
      ],
      color: "border-l-[var(--color-sage)]",
    },
    {
      title: "Quran Memorization (Hifz)",
      level: "Advanced",
      desc: "A structured memorization program starting from Juz Amma. Includes daily new memorization, recent revision, and old review cycles for long-term retention.",
      highlights: [
        "Juz-based memorization",
        "Daily Sabaq routine",
        "Revision cycles",
        "Retention tracking",
      ],
      color: "border-l-[var(--color-gold)]",
    },
  ];

  return (
    <section id="courses" className="bg-[var(--color-warm-bg)] py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-sage-dark)]">
            Our Courses
          </h2>
          <p className="mt-4 text-[var(--color-gray)] text-lg max-w-xl mx-auto">
            A clear path from first letters to complete Quran memorization.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {courses.map((c) => (
            <div
              key={c.title}
              className={`bg-white rounded-2xl p-8 border-l-4 ${c.color} shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300`}
            >
              <span className="inline-block bg-[var(--color-cream)] text-[var(--color-sage-dark)] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4">
                {c.level}
              </span>
              <h3 className="text-xl font-bold text-[var(--color-charcoal)] mb-3">
                {c.title}
              </h3>
              <p className="text-[var(--color-gray)] text-sm leading-relaxed mb-5">
                {c.desc}
              </p>
              <ul className="space-y-2 mb-6">
                {c.highlights.map((h) => (
                  <li
                    key={h}
                    className="flex items-center gap-2 text-sm text-[var(--color-charcoal)]"
                  >
                    <span className="text-[var(--color-gold)] text-xs">●</span>{" "}
                    {h}
                  </li>
                ))}
              </ul>
              <a
                href="#cta"
                className="text-[var(--color-sage)] hover:text-[var(--color-sage-dark)] font-semibold text-sm hover:underline transition-colors"
              >
                Start Free Trial →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   HOW IT WORKS — numbered steps
   ═════════════════════════════════════════════════════════════════════════════ */

function HowItWorks() {
  const steps = [
    {
      num: "1",
      title: "Register for Free",
      desc: "Sign up in 30 seconds. No credit card required.",
    },
    {
      num: "2",
      title: "Free Assessment",
      desc: "A 15-minute call to understand your child's current level.",
    },
    {
      num: "3",
      title: "Pick Your Schedule",
      desc: "Choose the days and times that work for your family.",
    },
    {
      num: "4",
      title: "Start Learning",
      desc: "Your child begins live classes from the comfort of home.",
    },
  ];

  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-sage-dark)]">
            How It Works
          </h2>
          <p className="mt-4 text-[var(--color-gray)] text-lg">
            Getting started takes less than 5 minutes.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.num} className="text-center relative">
              {/* connector line on desktop */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-7 left-[60%] w-[80%] h-0.5 bg-[var(--color-cream)]" />
              )}
              <div className="w-14 h-14 bg-[var(--color-sage)] text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-5 relative z-10">
                {s.num}
              </div>
              <h3 className="text-lg font-bold text-[var(--color-charcoal)] mb-2">
                {s.title}
              </h3>
              <p className="text-[var(--color-gray)] text-sm leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   PRICING
   ═════════════════════════════════════════════════════════════════════════════ */

function Pricing() {
  const plans = [
    {
      name: "2 Classes / Week",
      price: "$35",
      desc: "A gentle start for younger kids.",
      features: [
        "30-min live sessions",
        "1-on-1 with teacher",
        "Weekly progress notes",
      ],
    },
    {
      name: "4 Classes / Week",
      price: "$60",
      desc: "Our most popular plan for steady progress.",
      features: [
        "30-min live sessions",
        "1-on-1 with teacher",
        "Weekly progress notes",
        "Priority scheduling",
      ],
      popular: true,
    },
    {
      name: "5 Classes / Week",
      price: "$75",
      desc: "Best for serious learners and Hifz students.",
      features: [
        "30-min live sessions",
        "1-on-1 with teacher",
        "Daily progress notes",
        "Priority scheduling",
        "Hifz revision support",
      ],
    },
  ];

  return (
    <section id="pricing" className="bg-[var(--color-warm-bg)] py-20 lg:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-sage-dark)]">
            Simple, Transparent Pricing
          </h2>
          <p className="mt-4 text-[var(--color-gray)] text-lg">
            Monthly plans. No contracts. Cancel anytime.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`bg-white rounded-2xl p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                p.popular
                  ? "ring-2 ring-[var(--color-sage)] shadow-xl relative"
                  : "border border-[var(--color-cream)]"
              }`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--color-gold)] text-white text-xs font-bold px-4 py-1 rounded-full shadow">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold text-[var(--color-charcoal)]">
                {p.name}
              </h3>
              <p className="text-[var(--color-gray)] text-sm mt-1">{p.desc}</p>
              <div className="mt-6 mb-6">
                <span className="text-4xl font-black text-[var(--color-charcoal)]">
                  {p.price}
                </span>
                <span className="text-[var(--color-gray)] text-sm">
                  {" "}
                  / month
                </span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-3 text-sm text-[var(--color-charcoal)]"
                  >
                    <svg
                      className="w-4 h-4 text-[var(--color-sage)] shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="#cta"
                className={`block text-center py-3 rounded-lg font-semibold transition-all hover:-translate-y-0.5 ${
                  p.popular
                    ? "bg-[var(--color-sage)] hover:bg-[var(--color-sage-dark)] text-white shadow"
                    : "bg-[var(--color-cream)] hover:bg-[var(--color-sage-light)] hover:text-white text-[var(--color-charcoal)]"
                }`}
              >
                Start Free Trial
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   TESTIMONIALS
   ═════════════════════════════════════════════════════════════════════════════ */

function Testimonials() {
  const reviews = [
    {
      name: "Amina H.",
      text: "My daughter went from not knowing Alif to reading full ayahs in just 4 months. The teachers are incredibly patient.",
      role: "Mother of 3, Texas",
    },
    {
      name: "Yusuf R.",
      text: "My son used to resist Quran class. Now he actually asks when his next session is. The teachers make it fun.",
      role: "Father, New York",
    },
    {
      name: "Sarah M.",
      text: "Finally — a platform with a fixed schedule. No more chasing WhatsApp groups for class links. It's so organized.",
      role: "Mother, California",
    },
  ];

  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-sage-dark)]">
            What Parents Are Saying
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {reviews.map((r) => (
            <div
              key={r.name}
              className="bg-[var(--color-warm-bg)] border border-[var(--color-cream)] rounded-2xl p-8 border-l-4 border-l-[var(--color-gold)]"
            >
              <div className="text-[var(--color-gold)] text-lg mb-4">★★★★★</div>
              <p className="text-[var(--color-charcoal)] leading-relaxed mb-6">
                &ldquo;{r.text}&rdquo;
              </p>
              <div className="border-t border-[var(--color-cream)] pt-4">
                <p className="font-bold text-[var(--color-sage-dark)] text-sm">
                  {r.name}
                </p>
                <p className="text-[var(--color-gray)] text-xs">{r.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   FAQ — native <details> accordion
   ═════════════════════════════════════════════════════════════════════════════ */

function FAQ() {
  const faqs = [
    {
      q: "What age group is this for?",
      a: "Our classes are designed for kids aged 5–15, but we also offer programs for adults who want to learn or improve their Quran reading.",
    },
    {
      q: "Do I need any prior knowledge?",
      a: "Not at all. We start from the very basics — even if your child has never seen Arabic letters before.",
    },
    {
      q: "What platform do you use for classes?",
      a: "We use our own built-in classroom. No Zoom, no Skype — just log in and click 'Join Class'.",
    },
    {
      q: "Can I choose a female teacher?",
      a: "Yes, we have both male and female certified tutors available.",
    },
    {
      q: "What if I need to reschedule?",
      a: "You can reschedule with 24 hours notice directly through your parent dashboard.",
    },
    {
      q: "Is there really a free trial?",
      a: "Yes! You get a free assessment class with absolutely no obligation to continue. No credit card needed.",
    },
  ];

  return (
    <section id="faq" className="bg-[var(--color-warm-bg)] py-20 lg:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-sage-dark)]">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="bg-white rounded-xl border border-[var(--color-cream)] group"
            >
              <summary className="cursor-pointer p-6 font-semibold text-[var(--color-charcoal)] flex items-center justify-between list-none">
                {f.q}
                <svg
                  className="w-5 h-5 text-[var(--color-gray)] transition-transform group-open:rotate-180 shrink-0 ml-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-[var(--color-gray)] leading-relaxed">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   FINAL CTA — conversion section
   ═════════════════════════════════════════════════════════════════════════════ */

function CTA() {
  return (
    <section
      id="cta"
      className="bg-gradient-to-br from-[var(--color-sage-dark)] to-[var(--color-sage)] py-20 lg:py-24"
    >
      <div className="max-w-3xl mx-auto px-6 text-center text-white">
        <h2 className="text-3xl lg:text-4xl font-bold mb-6">
          Ready to Start Your Child&apos;s Quran Journey?
        </h2>
        <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto leading-relaxed">
          Book a free assessment class today. Meet your teacher, see how our
          platform works — no credit card, no obligation.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="mailto:hello@iqra-academy.com"
            className="inline-block bg-white text-[var(--color-sage-dark)] font-bold px-10 py-4 rounded-lg text-lg hover:bg-[var(--color-cream)] transition-all hover:-translate-y-0.5 shadow-lg"
          >
            Book Free Assessment
          </a>
          <a
            href="mailto:hello@iqra-academy.com"
            className="inline-block border-2 border-white/30 text-white font-semibold px-10 py-4 rounded-lg text-lg hover:bg-white/10 transition-all"
          >
            Contact Us
          </a>
        </div>
        <p className="mt-6 text-sm text-white/60">
          No credit card required · Cancel anytime · Free assessment included
        </p>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   FOOTER
   ═════════════════════════════════════════════════════════════════════════════ */

function Footer() {
  return (
    <footer className="bg-[var(--color-sage-dark)] text-white/80 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white font-bold">
          <div className="w-8 h-8 flex items-center justify-center text-sm">
            <img
              src="/logo.png"
              className="w-full h-full object-contain"
              alt="Logo"
            />
          </div>
          Iqra <span className="text-[var(--color-gold)]">Academy</span>
        </div>
        <p className="text-sm text-white/60">
          © 2026 Iqra Academy. All rights reserved.
        </p>
        <div className="flex gap-6 text-sm">
          <Link
            href="/privacy"
            className="hover:text-[var(--color-gold)] transition-colors"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="hover:text-[var(--color-gold)] transition-colors"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </footer>
  );
}
