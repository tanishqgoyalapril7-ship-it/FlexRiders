"use client";

import { useId, useState, type CSSProperties } from "react";
import { IconBike, IconClock } from "@/components/Icons";
import MagneticButton from "@/components/MagneticButton";
import s from "./ReachEstimator.module.css";

/* Illustrative reach maths for brands. The per-rider and per-journey figures are the owner's illustrative
   examples, never guarantees; everything else is what the brand chooses for its own campaign. */
const VISITS_PER_RIDER_DAY = 20;

const fmt = (n: number) => n.toLocaleString("en-IN");

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const id = useId();
  return (
    <div className={s.term}>
      <b className="num">{fmt(value)}</b>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--p": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </div>
  );
}

function Fixed({ value, label }: { value: string; label: string }) {
  return (
    <div className={`${s.term} ${s.fixed}`}>
      <b className="num">{value}</b>
      <span>{label}</span>
      <em>Illustrative</em>
    </div>
  );
}

export default function ReachEstimator() {
  const [tab, setTab] = useState<"riders" | "autos">("riders");
  const [riders, setRiders] = useState(10);
  const [riderDays, setRiderDays] = useState(30);
  const [autos, setAutos] = useState(10);
  const [hours, setHours] = useState(8);
  const [autoDays, setAutoDays] = useState(30);

  const perDay = riders * VISITS_PER_RIDER_DAY;
  const visits = perDay * riderDays;
  const displayHours = autos * hours * autoDays;

  return (
    <div className={s.estimator} aria-labelledby="reach-title">
      <div className={s.head}>
        <div>
          <h3 id="reach-title">Estimate your campaign&apos;s reach</h3>
          <p>Move the sliders to see how a campaign adds up. One vehicle, many chances to be seen.</p>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Vehicle type">
          <button type="button" role="tab" aria-selected={tab === "riders"} onClick={() => setTab("riders")}>
            <IconBike size={16} /> Riders &amp; bikes
          </button>
          <button type="button" role="tab" aria-selected={tab === "autos"} onClick={() => setTab("autos")}>
            <IconClock size={16} /> Autos
          </button>
        </div>
      </div>

      {tab === "riders" ? (
        <div role="tabpanel" className={s.panel}>
          <div className={s.formula}>
            <Slider label="Riders" value={riders} min={1} max={100} onChange={setRiders} />
            <span className={s.op} aria-hidden="true">×</span>
            <Fixed value={String(VISITS_PER_RIDER_DAY)} label="Home visits per rider per day" />
            <span className={s.op} aria-hidden="true">×</span>
            <Slider label="Campaign days" value={riderDays} min={1} max={90} onChange={setRiderDays} />
            <span className={s.op} aria-hidden="true">=</span>
            <div className={`${s.term} ${s.total}`} aria-live="polite">
              <b className="num">≈ {fmt(visits)}</b>
              <span>Potential home visits</span>
            </div>
          </div>
          <ol className={s.ladder}>
            <li>
              <b>1 rider</b> ≈ {VISITS_PER_RIDER_DAY} visits a day
            </li>
            <li>
              <b>{fmt(riders)} riders</b> ≈ {fmt(perDay)} visits a day
            </li>
            <li>
              <b>{fmt(riderDays)} days</b> ≈ {fmt(visits)} visits
            </li>
          </ol>
          <p className={s.note}>
            A rider moves through many streets and neighbourhoods during everyday travel, with your brand on
            their uniform and vehicle.
          </p>
        </div>
      ) : (
        <div role="tabpanel" className={s.panel}>
          <div className={s.formula}>
            <Slider label="Autos" value={autos} min={1} max={100} onChange={setAutos} />
            <span className={s.op} aria-hidden="true">×</span>
            <Slider label="Hours on the road per day" value={hours} min={1} max={12} onChange={setHours} />
            <span className={s.op} aria-hidden="true">×</span>
            <Slider label="Campaign days" value={autoDays} min={1} max={90} onChange={setAutoDays} />
            <span className={s.op} aria-hidden="true">=</span>
            <div className={`${s.term} ${s.total}`} aria-live="polite">
              <b className="num">{fmt(displayHours)}</b>
              <span>Hours of on-road brand display</span>
            </div>
          </div>
          <ol className={s.ladder}>
            <li>
              <b>30 min</b> typical passenger journey
            </li>
            <li>
              <b>≈ 20 min</b> of potential brand exposure
            </li>
            <li>
              <b>+ ~90 sec</b> at each traffic signal
            </li>
          </ol>
          <p className={s.note}>Seen by passengers, pedestrians, nearby motorists and two-wheelers.</p>
        </div>
      )}

      <div className={s.foot}>
        <p>
          Illustrative examples only. Actual reach, journey times and visibility vary with routes, traffic,
          rider participation and campaign duration. Flex Riders does not guarantee impressions, reach, sales or
          ROI.
        </p>
        <MagneticButton href="#enquiry" arrow>
          Plan this campaign
        </MagneticButton>
      </div>
    </div>
  );
}
