"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import riderApproved from "@/public/images/rider-approved.webp";
import { StatusPill } from "@/components/Devices";
import { IconBrand, IconCheck, IconDoc, IconHistory, IconLock, IconWallet } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { demoEarnings, demoPayments, demoRider, inr } from "@/lib/demo";
import s from "./Profile.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

function Satellite({
  side,
  delay,
  icon,
  title,
  children,
  className,
}: {
  side: "left" | "right";
  delay: number;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={[s.sat, s[side], className].filter(Boolean).join(" ")}
      initial={{ opacity: 0, x: side === "left" ? -50 : 50, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 1, ease, delay }}
    >
      <p className={s.satTitle}>
        {icon}
        {title}
      </p>
      {children}
    </motion.div>
  );
}

export default function Profile() {
  const fields = [
    ["Company", demoRider.company],
    ["Location", `${demoRider.city}, ${demoRider.zone}`],
    ["Vehicle", demoRider.vehicle],
    ["Vehicle no.", demoRider.plate],
    ["Brand", demoRider.brand],
    ["Phone", demoRider.phone],
  ];

  return (
    <section className={`section theme-light theme-paper ${s.profile}`} aria-labelledby="profile-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Rider profile</p>
          </Reveal>
          <RevealHeading
            id="profile-title"
            className="display"
            lines={["One rider.", "One complete profile."]}
          />
          <Reveal delay={0.12}>
            <p className="lead">
              Everything about a rider, connected — identity, documents, assignment, status and
              payments. Sensitive details stay masked.
            </p>
          </Reveal>
        </div>

        <div
          className={s.board}
          role="img"
          aria-label="Rider profile for Rahul Sharma, SR-000145, status Active, with connected documents, assignment, status history and payments (demonstration data)"
        >
          <div className={s.col} aria-hidden="true">
            <Satellite side="left" delay={0.25} icon={<IconDoc size={15} />} title="Documents">
              <ul className={s.docs}>
                {["Driving licence", "ID proof", "Vehicle RC"].map((d) => (
                  <li key={d}>
                    <span>{d}</span>
                    <em>
                      <IconCheck size={11} /> Verified
                    </em>
                  </li>
                ))}
              </ul>
              <p className={s.private}>
                <IconLock size={13} /> Visible to authorised team members only
              </p>
            </Satellite>
            <Satellite side="left" delay={0.4} icon={<IconHistory size={15} />} title="Status history">
              <ol className={s.states}>
                {["REGISTERED", "APPROVED", "BRAND ASSIGNED", "ACTIVE"].map((st) => (
                  <li key={st}>
                    <StatusPill status={st} />
                  </li>
                ))}
              </ol>
            </Satellite>
          </div>

          <motion.article
            className={s.card}
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 1.1, ease }}
            aria-hidden="true"
          >
            <div className={s.photo}>
              <Image
                src={riderApproved}
                alt=""
                sizes="(max-width: 767px) 90vw, 380px"
                style={{ width: "100%", height: "auto" }}
              />
            </div>
            <div className={s.identity}>
              <div>
                <h3>{demoRider.name}</h3>
                <p className="num">{demoRider.id}</p>
              </div>
              <StatusPill status="ACTIVE" />
            </div>
            <dl className={s.fields}>
              {fields.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </motion.article>

          <div className={s.col} aria-hidden="true">
            <Satellite side="right" delay={0.3} icon={<IconBrand size={15} />} title="Assignment">
              <div className={s.assign}>
                <span className="brand-mono" style={{ width: 38, height: 38, fontSize: 16 }}>
                  A
                </span>
                <div>
                  <b>{demoRider.brand}</b>
                  <em>
                    {demoRider.city} · since {demoRider.since}
                  </em>
                </div>
              </div>
            </Satellite>
            <Satellite side="right" delay={0.45} icon={<IconWallet size={15} />} title="Payments">
              <p className={s.payTotal}>
                <span>This month</span>
                <b className="num">{inr(demoEarnings.month)}</b>
              </p>
              <ul className={s.pays}>
                {demoPayments.slice(0, 3).map((p) => (
                  <li key={p.txn}>
                    <span>{p.date}</span>
                    <b className="num">{inr(p.amount)}</b>
                    <StatusPill status={p.status} />
                  </li>
                ))}
              </ul>
            </Satellite>
          </div>
        </div>
        <p className="demo-note">Demonstration data</p>
      </div>
    </section>
  );
}
