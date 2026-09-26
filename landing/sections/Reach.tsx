import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./Reach.module.css";

const ladder = [
  { value: "1", unit: "Rider", result: "20", resultUnit: "homes / day" },
  { value: "10", unit: "Riders", result: "200", resultUnit: "homes / day" },
  { value: "30", unit: "Days", result: "6,000", resultUnit: "potential home visits" },
];

const NOTE = "Actual campaign reach depends on rider participation, campaign area, routes and campaign duration.";

/** Illustrative reach maths for businesses. Clearly labelled as an example, never a promise. */
export default function Reach() {
  return (
    <section id="reach" className={`section theme-light ${s.reach}`} aria-labelledby="reach-title">
      <div className="container">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Brand promotion</p>
          </Reveal>
          <RevealHeading id="reach-title" className="display" lines={["How your brand", <span key="b" className="blue-text">reaches more homes.</span>]} />
          <Reveal delay={0.1}>
            <p className="lead">
              Businesses promote through FlexRiders riders and vehicles in selected campaign areas. Each rider covers many homes a day on
              their campaign route, and more riders over more days multiply that reach.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <p className={s.tag}>Illustrative campaign example</p>
          <ol className={s.ladder}>
            {ladder.map((step, i) => (
              <li key={step.unit} className={s.step}>
                <span className={s.input}>
                  <b className="num">{step.value}</b> {step.unit}
                </span>
                <span className={s.arrow} aria-hidden="true">
                  ↓
                </span>
                <span className={s.output}>
                  <b className="num">{step.result}</b>
                  <span>{step.resultUnit}</span>
                </span>
                {i < ladder.length - 1 ? (
                  <span className={s.next} aria-hidden="true">
                    →
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className={s.note}>{NOTE}</p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className={s.scale} role="group" aria-labelledby="scale-title">
            <h3 id="scale-title" className={s.scaleTitle}>
              See how a campaign can scale
            </h3>
            <div className={s.formula} aria-label="10 riders times 20 homes a day times 30 days equals 6,000 potential home visits">
              <span className={s.term}>
                <b className="num">10</b>
                <small>Riders</small>
              </span>
              <span className={s.op}>×</span>
              <span className={s.term}>
                <b className="num">20</b>
                <small>Homes / day</small>
              </span>
              <span className={s.op}>×</span>
              <span className={s.term}>
                <b className="num">30</b>
                <small>Days</small>
              </span>
              <span className={s.op}>=</span>
              <span className={`${s.term} ${s.total}`}>
                <b className="num">6,000</b>
                <small>Potential home visits</small>
              </span>
            </div>
            <p className={s.scaleNote}>Illustrative example. {NOTE}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
