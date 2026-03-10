"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface FadeInOnScrollProps {
  children: ReactNode;
  className?: string;
  /** Delay in ms before the animation starts (stagger cards) */
  delay?: number;
}

/**
 * Wraps children in a fade-in-up animation triggered by IntersectionObserver.
 * Uses CSS transitions for smooth 60fps performance.
 */
export default function FadeInOnScroll({
  children,
  className = "",
  delay = 0,
}: FadeInOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.classList.add("fade-in-visible");
          }, delay);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={`fade-in-hidden ${className}`}>
      {children}
    </div>
  );
}
