import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import WhatsAppButton from "@/components/WhatsAppButton";
import NativeAppFlag from "@/components/NativeAppFlag";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Novice Tutor — Learn Quran Online",
  description:
    "Live 1:1 and group Quran lessons with certified teachers. Qaidah, Quran reading, and Hifz — from anywhere.",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable}`}
        style={{ fontFamily: "var(--font-geist-sans)" }}
      >
        {/* Deliberately not a server-side header read. Reading headers() here
            opts the entire site out of static rendering — every marketing
            page becomes per-request work on a Worker that has run out of room
            before (see docs/worker-limits.md). The class is added on mount
            instead; it only drives cosmetic suppressions (text selection, tap
            highlight, the chat bubble), so arriving a frame late costs
            nothing. The chrome that must not flash — the dashboard's tab bar —
            is decided on the server in dashboard/layout.tsx, which is dynamic
            regardless because it reads the session. */}
        <NativeAppFlag />
        {children}
        {/* A floating chat bubble is a website's way of offering help. In the
            app, support lives in Messages — hidden via .native-app in CSS. */}
        <WhatsAppButton />
      </body>
    </html>
  );
}
