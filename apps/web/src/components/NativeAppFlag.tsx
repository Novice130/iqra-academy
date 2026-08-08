'use client';

/**
 * Marks the document as running inside the Novice Tutor app.
 *
 * Adds `native-app` to <html> so CSS can suppress the browser-isms that give
 * a WebView away — text selection on chrome, the grey tap flash, whole-page
 * rubber-banding, the floating WhatsApp bubble.
 *
 * Client-side on purpose. The obvious alternative, reading the user agent in
 * the root layout, forces every page in the site to render per request and
 * gives up static rendering for the marketing pages — a poor trade for a
 * cosmetic class. Anything that would *move* on screen is decided on the
 * server instead: see dashboard/layout.tsx, which is dynamic anyway.
 */

import { useEffect } from "react";
import { isNativeAppClient } from "@/lib/native-app";

export default function NativeAppFlag() {
  useEffect(() => {
    if (isNativeAppClient()) {
      document.documentElement.classList.add("native-app");
    }
  }, []);

  return null;
}
