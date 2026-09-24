"use client";

import { useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

/**
 * Reduced-motion preference that is always `false` during SSR and the first
 * client render, so server and client markup match before switching.
 */
export function useReduced() {
  const prefers = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? Boolean(prefers) : false;
}
