'use client';

/**
 * @fileoverview Instant Navigation Progress Bar
 *
 * Provides immediate (<16ms) visual feedback on route changes across the dashboard and admin panel.
 * Intercepts internal Link clicks and animates a slim #0A84FF progress bar at the top of the viewport.
 * Automatically completes and fades out when navigation settles.
 *
 * @component NavigationProgress
 */

import { useEffect, useState, useRef, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevUrlRef = useRef<string>('');

  const currentUrl = `${pathname}?${searchParams?.toString() || ''}`;

  // Complete progress on URL change
  useEffect(() => {
    if (prevUrlRef.current && prevUrlRef.current !== currentUrl) {
      // Reached new route
      setProgress(100);
      finishTimerRef.current = setTimeout(() => {
        setIsVisible(false);
        setIsNavigating(false);
        setProgress(0);
      }, 250);
    }
    prevUrlRef.current = currentUrl;

    return () => {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, [currentUrl]);

  // Global click listener for internal navigation triggers
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a') as HTMLAnchorElement | null;
      if (!anchor || !anchor.href) return;

      // Skip modifiers, new tab, download, or external links
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      const isInternal = url.origin === window.location.origin;
      const isSamePage = url.pathname === window.location.pathname && url.search === window.location.search;

      if (isInternal && !isSamePage) {
        // Start progress immediately (sub-frame <16ms feedback)
        if (timerRef.current) clearInterval(timerRef.current);
        if (finishTimerRef.current) clearTimeout(finishTimerRef.current);

        setIsNavigating(true);
        setIsVisible(true);
        setProgress(25);

        // Incremental tick animation
        timerRef.current = setInterval(() => {
          setProgress((prev) => {
            if (prev >= 85) {
              if (timerRef.current) clearInterval(timerRef.current);
              return 85;
            }
            return prev + (prev < 50 ? 15 : 5);
          });
        }, 150);
      }
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      if (timerRef.current) clearInterval(timerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 pointer-events-none z-[9999]"
      role="status"
      aria-live="polite"
      aria-label={isNavigating ? 'Loading page...' : 'Page loaded'}
    >
      <div
        className="h-[2.5px] transition-all duration-200 ease-out shadow-sm"
        style={{
          width: `${progress}%`,
          backgroundColor: '#0A84FF',
          boxShadow: '0 0 8px rgba(10, 132, 255, 0.6)',
        }}
      />
      <span className="sr-only">{isNavigating ? 'Loading page' : 'Done'}</span>
    </div>
  );
}

export default function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  );
}
