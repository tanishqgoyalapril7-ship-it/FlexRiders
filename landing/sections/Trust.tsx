"use client";

import { motion } from "framer-motion";
import {
  IconCamera,
  IconHistory,
  IconLock,
  IconRadius,
  IconShieldCheck,
  IconUsers,
  IconWallet,
  IconDoc,
} from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./Trust.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

// One place for what used to be the Operations, Payments and Security sections.
const items = [
  {
    Icon: IconShieldCheck,
    title: "Rider verification",
    text: "ID, driving licence, vehicle RC and a selfie are reviewed before a rider is approved.",
  },
  {
    Icon: IconDoc,
    title: "Campaign approval",
    text: "Every brand request is reviewed: approved, sent back for changes, or rejected.",
  },
  {
    Icon: IconCamera,
    title: "Photo verification",
    text: "Each daily photo is approved or rejected with a reason. Re-used photos are refused.",
  },
  {
    Icon: IconRadius,
    title: "Campaign controls",
    text: "The team can pause, resume or complete a campaign and control its radius expansion.",
  },
  {
    Icon: IconWallet,
    title: "Payment tracking",
    text: "Payouts move from pending to processing to paid, with a transaction reference.",
  },
  {
    Icon: IconUsers,
    title: "Role-based access",
    text: "Riders, brands and team members each see only what their role allows.",
  },
  {
    Icon: IconLock,
    title: "Secure data",
    text: "Every app and dashboard needs a sign-in, and rider documents are shown only to authorised people.",
  },
  {
    Icon: IconHistory,
    title: "Audit history",
    text: "Approvals, campaign changes and payment updates leave a clear record.",
  },
];

export default function Trust() {
  return (
    <section id="operations" className={`section theme-light theme-paper ${s.trust}`} aria-labelledby="trust-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Trust &amp; operations</p>
          </Reveal>
          <RevealHeading
            id="trust-title"
            className="display"
            lines={["Checked at every step."]}
          />
          <Reveal delay={0.1}>
            <p className="lead">
              Behind every campaign is an operations team that verifies riders, approves campaigns,
              reviews photos and tracks payments.
            </p>
          </Reveal>
        </div>

        <ul className={s.items}>
          {items.map(({ Icon, title, text }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease, delay: (i % 4) * 0.06 }}
            >
              <span className={s.icon}>
                <Icon size={19} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
