"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import avatar from "@/public/images/rider-avatar.webp";
import { StatusPill } from "@/components/Devices";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { demoRider } from "@/lib/demo";
import s from "./Brands.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const brands = [
  { k: "A", name: "Brand A", meta: "Gurugram", on: true },
  { k: "B", name: "Brand B", meta: "Noida" },
  { k: "C", name: "Brand C", meta: "Delhi" },
  { k: "D", name: "Brand D", meta: "Bengaluru" },
];

const history = [
  { brand: "Brand A", place: "Gurugram", range: "14 Mar 2026 — Present", current: true },
  { brand: "Brand C", place: "Gurugram", range: "02 Jan — 13 Mar 2026" },
  { brand: "Brand B", place: "Noida", range: "10 Oct 2025 — 01 Jan 2026" },
];

export default function Brands() {
  return (
    <section className={`section theme-light ${s.brands}`} aria-labelledby="brands-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Brand management</p>
          </Reveal>
          <RevealHeading
            id="brands-title"
            className="display"
            lines={["Connect riders with", "the right brands."]}
          />
          <Reveal delay={0.12}>
            <p className="lead">
              Assign each approved rider to a brand and working location. Reassign when things
              change — the history stays with the rider.
            </p>
          </Reveal>
        </div>

        <motion.div
          className={s.diagram}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.45 }}
          role="img"
          aria-label="Diagram: rider Rahul Sharma connected to Brand A, one of several brands (demonstration data)"
        >
          <motion.div
            className={s.rider}
            variants={{ hidden: { opacity: 0, x: -30 }, show: { opacity: 1, x: 0 } }}
            transition={{ duration: 0.9, ease }}
          >
            <span className="avatar" style={{ width: 64, height: 64 }}>
              <Image src={avatar} alt="" width={64} height={64} sizes="128px" />
            </span>
            <div>
              <p className={s.eyebrowSm}>Rider</p>
              <b>{demoRider.name}</b>
              <em>
                {demoRider.id} · {demoRider.city}
              </em>
            </div>
          </motion.div>

          <svg className={s.wires} viewBox="0 0 300 400" preserveAspectRatio="none" aria-hidden="true">
            {[50, 150, 250, 350].map((y, i) => (
              <motion.path
                key={y}
                d={`M0 200 C 150 200, 150 ${y}, 300 ${y}`}
                className={i === 0 ? s.wireOn : s.wire}
                variants={{ hidden: { pathLength: 0 }, show: { pathLength: 1 } }}
                transition={{ duration: 1.1, ease, delay: 0.4 + (i === 0 ? 0.35 : i * 0.08) }}
              />
            ))}
          </svg>

          <ul className={s.brandList}>
            {brands.map((b, i) => (
              <motion.li
                key={b.k}
                className={b.on ? s.brandOn : undefined}
                variants={{ hidden: { opacity: 0, x: 30 }, show: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.8, ease, delay: 0.25 + i * 0.07 }}
              >
                <span className="brand-mono" style={{ width: 40, height: 40, fontSize: 17 }}>
                  {b.k}
                </span>
                <span className={s.bName}>
                  <b>{b.name}</b>
                  <em>{b.meta}</em>
                </span>
                {b.on && (
                  <motion.span
                    variants={{ hidden: { opacity: 0, scale: 0.8 }, show: { opacity: 1, scale: 1 } }}
                    transition={{ type: "spring", stiffness: 260, damping: 18, delay: 1.3 }}
                  >
                    <StatusPill status="ASSIGNED" tone="info" />
                  </motion.span>
                )}
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <Reveal className={s.history} delay={0.1}>
          <h3 className={s.historyTitle}>Assignment history</h3>
          <ol>
            {history.map((h) => (
              <li key={h.range} className={h.current ? s.hCurrent : undefined}>
                <span className={s.hDot} aria-hidden="true" />
                <b>{h.brand}</b>
                <span className={s.hPlace}>{h.place}</span>
                <span className={s.hRange}>{h.range}</span>
                {h.current && <StatusPill status="CURRENT" tone="info" />}
              </li>
            ))}
          </ol>
          <p className="demo-note" style={{ justifyContent: "flex-start" }}>
            Brand names and dates are demonstration data
          </p>
        </Reveal>

        <div className={s.scale}>
          {[
            ["Many brands.", "Manage every brand your riders work with from one place."],
            ["Many cities.", "Keep working locations clear as your network grows."],
            ["One view.", "See every rider's current and past assignments together."],
          ].map(([t, d], i) => (
            <Reveal key={t} delay={i * 0.08}>
              <p className={s.scaleT}>{t}</p>
              <p className={s.scaleD}>{d}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
