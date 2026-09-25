"use client";

import Image from "next/image";
import {
  motion,
  useMotionTemplate,
  useMotionValue,

  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useReduced } from "@/lib/useReduced";
import { useRef, type ReactNode } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import avatar from "@/public/images/rider-avatar.webp";
import { useContact } from "@/components/Contact";
import { Phone, StatusPill } from "@/components/Devices";
import { IconCheck, IconPin } from "@/components/Icons";
import Logo from "@/components/Logo";
import MagneticButton from "@/components/MagneticButton";
import { HomeScreen } from "@/components/RiderScreens";
import { demoEarnings, demoRider, inr } from "@/lib/demo";
import s from "./Hero.module.css";

const ease = [0.22, 1, 0.36, 1] as const;
const enter = (delay: number, y = 24, blur = 10) => ({
  initial: { opacity: 0, y, filter: `blur(${blur}px)` },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 1.1, ease, delay },
});

export default function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduced();
  const openContact = useContact();

  // Cursor: normalized -1..1, smoothed. Drives spotlight + depth parallax.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const px = useMotionValue(-1000);
  const py = useMotionValue(-1000);
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${px}px ${py}px, rgba(46,155,250,0.10), transparent 70%)`;

  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set(e.clientX - r.left);
    py.set(e.clientY - r.top);
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  // Scroll: the ecosystem disperses and the phone drifts as the hero leaves.
  const { scrollYProgress } = useScrollProgress({ target: ref, offset: ["start start", "end start"] });
  const spread = useTransform(scrollYProgress, [0, 0.7], [0, 1]);
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -60]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.6], [1, reduce ? 1 : 0]);
  const rotY = useTransform(sx, [-1, 1], [-18, -6]);
  const rotX = useTransform(sy, [-1, 1], [8, 2]);

  return (
    <section
      ref={ref}
      id="top"
      className={`${s.hero} theme-dark`}
      aria-labelledby="hero-title"
      onPointerMove={onMove}
    >
      <motion.div className={s.spotlight} style={{ background: spotlight }} aria-hidden="true" />
      <div className={s.glow} aria-hidden="true" />

      <div className={`container ${s.grid}`}>
        <motion.div className={s.copy} style={{ y: copyY, opacity: copyOpacity }}>
          <motion.div {...enter(0.05, 12, 6)} className={s.mark}>
            <Logo height={30} wordmark={false} priority />
            <span>Flex Riders</span>
          </motion.div>

          <h1 id="hero-title" className={`display-xl ${s.title}`}>
            <motion.span {...enter(0.2, 40, 14)} className={s.line}>
              One platform.
            </motion.span>
            <motion.span {...enter(0.34, 40, 14)} className={`${s.line} blue-text`}>
              Every rider.
            </motion.span>
          </h1>

          <motion.p {...enter(0.55)} className={`lead ${s.lead}`}>
            Flex Riders brings rider registration, approvals, brand assignments and payment
            tracking into one connected platform.
          </motion.p>

          <motion.div {...enter(0.7, 16, 6)} className={s.ctas}>
            <MagneticButton onClick={() => openContact("start")} arrow>
              Get Started
            </MagneticButton>
            <MagneticButton href="#problem" variant="ghost">
              Explore Flex Riders
            </MagneticButton>
          </motion.div>

          <motion.ul {...enter(0.85, 10, 4)} className={s.audiences} aria-label="Built for">
            <li>Rider experience</li>
            <li>Operations management</li>
            <li>Brand advertising</li>
          </motion.ul>
        </motion.div>

        <motion.div
          className={s.visual}
          initial={{ opacity: 0, y: 60, scale: 0.94, filter: "blur(16px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          transition={{ duration: 1.5, ease, delay: 0.45 }}
        >
          <div className={s.orbits} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <motion.div className={s.stage} style={{ y: phoneY }}>
            <motion.div
              className={s.phoneWrap}
              style={reduce ? undefined : { rotateY: rotY, rotateX: rotX }}
            >
              <Phone
                className={s.phone}
                label="Flex Riders rider app home screen showing account status Active, today's earnings, assigned brand and latest payment (demonstration data)"
              >
                <HomeScreen />
              </Phone>
            </motion.div>
          </motion.div>

          <Chip at="profile" delay={1.0} spread={spread} sx={sx} sy={sy} depth={1.2} dir={[-1, -1]}>
            <span className="avatar" style={{ width: 34, height: 34 }}>
              <Image src={avatar} alt="" width={34} height={34} sizes="68px" />
            </span>
            <span>
              <b>{demoRider.name}</b>
              <em>{demoRider.id}</em>
            </span>
          </Chip>

          <Chip at="approved" delay={1.12} spread={spread} sx={sx} sy={sy} depth={0.7} dir={[-1, 0.2]}>
            <span className={s.okIcon}>
              <IconCheck size={14} />
            </span>
            <span>
              <b>Application approved</b>
              <em>Reviewed by operations</em>
            </span>
          </Chip>

          <Chip at="brand" delay={1.24} spread={spread} sx={sx} sy={sy} depth={1} dir={[1, -1]}>
            <span className="brand-mono" style={{ width: 34, height: 34, fontSize: 15 }}>
              A
            </span>
            <span>
              <b>Assigned to {demoRider.brand}</b>
              <em>Since {demoRider.since}</em>
            </span>
          </Chip>

          <Chip at="location" delay={1.36} spread={spread} sx={sx} sy={sy} depth={0.6} dir={[1, 0.1]}>
            <span className={s.pinIcon}>
              <IconPin size={16} />
            </span>
            <span>
              <b>{demoRider.city}</b>
              <em>{demoRider.zone} · Working location</em>
            </span>
          </Chip>

          <Chip at="payment" delay={1.48} spread={spread} sx={sx} sy={sy} depth={1.3} dir={[-1, 1]}>
            <span>
              <em>Payment · 23 Sep</em>
              <b className="num">{inr(920)}</b>
            </span>
            <StatusPill status="PAID" style={{ fontSize: 12 }} />
          </Chip>

          <Chip at="earnings" delay={1.6} spread={spread} sx={sx} sy={sy} depth={0.9} dir={[1, 1]}>
            <span>
              <em>This month</em>
              <b className={`num ${s.bigNum}`}>{inr(demoEarnings.month)}</b>
            </span>
          </Chip>
        </motion.div>
      </div>
    </section>
  );
}

type ChipProps = {
  at: "profile" | "approved" | "brand" | "location" | "payment" | "earnings";
  delay: number;
  spread: MotionValue<number>;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  depth: number;
  dir: [number, number];
  children: ReactNode;
};

function Chip({ at, delay, spread, sx, sy, depth, dir, children }: ChipProps) {
  const reduce = useReduced();
  const x = useTransform(() => (reduce ? 0 : sx.get() * 14 * depth + spread.get() * dir[0] * 90));
  const y = useTransform(() => (reduce ? 0 : sy.get() * 10 * depth + spread.get() * dir[1] * 70));
  const opacity = useTransform(spread, [0, 0.8], [1, 0]);
  return (
    <motion.div className={`${s.chip} ${s[at]}`} style={{ x, y, opacity }} aria-hidden="true">
      <motion.div
        className={s.chipInner}
        initial={{ opacity: 0, scale: 0.9, y: 16, filter: "blur(8px)" }}
        animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 120, damping: 20, delay }}
      >
        <div className={s.float} style={{ animationDelay: `${-delay * 2.3}s` }}>
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}
