"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useContact } from "./Contact";
import styles from "./MobileActionBar.module.css";

/**
 * Phones only (CSS): both primary actions stay one tap away once the hero has scrolled off.
 * Hidden while the planner, the enquiry form or the footer is on screen, so it never covers them.
 */
export default function MobileActionBar() {
  const openContact = useContact();
  const [heroVisible, setHeroVisible] = useState(true);
  const [endVisible, setEndVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("top");
    // Also hidden over the planner, which has its own price and button.
    const ends = [document.getElementById("plan"), document.getElementById("enquiry"), document.querySelector("footer")].filter(
      (el): el is HTMLElement => !!el,
    );
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.target === hero) setHeroVisible(e.isIntersecting);
        else seen.set(e.target, e.isIntersecting);
      });
      setEndVisible([...seen.values()].some(Boolean));
    });
    if (hero) io.observe(hero);
    ends.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const show = !heroVisible && !endVisible;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={styles.bar}
          initial={{ y: "120%" }}
          animate={{ y: 0 }}
          exit={{ y: "120%" }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          <a href="#plan" className="btn btn-primary">
            Promote Your Brand
          </a>
          <button type="button" className="btn btn-ghost" onClick={() => openContact("start", "rider")}>
            Join as Rider
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
