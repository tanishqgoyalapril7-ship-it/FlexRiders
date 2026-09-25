"use client";

import Image from "next/image";
import { motion, useTransform } from "framer-motion";
import { useRef, type ReactNode } from "react";
import autoAd from "@/public/images/auto-advertising.webp";
import { ContactButton } from "@/components/Contact";
import { StatusPill } from "@/components/Devices";
import { IconBike, IconBrand, IconCheck, IconPin } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { useReduced } from "@/lib/useReduced";
import { useScrollProgress } from "@/lib/useScrollProgress";
import s from "./Advertising.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const channels: { n: string; Icon: typeof IconBike; title: string; text: string }[] = [
  {
    n: "01",
    Icon: IconBike,
    title: "Riders as promoters",
    text: "Riders assigned to your brand carry it with them — on their uniform, their bike and every stop they make.",
  },
  {
    n: "02",
    Icon: IconBrand,
    title: "Auto-rickshaw advertising",
    text: "Put your brand on auto-rickshaws moving through the city every day, with each vehicle and driver managed in Flex Riders.",
  },
];

const driverSteps = ["Register", "Review", "Approve", "Assign campaign", "Get paid"];

function Chip({ className, delay, children }: { className: string; delay: number; children: ReactNode }) {
  return (
    <motion.div
      className={`${s.chip} ${className}`}
      initial={{ opacity: 0, y: 14, scale: 0.94 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ type: "spring", stiffness: 160, damping: 20, delay }}
      aria-hidden="true"
    >
      {children}
    </motion.div>
  );
}

export default function Advertising() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReduced();
  const { scrollYProgress } = useScrollProgress({ target: ref, offset: ["start end", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 40, reduce ? 0 : -40]);

  return (
    <section id="advertising" className={`section theme-light ${s.ads}`} aria-labelledby="ads-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Brand advertising</p>
          </Reveal>
          <RevealHeading id="ads-title" className="display" lines={["Your brand.", "On every street."]} />
          <Reveal delay={0.12}>
            <p className="lead">
              Flex Riders puts brands in front of the city — through riders who promote them and
              auto-rickshaws that carry them.
            </p>
          </Reveal>
        </div>

        <div className={s.grid}>
          <div ref={ref} className={s.visual}>
            <motion.div style={{ y: imgY }} className={s.imgWrap}>
              <Image
                src={autoAd}
                alt="An auto-rickshaw carrying a Flex Riders “Your Brand” advertising panel, with its driver leaning beside it"
                sizes="(max-width: 1023px) 92vw, 600px"
                className={s.img}
              />
            </motion.div>
            <Chip className={s.chipCampaign} delay={0.3}>
              <span className="brand-mono" style={{ width: 32, height: 32, fontSize: 14 }}>
                A
              </span>
              <span>
                <b>Brand A campaign</b>
                <em>Auto panel · rear</em>
              </span>
            </Chip>
            <Chip className={s.chipDriver} delay={0.45}>
              <span className={s.okIcon}>
                <IconCheck size={13} />
              </span>
              <span>
                <b>Driver approved</b>
                <em>Reviewed by operations</em>
              </span>
            </Chip>
            <Chip className={s.chipCity} delay={0.6}>
              <span className={s.pinIcon}>
                <IconPin size={15} />
              </span>
              <span>
                <b>Gurugram</b>
                <em>Campaign area</em>
              </span>
              <StatusPill status="ACTIVE" />
            </Chip>
          </div>

          <div className={s.copy}>
            <ol className={s.channels}>
              {channels.map(({ n, Icon, title, text }, i) => (
                <motion.li
                  key={n}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.6 }}
                  transition={{ duration: 0.8, ease, delay: i * 0.1 }}
                >
                  <span className={s.chIcon}>
                    <Icon size={22} />
                  </span>
                  <div>
                    <p className={s.chNo}>{n}</p>
                    <h3>{title}</h3>
                    <p className={s.chText}>{text}</p>
                  </div>
                </motion.li>
              ))}
            </ol>

            <Reveal className={s.drivers} delay={0.1}>
              <h3>Drivers join the same way.</h3>
              <p>
                Auto drivers register and sign in exactly like riders — with the same review,
                approval, assignment and payment tracking.
              </p>
              <ol className={s.flow} aria-label="Driver process">
                {driverSteps.map((st, i) => (
                  <li key={st}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    {st}
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal delay={0.15} className={s.ctas}>
              <ContactButton intent="advertise" arrow>
                Advertise with us
              </ContactButton>
              <ContactButton intent="start" role="driver" variant="ghost">
                Join as a driver
              </ContactButton>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
