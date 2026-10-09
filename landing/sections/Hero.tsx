"use client";

import { motion } from "framer-motion";
import { Phone } from "@/components/Devices";
import { DiscoverScreen } from "@/components/AppScreens";
import { useContact } from "@/components/Contact";
import { IconCamera, IconCheck, IconClock } from "@/components/Icons";
import Logo from "@/components/Logo";
import MagneticButton from "@/components/MagneticButton";
import s from "./Hero.module.css";

const ease = [0.22, 1, 0.36, 1] as const;
const enter = (delay: number, y = 20) => ({
  initial: { opacity: 0, y },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, ease, delay },
});

const trust = ["Campaigns approved by our team", "Verified riders", "Photo-checked every day"];

export default function Hero() {
  const openContact = useContact();

  return (
    <section id="top" className={`${s.hero} theme-dark`} aria-labelledby="hero-title">
      <div className={s.glow} aria-hidden="true" />

      <div className={`container ${s.grid}`}>
        <div className={s.copy}>
          <motion.div {...enter(0.05, 10)} className={s.mark}>
            <Logo height={22} wordmark={false} priority />
            <span>Flex Riders</span>
          </motion.div>

          <motion.h1 {...enter(0.15, 28)} id="hero-title" className={s.title}>
            Turn everyday rides into <span className="blue-text">brand visibility.</span>
          </motion.h1>

          <motion.p {...enter(0.28)} className={`lead ${s.lead}`}>
            Brands get seen street by street in the areas they choose. Riders on cycles, bikes, autos
            and three-wheelers earn a daily rate for every campaign day they complete.
          </motion.p>

          <motion.div {...enter(0.4, 14)} className={s.ctas}>
            <MagneticButton onClick={() => openContact("start", "rider")} arrow>
              Join as Rider
            </MagneticButton>
            <MagneticButton href="#enquiry" variant="ghost">
              Promote Your Brand
            </MagneticButton>
          </motion.div>

          <motion.ul {...enter(0.52, 10)} className={s.trust} aria-label="Why Flex Riders">
            {trust.map((t) => (
              <li key={t}>
                <IconCheck size={13} />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          className={s.visual}
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, ease, delay: 0.3 }}
        >
          <div className={s.rings} aria-hidden="true">
            <span />
            <span />
          </div>
          <Phone
            className={s.phone}
            label="Flex Riders rider app Campaigns screen: a map with a campaign's reach radius, Near You, Opening Soon and My Areas filters, and nearby campaign cards with daily payout and open slots (demonstration data)"
          >
            <DiscoverScreen animated />
          </Phone>

          <motion.div
            className={`${s.chip} ${s.chipA}`}
            aria-hidden="true"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease, delay: 2.0 }}
          >
            <span className={s.chipIconWarn}>
              <IconClock size={15} />
            </span>
            <span>
              <b>Opening Soon</b>
              <em>Starts in 18h · 3 slots</em>
            </span>
          </motion.div>
          <motion.div
            className={`${s.chip} ${s.chipB}`}
            aria-hidden="true"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease, delay: 2.8 }}
          >
            <span className={s.chipIconOk}>
              <IconCamera size={15} />
            </span>
            <span>
              <b>Morning photo approved</b>
              <em>Day 7 · streak on track</em>
            </span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
