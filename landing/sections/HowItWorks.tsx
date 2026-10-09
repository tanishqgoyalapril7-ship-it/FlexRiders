"use client";

import { useRef, useState, type CSSProperties } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { IconBike, IconBrand } from "@/components/Icons";
import { useContact } from "@/components/Contact";
import MagneticButton from "@/components/MagneticButton";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./HowItWorks.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

const businessSteps = [
  { n: "01", title: "Request a campaign", text: "Send an enquiry here, or create a campaign request in the Flex Riders app." },
  { n: "02", title: "Define area & requirements", text: "Target area, riders needed, vehicle types, dates, daily hours and payout per day." },
  { n: "03", title: "Admin review & approval", text: "Our team approves the request, or asks for changes, before it is published." },
  { n: "04", title: "Track campaign activity", text: "Riders join and submit daily photos; follow progress in the app or brand portal." },
];

const riderSteps = [
  { n: "01", title: "Register", text: "Sign up in the app with your vehicle, documents and working areas." },
  { n: "02", title: "Get approved", text: "The operations team verifies your profile before you can join campaigns." },
  { n: "03", title: "Join a campaign", text: "Request an open slot in a campaign near you that fits your vehicle." },
  { n: "04", title: "Complete days & earn", text: "Submit Morning, Evening and Night photos; approved days earn the daily rate." },
];

export default function HowItWorks() {
  const [tab, setTab] = useState<"business" | "riders">("riders");
  const steps = tab === "business" ? businessSteps : riderSteps;
  const openContact = useContact();
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, amount: 0.5 });

  return (
    <section id="how-it-works" className="section theme-light theme-paper" aria-labelledby="how-title">
      <div className="container">
        {/* Section Header */}
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">How it works</p>
          </Reveal>
          <RevealHeading
            id="how-title"
            className="display"
            lines={["From sign-up", <span key="b" className="blue-text">to your first campaign day.</span>]}
          />
          <Reveal delay={0.1}>
            <p className="lead">
              Every campaign is approved by our team, and every rider is verified before joining one.
            </p>
          </Reveal>
        </div>

        {/* Toggle Switcher */}
        <div className={s.toggleWrap}>
          <div className={s.toggle} role="tablist" aria-label="Workflow audience">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "riders"}
              className={`${s.toggleBtn} ${tab === "riders" ? s.toggleBtnActive : ""}`}
              onClick={() => setTab("riders")}
            >
              <IconBike size={16} />
              <span>For Riders</span>
              {tab === "riders" && <motion.div layoutId="howItWorksToggle" className={s.toggleIndicator} transition={{ duration: 0.3, ease }} />}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "business"}
              className={`${s.toggleBtn} ${tab === "business" ? s.toggleBtnActive : ""}`}
              onClick={() => setTab("business")}
            >
              <IconBrand size={16} />
              <span>For Brands</span>
              {tab === "business" && <motion.div layoutId="howItWorksToggle" className={s.toggleIndicator} transition={{ duration: 0.3, ease }} />}
            </button>
          </div>
        </div>

        {/* Horizontal Desktop Stepper Grid */}
        <div ref={gridRef} className={s.stepperWrap} data-inview={inView || undefined}>
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className={s.stepsGrid}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease }}
            >
              {steps.map((st, i) => (
                <div key={st.n} className={s.stepCard} style={{ "--i": i } as CSSProperties}>
                  <div className={s.stepCardHead}>
                    <span className={s.stepNum}>{st.n}</span>
                    {i < steps.length - 1 && <span className={s.stepArrow}>→</span>}
                  </div>
                  <h4 className={s.stepTitle}>{st.title}</h4>
                  <p className={s.stepText}>{st.text}</p>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className={s.next}>
          {tab === "riders" ? (
            <>
              <p>Register in the Flex Riders app. Our team reviews every rider before their first campaign.</p>
              <MagneticButton onClick={() => openContact("start", "rider")} arrow>
                Join as Rider
              </MagneticButton>
            </>
          ) : (
            <>
              <p>Tell us your area and goals. We&apos;ll help you plan the campaign before it goes live.</p>
              <MagneticButton href="#enquiry" arrow>
                Start a Campaign
              </MagneticButton>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
