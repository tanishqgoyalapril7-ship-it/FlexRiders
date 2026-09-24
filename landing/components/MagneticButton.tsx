"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import type { ReactNode, MouseEvent } from "react";
import { useReduced } from "@/lib/useReduced";
import { useRef } from "react";
import { IconArrowRight } from "./Icons";

type Common = {
  children: ReactNode;
  variant?: "primary" | "ghost" | "link";
  size?: "md" | "sm";
  arrow?: boolean;
  className?: string;
  /** Max pull toward the cursor, in px. */
  strength?: number;
  "aria-label"?: string;
};

type Props =
  | (Common & { href: string; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void })
  | (Common & { href?: undefined; onClick?: (e: MouseEvent<HTMLButtonElement>) => void; type?: "button" | "submit" });

const spring = { stiffness: 260, damping: 18, mass: 0.6 };

/**
 * Pill button with a subtle magnetic pull toward the cursor (fine pointers only)
 * and a small spring response on press.
 */
export default function MagneticButton(props: Props) {
  const { children, variant = "primary", size = "md", arrow, className, strength = 6 } = props;
  const reduce = useReduced();
  const ref = useRef<HTMLElement | null>(null);
  const x = useSpring(useMotionValue(0), spring);
  const y = useSpring(useMotionValue(0), spring);

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    x.set(dx * strength);
    y.set(dy * strength * 0.6);
  };
  const onLeave = () => {
    x.set(0);
    y.set(0);
  };

  const cls = ["btn", `btn-${variant}`, size === "sm" && "btn-sm", className]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span>{children}</span>
      {arrow && <IconArrowRight className="btn-arrow" size={size === "sm" ? 13 : 16} />}
    </>
  );

  const motionProps = {
    className: cls,
    style: { x, y },
    onPointerMove: onMove,
    onPointerLeave: onLeave,
    whileTap: reduce ? undefined : { scale: 0.965 },
    transition: { type: "spring" as const, stiffness: 500, damping: 22 },
    "aria-label": props["aria-label"],
  };

  if (props.href !== undefined) {
    return (
      <motion.a
        {...motionProps}
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={props.href}
        onClick={props.onClick}
      >
        {inner}
      </motion.a>
    );
  }
  return (
    <motion.button
      {...motionProps}
      ref={ref as React.Ref<HTMLButtonElement>}
      type={props.type ?? "button"}
      onClick={props.onClick}
    >
      {inner}
    </motion.button>
  );
}
