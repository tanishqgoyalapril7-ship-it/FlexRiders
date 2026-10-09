"use client";

import EnquiryForm from "@/components/EnquiryForm";
import { useContact } from "@/components/Contact";
import { IconBike } from "@/components/Icons";
import MagneticButton from "@/components/MagneticButton";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./FinalCTA.module.css";

export default function FinalCTA() {
  const openContact = useContact();

  return (
    <section id="enquiry" className={`theme-dark ${s.cta}`} aria-labelledby="cta-title">
      <div className={s.glow} aria-hidden="true" />

      <div className={`container ${s.inner}`}>
        <div className={s.copy}>
          <RevealHeading
            id="cta-title"
            className={`display ${s.title}`}
            lines={["Ready to put your brand", <span key="o" className="blue-text">on the road?</span>]}
          />
          <Reveal delay={0.1}>
            <p className={`lead ${s.lead}`}>
              Share your brand, target area and goals. Our team reviews every enquiry and helps you
              plan the campaign before it goes live.
            </p>
          </Reveal>

          <Reveal delay={0.18} className={s.rider}>
            <span className={s.riderIcon}>
              <IconBike size={20} />
            </span>
            <div>
              <h3>Want to earn with Flex Riders?</h3>
              <p>Riders, auto drivers and cyclists can join campaigns near them.</p>
            </div>
            <MagneticButton variant="ghost" size="sm" onClick={() => openContact("start", "rider")}>
              Join as Rider
            </MagneticButton>
          </Reveal>
        </div>

        <Reveal delay={0.12} className={s.form}>
          <h3 className={s.formTitle}>Tell us about your campaign</h3>
          <EnquiryForm role="business" intent="advertise" submitLabel="Send Enquiry" />
        </Reveal>
      </div>
    </section>
  );
}
