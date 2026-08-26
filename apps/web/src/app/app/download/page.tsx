/**
 * @fileoverview App downloads — novicetutor.com/app/download
 *
 * One row per platform, the way any multi-platform app presents itself. The
 * app is sideloaded rather than sold through a store, so this page also has to
 * do the job a store listing normally does: say it is safe, and walk someone
 * past the "unknown app" warning. Without that second part most people stop
 * there.
 *
 * Availability is asked of R2 rather than assumed. The desktop builds are
 * produced on a Windows machine and uploaded by hand, so hardcoding a link
 * would hand out 404s on any day the upload had not happened yet. A platform
 * with no file says so instead of pretending.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { ALLOWED_DOWNLOADS } from "@/lib/app-downloads";

export const metadata: Metadata = {
  title: "Download the app | Novice Tutor",
  description:
    "Install Novice Tutor on Android, Windows or iPhone — get notified the moment your class starts, and answer a teacher's call like a phone call.",
};

/**
 * Rendered per request, not at build. The point of asking R2 what exists is
 * that the answer changes when a build is uploaded — and uploads happen
 * without a deploy. Prerendering this would freeze "Windows: not published"
 * into the page until the next deploy, which is worse than not checking.
 */
export const dynamic = "force-dynamic";

const ANDROID_VERSION = "1.2";

interface BucketObjectHead {
  size: number;
}
interface AppDownloadsBucket {
  head(key: string): Promise<BucketObjectHead | null>;
}

/** Which builds are actually sitting in the bucket right now, and how big. */
async function availableBuilds(): Promise<Record<string, number | null>> {
  const keys = Object.values(ALLOWED_DOWNLOADS);
  const empty = Object.fromEntries(keys.map((k) => [k, null]));

  try {
    const { env } = getCloudflareContext();
    const bucket = (env as unknown as { APP_DOWNLOADS?: AppDownloadsBucket }).APP_DOWNLOADS;
    if (!bucket) return empty;

    const entries = await Promise.all(
      keys.map(async (key) => {
        try {
          const head = await bucket.head(key);
          return [key, head ? head.size : null] as const;
        } catch {
          return [key, null] as const;
        }
      })
    );
    return Object.fromEntries(entries);
  } catch {
    // No Cloudflare context — `next dev` on a laptop. Everything reads as
    // unavailable, which is honest here and never happens in production.
    return empty;
  }
}

function formatSize(bytes: number | null): string | null {
  if (!bytes) return null;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export default async function AppDownloadPage() {
  const builds = await availableBuilds();

  const androidSize = formatSize(builds[ALLOWED_DOWNLOADS.androidArm64]);
  const windowsSize = formatSize(builds[ALLOWED_DOWNLOADS.windows]);
  const macSize = formatSize(builds[ALLOWED_DOWNLOADS.macos]);
  const arm32Available = builds[ALLOWED_DOWNLOADS.androidArm32] !== null;

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--color-cream)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center">
              <img src="/logo.png?v=3" className="w-full h-full object-contain" alt="Novice Tutor" />
            </div>
            <span className="font-bold text-[var(--color-charcoal)]">
              Novice <span className="text-[var(--color-gold)]">Tutor</span>
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] mb-3">
          Get Novice Tutor
        </h1>
        <p className="text-[var(--color-gray)] mb-10 leading-relaxed">
          Your classes, on your device. The app rings you when your teacher
          calls — even when your screen is off — so you never miss a lesson
          waiting on a browser tab.
        </p>

        <div className="space-y-4">
          <PlatformRow
            name="Android"
            icon={<AndroidIcon />}
            detail={
              androidSize
                ? `Version ${ANDROID_VERSION} · ${androidSize} · Android 7 and above`
                : "Android 7 and above"
            }
            href={androidSize ? `/api/app-download/${ALLOWED_DOWNLOADS.androidArm64}` : null}
            cta="Download APK"
          />

          <PlatformRow
            name="Windows"
            icon={<WindowsIcon />}
            detail={
              windowsSize
                ? `Installer · ${windowsSize} · Windows 10 and above`
                : "Not published yet — use novicetutor.com in your browser."
            }
            href={windowsSize ? `/api/app-download/${ALLOWED_DOWNLOADS.windows}` : null}
            cta="Download installer"
          />

          {macSize && (
            <PlatformRow
              name="macOS"
              icon={<AppleIcon />}
              detail={`Disk image · ${macSize} · Apple Silicon and Intel`}
              href={`/api/app-download/${ALLOWED_DOWNLOADS.macos}`}
              cta="Download for Mac"
            />
          )}

          {/* iPhone is not a download and cannot be made into one — see the
              section below. Saying "coming soon" next to a dead button would
              be the dishonest version of this row. */}
          <PlatformRow
            name="iPhone & iPad"
            icon={<AppleIcon />}
            detail="Coming to the App Store. For now, use Safari — everything works."
            href={null}
            cta="Open in Safari"
            fallbackHref="/dashboard"
          />
        </div>

        <div className="mt-12 space-y-8">
          <section>
            <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-3">
              Installing on Android
            </h2>
            <ol className="space-y-3 text-[var(--color-gray)] leading-relaxed">
              <Step n={1}>Tap Download. The file saves to your phone.</Step>
              <Step n={2}>
                Open it — from the download notification, or from your Files app
                under <strong>Downloads</strong>.
              </Step>
              <Step n={3}>
                Android will warn you the app came from outside the Play Store.
                Tap <strong>Settings</strong>, turn on{" "}
                <strong>Allow from this source</strong>, go back, then tap{" "}
                <strong>Install</strong>. This warning is normal for apps
                installed directly rather than from a store.
              </Step>
              <Step n={4}>
                Open the app, sign in, and <strong>allow notifications</strong>.
                If it offers <strong>full-screen notifications</strong>, allow
                that too — without it your phone rings but the screen stays
                dark.
              </Step>
            </ol>
            {arm32Available && (
              <p className="text-sm text-[var(--color-gray)] mt-4">
                Very old handsets need the{" "}
                <a
                  href={`/api/app-download/${ALLOWED_DOWNLOADS.androidArm32}`}
                  download
                  className="underline"
                >
                  32-bit build
                </a>{" "}
                instead.
              </p>
            )}
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-3">
              Why there is no iPhone download
            </h2>
            <p className="text-[var(--color-gray)] leading-relaxed">
              Android lets you install an app straight from a website. Apple
              does not: on an iPhone, apps can only be installed through the App
              Store, and Apple checks every one before it is listed. There is no
              equivalent of the file on this page — not because the iPhone app
              is unfinished, but because handing out an installable iPhone app
              outside the store is something Apple does not permit.
            </p>
            <p className="text-[var(--color-gray)] leading-relaxed mt-3">
              Until it is listed, open{" "}
              <Link href="/dashboard" className="underline">
                novicetutor.com
              </Link>{" "}
              in Safari and add it to your Home Screen — Share, then{" "}
              <strong>Add to Home Screen</strong>. It opens full-screen like an
              app. Classes, video and chat all work; only the ring-while-closed
              does not.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-[var(--color-charcoal)] mb-3">
              If something will not install
            </h2>
            <p className="text-[var(--color-gray)] leading-relaxed">
              Message us and keep using the website in the meantime — nothing is
              lost by not having the app. Every class can be joined from a
              browser.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}

function PlatformRow({
  name,
  icon,
  detail,
  href,
  cta,
  fallbackHref,
}: {
  name: string;
  icon: React.ReactNode;
  detail: string;
  href: string | null;
  cta: string;
  fallbackHref?: string;
}) {
  return (
    <div className="flex items-center flex-wrap gap-4 p-5 rounded-2xl border border-[var(--color-cream)] bg-white">
      <div className="shrink-0 w-10 h-10 flex items-center justify-center text-[var(--color-charcoal)]">
        {icon}
      </div>
      {/* basis, not just flex-1: below it the CTA wraps to its own line rather
          than squeezing the name and detail into a two-word-per-line column. */}
      <div className="flex-1 basis-40 min-w-0">
        <div className="font-semibold text-[var(--color-charcoal)]">{name}</div>
        <div className="text-sm text-[var(--color-gray)] mt-0.5">{detail}</div>
      </div>
      {href ? (
        <a
          href={href}
          download
          className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--color-charcoal)" }}
        >
          <DownloadIcon />
          <span className="hidden sm:inline">{cta}</span>
        </a>
      ) : fallbackHref ? (
        <Link
          href={fallbackHref}
          className="shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold border border-[var(--color-cream)] text-[var(--color-charcoal)]"
        >
          {cta}
        </Link>
      ) : (
        <span className="shrink-0 px-4 py-2.5 text-sm text-[var(--color-gray)]">Soon</span>
      )}
    </div>
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

function AndroidIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.6 9.48l1.84-3.18a.4.4 0 0 0-.7-.4l-1.87 3.23a11.6 11.6 0 0 0-9.74 0L5.26 5.9a.4.4 0 1 0-.7.4L6.4 9.48A10.2 10.2 0 0 0 1 17.5h22a10.2 10.2 0 0 0-5.4-8.02M7 14.6a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9m10 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.6l7.2-1v7.1H3zM11.4 4.4L21 3v8.7h-9.6zM3 12.9h7.2V20L3 19zM11.4 12.9H21V21l-9.6-1.3z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.8c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.15-2.8.85-3.5.85s-1.85-.83-3-.8c-1.55.02-3 .9-3.8 2.28-1.62 2.8-.42 6.95 1.16 9.23.77 1.11 1.69 2.36 2.9 2.32 1.16-.05 1.6-.75 3-.75s1.8.75 3.02.72c1.25-.02 2.04-1.13 2.8-2.25.88-1.29 1.24-2.54 1.26-2.6-.03-.01-2.42-.93-2.44-3.7M14.1 5.1c.63-.77 1.06-1.84.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.1 1.77-.96 2.81 1.02.08 2.06-.51 2.69-1.28" />
    </svg>
  );
}
