import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Online Quran Classes for Kids | Iqra Academy – 4 Live Sessions a Week",
  description:
    "Online Quran classes for kids in the US. Noorani Qaida, Tajweed & Hifz with live teachers. 4 sessions/week, fixed schedule. Book a free assessment today.",
  openGraph: {
    title: "Online Quran Classes for Kids | Iqra Academy",
    description:
      "Live 1:1 and group Quran classes for children aged 5–15. Structured tracks from Noorani Qaida to Hifz. US time zones. Book a free assessment.",
    type: "website",
    locale: "en_US",
    siteName: "Iqra Academy",
  },
  twitter: {
    card: "summary_large_image",
    title: "Online Quran Classes for Kids | Iqra Academy",
    description:
      "Live 1:1 and group Quran classes for children aged 5–15. US time zones. Book a free assessment.",
  },
  keywords: [
    "online Quran classes for kids",
    "online Noorani Qaida for kids",
    "Quran memorization classes online",
    "Tajweed classes for children",
    "Hifz classes online",
    "online Quran school US",
    "kids Quran teacher online",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#faf9f6] text-gray-900`}
      >
        {children}
      </body>
    </html>
  );
}
