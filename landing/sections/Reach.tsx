"use client";

import Image from "next/image";
import ridersCover from "@/public/images/riders-cover-900.webp";
import autoAd from "@/public/images/auto-advertising.webp";
import { Reveal, RevealHeading } from "@/components/Reveal";
import s from "./Reach.module.css";

const riderLadder = [
  { value: "1", unit: "Rider", result: "≈20", resultUnit: "potential home visits/day" },
  { value: "10", unit: "Riders", result: "≈200", resultUnit: "potential home visits/day" },
  { value: "30", unit: "Days", result: "≈6,000", resultUnit: "potential home visits" },
];

const autoLadder = [
  { value: "30", unit: "MIN", result: "30 MIN", resultUnit: "Illustrative passenger journey" },
  { value: "≈20", unit: "MIN", result: "≈20 MIN", resultUnit: "Potential meaningful brand exposure" },
  { value: "≈90", unit: "SEC", result: "+ ≈90 SEC", resultUnit: "Traffic-signal waiting opportunity" },
];

const riderStrengths = [
  "Doorstep neighborhood reach",
  "Uniform & bike branding",
  "Targeted route repetition",
  "Active local engagement",
];

const autoAudiences = [
  "Passengers",
  "Pedestrians",
  "Nearby motorists",
  "Two-wheelers",
];

const RIDER_DISCLAIMER =
  "Illustrative campaign example. Actual campaign reach depends on rider participation, campaign area, routes and campaign duration.";

const AUTO_DISCLAIMER =
  "Illustrative examples only. Actual journey duration, traffic-signal waiting time and visibility vary by route, traffic, vehicle position, passenger behaviour and surrounding conditions.";

export default function Reach() {
  return (
    <section id="reach" className={`section theme-light ${s.reach}`} aria-labelledby="reach-title">
      {/* Subtle ambient light glow */}
      <div className={s.ambientGlow} aria-hidden="true" />

      <div className="container">
        {/* Section Header */}
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Brand promotion</p>
          </Reveal>
          <RevealHeading
            id="reach-title"
            className="display"
            lines={["How your brand", <span key="b" className="blue-text">reaches more people.</span>]}
          />
          <Reveal delay={0.1}>
            <p className="lead">
              Flex Riders helps businesses promote their brands through riders and vehicles across selected local areas.
            </p>
          </Reveal>
        </div>

        {/* Parallel Channel Cards: Left (Riders) and Right (Autos) */}
        <div className={s.channelsGrid}>
          {/* LEFT CARD: RIDERS / BIKES */}
          <Reveal delay={0.12} className={s.cardReveal}>
            <div className={s.channelCard} role="region" aria-labelledby="riders-card-title">
              {/* Card Header */}
              <div className={s.cardHeader}>
                <div className={s.channelBadge}>
                  <span className={s.channelEmoji} aria-hidden="true">🏍️</span>
                  <div>
                    <h3 id="riders-card-title" className={s.channelTitle}>RIDERS</h3>
                    <span className={s.channelSub}>Route-based local visibility</span>
                  </div>
                </div>
                <span className={s.cardTag}>Illustrative calculation</span>
              </div>

              {/* Visual Preview Banner */}
              <div className={s.visualBanner}>
                <div className={s.bannerImgWrap}>
                  <Image
                    src={ridersCover}
                    alt="Flex Riders bike fleet on duty with brand ambassadors"
                    sizes="(max-width: 1023px) 90vw, 540px"
                    className={s.bannerImg}
                    priority={false}
                  />
                </div>
                <div className={s.bannerOverlay}>
                  <span className={s.bannerBadge}>
                    <span className={s.liveDot} aria-hidden="true" />
                    Local Street Fleet
                  </span>
                  <span className={s.bannerSub}>Daily residential & commercial routes</span>
                </div>
              </div>

              {/* 3-Step Metric Ladder */}
              <div className={s.ladderSection}>
                <p className={s.ladderLabel}>Step-by-step route multiplication</p>
                <ol className={s.ladder} aria-label="Rider reach calculation ladder">
                  {riderLadder.map((step, i) => (
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
                    </li>
                  ))}
                </ol>
              </div>

              {/* Highlights / Features list */}
              <div className={s.pillsSection}>
                <p className={s.pillsHeading}>Delivery touchpoints:</p>
                <ul className={s.pillsList}>
                  {riderStrengths.map((item) => (
                    <li key={item} className={s.featurePill}>
                      <span className={s.pillDot} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Dark High-Tech Multiplication Card */}
              <div className={s.techFormulaBox} role="group" aria-label="Rider multiplication formula">
                <div className={s.techFormulaHead}>
                  <span className={s.techLabel}>MULTIPLICATION EFFECT</span>
                  <span className={s.techSub}>Consistent campaign scale</span>
                </div>
                <div className={s.techFormula}>
                  <div className={s.techTerm}>
                    <b className="num">10</b>
                    <small>Riders</small>
                  </div>
                  <span className={s.techOp}>×</span>
                  <div className={s.techTerm}>
                    <b className="num">20</b>
                    <small>Visits / day</small>
                  </div>
                  <span className={s.techOp}>×</span>
                  <div className={s.techTerm}>
                    <b className="num">30</b>
                    <small>Days</small>
                  </div>
                  <span className={s.techOp}>=</span>
                  <div className={`${s.techTerm} ${s.techTotal}`}>
                    <b className="num">6,000</b>
                    <small>Potential visits</small>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className={s.cardFooter}>
                <p className={s.disclaimer}>{RIDER_DISCLAIMER}</p>
              </div>
            </div>
          </Reveal>

          {/* RIGHT CARD: AUTOS */}
          <Reveal delay={0.16} className={s.cardReveal}>
            <div className={s.channelCard} role="region" aria-labelledby="autos-card-title">
              {/* Card Header */}
              <div className={s.cardHeader}>
                <div className={s.channelBadge}>
                  <span className={s.channelEmoji} aria-hidden="true">🛺</span>
                  <div>
                    <h3 id="autos-card-title" className={s.channelTitle}>AUTOS</h3>
                    <span className={s.channelSub}>Passenger + street exposure</span>
                  </div>
                </div>
                <span className={s.cardTag}>Illustrative exposure</span>
              </div>

              {/* Visual Preview Banner */}
              <div className={s.visualBanner}>
                <div className={s.bannerImgWrapAuto}>
                  <Image
                    src={autoAd}
                    alt="Realistic auto-rickshaw advertising vehicle with branded back panel"
                    sizes="(max-width: 1023px) 90vw, 540px"
                    className={s.bannerImgAuto}
                    priority={false}
                  />
                </div>
                <div className={s.bannerOverlay}>
                  <span className={s.bannerBadge}>
                    <span className={s.liveDot} aria-hidden="true" />
                    Rear Ad Panel
                  </span>
                  <span className={s.bannerSub}>High-dwell commuter & traffic exposure</span>
                </div>
              </div>

              {/* 3-Step Metric Ladder */}
              <div className={s.ladderSection}>
                <p className={s.ladderLabel}>Passenger dwell & signal opportunity</p>
                <div className={s.ladder}>
                  <div className={s.step}>
                    <span className={s.input}>
                      <b className="num">30</b> MIN
                    </span>
                    <span className={s.arrow} aria-hidden="true">
                      ↓
                    </span>
                    <span className={s.output}>
                      <b className="num">30</b>
                      <span>Illustrative passenger journey</span>
                    </span>
                  </div>

                  <div className={s.step}>
                    <span className={s.input}>
                      <b className="num">≈20</b> MIN
                    </span>
                    <span className={s.arrow} aria-hidden="true">
                      ↓
                    </span>
                    <span className={s.output}>
                      <b className="num">≈20</b>
                      <span>Potential meaningful brand exposure</span>
                    </span>
                  </div>

                  <div className={s.step}>
                    <span className={s.input}>
                      <b className="num">≈90</b> SEC
                    </span>
                    <span className={s.arrow} aria-hidden="true">
                      ↓
                    </span>
                    <span className={s.output}>
                      <b className="num">+ ≈90s</b>
                      <span>Traffic-signal waiting opportunity</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Audience Section */}
              <div className={s.pillsSection}>
                <p className={s.pillsHeading}>Potential visibility to:</p>
                <ul className={s.pillsList}>
                  {autoAudiences.map((item) => (
                    <li key={item} className={s.featurePill}>
                      <span className={s.pillDot} aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Dark High-Tech Visibility Formula Card */}
              <div className={s.techFormulaBox} role="group" aria-label="Auto visibility formula">
                <div className={s.techFormulaHead}>
                  <span className={s.techLabel}>AUTO VISIBILITY FORMULA</span>
                  <span className={s.techSub}>Multi-point urban presence</span>
                </div>
                <div className={s.techFormulaAuto}>
                  <div className={s.techPillTerm}>
                    <span className={s.pillTermText}>TIME</span>
                    <small>Extended dwell</small>
                  </div>
                  <span className={s.techOp}>+</span>
                  <div className={s.techPillTerm}>
                    <span className={s.pillTermText}>PASSENGER</span>
                    <small>Captive in-cabin</small>
                  </div>
                  <span className={s.techOp}>+</span>
                  <div className={s.techPillTerm}>
                    <span className={s.pillTermText}>STREET</span>
                    <small>Surrounding view</small>
                  </div>
                  <span className={s.techOp}>=</span>
                  <div className={`${s.techPillTerm} ${s.techTotalAuto}`}>
                    <span className={s.pillTermHighlight}>HIGH EXPOSURE</span>
                    <small>All day roaming</small>
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div className={s.cardFooter}>
                <p className={s.disclaimer}>{AUTO_DISCLAIMER}</p>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Shared Bottom Message */}
        <Reveal delay={0.2}>
          <div className={s.sharedSummary} role="region" aria-label="Two mobile advertising channels summary">
            <div className={s.sharedGlow} aria-hidden="true" />
            
            <div className={s.sharedHead}>
              <p className={s.sharedEyebrow}>ONE PLATFORM.</p>
              <h3 className={s.sharedTitle}>TWO MOBILE ADVERTISING CHANNELS.</h3>
              <p className={s.sharedSubtitle}>
                Combine route-level micro-targeting with broad city-wide transit visibility for maximum reach.
              </p>
            </div>

            <div className={s.channelsRow}>
              <div className={s.channelPillar}>
                <div className={s.pillarIconWrap}>
                  <span className={s.pillarEmoji} aria-hidden="true">🏍️</span>
                </div>
                <div className={s.pillarText}>
                  <div className={s.pillarHeader}>
                    <strong className={s.pillarName}>Riders</strong>
                    <span className={s.pillarPill}>Route-Based</span>
                  </div>
                  <span className={s.pillarDesc}>Doorstep residential visits & local street visibility</span>
                </div>
              </div>

              <div className={s.pillarDivider} aria-hidden="true" />

              <div className={s.channelPillar}>
                <div className={s.pillarIconWrap}>
                  <span className={s.pillarEmoji} aria-hidden="true">🛺</span>
                </div>
                <div className={s.pillarText}>
                  <div className={s.pillarHeader}>
                    <strong className={s.pillarName}>Autos</strong>
                    <span className={s.pillarPill}>Transit-Based</span>
                  </div>
                  <span className={s.pillarDesc}>In-journey passenger + surrounding street & traffic visibility</span>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


