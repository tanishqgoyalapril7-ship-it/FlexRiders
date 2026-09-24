"use client";

import Image from "next/image";
import {
  animate,
  motion,
  useInView,
  useMotionValueEvent,

  useTransform,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import avatar from "@/public/images/rider-avatar.webp";
import { StatusPill } from "@/components/Devices";
import { IconBell, IconCheck } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { demoEarnings, demoPayments, demoRider, inr } from "@/lib/demo";
import { useReduced } from "@/lib/useReduced";
import s from "./Payments.module.css";

function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReduced();
  const [n, setN] = useState(value);
  const started = useRef(false);

  // Server markup shows the real figure; once hydrated (and still off-screen), reset to 0 for the count.
  useEffect(() => {
    if (reduce) setN(value);
    else if (!started.current) setN(0);
  }, [reduce, value]);

  useEffect(() => {
    if (!inView || reduce || started.current) return;
    started.current = true;
    const c = animate(0, value, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => c.stop();
  }, [inView, reduce, value]);

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {inr(n)}
    </span>
  );
}

export default function Payments() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScrollProgress({ target: stageRef, offset: ["start end", "end start"] });
  const sideY = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 70, reduce ? 0 : -50]);
  const midY = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 30, reduce ? 0 : -30]);

  return (
    <section id="payments" className={`section theme-dark ${s.payments}`} aria-labelledby="payments-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Payments</p>
          </Reveal>
          <RevealHeading
            id="payments-title"
            className="display"
            lines={["Payments without", <span key="g" className="metal-text">the guesswork.</span>]}
          />
          <Reveal delay={0.12}>
            <p className="lead">
              Every payment is recorded against the rider and the brand they worked for — with its
              status, transaction reference and full history in one place.
            </p>
          </Reveal>
        </div>

        <div
          ref={stageRef}
          className={s.stage}
          role="img"
          aria-label="Payment views: today's earnings ₹850 and this month ₹18,450; latest payment marked PAID with transaction ID TXN123456789; and a payment history list (demonstration data)"
        >
          <motion.div className={`${s.card} ${s.status}`} style={{ y: sideY }} aria-hidden="true">
            <div className={s.cardHead}>
              <span>Latest payment</span>
              <StatusPill status="PAID" />
            </div>
            <p className={`${s.amountMd} num`}>{inr(920)}</p>
            <dl className={s.kv}>
              <div>
                <dt>Transaction ID</dt>
                <dd className="num">{demoEarnings.txn}</dd>
              </div>
              <div>
                <dt>Brand</dt>
                <dd>{demoRider.brand}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>23 Sep 2026</dd>
              </div>
            </dl>
            <p className={s.notified}>
              <IconBell size={14} /> Rider notified
            </p>
          </motion.div>

          <motion.div className={`${s.card} ${s.earn}`} style={{ y: midY }} aria-hidden="true">
            <div className={s.earnHead}>
              <span className="avatar" style={{ width: 40, height: 40 }}>
                <Image src={avatar} alt="" width={40} height={40} sizes="80px" />
              </span>
              <div>
                <b>{demoRider.name}</b>
                <em>
                  {demoRider.id} · {demoRider.brand}
                </em>
              </div>
            </div>
            <p className={s.label}>Today&apos;s earnings</p>
            <CountUp value={demoEarnings.today} className={s.amountXl} />
            <div className={s.divider} />
            <div className={s.earnRow}>
              <div>
                <p className={s.label}>This month</p>
                <CountUp value={demoEarnings.month} className={s.amountLg} />
              </div>
              <div className={s.earnRight}>
                <p className={s.label}>Payment status</p>
                <StatusPill status="PAID" className={s.pillLg} />
              </div>
            </div>
          </motion.div>

          <motion.div className={`${s.card} ${s.history}`} style={{ y: sideY }} aria-hidden="true">
            <div className={s.cardHead}>
              <span>Payment history</span>
              <em className={s.month}>September</em>
            </div>
            <ul className={s.hList}>
              {demoPayments.slice(0, 5).map((p) => (
                <li key={p.txn}>
                  <div>
                    <b>{p.date}</b>
                    <em className="num">{p.txn}</em>
                  </div>
                  <div className={s.hRight}>
                    <b className="num">{inr(p.amount)}</b>
                    <StatusPill status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
        <p className="demo-note">Demonstration data</p>

        <PaymentFlow />
      </div>
    </section>
  );
}

const flow = [
  { key: "created", title: "Payment created", text: "Recorded against the rider and brand." },
  { key: "processing", title: "Processing", text: "Status tracked as it moves." },
  { key: "provider", title: "Payment provider", text: "Your chosen provider handles the transfer.", modular: true },
  { key: "confirmed", title: "Transaction confirmed", text: "Reference saved to the record." },
  { key: "paid", title: "PAID", text: "Status updated for everyone.", success: true },
  { key: "notified", title: "Rider notified", text: "The rider sees it in their app.", success: true },
];

function PaymentFlow() {
  const ref = useRef<HTMLOListElement>(null);
  const reduce = useReduced();
  const [reached, setReached] = useState(-1);
  const { scrollYProgress: p } = useScrollProgress({ target: ref, offset: ["start 85%", "end 45%"] });
  const fill = useTransform(p, [0, 1], [0, 1]);

  useMotionValueEvent(p, "change", (v) => {
    setReached(Math.min(flow.length - 1, Math.floor(v * flow.length * 0.999 + 0.3) - 1));
  });
  const current = reduce ? flow.length - 1 : reached;

  return (
    <div className={s.flowWrap}>
      <div className={s.flowHead}>
        <h3 className="headline">How a payment moves.</h3>
        <p className={s.flowLead}>
          Flex Riders manages and tracks each payment from start to finish. The transfer itself runs
          through the payment provider you connect — so you can use the one that suits your business.
        </p>
      </div>

      <ol ref={ref} className={s.flow}>
        <span className={s.flowTrack} aria-hidden="true">
          <motion.i style={{ scaleX: reduce ? 1 : fill }} className={s.flowFillX} />
          <motion.i style={{ scaleY: reduce ? 1 : fill }} className={s.flowFillY} />
        </span>
        {flow.map((f, i) => (
          <li
            key={f.key}
            data-state={i <= current ? "on" : "off"}
            data-success={f.success ? "true" : undefined}
            data-modular={f.modular ? "true" : undefined}
          >
            <span className={s.fNode} aria-hidden="true">
              {i <= current ? <IconCheck size={13} /> : <i />}
            </span>
            <div>
              <p className={s.fTitle}>{f.title}</p>
              <p className={s.fText}>{f.text}</p>
              {f.modular && <span className={s.modTag}>Modular</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
