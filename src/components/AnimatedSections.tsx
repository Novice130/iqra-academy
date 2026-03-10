"use client";

import FadeInOnScroll from "@/components/FadeInOnScroll";
import type { ReactNode } from "react";

/**
 * A client-side wrapper that adds scroll-animation to each section on the landing page.
 * We wrap each child with FadeInOnScroll, staggering them.
 */
export default function AnimatedSections({
  children,
}: {
  children: ReactNode[];
}) {
  return (
    <>
      {children.map((child, i) => (
        <FadeInOnScroll key={i} delay={i === 0 ? 0 : 80}>
          {child}
        </FadeInOnScroll>
      ))}
    </>
  );
}
