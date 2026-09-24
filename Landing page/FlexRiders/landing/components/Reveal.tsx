"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import type { ElementType, ReactNode } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

type RevealProps = HTMLMotionProps<"div"> & {
  delay?: number;
  y?: number;
  blur?: boolean;
  amount?: number;
};

/** Fades and lifts content into place once it enters the viewport. */
export function Reveal({
  delay = 0,
  y = 28,
  blur = false,
  amount = 0.35,
  children,
  ...rest
}: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y, filter: blur ? "blur(8px)" : "blur(0px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount }}
      transition={{ duration: 1, ease, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type HeadingProps = {
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** Each entry renders on its own line and animates in sequence. */
  lines: ReactNode[];
  delay?: number;
  id?: string;
};

/** Line-by-line headline reveal: each line rises out of a soft blur. */
export function RevealHeading({ as = "h2", className, lines, delay = 0, id }: HeadingProps) {
  const Tag = motion[as] as ElementType;
  return (
    <Tag
      id={id}
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.6 }}
      transition={{ staggerChildren: 0.1, delayChildren: delay }}
    >
      {lines.map((line, i) => (
        <motion.span
          key={i}
          style={{ display: "block" }}
          variants={{
            hidden: { opacity: 0, y: "0.35em", filter: "blur(10px)" },
            show: {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              transition: { duration: 1.1, ease },
            },
          }}
        >
          {line}
        </motion.span>
      ))}
    </Tag>
  );
}
