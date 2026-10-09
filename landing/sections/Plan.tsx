"use client";

import { animate } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import CoverageMap from "@/components/CoverageMap";
import { IconAuto, IconBike, IconCheck } from "@/components/Icons";
import MagneticButton from "@/components/MagneticButton";
import { Reveal, RevealHeading } from "@/components/Reveal";
import { scrollToHash } from "@/lib/scroll";
import { useReduced } from "@/lib/useReduced";
import {
  ILLUSTRATIVE,
  MAX_VEHICLES,
  PRICING,
  campaignCost,
  clampCount,
  coverageTier,
  inr,
  minCampaign,
  PLAN_EVENT,
  type PlanDetail,
  type VehicleKind,
} from "@/lib/pricing";
import s from "./Plan.module.css";

function Money({ value }: { value: number }) {
  const reduce = useReduced();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduce) {
      setShown(value);
      from.current = value;
      return;
    }
    const c = animate(from.current, value, {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
      onComplete: () => (from.current = value),
    });
    return () => {
      from.current = value;
      c.stop();
    };
  }, [value, reduce]);
  return <span className="num">{inr(shown)}</span>;
}

const KINDS: { kind: VehicleKind; Icon: typeof IconBike; title: string; coverage: string }[] = [
  { kind: "bike", Icon: IconBike, title: "Bike riders", coverage: "Street-level coverage through neighbourhoods" },
  { kind: "auto", Icon: IconAuto, title: "Autos", coverage: "High-visibility coverage on main roads" },
];

export default function Plan() {
  const [kind, setKind] = useState<VehicleKind>("bike");
  const [counts, setCounts] = useState<Record<VehicleKind, number>>({ bike: 10, auto: 10 });
  const p = PRICING[kind];
  const count = counts[kind];
  const cost = campaignCost(kind, count);
  const tier = coverageTier(kind, count);
  const setCount = (n: number) => setCounts((c) => ({ ...c, [kind]: clampCount(kind, n) }));
  const perDay = count * ILLUSTRATIVE.homeVisitsPerRiderPerDay;

  const start = () => {
    window.dispatchEvent(new CustomEvent<PlanDetail>(PLAN_EVENT, { detail: { kind, count, cost } }));
    scrollToHash("#enquiry");
  };

  return (
    <section id="plan" className={`section theme-light ${s.plan}`} aria-labelledby="plan-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Plan your campaign</p>
          </Reveal>
          <RevealHeading
            id="plan-title"
            className="display"
            lines={["See how far your", <span key="b" className="blue-text">campaign can go.</span>]}
          />
          <Reveal delay={0.1}>
            <p className="lead">
              Choose your vehicle type and campaign size. See the estimated coverage and your campaign cost
              before you enquire.
            </p>
          </Reveal>
        </div>

        {/* 1. Vehicle type, with its own price and minimum */}
        <div className={s.kinds} role="radiogroup" aria-label="Vehicle type">
          {KINDS.map(({ kind: k, Icon, title, coverage }) => {
            const kp = PRICING[k];
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={s.kind}
                data-kind={k}
                onClick={() => setKind(k)}
              >
                <span className={s.kindIcon}>
                  <Icon size={22} />
                </span>
                <span className={s.kindBody}>
                  <b>{title}</b>
                  <em>{coverage}</em>
                </span>
                <span className={s.kindPrice}>
                  <b className="num">{inr(kp.rate)}</b>
                  <em>per {kp.unit}</em>
                  <i>{kp.min > 1 ? `Min. ${kp.min} ${kp.unit}s · ${inr(minCampaign(k))}` : "No minimum"}</i>
                </span>
              </button>
            );
          })}
        </div>

        <div className={s.grid}>
          {/* 2. Estimated coverage */}
          <div className={s.coverage}>
            <CoverageMap kind={kind} count={count} />
            <div className={s.tier}>
              <p className={s.kicker}>Estimated coverage</p>
              <h3>{tier.label}</h3>
              <p>{tier.text}</p>
              {kind === "bike" ? (
                <p className={s.illus}>
                  Illustrative: 1 rider ≈ {ILLUSTRATIVE.homeVisitsPerRiderPerDay} potential home visits a day, so{" "}
                  <b>
                    {count} {count === 1 ? "rider" : "riders"} ≈ {perDay.toLocaleString("en-IN")} a day
                  </b>{" "}
                  and ≈ {(perDay * 30).toLocaleString("en-IN")} over 30 days.
                </p>
              ) : (
                <p className={s.illus}>
                  Illustrative: a {ILLUSTRATIVE.autoJourneyMin}-min passenger journey ≈{" "}
                  <b>{ILLUSTRATIVE.autoExposureMin} min of brand exposure</b>, plus ~{ILLUSTRATIVE.autoSignalSec} sec at
                  each traffic signal, seen by passengers, pedestrians and nearby traffic.
                </p>
              )}
            </div>
          </div>

          {/* 3. Campaign size and cost */}
          <div className={s.panel} data-kind={kind}>
            <div className={s.countHead}>
              <label htmlFor="plan-count">Number of {p.plural.toLowerCase()}</label>
              <div className={s.stepper}>
                <button type="button" aria-label={`Fewer ${p.plural.toLowerCase()}`} disabled={count <= p.min} onClick={() => setCount(count - 1)}>
                  −
                </button>
                <output className="num" aria-live="polite">
                  {count}
                </output>
                <button type="button" aria-label={`More ${p.plural.toLowerCase()}`} disabled={count >= MAX_VEHICLES} onClick={() => setCount(count + 1)}>
                  +
                </button>
              </div>
            </div>
            <input
              id="plan-count"
              type="range"
              className={s.slider}
              min={p.min}
              max={MAX_VEHICLES}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              style={{ "--p": `${((count - p.min) / (MAX_VEHICLES - p.min)) * 100}%` } as CSSProperties}
            />
            <div className={s.presets}>
              {p.presets.map((n) => (
                <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>
                  {n} {n === 1 ? p.unit : `${p.unit}s`}
                </button>
              ))}
            </div>
            {kind === "auto" && (
              <p className={s.minNote}>
                Minimum Auto campaign: {p.min} autos · {inr(minCampaign("auto"))}
              </p>
            )}

            <div className={s.cost} data-kind={kind}>
              <p className={s.kicker}>Estimated campaign cost</p>
              <p className={s.price}>
                <Money value={cost} />
              </p>
              <p className={s.formula}>
                {count} {count === 1 ? p.unit : `${p.unit}s`} × {inr(p.rate)} per {p.unit}
              </p>
            </div>

            <ul className={s.includes}>
              <li>
                <IconCheck size={14} /> Campaign reviewed and approved by our team
              </li>
              <li>
                <IconCheck size={14} /> Verified {kind === "bike" ? "riders" : "auto drivers"} carry your brand
              </li>
              <li>
                <IconCheck size={14} /> Morning, evening and night photos every campaign day
              </li>
            </ul>

            <MagneticButton onClick={start} arrow className={s.cta}>
              Start My Campaign
            </MagneticButton>
            <p className={s.fine}>Your final quote is confirmed by our team when your campaign is approved.</p>
          </div>
        </div>

        <p className={s.disclaimer}>
          Coverage maps and visit figures are illustrative, not measurements. Actual visibility varies with routes,
          traffic and campaign duration. Flex Riders does not guarantee impressions, reach, sales or ROI.
        </p>
      </div>
    </section>
  );
}
