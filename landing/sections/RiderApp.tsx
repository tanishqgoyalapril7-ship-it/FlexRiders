"use client";

import { AnimatePresence, motion, useInView } from "framer-motion";
import { useRef, useState, type ReactNode } from "react";
import { DiscoverScreen, EarningsScreen, PhotosScreen } from "@/components/AppScreens";
import { useContact } from "@/components/Contact";
import { Phone } from "@/components/Devices";
import { IconCamera, IconCheck, IconMegaphone, IconWallet } from "@/components/Icons";
import MagneticButton from "@/components/MagneticButton";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./RiderApp.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

type View = {
  key: string;
  label: string;
  Icon: typeof IconMegaphone;
  title: string;
  points: ReactNode[];
  screen: ReactNode;
  alt: string;
};

const views: View[] = [
  {
    key: "discover",
    label: "Discover",
    Icon: IconMegaphone,
    title: "Find campaigns that fit your area",
    points: [
      <>
        <b>Near You</b>: open campaigns around your current location, nearest first.
      </>,
      <>
        <b>Opening Soon</b>: campaigns starting within the next 48 hours, with a countdown.
      </>,
      <>
        <b>My Areas</b>: campaigns that match the working areas on your profile.
      </>,
      <>
        A campaign&apos;s reach starts small and expands step by step while it still has open slots.
      </>,
      <>Each card shows the payout per day, open slots and which vehicles can join.</>,
    ],
    screen: <DiscoverScreen animated />,
    alt: "Campaigns screen with a map, the Near You, Opening Soon and My Areas filters, and campaign cards (demonstration data)",
  },
  {
    key: "photos",
    label: "Daily photos",
    Icon: IconCamera,
    title: "Complete daily activity",
    points: [
      <>Three photo sessions a day: Morning, Evening and Night, each in its own time window.</>,
      <>Every photo is reviewed by the operations team.</>,
      <>All 3 approved completes the day, builds your streak and earns the campaign&apos;s daily rate.</>,
    ],
    screen: <PhotosScreen />,
    alt: "Daily Activity screen with Morning approved, Evening in review and Night upcoming, plus a 6-day streak (demonstration data)",
  },
  {
    key: "earnings",
    label: "Earnings",
    Icon: IconWallet,
    title: "Track earnings and payouts",
    points: [
      <>See what each approved day has earned, campaign by campaign.</>,
      <>Payouts are sent by the Flex Riders payments team to your UPI ID.</>,
      <>Every payout shows its status and transaction reference, and you get a notification.</>,
    ],
    screen: <EarningsScreen />,
    alt: "Earnings screen with total earned, UPI ID and a payout history marked Paid or Processing (demonstration data)",
  },
];

const vehicles = ["Cycle", "Bike / Two Wheeler", "Auto", "Three Wheeler"];

export default function RiderApp() {
  const [active, setActive] = useState(views[0].key);
  const openContact = useContact();
  const view = views.find((v) => v.key === active)!;
  // Mount the screen only once the phone is on screen, so its animation plays where people can see it.
  const visualRef = useRef<HTMLDivElement>(null);
  const visualInView = useInView(visualRef, { once: true, amount: 0.3 });

  return (
    <section id="riders" className={`section theme-light ${s.riders}`} aria-labelledby="riders-title">
      <div className={`container ${s.grid}`}>
        <div className={s.copy}>
          <Reveal>
            <p className="eyebrow">For riders</p>
          </Reveal>
          <RevealHeading
            id="riders-title"
            className="display"
            lines={["Earn by completing", <span key="b" className="blue-text">real campaigns.</span>]}
          />

          <div className={s.tabs} role="tablist" aria-label="Rider app">
            {views.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`rider-tab-${key}`}
                aria-selected={active === key}
                aria-controls="rider-panel"
                className={active === key ? s.tabOn : undefined}
                onClick={() => setActive(key)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={view.key}
              id="rider-panel"
              role="tabpanel"
              aria-labelledby={`rider-tab-${view.key}`}
              className={s.panel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease }}
            >
              <h3>{view.title}</h3>
              <ul>
                {view.points.map((p, i) => (
                  <li key={i}>
                    <IconCheck size={14} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>

          <div className={s.vehicles}>
            <span>Vehicles:</span>
            {vehicles.map((v) => (
              <em key={v}>{v}</em>
            ))}
          </div>

          <div className={s.cta}>
            <MagneticButton onClick={() => openContact("start", "rider")} arrow>
              Join Flex Riders
            </MagneticButton>
            <p>Register in the Flex Riders app, or leave your details and our team will call you.</p>
          </div>
        </div>

        <div ref={visualRef} className={s.visual}>
          <AnimatePresence mode="wait">
            <motion.div
              key={view.key}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.4, ease }}
            >
              <Phone className={s.phone} label={view.alt}>
                {visualInView ? view.screen : null}
              </Phone>
            </motion.div>
          </AnimatePresence>
          <p className="demo-note">Demonstration data</p>
        </div>
      </div>
    </section>
  );
}
