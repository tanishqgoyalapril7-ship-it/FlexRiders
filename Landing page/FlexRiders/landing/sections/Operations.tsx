"use client";

import Image from "next/image";
import { motion, useInView, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import avatar from "@/public/images/rider-avatar.webp";
import markDark from "@/public/images/fr-mark-dark.png";
import { Browser, StatusPill } from "@/components/Devices";
import {
  IconBrand,
  IconChart,
  IconCheck,
  IconDoc,
  IconHistory,
  IconSearch,
  IconBell,
  IconUsers,
  IconWallet,
  IconShieldCheck,
} from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { demoRider, demoRiders } from "@/lib/demo";
import { useReduced } from "@/lib/useReduced";
import s from "./Operations.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const capabilities = [
  { Icon: IconShieldCheck, title: "Rider approvals", text: "Review applications and approve with confidence." },
  { Icon: IconBrand, title: "Brand assignments", text: "Assign riders to brands and locations." },
  { Icon: IconWallet, title: "Payment management", text: "Record, update and track every payment." },
  { Icon: IconSearch, title: "Rider search", text: "Find any rider by name, ID or phone." },
  { Icon: IconDoc, title: "Documents", text: "Rider documents, stored with the profile." },
  { Icon: IconBell, title: "Notifications", text: "Keep riders informed as their status changes." },
  { Icon: IconChart, title: "Reports", text: "See riders, assignments and payments at a glance." },
  { Icon: IconHistory, title: "Audit history", text: "A record of who changed what, and when." },
];

export default function Operations() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScrollProgress({ target: ref, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.88, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 60, 0]);

  return (
    <section id="operations" className={`section theme-light theme-paper ${s.ops}`} aria-labelledby="ops-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">For operations teams</p>
          </Reveal>
          <RevealHeading
            id="ops-title"
            className="display"
            lines={["From registration to payment.", "Everything under control."]}
          />
          <Reveal delay={0.15}>
            <p className="lead">
              One workspace for your team to approve riders, assign brands and manage payments —
              with the full history behind every decision.
            </p>
          </Reveal>
        </div>

        <div ref={ref} className={s.perspective}>
          <motion.div style={{ rotateX, scale, y }} className={s.tilt}>
            <Browser
              title="Flex Riders · Operations"
              label="Flex Riders operations workspace showing a searchable rider list with IDs, cities, brands and statuses, and a selected rider's profile and activity (demonstration data)"
            >
              <OpsUI />
            </Browser>
          </motion.div>
          <p className="demo-note">Demonstration data</p>
        </div>

        <ul className={s.caps}>
          {capabilities.map(({ Icon, title, text }, i) => (
            <motion.li
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.8, ease, delay: (i % 4) * 0.08 }}
            >
              <Icon size={26} className={s.capIcon} />
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function useTyped(text: string, start: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 110);
    return () => clearInterval(id);
  }, [start, text]);
  return text.slice(0, n);
}

function OpsUI() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const typed = useTyped("Rahul", inView);
  const nav = [
    { Icon: IconUsers, label: "Riders", on: true },
    { Icon: IconShieldCheck, label: "Approvals", badge: "12" },
    { Icon: IconBrand, label: "Brands" },
    { Icon: IconWallet, label: "Payments" },
    { Icon: IconDoc, label: "Documents" },
    { Icon: IconChart, label: "Reports" },
    { Icon: IconHistory, label: "Audit log" },
  ];
  const tabs = ["All", "Active", "Pending review", "Approved", "Registered"];

  return (
    <div ref={ref} className={s.ui}>
      <aside className={s.side}>
        <div className={s.sideBrand}>
          <Image src={markDark} alt="" width={28} height={14} />
          <span>Operations</span>
        </div>
        {nav.map(({ Icon, label, on, badge }) => (
          <div key={label} className={on ? s.navOn : s.navItem}>
            <Icon size={16} />
            <span>{label}</span>
            {badge && <em>{badge}</em>}
          </div>
        ))}
      </aside>

      <div className={s.main}>
        <div className={s.topbar}>
          <h4>Riders</h4>
          <div className={s.search}>
            <IconSearch size={14} />
            <span>
              {typed || <span className={s.placeholder}>Search by name, ID or phone</span>}
              {inView && <i className={s.caret} />}
            </span>
          </div>
        </div>
        <div className={s.tabs}>
          {tabs.map((t, i) => (
            <span key={t} className={i === 0 ? s.tabOn : undefined}>
              {t}
            </span>
          ))}
        </div>
        <div className={s.table}>
          <div className={`${s.row} ${s.thead}`}>
            <span>Rider ID</span>
            <span>Name</span>
            <span className={s.colCity}>City</span>
            <span className={s.colBrand}>Brand</span>
            <span>Status</span>
          </div>
          {demoRiders.map((r, i) => (
            <motion.div
              key={r.id}
              className={`${s.row} ${i === 0 ? s.rowOn : ""}`}
              initial={{ opacity: 0, y: 10 }}
              animate={inView ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.6, ease, delay: 0.2 + i * 0.07 }}
            >
              <span className={s.mono}>{r.id}</span>
              <span className={s.name}>
                <b>{r.name}</b>
                <em>{r.id}</em>
              </span>
              <span className={s.colCity}>{r.city}</span>
              <span className={s.colBrand}>{r.brand}</span>
              <span>
                <StatusPill status={r.status} />
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      <aside className={s.panel}>
        <div className={s.pHead}>
          <span className="avatar" style={{ width: "calc(var(--bx) * 52)", height: "calc(var(--bx) * 52)" }}>
            <Image src={avatar} alt="" width={52} height={52} sizes="104px" />
          </span>
          <div>
            <b>{demoRider.name}</b>
            <em>{demoRider.id}</em>
          </div>
        </div>
        <StatusPill status="ACTIVE" className={s.pPill} />
        <dl className={s.pKv}>
          <div>
            <dt>Brand</dt>
            <dd>{demoRider.brand}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{demoRider.city}</dd>
          </div>
          <div>
            <dt>Vehicle</dt>
            <dd>{demoRider.vehicle}</dd>
          </div>
          <div>
            <dt>Documents</dt>
            <dd>3 verified</dd>
          </div>
        </dl>
        <p className={s.pLabel}>Activity</p>
        <ol className={s.activity}>
          {[
            ["Payment marked PAID", "23 Sep"],
            [`Assigned to ${demoRider.brand}`, "14 Mar"],
            ["Application approved", "12 Mar"],
            ["Registered", "10 Mar"],
          ].map(([t, d]) => (
            <li key={t}>
              <span className={s.aDot}>
                <IconCheck size={8} />
              </span>
              <span>{t}</span>
              <em>{d}</em>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
