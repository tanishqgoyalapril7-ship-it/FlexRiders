"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { ContactProvider } from "./Contact";
import SmoothScroll from "./SmoothScroll";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ContactProvider>
        <SmoothScroll />
        {children}
      </ContactProvider>
    </MotionConfig>
  );
}
