"use client";

import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import Logo from "@/components/Logo";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./Scale.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const available = [
  "Registration",
  "Approvals",
  "Brand assignment",
  "Payment tracking",
  "Documents",
  "Notifications",
  "Reports",
  "Audit history",
];

const roadmap = [
  "Attendance",
  "Work assignments",
  "GPS",
  "Live location",
  "Shifts",
  "Incentives",
  "Performance",
  "Automated payments",
  "WhatsApp notifications",
  "Multi-city operations",
];

export default function Scale() {
  return (
    <section className={`section theme-dark ${s.scale}`} aria-labelledby="scale-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Built for scale</p>
          </Reveal>
          <RevealHeading
            id="scale-title"
            className="display"
            lines={["Built for today's operations.", <span key="t" className="metal-text">Ready for tomorrow&apos;s scale.</span>]}
          />
          <Reveal delay={0.12}>
            <p className="lead">
              Flex Riders is designed to evolve. The core is in place today, and the platform is
              structured to grow into new capabilities as your operations do.
            </p>
          </Reveal>
        </div>

        <motion.div
          className={s.orbit}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.35 }}
        >
          <motion.span
            className={s.ringInner}
            variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }}
            transition={{ duration: 1.2, ease }}
            aria-hidden="true"
          />
          <motion.span
            className={s.ringOuter}
            variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
            transition={{ duration: 1.4, ease, delay: 0.5 }}
            aria-hidden="true"
          />

          <motion.div
            className={s.core}
            variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
            transition={{ duration: 1, ease }}
          >
            <Logo height={34} wordmark={false} />
            <span>Flex Riders core</span>
          </motion.div>

          <div className={s.group}>
            <h3 className={s.groupTitle}>
              <i className={s.dotNow} aria-hidden="true" /> Available now
            </h3>
            <ul className={s.listNow}>
              {available.map((a, i) => (
                <motion.li
                  key={a}
                  style={{ "--a": `${(360 / available.length) * i - 90}deg` } as CSSProperties}
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.06 }}
                >
                  <span>{a}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <div className={s.group}>
            <h3 className={s.groupTitle}>
              <i className={s.dotNext} aria-hidden="true" /> On the roadmap
            </h3>
            <ul className={s.listNext}>
              {roadmap.map((a, i) => (
                <motion.li
                  key={a}
                  style={{ "--a": `${(360 / roadmap.length) * i - 72}deg` } as CSSProperties}
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                  transition={{ duration: 0.6, delay: 0.9 + i * 0.07 }}
                >
                  <span>{a}</span>
                </motion.li>
              ))}
            </ul>
          </div>
        </motion.div>

        <Reveal className={s.legend}>
          <span>
            <i className={s.dotNow} aria-hidden="true" /> Available now
          </span>
          <span>
            <i className={s.dotNext} aria-hidden="true" /> On the roadmap — planned capabilities, not
            yet available
          </span>
        </Reveal>
      </div>
    </section>
  );
}
