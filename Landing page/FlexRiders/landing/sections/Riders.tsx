"use client";

import { AnimatePresence, motion, useMotionValueEvent } from "framer-motion";
import { useRef, useState } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import { Phone } from "@/components/Devices";
import { Reveal, RevealHeading } from "@/components/Reveal";
import {
  ApprovedScreen,
  BrandScreen,
  HistoryScreen,
  PaymentScreen,
  RegisterScreen,
} from "@/components/RiderScreens";
import { scrollToProgress } from "@/lib/scroll";
import { useReduced } from "@/lib/useReduced";
import s from "./Riders.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const chapters = [
  {
    key: "register",
    title: "Simple registration.",
    text: "Riders create their profile and upload documents in a few guided steps.",
    Screen: RegisterScreen,
    alt: "Registration screen: step 3 of 4 with name, mobile, city, vehicle and uploaded documents",
  },
  {
    key: "approved",
    title: "Know where you stand.",
    text: "Account status is always visible — from under review to approved.",
    Screen: ApprovedScreen,
    alt: "Approval screen confirming the rider's application has been approved",
  },
  {
    key: "brand",
    title: "Your brand. Your location.",
    text: "See the assigned brand, working location and assignment date at a glance.",
    Screen: BrandScreen,
    alt: "Assignment screen showing Brand A, working location Gurugram, and a notification",
  },
  {
    key: "payment",
    title: "Earnings, clearly.",
    text: "Today's earnings, this month's total and the latest payment status.",
    Screen: PaymentScreen,
    alt: "Earnings screen showing today ₹850, this month ₹18,450 and a paid payment with transaction ID",
  },
  {
    key: "history",
    title: "Every payment, on record.",
    text: "A complete payment history, with status on every entry.",
    Screen: HistoryScreen,
    alt: "Payment history list with dates, amounts and paid or processing status",
  },
];

const extras = ["Profile", "Documents", "Notifications", "Account status"];

export default function Riders() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const [active, setActive] = useState(0);
  const { scrollYProgress: p } = useScrollProgress({ target: trackRef, offset: ["start start", "end end"] });

  useMotionValueEvent(p, "change", (v) => {
    const i = Math.min(chapters.length - 1, Math.max(0, Math.floor(v * chapters.length * 0.999)));
    setActive((prev) => (prev === i ? prev : i));
  });

  const go = (i: number) =>
    trackRef.current && scrollToProgress(trackRef.current, (i + 0.5) / chapters.length);

  return (
    <section id="riders" className={`${s.riders} theme-light`} aria-labelledby="riders-title">
      <div className={`container ${s.head}`}>
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">For riders</p>
          </Reveal>
          <RevealHeading
            id="riders-title"
            className="display"
            lines={["Everything a rider needs.", "In one place."]}
          />
          <Reveal delay={0.15}>
            <p className="lead">
              A clear, simple app that keeps riders informed — from the first form to the latest
              payment.
            </p>
          </Reveal>
        </div>
      </div>

      {reduce ? (
        <div className={`container ${s.staticGrid}`}>
          {chapters.map((c) => (
            <figure key={c.key} className={s.staticItem}>
              <Phone className={s.staticPhone} label={`${c.alt} (demonstration data)`}>
                <c.Screen />
              </Phone>
              <figcaption>
                <b>{c.title}</b> {c.text}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div ref={trackRef} className={s.track} style={{ height: `${chapters.length * 70 + 30}vh` }}>
          <div className={s.sticky}>
            <div className={`container ${s.grid}`}>
              <ol className={s.list}>
                {chapters.map((c, i) => (
                  <li key={c.key} data-on={i === active}>
                    <button onClick={() => go(i)} aria-current={i === active ? "step" : undefined}>
                      <span className={s.bar} aria-hidden="true">
                        <motion.i
                          initial={false}
                          animate={{ scaleY: i === active ? 1 : 0 }}
                          transition={{ duration: 0.6, ease }}
                        />
                      </span>
                      <span className={s.itemTitle}>{c.title}</span>
                      <span className={s.itemText}>{c.text}</span>
                    </button>
                  </li>
                ))}
                <li className={s.extras} aria-label="Also in the rider app">
                  {extras.map((e) => (
                    <span key={e}>{e}</span>
                  ))}
                </li>
              </ol>

              <div className={s.device}>
                <div className={s.halo} aria-hidden="true" />
                <Phone className={s.phone} label={`${chapters[active].alt} (demonstration data)`}>
                  {chapters.map((c, i) => (
                    <motion.div
                      key={c.key}
                      className={s.screenLayer}
                      initial={false}
                      animate={{
                        opacity: i === active ? 1 : 0,
                        y: i === active ? 0 : i < active ? -24 : 24,
                        scale: i === active ? 1 : 0.98,
                      }}
                      transition={{ duration: 0.7, ease }}
                      aria-hidden={i !== active}
                    >
                      <c.Screen />
                    </motion.div>
                  ))}
                </Phone>
              </div>

              {/* Mobile caption */}
              <div className={s.mobileCaption} aria-hidden="true">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={active}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.35, ease }}
                  >
                    <b>{chapters[active].title}</b>
                    <p>{chapters[active].text}</p>
                  </motion.div>
                </AnimatePresence>
                <div className={s.dots}>
                  {chapters.map((c, i) => (
                    <i key={c.key} data-on={i === active} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
