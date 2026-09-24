"use client";

import {
  motion,

  useTransform,
  type MotionValue,
} from "framer-motion";
import { useRef, type ReactNode } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import { useReduced } from "@/lib/useReduced";
import { IconCheck } from "@/components/Icons";
import Logo from "@/components/Logo";
import s from "./Problem.module.css";

type Fragment = {
  key: string;
  label: string;
  /** Resting centre position (% of stage) and tilt for the "messy" state. */
  x: number;
  y: number;
  r: number;
  body: ReactNode;
};

const fragments: Fragment[] = [
  {
    key: "form",
    label: "Paper registration",
    x: 22,
    y: 20,
    r: -6,
    body: (
      <div className={s.paper}>
        <i style={{ width: "70%" }} />
        <i style={{ width: "92%" }} />
        <i style={{ width: "55%" }} />
        <span className={s.scribble}>Name? Licence no.?</span>
      </div>
    ),
  },
  {
    key: "chat",
    label: "Chat threads",
    x: 80,
    y: 14,
    r: 4,
    body: (
      <div className={s.chat}>
        <p className={s.bubbleIn}>Please resend your licence photo</p>
        <p className={s.bubbleOut}>Sent yesterday?</p>
        <p className={s.bubbleIn}>Can&apos;t find it. One more time 🙏</p>
      </div>
    ),
  },
  {
    key: "sheet",
    label: "Spreadsheets",
    x: 50,
    y: 42,
    r: -2,
    body: (
      <div className={s.sheet}>
        {["Name", "Brand", "Paid?", "Rahul S.", "A?", "??", "Aman V.", "B", "—", "Priya N.", "", "pending"].map(
          (c, i) => (
            <span key={i} className={c.includes("?") || c === "pending" ? s.cellWarn : undefined}>
              {c}
            </span>
          ),
        )}
      </div>
    ),
  },
  {
    key: "approve",
    label: "Manual approvals",
    x: 17,
    y: 68,
    r: 5,
    body: (
      <div className={s.note}>
        Approve Priya?
        <br />
        <span>— ask ops again</span>
      </div>
    ),
  },
  {
    key: "pay",
    label: "Payment records",
    x: 84,
    y: 62,
    r: -5,
    body: (
      <div className={s.ledger}>
        <p>
          <span>Rahul — Sept</span>
          <b>₹ ?</b>
        </p>
        <p>
          <span>Aman — Sept</span>
          <b>paid?</b>
        </p>
        <p>
          <span>Txn ref</span>
          <b>missing</b>
        </p>
      </div>
    ),
  },
  {
    key: "follow",
    label: "Follow-ups",
    x: 54,
    y: 86,
    r: 3,
    body: (
      <div className={s.follow}>
        <b>3 missed calls</b>
        <span>&ldquo;When will I get assigned?&rdquo;</span>
      </div>
    ),
  },
];

const connected = [
  "Registration",
  "Documents",
  "Approval",
  "Brand assignment",
  "Payments",
  "Payment history",
];

export default function Problem() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduced();
  const { scrollYProgress: p } = useScrollProgress({ target: ref, offset: ["start start", "end end"] });

  const messyCaption = useTransform(p, [0.3, 0.42], [1, 0]);
  const cleanCaption = useTransform(p, [0.5, 0.62], [0, 1]);
  const pathDraw = useTransform(p, [0, 0.28], [0.15, 1]);
  const pathFade = useTransform(p, [0.3, 0.45], [1, 0]);
  const cardScale = useTransform(p, [0.45, 0.72], [0.86, 1]);
  const cardOpacity = useTransform(p, [0.45, 0.62], [0, 1]);
  const cardBlur = useTransform(p, [0.45, 0.66], [16, 0]);
  const cardFilter = useTransform(cardBlur, (b) => `blur(${b}px)`);

  if (reduce) return <ProblemStatic />;

  return (
    <section ref={ref} id="problem" className={`${s.problem} theme-light`} aria-labelledby="problem-title">
      <div className={s.sticky}>
        <div className={`container ${s.inner}`}>
          <header className={s.head}>
            <h2 id="problem-title" className="display">
              Rider operations
              <br />
              shouldn&apos;t be complicated.
            </h2>
            <div className={s.captions}>
              <motion.p className="lead" style={{ opacity: messyCaption }}>
                Today, a single rider moves through forms, chats, spreadsheets and phone calls.
              </motion.p>
              <motion.p className="lead" style={{ opacity: cleanCaption }}>
                <strong>With Flex Riders, it&apos;s one connected system.</strong> Every step, every
                record, in one place.
              </motion.p>
            </div>
          </header>

          <div className={s.stage}>
            <svg className={s.tangle} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <motion.path
                d="M18 18 C 50 0, 60 30, 76 14 S 40 50, 48 40 S 10 60, 14 66 S 60 90, 50 80 S 90 70, 82 58"
                style={{ pathLength: pathDraw, opacity: pathFade }}
              />
            </svg>

            {fragments.map((f, i) => (
              <FragmentCard key={f.key} f={f} i={i} p={p} />
            ))}

            <motion.div
              className={s.system}
              style={{ scale: cardScale, opacity: cardOpacity, filter: cardFilter }}
            >
              <div className={s.systemHead}>
                <Logo tone="dark" height={20} />
                <span className={s.systemTag}>One connected system</span>
              </div>
              <ol className={s.systemList}>
                {connected.map((c, i) => (
                  <SystemRow key={c} label={c} i={i} p={p} />
                ))}
              </ol>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FragmentCard({ f, i, p }: { f: Fragment; i: number; p: MotionValue<number> }) {
  // Drift slightly while messy, then converge to the centre and dissolve.
  const start = 0.3 + i * 0.015;
  const end = 0.56 + i * 0.012;
  const left = useTransform(p, [start, end], [`${f.x}%`, "50%"]);
  const top = useTransform(p, [start, end], [`${f.y}%`, "50%"]);
  const rotate = useTransform(p, [0, start, end], [f.r * 1.4, f.r, 0]);
  const scale = useTransform(p, [start, end], [1, 0.55]);
  const opacity = useTransform(p, [end - 0.08, end], [1, 0]);
  const drift = useTransform(p, [0, start], [16 * (i % 2 ? 1 : -1), 0]);
  return (
    <motion.figure
      className={s.frag}
      style={{ left, top, rotate, scale, opacity, y: drift }}
      aria-hidden="true"
    >
      <figcaption>{f.label}</figcaption>
      {f.body}
    </motion.figure>
  );
}

function SystemRow({ label, i, p }: { label: string; i: number; p: MotionValue<number> }) {
  const a = 0.6 + i * 0.045;
  const opacity = useTransform(p, [a, a + 0.06], [0.25, 1]);
  const x = useTransform(p, [a, a + 0.06], [-8, 0]);
  const check = useTransform(p, [a + 0.03, a + 0.07], [0, 1]);
  return (
    <motion.li style={{ opacity, x }}>
      <span className={s.stepNo}>{String(i + 1).padStart(2, "0")}</span>
      <span>{label}</span>
      <motion.span className={s.stepOk} style={{ opacity: check, scale: check }}>
        <IconCheck size={12} />
      </motion.span>
    </motion.li>
  );
}

/** Reduced-motion version: before and after, side by side, no scroll choreography. */
function ProblemStatic() {
  return (
    <section id="problem" className={`section theme-light`} aria-labelledby="problem-title">
      <div className="container">
        <header className={s.head}>
          <h2 id="problem-title" className="display">
            Rider operations
            <br />
            shouldn&apos;t be complicated.
          </h2>
          <p className="lead" style={{ marginTop: 20 }}>
            Forms, chats, spreadsheets and phone calls — replaced by{" "}
            <strong>one connected system.</strong>
          </p>
        </header>
        <div className={s.staticGrid}>
          <ul className={s.staticMess}>
            {fragments.map((f) => (
              <li key={f.key}>{f.label}</li>
            ))}
          </ul>
          <div className={`${s.system} ${s.systemStatic}`}>
            <div className={s.systemHead}>
              <Logo tone="dark" height={20} />
              <span className={s.systemTag}>One connected system</span>
            </div>
            <ol className={s.systemList}>
              {connected.map((c, i) => (
                <li key={c}>
                  <span className={s.stepNo}>{String(i + 1).padStart(2, "0")}</span>
                  <span>{c}</span>
                  <span className={s.stepOk}>
                    <IconCheck size={12} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
