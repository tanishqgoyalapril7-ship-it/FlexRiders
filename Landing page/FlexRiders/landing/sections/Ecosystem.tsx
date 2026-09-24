"use client";

import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,

  useTransform,
} from "framer-motion";
import { useRef, useState, type ReactNode } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import avatar from "@/public/images/rider-avatar.webp";
import { StatusPill } from "@/components/Devices";
import { IconCheck, IconDoc, IconPin } from "@/components/Icons";
import { RevealHeading, Reveal } from "@/components/Reveal";
import { demoEarnings, demoRider, inr } from "@/lib/demo";
import { scrollToProgress } from "@/lib/scroll";
import { useReduced } from "@/lib/useReduced";
import s from "./Ecosystem.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

type Step = { key: string; label: string; title: string; text: string; visual: ReactNode };

const steps: Step[] = [
  {
    key: "register",
    label: "Register",
    title: "Register",
    text: "Riders sign up from their phone with their details and documents. No paper. No chasing.",
    visual: <RegisterVisual />,
  },
  {
    key: "verify",
    label: "Verify",
    title: "Verify",
    text: "Your operations team reviews every application — details and documents — before anyone is approved.",
    visual: <VerifyVisual />,
  },
  {
    key: "assign",
    label: "Assign",
    title: "Assign",
    text: "Approved riders are matched to the right brand and working location.",
    visual: <AssignVisual />,
  },
  {
    key: "work",
    label: "Work",
    title: "Work",
    text: "Riders work for their assigned brand, with status and details always current for both sides.",
    visual: <WorkVisual />,
  },
  {
    key: "paid",
    label: "Get paid",
    title: "Get paid",
    text: "Payments are recorded against the rider and the brand — with status, reference and history.",
    visual: <PaidVisual />,
  },
];

export default function Ecosystem() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const [active, setActive] = useState(0);
  const { scrollYProgress: p } = useScrollProgress({ target: trackRef, offset: ["start start", "end end"] });
  const fill = useTransform(p, [0.02, 0.9], [0, 1]);

  useMotionValueEvent(p, "change", (v) => {
    const i = Math.min(steps.length - 1, Math.max(0, Math.floor(v * steps.length * 0.999)));
    setActive((prev) => (prev === i ? prev : i));
  });

  return (
    <section id="product" className={`${s.eco} theme-dark`} aria-labelledby="eco-title">
      <div className={`container ${s.head}`}>
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">The Flex Riders ecosystem</p>
          </Reveal>
          <RevealHeading
            id="eco-title"
            className="display"
            lines={["One connected journey.", <span key="b" className="metal-text">From sign‑up to payout.</span>]}
          />
          <Reveal delay={0.15}>
            <p className="lead">
              Every stage of a rider&apos;s lifecycle lives in the same place — so nothing falls
              between the cracks.
            </p>
          </Reveal>
        </div>
      </div>

      {reduce ? (
        <div className="container">
          <ol className={s.staticList}>
            {steps.map((st, i) => (
              <li key={st.key} className={s.staticItem}>
                <StepText step={st} i={i} />
                <div className={s.visualBox}>{st.visual}</div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div ref={trackRef} className={s.track} style={{ height: `${steps.length * 75 + 25}vh` }}>
          <div className={s.sticky}>
            <div className={`container ${s.stickyInner}`}>
              <nav className={s.rail} aria-label="Lifecycle stages">
                <div className={s.railLine} aria-hidden="true">
                  <motion.i style={{ scaleX: fill }} />
                </div>
                <ol>
                  {steps.map((st, i) => (
                    <li key={st.key}>
                      <button
                        className={s.node}
                        data-state={i < active ? "done" : i === active ? "on" : "off"}
                        aria-current={i === active ? "step" : undefined}
                        onClick={() =>
                          trackRef.current &&
                          scrollToProgress(trackRef.current, (i + 0.5) / steps.length)
                        }
                      >
                        <span className={s.dot}>
                          {i < active ? <IconCheck size={12} /> : String(i + 1).padStart(2, "0")}
                        </span>
                        <span className={s.nodeLabel}>{st.label}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>

              <div className={s.stage} aria-live="polite">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={active}
                    className={s.stageGrid}
                    initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -30, filter: "blur(10px)" }}
                    transition={{ duration: 0.6, ease }}
                  >
                    <StepText step={steps[active]} i={active} />
                    <div className={s.visualBox}>{steps[active].visual}</div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StepText({ step, i }: { step: Step; i: number }) {
  return (
    <div className={s.text}>
      <span className={s.bigNo}>{String(i + 1).padStart(2, "0")}</span>
      <h3 className={s.stepTitle}>{step.title}</h3>
      <p className={s.stepText}>{step.text}</p>
    </div>
  );
}

/* ---------------- Stage visuals (demonstration data) ---------------- */

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={[s.card, className].filter(Boolean).join(" ")} aria-hidden="true">
      {children}
    </div>
  );
}

function RegisterVisual() {
  return (
    <Card>
      <div className={s.cardHead}>
        <span>New rider application</span>
        <StatusPill status="REGISTERED" />
      </div>
      <dl className={s.kv}>
        {[
          ["Full name", demoRider.name],
          ["Mobile", demoRider.phone],
          ["City", demoRider.city],
          ["Vehicle", demoRider.vehicle],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className={s.chips}>
        <span>
          <IconDoc size={14} /> Driving licence
        </span>
        <span>
          <IconDoc size={14} /> ID proof
        </span>
        <span>
          <IconDoc size={14} /> Vehicle RC
        </span>
      </div>
    </Card>
  );
}

function VerifyVisual() {
  return (
    <Card>
      <div className={s.cardHead}>
        <span>Review · {demoRider.id}</span>
        <StatusPill status="PENDING REVIEW" />
      </div>
      <ul className={s.checks}>
        {["Personal details", "Driving licence", "ID proof", "Vehicle RC"].map((d, i) => (
          <motion.li
            key={d}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.18 }}
          >
            <span>{d}</span>
            <motion.em
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.35 + i * 0.18, type: "spring", stiffness: 400, damping: 20 }}
            >
              <IconCheck size={11} /> Checked
            </motion.em>
          </motion.li>
        ))}
      </ul>
      <div className={s.actions}>
        <span className={s.btnPrimary}>Approve rider</span>
        <span className={s.btnGhost}>Request changes</span>
      </div>
    </Card>
  );
}

function AssignVisual() {
  return (
    <Card className={s.assignCard}>
      <div className={s.assignRow}>
        <div className={s.entity}>
          <span className="avatar" style={{ width: 52, height: 52 }}>
            <Image src={avatar} alt="" width={52} height={52} sizes="104px" />
          </span>
          <b>{demoRider.name}</b>
          <em>{demoRider.id}</em>
        </div>
        <svg className={s.link} viewBox="0 0 120 20" aria-hidden="true">
          <motion.path
            d="M2 10 H118"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease, delay: 0.2 }}
          />
          <motion.circle
            r="3.5"
            cy="10"
            initial={{ cx: 2, opacity: 0 }}
            animate={{ cx: 118, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.4, ease, delay: 0.5, repeat: Infinity, repeatDelay: 0.8 }}
          />
        </svg>
        <div className={s.entity}>
          <span className="brand-mono" style={{ width: 52, height: 52, fontSize: 22 }}>
            A
          </span>
          <b>{demoRider.brand}</b>
          <em>{demoRider.city}</em>
        </div>
      </div>
      <div className={s.cardFoot}>
        <span>Assigned {demoRider.since}</span>
        <StatusPill status="BRAND ASSIGNED" />
      </div>
    </Card>
  );
}

function WorkVisual() {
  return (
    <Card className={s.workCard}>
      <div className={s.map} aria-hidden="true">
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <g stroke="rgba(255,255,255,0.08)" strokeWidth="1" fill="none">
            {Array.from({ length: 11 }).map((_, i) => (
              <path key={`v${i}`} d={`M${i * 40} 0 V200`} />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <path key={`h${i}`} d={`M0 ${i * 40} H400`} />
            ))}
          </g>
          <path d="M-10 150 C 90 120, 160 170, 240 110 S 360 60, 420 80" stroke="rgba(46,155,250,0.35)" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M120 -10 C 140 60, 110 120, 150 210" stroke="rgba(255,255,255,0.12)" strokeWidth="4" fill="none" />
        </svg>
        <span className={s.pin}>
          <IconPin size={18} />
        </span>
        <span className={s.pulse} />
      </div>
      <div className={s.workInfo}>
        <div>
          <em>Working location</em>
          <b>
            {demoRider.city} · {demoRider.zone}
          </b>
        </div>
        <div>
          <em>Brand</em>
          <b>{demoRider.brand}</b>
        </div>
        <StatusPill status="ACTIVE" />
      </div>
    </Card>
  );
}

function PaidVisual() {
  return (
    <Card>
      <div className={s.cardHead}>
        <span>Payment · 23 Sep</span>
        <StatusPill status="PAID" />
      </div>
      <p className={`${s.amount} num`}>{inr(920)}</p>
      <dl className={s.kv}>
        <div>
          <dt>Rider</dt>
          <dd>
            {demoRider.name} · {demoRider.id}
          </dd>
        </div>
        <div>
          <dt>Brand</dt>
          <dd>{demoRider.brand}</dd>
        </div>
        <div>
          <dt>Transaction ID</dt>
          <dd className="num">{demoEarnings.txn}</dd>
        </div>
        <div>
          <dt>This month</dt>
          <dd className="num">{inr(demoEarnings.month)}</dd>
        </div>
      </dl>
    </Card>
  );
}
