import type { ReactNode } from "react";
import { IconBike, IconChart, IconHistory, IconHome, IconPin, IconUsers } from "@/components/Icons";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./BeyondScreen.module.css";

const points: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <IconPin size={22} />, title: "Local brand visibility", text: "Your brand is seen on the road in the neighbourhoods where your customers live." },
  { icon: <IconHome size={22} />, title: "Selected campaign areas", text: "Choose the areas your campaign should cover." },
  { icon: <IconUsers size={22} />, title: "Riders working together", text: "Several riders carry the same campaign at the same time." },
  { icon: <IconHistory size={22} />, title: "Flexible duration", text: "Plan a campaign for as many days as you need." },
  { icon: <IconBike size={22} />, title: "Riders, bikes & autos", text: "Campaigns on riders, bikes and two-wheelers, autos and three-wheelers." },
  { icon: <IconChart size={22} />, title: "Activity tracking", text: "Daily campaign photos and progress, tracked in FlexRiders." },
];

export default function BeyondScreen() {
  return (
    <section className={`section theme-dark ${s.beyond}`} aria-labelledby="beyond-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Why FlexRiders</p>
          </Reveal>
          <RevealHeading id="beyond-title" className="display" lines={["Take your brand", <span key="b" className="blue-text">beyond the screen.</span>]} />
          <Reveal delay={0.1}>
            <p className="lead">FlexRiders takes your promotion into local communities, through riders and vehicles out on the road every day.</p>
          </Reveal>
        </div>
        <div className={s.grid} role="list">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={0.05 * i} className={s.card} role="listitem">
              <span className={s.icon}>{p.icon}</span>
              <h3 className={s.title}>{p.title}</h3>
              <p className={s.text}>{p.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
