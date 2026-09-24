"use client";

import Lenis from "lenis";
import { useEffect } from "react";
import { scrollToHash, setLenis } from "@/lib/scroll";

/**
 * Lenis smooth scrolling (skipped for reduced-motion users and touch devices,
 * where native momentum scrolling already feels right), plus smooth
 * in-page anchor navigation for every `a[href^="#"]`.
 */
export default function SmoothScroll() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let lenis: Lenis | null = null;
    let raf = 0;

    if (!reduce && !coarse) {
      lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 1 });
      setLenis(lenis);
      const loop = (t: number) => {
        lenis?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]');
      if (!a) return;
      const hash = a.getAttribute("href");
      if (!hash || hash === "#") return;
      e.preventDefault();
      scrollToHash(hash);
    };
    document.addEventListener("click", onClick);

    // Honour a hash present on first load.
    if (location.hash) {
      const h = location.hash;
      setTimeout(() => scrollToHash(h), 60);
    }

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(raf);
      lenis?.destroy();
      setLenis(null);
    };
  }, []);

  return null;
}
