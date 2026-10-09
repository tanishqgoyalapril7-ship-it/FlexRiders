import type { CSSProperties } from "react";
import type { VehicleKind } from "@/lib/pricing";
import s from "./CoverageMap.module.css";

/* An illustrative coverage map: vehicles appear around "your target area" and their zones spread outward
   as the count grows. Positions are fixed (seeded), so the same count always looks the same. Bikes: many
   tight street-level zones through the neighbourhoods. Autos: larger zones along the main roads. */

const W = 480;
const H = 320;
const CX = 236;
const CY = 168;
const SHOWN = 30; // markers drawn at most; larger campaigns are shown as "+N more"

const MAIN_ROADS: [number, number, number, number][] = [
  [0, 196, 480, 150],
  [212, 0, 252, 320],
  [24, 18, 470, 300],
];
const STREETS: [number, number, number, number][] = [
  [0, 70, 480, 58], [0, 262, 480, 248], [96, 0, 112, 320], [356, 0, 372, 320],
  [0, 118, 210, 110], [260, 226, 480, 214], [150, 0, 160, 120], [310, 200, 322, 320],
];

function rng(seed: number) {
  let x = seed;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const byDistance = (a: [number, number], b: [number, number]) =>
  Math.hypot(a[0] - CX, a[1] - CY) - Math.hypot(b[0] - CX, b[1] - CY);

const BIKE_POINTS: [number, number][] = (() => {
  const r = rng(7);
  const pts: [number, number][] = [];
  while (pts.length < SHOWN) {
    const p: [number, number] = [24 + r() * (W - 48), 22 + r() * (H - 44)];
    if (pts.every((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) > 34)) pts.push(p);
  }
  return pts.sort(byDistance);
})();

const AUTO_POINTS: [number, number][] = (() => {
  const pts: [number, number][] = [];
  MAIN_ROADS.forEach(([x1, y1, x2, y2], k) => {
    for (let t = 0.06 + k * 0.03; t < 1; t += 0.085) pts.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
  });
  return pts.sort(byDistance).slice(0, SHOWN);
})();

export default function CoverageMap({
  kind,
  count,
  label,
  className,
}: {
  kind: VehicleKind;
  count: number;
  label?: string;
  className?: string;
}) {
  const points = kind === "bike" ? BIKE_POINTS : AUTO_POINTS;
  const shown = Math.min(count, SHOWN);
  const more = count - shown;
  return (
    <div className={[s.map, className].filter(Boolean).join(" ")} data-kind={kind}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? `Illustrative coverage map with ${count} ${kind === "bike" ? "bike riders" : "autos"} around your target area`}>
        <defs>
          <pattern id="cm-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="currentColor" strokeOpacity="0.06" />
          </pattern>
        </defs>
        <rect width={W} height={H} className={s.ground} />
        <rect width={W} height={H} fill="url(#cm-grid)" />
        {STREETS.map(([x1, y1, x2, y2], i) => (
          <line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={s.street} />
        ))}
        {MAIN_ROADS.map(([x1, y1, x2, y2], i) => (
          <line key={`m${i}`} x1={x1} y1={y1} x2={x2} y2={y2} className={s.road} />
        ))}

        <g className={s.zones}>
          {points.map(([x, y], i) => (
            <circle
              key={`z${kind}${i}`}
              cx={x}
              cy={y}
              r={kind === "bike" ? 30 : 46}
              className={s.zone}
              data-on={i < shown || undefined}
              style={{ "--d": `${(i % 10) * 28}ms` } as CSSProperties}
            />
          ))}
        </g>
        <g>
          {points.map(([x, y], i) => (
            <circle
              key={`v${kind}${i}`}
              cx={x}
              cy={y}
              r={kind === "bike" ? 4.5 : 6}
              className={s.vehicle}
              data-on={i < shown || undefined}
              style={{ "--d": `${(i % 10) * 28 + 80}ms` } as CSSProperties}
            />
          ))}
        </g>

        <g className={s.target}>
          <circle cx={CX} cy={CY} r="14" className={s.targetPulse} />
          <circle cx={CX} cy={CY} r="7" className={s.targetDot} />
        </g>
      </svg>
      <span className={s.targetLabel}>Your target area</span>
      {more > 0 && <span className={s.more}>+{more.toLocaleString("en-IN")} more</span>}
    </div>
  );
}
