"use client";

import Image from "next/image";
import { motion, useTransform } from "framer-motion";
import { useRef } from "react";
import { useScrollProgress } from "@/lib/useScrollProgress";
import cover from "@/public/images/riders-cover.webp";
import { RevealHeading, Reveal } from "@/components/Reveal";
import { useReduced } from "@/lib/useReduced";
import s from "./Interlude.module.css";

/** Brand photography moment: the Flex Riders team, framed like a product shot. */
export default function Interlude() {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScrollProgress({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.5], [reduce ? 1 : 0.88, 1]);
  const radius = useTransform(scrollYProgress, [0, 0.5], [reduce ? 20 : 36, 20]);
  const imgY = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["-4%", "4%"]);

  return (
    <section ref={ref} className={`${s.interlude} theme-light`} aria-labelledby="interlude-title">
      <div className="container">
        <div className="section-head center">
          <RevealHeading id="interlude-title" className="display" lines={["Built around the rider."]} />
          <Reveal delay={0.1}>
            <p className="lead">
              Riders are the heart of every delivery network. Flex Riders gives them clarity, and
              gives your team control.
            </p>
          </Reveal>
        </div>
      </div>
      <div className={s.frameWrap}>
        <motion.div className={s.frame} style={{ scale, borderRadius: radius }}>
          <motion.div className={s.img} style={{ y: imgY }}>
            <Image
              src={cover}
              alt="Four riders in Flex Riders branded polo shirts leaning on Flex Riders branded motorcycles"
              sizes="(max-width: 767px) 150vw, (max-width: 1400px) 100vw, 1400px"
              placeholder="blur"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
