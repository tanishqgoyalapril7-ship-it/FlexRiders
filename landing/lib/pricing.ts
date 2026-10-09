/**
 * Website campaign pricing (owner's current rules, 2026-10). Linear per vehicle, different per type:
 *   Bike: ₹1,000 per rider, no minimum          → 10 = ₹10,000, 20 = ₹20,000, 30 = ₹30,000
 *   Auto: ₹1,200 per auto, minimum 10 autos      → 10 = ₹12,000 (minimum), 20 = ₹24,000, 30 = ₹36,000
 * Every price on the site is computed from PRICING; change the rates here.
 * TODO(owner): confirm whether the rate is per campaign or per day before publishing, then set `unit`.
 */
export type VehicleKind = "bike" | "auto";

export const MAX_VEHICLES = 100;

export const PRICING: Record<
  VehicleKind,
  { rate: number; min: number; presets: number[]; label: string; plural: string; unit: string; enquiry: string }
> = {
  bike: { rate: 1000, min: 1, presets: [1, 10, 20, 30], label: "Bike rider", plural: "Bike riders", unit: "rider", enquiry: "RIDER_BIKE" },
  auto: { rate: 1200, min: 10, presets: [10, 20, 30], label: "Auto", plural: "Autos", unit: "auto", enquiry: "AUTO" },
};

/** Clamp to the vehicle type's minimum order and the site maximum. */
export const clampCount = (kind: VehicleKind, n: number) =>
  Math.min(MAX_VEHICLES, Math.max(PRICING[kind].min, Math.round(n) || PRICING[kind].min));

export const campaignCost = (kind: VehicleKind, n: number) => clampCount(kind, n) * PRICING[kind].rate;

export const minCampaign = (kind: VehicleKind) => PRICING[kind].min * PRICING[kind].rate;

export const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Qualitative coverage tier (no invented impression numbers). */
export function coverageTier(kind: VehicleKind, n: number): { label: string; text: string } {
  if (kind === "bike") {
    if (n <= 1) return { label: "One neighbourhood route", text: "Street-level visibility along one rider's daily route." };
    if (n <= 10) return { label: "Several neighbourhoods", text: "Riders spread across the lanes and markets around your target area." };
    if (n <= 20) return { label: "Wide local area", text: "Multiple sectors covered at street level, day after day." };
    return { label: "Broad city-area coverage", text: "Your brand seen across a large part of the city's neighbourhoods." };
  }
  if (n <= 10) return { label: "Key roads around your area", text: "Autos on the main roads, signals and markets near your target area." };
  if (n <= 20) return { label: "Wide road network", text: "High-visibility presence across many of the area's busiest roads." };
  return { label: "Broad city-road coverage", text: "Your brand on the move across a large part of the city's road network." };
}

/** The owner's illustrative per-vehicle figures. Never presented as guarantees. */
export const ILLUSTRATIVE = {
  homeVisitsPerRiderPerDay: 20,
  autoJourneyMin: 30,
  autoExposureMin: 20,
  autoSignalSec: 90,
};

/** "Start My Campaign" sends the chosen plan to the enquiry form with this window event. */
export const PLAN_EVENT = "flexriders:plan";
export type PlanDetail = { kind: VehicleKind; count: number; cost: number };

export const planSummary = ({ kind, count, cost }: PlanDetail) => {
  const what = kind === "bike" ? (count === 1 ? "bike rider" : "bike riders") : count === 1 ? "auto" : "autos";
  return `Campaign plan: ${count} ${what}, estimated cost ${inr(cost)}.`;
};
