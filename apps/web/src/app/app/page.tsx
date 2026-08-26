/**
 * @fileoverview The app's own page — novicetutor.com/app
 *
 * The homepage sells the classes. This page sells the *app*, which is a
 * different argument: a parent who already believes in the lessons still has
 * to be told why a phone app beats the website they are reading this on. The
 * answer is the three things a browser tab cannot do — ring when the teacher
 * calls, tell you the class started while the phone is in a pocket, and keep
 * the lesson audible when the screen locks.
 *
 * No screenshots. There are none in `public/`, and a mocked-up screenshot of
 * a screen that does not look like that yet is worse than none — so the phone
 * here is drawn in markup from the same parts the real screen has.
 *
 * Two rules this page lives under:
 *
 *   - **The App Store link does not exist yet.** It cannot until the APNs key
 *     and the plist land (`docs/next-up.md` item 2) and a build is reviewed.
 *     A dead button is worse than an honest "not yet", so `APP_STORE_URL`
 *     stays null and the button says what is true.
 *   - **Prices are fine here and not in the app.** This is a website, and
 *     Apple's rules are about what the *app* does; per
 *     `project_payments_and_app_store` the iOS app must not link to this page
 *     in a way that reads as steering around in-app purchase, so nothing in
 *     the app points at it.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The Novice Tutor app | Quran classes that ring your phone",
  description:
    "Install Novice Tutor on your phone: your teacher's call rings like a phone call, class reminders arrive before the lesson, and the audio keeps going when the screen locks.",
  openGraph: {
    title: "The Novice Tutor app",
    description:
      "Your teacher's call rings like a phone call. Class reminders before the lesson. Audio that survives a locked screen.",
    type: "website",
    url: "https://novicetutor.com/app",
  },
};

/**
 * Filled in once the app is on the App Store — item 2 in `docs/next-up.md`
 * has to complete first. Until then the button says so rather than pretending.
 */
const APP_STORE_URL: string | null = null;

export default function AppLandingPage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <WhyTheApp />
        <InsideAClass />
        <Curriculum />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   HEADER
   ═════════════════════════════════════════════════════════════════════════════ */

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--color-cream)]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png?v=3" alt="Novice Tutor" className="w-9 h-9 object-contain" />
          <span className="font-bold text-[var(--color-charcoal)]">Novice Tutor</span>
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <Link
            href="/#pricing"
            className="hidden sm:inline text-[var(--color-gray)] hover:text-[var(--color-charcoal)]"
          >
            Pricing
          </Link>
          <Link
            href="/app/download"
            className="text-[var(--color-gray)] hover:text-[var(--color-charcoal)]"
          >
            Downloads
          </Link>
          <Link
            href="/register"
            className="bg-[var(--color-sage)] hover:bg-[var(--color-sage-dark)] text-white font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Free trial
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   HERO
   ═════════════════════════════════════════════════════════════════════════════ */

function Hero() {
  return (
    <section className="bg-gradient-to-br from-[var(--color-warm-bg)] via-white to-[var(--color-cream)]">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <p className="inline-block bg-[var(--color-cream)] text-[var(--color-sage-dark)] text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              📱 Android now · iPhone next
            </p>

            <h1 className="text-4xl lg:text-5xl font-extrabold text-[var(--color-charcoal)] leading-tight">
              The class comes to you.
              <br />
              <span className="text-[var(--color-sage)]">It rings.</span>
            </h1>

            <p className="mt-6 text-lg text-[var(--color-gray)] leading-relaxed max-w-lg">
              A browser tab has to be open and watched. The app does not: when
              your teacher starts the lesson, the phone rings like a phone
              call, and one tap puts your child in class.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <StoreButton />
              <Link
                href="/app/download"
                className="inline-flex items-center justify-center gap-2 border-2 border-[var(--color-cream)] hover:border-[var(--color-sage-light)] text-[var(--color-charcoal)] font-semibold px-7 py-3.5 rounded-xl transition-colors"
              >
                <AndroidIcon />
                Get it for Android
              </Link>
            </div>

            <p className="mt-4 text-sm text-[var(--color-gray)]">
              Free to install. Classes are booked separately —{" "}
              <Link href="/#pricing" className="underline hover:text-[var(--color-charcoal)]">
                plans start at $35 a month
              </Link>
              , and the first class is free.
            </p>
          </div>

          <PhoneMock />
        </div>
      </div>
    </section>
  );
}

/**
 * Says what is true rather than linking somewhere that isn't there yet. The
 * moment the App Store listing exists, `APP_STORE_URL` is the only edit.
 */
function StoreButton() {
  if (!APP_STORE_URL) {
    return (
      <span
        className="inline-flex items-center justify-center gap-2 bg-[var(--color-charcoal)]/10 text-[var(--color-gray)] font-semibold px-7 py-3.5 rounded-xl cursor-default"
        title="The iPhone app is in review — Android is ready today."
      >
        <AppleIcon />
        Coming to the App Store
      </span>
    );
  }

  return (
    <a
      href={APP_STORE_URL}
      className="inline-flex items-center justify-center gap-2 bg-[var(--color-charcoal)] hover:bg-black text-white font-semibold px-7 py-3.5 rounded-xl transition-colors"
    >
      <AppleIcon />
      Download on the App Store
    </a>
  );
}

/**
 * The call screen, drawn rather than photographed: a full-bleed teacher, the
 * student's own tile in a corner, and the control bar. It is deliberately the
 * same shape as `apps/ios-native/NoviceTutor/Call/CallStageView.swift`, so if
 * one changes shape the other should too.
 */
function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="absolute -inset-4 bg-[var(--color-cream)] rounded-[3rem] rotate-2 opacity-60" />

      <div className="relative rounded-[2.5rem] border-[10px] border-[var(--color-charcoal)] bg-[#0f1115] shadow-2xl overflow-hidden aspect-[9/19.5]">
        {/* Dynamic Island */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-6 w-24 rounded-full bg-black z-20" />

        {/* Teacher, full bleed */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1d2b25] via-[#16211c] to-[#0f1115]">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-24 w-24 rounded-full bg-[var(--color-sage)]/80 flex items-center justify-center text-white text-3xl font-semibold">
              UB
            </div>
          </div>
          <span className="absolute bottom-28 left-4 text-[11px] text-white bg-black/45 rounded-full px-2.5 py-1">
            Ustadh Bilal
          </span>
        </div>

        {/* The student's own tile, where the app parks it */}
        <div className="absolute bottom-28 right-4 h-24 w-16 rounded-xl border border-white/15 bg-white/10 backdrop-blur-sm flex items-end justify-center pb-1.5">
          <span className="text-[9px] text-white/90">You</span>
        </div>

        {/* Control bar */}
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/15 px-3 py-2">
          <MockCircle label="mic" />
          <MockCircle label="cam" />
          <MockCircle label="more" />
          <span className="rounded-full bg-red-500 text-white text-[10px] font-bold px-3 py-2">
            Leave
          </span>
        </div>
      </div>
    </div>
  );
}

function MockCircle({ label }: { label: string }) {
  return (
    <span
      aria-hidden
      title={label}
      className="h-8 w-8 rounded-full bg-white/20 border border-white/10 inline-block"
    />
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   WHY THE APP
   ═════════════════════════════════════════════════════════════════════════════ */

function WhyTheApp() {
  const points = [
    {
      icon: "📞",
      title: "The teacher's call rings",
      body: "When the teacher opens the class, every booked student's phone rings — a full-screen call, not a notification you scroll past.",
    },
    {
      icon: "🔔",
      title: "It knows the class started",
      body: "The app checks for a live class in the background and shows it at the top of the screen, so nobody has to remember to refresh anything.",
    },
    {
      icon: "🔒",
      title: "Keeps going when the screen locks",
      body: "A child can put the phone down to hold their mushaf with both hands and still hear the teacher.",
    },
    {
      icon: "🕌",
      title: "The whole class, on a phone",
      body: "Chat, the people in the room, background blur, and — for teachers — muting, spotlighting and letting a parent in.",
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] text-center">
          What the app does that a browser tab can&apos;t
        </h2>
        <p className="mt-4 text-center text-[var(--color-gray)] max-w-2xl mx-auto">
          Everything on novicetutor.com works in a phone browser. These four
          things only work when the app is installed.
        </p>

        <div className="mt-12 grid sm:grid-cols-2 gap-6">
          {points.map((point) => (
            <div
              key={point.title}
              className="border border-[var(--color-cream)] rounded-2xl p-6 hover:shadow-md transition-shadow"
            >
              <span className="text-2xl">{point.icon}</span>
              <h3 className="mt-3 font-bold text-[var(--color-charcoal)]">{point.title}</h3>
              <p className="mt-2 text-[var(--color-gray)] leading-relaxed">{point.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   INSIDE A CLASS
   ═════════════════════════════════════════════════════════════════════════════ */

function InsideAClass() {
  const steps = [
    {
      n: "1",
      title: "The phone rings",
      body: "Your teacher opens the room. Answer, and you are in — no link, no meeting code, no password.",
    },
    {
      n: "2",
      title: "Camera and mic, checked first",
      body: "The app shows you yourself before anyone else sees you, and remembers whether you wanted the camera on.",
    },
    {
      n: "3",
      title: "Thirty minutes, one to one",
      body: "The teacher fills the screen. Turn your background blurry, type in the chat, or hold the mushaf up to the camera in landscape.",
    },
    {
      n: "4",
      title: "The teacher ends it",
      body: "Not a timer, and not a dropped connection — a class ends when the teacher says it does, and everyone's attendance is recorded.",
    },
  ];

  return (
    <section className="py-20 bg-[var(--color-warm-bg)]">
      <div className="max-w-4xl mx-auto px-6">
        <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] text-center">
          What a class actually looks like
        </h2>

        <ol className="mt-12 space-y-6">
          {steps.map((step) => (
            <li key={step.n} className="flex gap-5">
              <span className="shrink-0 h-10 w-10 rounded-full bg-[var(--color-sage)] text-white font-bold flex items-center justify-center">
                {step.n}
              </span>
              <div>
                <h3 className="font-bold text-[var(--color-charcoal)]">{step.title}</h3>
                <p className="mt-1 text-[var(--color-gray)] leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   CURRICULUM
   ═════════════════════════════════════════════════════════════════════════════ */

function Curriculum() {
  const stages = [
    {
      name: "Noorani Qaida",
      body: "The Arabic letters, their sounds, and joining them — where a child with no Arabic starts.",
    },
    {
      name: "Tajweed",
      body: "Reciting correctly: the rules of pronunciation, applied to what your child is already reading.",
    },
    {
      name: "Hifz",
      body: "Memorisation, at whatever pace fits — with revision built into the weekly schedule.",
    },
  ];

  return (
    <section className="py-20 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] text-center">
          Three stages, in order
        </h2>
        <p className="mt-4 text-center text-[var(--color-gray)] max-w-2xl mx-auto">
          Your teacher decides where to begin in the free first class, and the
          app keeps the schedule and the weekly progress notes in one place.
        </p>

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {stages.map((stage, index) => (
            <div
              key={stage.name}
              className="rounded-2xl border border-[var(--color-cream)] p-6 bg-[var(--color-warm-bg)]"
            >
              <span className="text-sm font-semibold text-[var(--color-gold-dark)]">
                Stage {index + 1}
              </span>
              <h3 className="mt-1 text-xl font-bold text-[var(--color-charcoal)]">{stage.name}</h3>
              <p className="mt-2 text-[var(--color-gray)] leading-relaxed">{stage.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
   CTA
   ═════════════════════════════════════════════════════════════════════════════ */

function Cta() {
  return (
    <section className="bg-gradient-to-br from-[var(--color-sage-dark)] to-[var(--color-sage)] py-20">
      <div className="max-w-3xl mx-auto px-6 text-center text-white">
        <h2 className="text-3xl lg:text-4xl font-bold">Try one class first.</h2>
        <p className="mt-5 text-white/80 text-lg leading-relaxed">
          Book a free trial class, meet the teacher, and see whether it suits
          your child. Install the app when you know it does — nothing is charged
          to try it.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="inline-block bg-white text-[var(--color-sage-dark)] font-bold px-10 py-4 rounded-lg text-lg hover:bg-[var(--color-cream)] transition-colors"
          >
            Book a free class
          </Link>
          <Link
            href="/app/download"
            className="inline-block border-2 border-white/30 text-white font-semibold px-10 py-4 rounded-lg text-lg hover:bg-white/10 transition-colors"
          >
            All downloads
          </Link>
        </div>

        <p className="mt-6 text-sm text-white/60">
          No card to try · Android available now · iPhone coming
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
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
        <span>© {new Date().getFullYear()} Novice Tutor</span>
        <div className="flex gap-6">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <Link href="/app/download" className="hover:text-white">
            Downloads
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 3.02-.84.99-2.22 1.76-3.37 1.67-.14-1.1.42-2.26 1.1-3.02.77-.87 2.13-1.55 3.2-1.6.06.31.09.62.09.93zM20.9 17.1c-.55 1.27-.81 1.84-1.52 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C.36 15.9-.01 10.86 1.66 8.28c1.18-1.83 3.05-2.9 4.8-2.9 1.79 0 2.91 1 4.39 1 1.43 0 2.3-1 4.37-1 1.56 0 3.22.85 4.4 2.32-3.87 2.12-3.24 7.64 1.28 9.4z" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18a.38.38 0 00-.66-.38l-1.86 3.22a11.4 11.4 0 00-9.84 0L5.22 5.92a.38.38 0 10-.66.38L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.05 1.05 0 111.05-1.05A1.05 1.05 0 017 15.25zm10 0a1.05 1.05 0 111.05-1.05A1.05 1.05 0 0117 15.25z" />
    </svg>
  );
}
