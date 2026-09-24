"use client";

import { useMotionValue, useMotionValueEvent, useScroll } from "framer-motion";
import { useEffect } from "react";

type Options = Parameters<typeof useScroll>[0];

/**
 * Drop-in for `useScroll` that relays progress through a plain motion value.
 *
 * Framer Motion may hand scroll-linked opacity/transform to a native
 * ScrollTimeline; with sticky targets and custom offsets that mapping drifts
 * from the real progress. Relaying keeps every value driven by the same,
 * correct number.
 */
export function useScrollProgress(options: Options) {
  const { scrollYProgress: source } = useScroll(options);
  const scrollYProgress = useMotionValue(0);
  useEffect(() => {
    scrollYProgress.set(source.get());
  }, [source, scrollYProgress]);
  useMotionValueEvent(source, "change", (v) => scrollYProgress.set(v));
  return { scrollYProgress };
}
