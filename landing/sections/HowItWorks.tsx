"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import avatar from "@/public/images/rider-avatar.webp";
import { StatusPill } from "@/components/Devices";
import { IconCheck, IconSearch } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { demoEarnings, inr } from "@/lib/demo";
import s from "./HowItWorks.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const steps: { n: string; title: string; text: string; art: ReactNode }[] = [
  {
    n: "01",
    title: "Register",
    text: "The rider creates a profile and submits their information.",
    art: (
      <div className={s.artForm}>
        <i style={{ width: "62%" }} />
        <i style={{ width: "84%" }} />
        <i style={{ width: "48%" }} />
        <span className={s.artBtn}>Submit</span>
      </div>
    ),
  },
  {
    n: "02",
    title: "Review",
    text: "Your operations team reviews the application.",
    art: (
      <div className={s.artReview}>
        <span className="avatar" style={{ width: 40, height: 40 }}>
          <Image src={avatar} alt="" width={40} height={40} sizes="80px" />
        </span>
        <span className={s.lens}>
          <IconSearch size={18} />
        </span>
        <StatusPill status="PENDING REVIEW" />
      </div>
    ),
  },
  {
    n: "03",
    title: "Assign",
    text: "Approved riders can be assigned to brands.",
    art: (
      <div className={s.artAssign}>
        <span className="avatar" style={{ width: 36, height: 36 }}>
          <Image src={avatar} alt="" width={36} height={36} sizes="72px" />
        </span>
        <span className={s.wire} />
        <span className="brand-mono" style={{ width: 36, height: 36, fontSize: 15 }}>
          A
        </span>
      </div>
    ),
  },
  {
    n: "04",
    title: "Manage",
    text: "Track rider information and payments from one platform.",
    art: (
      <div className={s.artManage}>
        <p>
          <span>This month</span>
          <b className="num">{inr(demoEarnings.month)}</b>
        </p>
        <p>
          <span>
            <IconCheck size={11} /> Status
          </span>
          <StatusPill status="ACTIVE" />
        </p>
      </div>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className={`section theme-light theme-paper`} aria-labelledby="how-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">How it works</p>
          </Reveal>
          <RevealHeading id="how-title" className="display" lines={["Four steps.", "One platform."]} />
        </div>

        <motion.ol
          className={s.steps}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
        >
          <motion.span
            className={s.line}
            aria-hidden="true"
            variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1 } }}
            transition={{ duration: 1.6, ease, delay: 0.2 }}
          />
          {steps.map((st, i) => (
            <motion.li
              key={st.n}
              variants={{
                hidden: { opacity: 0, y: 30 },
                show: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.9, ease, delay: 0.15 + i * 0.14 }}
            >
              <span className={s.num}>{st.n}</span>
              <div className={s.art} aria-hidden="true">
                {st.art}
              </div>
              <h3>{st.title}</h3>
              <p>{st.text}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}
