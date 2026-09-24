"use client";

import { motion } from "framer-motion";
import { IconApi, IconDoc, IconHistory, IconKey, IconLock, IconUsers } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./Security.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const items = [
  {
    Icon: IconKey,
    title: "Secure authentication",
    text: "Riders and team members sign in before they see anything.",
  },
  {
    Icon: IconUsers,
    title: "Role-based access",
    text: "Riders see their own information. Your team sees what their role allows.",
  },
  {
    Icon: IconDoc,
    title: "Protected documents",
    text: "Rider documents are available only to authorised people.",
  },
  {
    Icon: IconHistory,
    title: "Audit logs",
    text: "Approvals, assignments and payment updates leave a clear record.",
  },
  {
    Icon: IconApi,
    title: "API authorization",
    text: "Every request is checked against the caller's permissions.",
  },
  {
    Icon: IconLock,
    title: "Encrypted sensitive information",
    text: "Sensitive rider details are encrypted and masked where shown.",
  },
];

export default function Security() {
  return (
    <section id="security" className={`section theme-light ${s.security}`} aria-labelledby="security-title">
      <div className={`container ${s.grid}`}>
        <div className={s.head}>
          <Reveal>
            <p className="eyebrow">Security</p>
          </Reveal>
          <RevealHeading id="security-title" className="display" lines={["Trust,", "built in."]} />
          <Reveal delay={0.12}>
            <p className="lead">
              Rider data is personal. Flex Riders is built so the right people see the right
              information — and nothing more.
            </p>
          </Reveal>
        </div>

        <ul className={s.items}>
          {items.map(({ Icon, title, text }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.8, ease, delay: (i % 2) * 0.08 + Math.floor(i / 2) * 0.05 }}
            >
              <span className={s.icon}>
                <Icon size={22} />
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
