"use client";

import Image from "next/image";
import ridersCover from "@/public/images/riders-cover-900.webp";
import autoAd from "@/public/images/auto-advertising.webp";
import { IconArrowRight, IconCheck } from "@/components/Icons";
import MagneticButton from "@/components/MagneticButton";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { site } from "@/lib/site";
import ReachEstimator from "./ReachEstimator";
import s from "./ForBrands.module.css";

const checklist = [
  "Target a specific city and area",
  "Choose vehicles: cycle, bike, auto or three-wheeler",
  "Set the riders needed and payout per day",
  "Define campaign dates and daily hours",
  "Track daily photo activity rider by rider",
  "Review progress in the app or brand web portal",
];

// Campaign states as brands see them in the app.
const lifecycle = ["Submitted", "Admin review", "Open for joining", "Live", "Completed"];

const channels = [
  {
    img: ridersCover,
    alt: "Flex Riders bike riders in branded gear",
    title: "Riders, bikes & cycles",
    text: "Route-based visibility through local streets and neighbourhoods.",
  },
  {
    img: autoAd,
    alt: "Auto-rickshaw with a branded rear advertising panel",
    title: "Autos & three-wheelers",
    text: "Rear-panel branding seen by passengers, pedestrians and traffic.",
  },
];

export default function ForBrands() {
  return (
    <section id="brands" className={`section theme-dark ${s.brands}`} aria-labelledby="brands-title">
      <div className={`container ${s.grid}`}>
        <div>
          <Reveal>
            <p className="eyebrow">For brands</p>
          </Reveal>
          <RevealHeading
            id="brands-title"
            className="display"
            lines={["Put your brand", <span key="b" className="blue-text">on the road.</span>]}
          />
          <Reveal delay={0.1}>
            <p className={`lead ${s.lead}`}>
              Choose where and how your campaign runs. Our team reviews it, verified riders join, and
              every campaign day is backed by photos.
            </p>
          </Reveal>

          <ul className={s.checklist}>
            {checklist.map((c) => (
              <li key={c}>
                <IconCheck size={14} />
                {c}
              </li>
            ))}
          </ul>

          <ol className={s.lifecycle} aria-label="Campaign lifecycle">
            {lifecycle.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ol>

          <div className={s.ctas}>
            <MagneticButton href="#enquiry" arrow>
              Start a Campaign
            </MagneticButton>
            <a className={s.login} href={site.brandUrl}>
              Brand login <IconArrowRight size={14} />
            </a>
          </div>
        </div>

        <div className={s.channels}>
          {channels.map((c, i) => (
            <Reveal key={c.title} delay={0.08 * i} className={s.channel}>
              <div className={s.media}>
                <Image src={c.img} alt={c.alt} sizes="(max-width: 899px) 50vw, 480px" />
              </div>
              <div className={s.channelText}>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
      <div className="container">
        <ReachEstimator />
      </div>
    </section>
  );
}
