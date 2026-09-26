"use client";

import Image from "next/image";
import { motion, useTransform } from "framer-motion";
import { useRef } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import markLight from "@/public/images/fr-mark-light.png";
import EnquiryForm from "@/components/EnquiryForm";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { useReduced } from "@/lib/useReduced";
import s from "./FinalCTA.module.css";

export default function FinalCTA() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScrollProgress({ target: ref, offset: ["start end", "end end"] });
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 1.25, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [0, 0.09]);

  return (
    <section ref={ref} id="enquiry" className={`theme-dark ${s.cta}`} aria-labelledby="cta-title">
      <motion.div className={s.mark} style={{ scale, opacity }} aria-hidden="true">
        <Image src={markLight} alt="" sizes="(max-width: 767px) 120vw, 1100px" />
      </motion.div>
      <div className={s.glow} aria-hidden="true" />

      <div className={`container ${s.inner}`}>
        <RevealHeading
          id="cta-title"
          className={`display-xl ${s.title}`}
          lines={["Want to promote", <span key="o" className="blue-text">your brand?</span>]}
        />
        <Reveal delay={0.15}>
          <p className={`lead ${s.lead}`}>Tell us about your campaign and our team will get in touch with you.</p>
        </Reveal>
        <Reveal delay={0.25} className={s.form}>
          <EnquiryForm role="business" intent="advertise" />
        </Reveal>
      </div>
    </section>
  );
}
