"use client";

import { motion } from "framer-motion";
import { IconBrand, IconCamera, IconMegaphone, IconWallet } from "@/components/Icons";
import s from "./Snapshot.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const cards = [
  { Icon: IconBrand, kicker: "Brand campaigns", text: "Reach customers in a chosen area through local riders and autos." },
  { Icon: IconCamera, kicker: "Real activity", text: "Morning, evening and night photos, reviewed every campaign day." },
  { Icon: IconMegaphone, kicker: "Rider campaigns", text: "Discover open campaigns near you and in your working areas." },
  { Icon: IconWallet, kicker: "Earnings", text: "Approved days add up to earnings, with payouts to the rider's UPI." },
];

export default function Snapshot() {
  return (
    <section id="product" className={`theme-dark ${s.snapshot}`} aria-label="What Flex Riders does">
      <div className="container">
        <ul className={s.cards}>
          {cards.map(({ Icon, kicker, text }, i) => (
            <motion.li
              key={kicker}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, ease, delay: i * 0.06 }}
            >
              <span className={s.icon}>
                <Icon size={18} />
              </span>
              <h2>{kicker}</h2>
              <p>{text}</p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
