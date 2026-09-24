"use client";

import Image from "next/image";
import {
  motion,
  useMotionValueEvent,

  useTransform,
} from "framer-motion";
import { useRef, useState } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import riderApproved from "@/public/images/rider-approved.webp";
import { StatusPill } from "@/components/Devices";
import { IconCheck } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { useReduced } from "@/lib/useReduced";
import s from "./Approvals.module.css";

const stages = [
  { status: "REGISTERED", text: "The rider submits their details and documents.", when: "Mon · 10:42" },
  { status: "PENDING REVIEW", text: "Your team checks the application.", when: "Mon · 14:05" },
  { status: "APPROVED", text: "Approved by an authorised team member.", when: "Tue · 09:30" },
  { status: "BRAND ASSIGNED", text: "Matched to a brand and working location.", when: "Tue · 11:15" },
  { status: "ACTIVE", text: "Ready to work — and the rider is notified.", when: "Tue · 11:16" },
];

export default function Approvals() {
  const listRef = useRef<HTMLOListElement>(null);
  const reduce = useReduced();
  const [reached, setReached] = useState(-1);
  const { scrollYProgress: p } = useScrollProgress({
    target: listRef,
    offset: ["start 75%", "end 55%"],
  });
  const fill = useTransform(p, [0, 1], [0, 1]);

  useMotionValueEvent(p, "change", (v) => {
    const i = Math.floor(v * stages.length * 0.999 + 0.35) - 1;
    setReached(Math.min(stages.length - 1, i));
  });

  const current = reduce ? stages.length - 1 : reached;

  return (
    <section className={`section theme-dark ${s.approvals}`} aria-labelledby="approvals-title">
      <div className={`container ${s.grid}`}>
        <div className={s.visual}>
          <div className={s.glow} aria-hidden="true" />
          <Reveal y={40} blur className={s.imgWrap}>
            <Image
              src={riderApproved}
              alt="A Flex Riders rider in a branded polo giving a thumbs up"
              sizes="(max-width: 767px) 80vw, 40vw"
              className={s.img}
            />
          </Reveal>
          <motion.div
            className={s.badge}
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ type: "spring", stiffness: 160, damping: 18, delay: 0.4 }}
            aria-hidden="true"
          >
            <span className={s.badgeIcon}>
              <IconCheck size={16} />
            </span>
            <span>
              <b>Approved</b>
              <em>Reviewed by operations</em>
            </span>
          </motion.div>
        </div>

        <div className={s.copy}>
          <Reveal>
            <p className="eyebrow">Approvals</p>
          </Reveal>
          <RevealHeading
            id="approvals-title"
            className="display"
            lines={["Every rider starts", "with approval."]}
          />
          <Reveal delay={0.1}>
            <p className={`lead ${s.lead}`}>
              Registration isn&apos;t activation. Your team reviews every application before a
              rider goes live — so every active rider is one you&apos;ve approved.
            </p>
          </Reveal>

          <ol ref={listRef} className={s.timeline}>
            <span className={s.track} aria-hidden="true">
              <motion.i style={{ scaleY: reduce ? 1 : fill }} />
            </span>
            {stages.map((st, i) => (
              <li key={st.status} data-state={i < current ? "done" : i === current ? "on" : "off"}>
                <span className={s.node} aria-hidden="true">
                  {i <= current && <IconCheck size={11} />}
                </span>
                <div className={s.row}>
                  <StatusPill status={st.status} className={s.pill} />
                  <em className={s.when}>{st.when}</em>
                </div>
                <p className={s.text}>{st.text}</p>
              </li>
            ))}
          </ol>
          <p className={s.note}>Timeline shows demonstration data.</p>
        </div>
      </div>
    </section>
  );
}
