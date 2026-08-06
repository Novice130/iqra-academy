/**
 * @fileoverview Android app download page — novicetutor.com/app/download
 *
 * The app is sideloaded, not on the Play Store, so this page has to do a job
 * a store listing normally does: tell someone it is safe, and walk them past
 * the "unknown app" warning Android shows them. Without that second part the
 * download simply stops there for most people.
 *
 * The APKs are static files in `public/app/`. Two of them: arm64 for anything
 * modern, arm32 for old handsets. One universal APK would spare the choice but
 * costs every phone an extra 15MB.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download the Android app | Novice Tutor",
  description:
    "Install the Novice Tutor app for Android — get notified the moment your class starts, and answer a teacher's call like a phone call.",
};

const VERSION = "1.0.0";
const SIZE = "18 MB";

export default function AppDownloadPage() {
  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--color-cream)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Novice Tutor" />
            </div>
            <span className="font-bold text-[var(--color-charcoal)]">
              Novice <span className="text-[var(--color-gold)]">Tutor</span>
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] mb-3">
          Novice Tutor for Android
        </h1>
        <p className="text-[var(--color-gray)] mb-8 leading-relaxed">
          Your classes, on your phone. The app rings you when your teacher
          calls — even when your screen is off — so you never miss a lesson
          waiting on a browser tab.
        </p>

        <a
          href="/app/novice-tutor.apk"
          download
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-4 rounded-full font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--color-charcoal)" }}
        >
          <DownloadIcon />
          Download for Android
        </a>
        <p className="text-sm text-[var(--color-gray)] mt-3">
          Version {VERSION} · {SIZE} · Android 7 and above
        </p>

        <div className="mt-12 space-y-8">
          <section>
            <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-3">
              Installing it
            </h2>
            <ol className="space-y-3 text-[var(--color-gray)] leading-relaxed">
              <Step n={1}>Tap the button above. The file downloads to your phone.</Step>
              <Step n={2}>
                Open it — from the download notification, or from your Files app
                under <strong>Downloads</strong>.
              </Step>
              <Step n={3}>
                Android will warn you that this app came from outside the Play
                Store. Tap <strong>Settings</strong>, turn on{" "}
                <strong>Allow from this source</strong>, then go back and tap{" "}
                <strong>Install</strong>. This warning is normal for apps
                installed directly rather than from the store.
              </Step>
              <Step n={4}>
                Open the app, sign in, and <strong>allow notifications</strong>{" "}
                when it asks. Without that permission your phone cannot ring.
              </Step>
            </ol>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-3">
              On an iPhone or iPad?
            </h2>
            <p className="text-[var(--color-gray)] leading-relaxed">
              There is no iPhone app yet. Everything works in Safari at{" "}
              <Link href="/dashboard" className="underline">
                novicetutor.com
              </Link>{" "}
              — classes, video, chat. Keep the page open when a class is due and
              you will be let straight in.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-3">
              If it will not install
            </h2>
            <p className="text-[var(--color-gray)] leading-relaxed">
              Very old phones need a different build. Try the{" "}
              <a href="/app/novice-tutor-arm32.apk" download className="underline">
                32-bit version
              </a>{" "}
              instead. If neither works, message us and keep using the website
              in the meantime — nothing is lost by not having the app.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
        style={{ background: "var(--color-gold)" }}
      >
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" />
      <path d="M7 10l5 5 5-5M12 15V3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
