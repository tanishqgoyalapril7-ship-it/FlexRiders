"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { VehicleKind } from "@/lib/pricing";
import s from "./RealCoverageMap.module.css";

/* A real map (OpenStreetMap tiles, as in the rider app and dashboard) for the campaign planner.
   Real: the target place (from the backend's area search) and the campaign reach radius (the backend's
   campaign defaults: where it starts and how far it can expand). Illustrative: the vehicle zones, spread
   out from the target as the campaign grows. They are never shown as rider positions. */

export type Target = { label: string; lat: number; lng: number };
export type ReachRadius = { initialKm: number; maxKm: number };

// OpenStreetMap's standard tiles (light use, attribution required: osm.wiki/Tile_usage_policy).
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const SHOWN = 30;
const ZONE_KM: Record<VehicleKind, number> = { bike: 0.45, auto: 0.75 };
const COLOR: Record<VehicleKind, string> = { bike: "#2e9bfa", auto: "#e08a00" };

/** Zone i of SHOWN on a golden-angle spiral: the first zones hug the target, later ones reach outward. */
function zoneCentre(t: Target, i: number, maxKm: number): [number, number] {
  const angle = i * 2.39996;
  const d = maxKm * 0.92 * Math.sqrt((i + 0.6) / SHOWN);
  const dLat = (d * Math.cos(angle)) / 111.32;
  const dLng = (d * Math.sin(angle)) / (111.32 * Math.cos((t.lat * Math.PI) / 180));
  return [t.lat + dLat, t.lng + dLng];
}

export default function RealCoverageMap({
  kind,
  count,
  target,
  radius,
  isExample,
  onFail,
}: {
  kind: VehicleKind;
  count: number;
  target: Target;
  radius: ReachRadius;
  isExample: boolean;
  onFail: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; rings: Leaflet.LayerGroup; zones: Leaflet.Circle[]; pin: Leaflet.Marker } | null>(null);
  const [ready, setReady] = useState(false);
  const [zoneTick, setZoneTick] = useState(0); // bumped when zones must be rebuilt around a new target

  // Load Leaflet only when the planner comes near the viewport.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let cancelled = false;
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting || mapRef.current) return;
        io.disconnect();
        try {
          const L = (await import("leaflet")).default;
          if (cancelled || !boxRef.current) return;
          const touch = window.matchMedia("(pointer: coarse)").matches;
          // A view must exist before any layer is added (the effects below then fit it to the reach radius).
          const map = L.map(boxRef.current, {
            center: [target.lat, target.lng],
            zoom: 12,
            zoomControl: true,
            scrollWheelZoom: false, // never hijack page scrolling
            dragging: !touch, // one-finger swipes keep scrolling the page on phones
            attributionControl: true,
          });
          L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
          const rings = L.layerGroup().addTo(map);
          const pin = L.marker([target.lat, target.lng], {
            icon: L.divIcon({ className: s.pinIcon, html: "<span></span>", iconSize: [22, 22], iconAnchor: [11, 11] }),
            keyboard: false,
            interactive: false,
          }).addTo(map);
          mapRef.current = { L, map, rings, zones: [], pin };
          setReady(true);
        } catch {
          if (!cancelled) onFail();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Target and reach rings.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const { L, map, rings, pin } = m;
    const centre: [number, number] = [target.lat, target.lng];
    pin.setLatLng(centre);
    rings.clearLayers();
    const max = L.circle(centre, {
      radius: radius.maxKm * 1000,
      color: "#0b2a52",
      weight: 1.5,
      dashArray: "6 6",
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(rings);
    L.circle(centre, { radius: radius.initialKm * 1000, color: "#0068d8", weight: 2, fillOpacity: 0.06, interactive: false }).addTo(rings);
    map.fitBounds(max.getBounds(), { padding: [12, 12], animate: !isExample });
    // Zones were placed around the old target: rebuild them around the new one.
    m.zones.forEach((z) => z.remove());
    m.zones = [];
    setZoneTick((t) => t + 1);
  }, [ready, target, radius, isExample]);

  // Vehicle zones: add or remove only the difference, so existing zones stay put.
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const shown = Math.min(count, SHOWN);
    while (m.zones.length > shown) m.zones.pop()!.remove();
    m.zones.forEach((z) => z.setStyle({ color: COLOR[kind], fillColor: COLOR[kind] }).setRadius(ZONE_KM[kind] * 1000));
    for (let i = m.zones.length; i < shown; i++) {
      m.zones.push(
        m.L.circle(zoneCentre(target, i, radius.maxKm), {
          radius: ZONE_KM[kind] * 1000,
          color: COLOR[kind],
          fillColor: COLOR[kind],
          weight: 1,
          opacity: 0.6,
          fillOpacity: 0.28,
          className: s.zone,
          interactive: false,
        }).addTo(m.map),
      );
    }
  }, [ready, count, kind, target, radius, zoneTick]);

  const more = count - Math.min(count, SHOWN);

  return (
    <div className={s.wrap}>
      <div ref={boxRef} className={s.map} role="img" aria-label={`Map of ${target.label} with the campaign reach radius and ${count} illustrative ${kind === "bike" ? "bike rider" : "auto"} zones`} />
      <span className={s.area}>
        {isExample ? `Example area: ${target.label}` : `Your target area: ${target.label}`}
      </span>
      {more > 0 && <span className={s.more}>+{more.toLocaleString("en-IN")} more</span>}
      <div className={s.legend} aria-hidden="true">
        <span>
          <i className={s.lStart} /> Starts at {radius.initialKm} km
        </span>
        <span>
          <i className={s.lMax} /> Can expand to {radius.maxKm} km
        </span>
        <span>
          <i className={s.lZone} style={{ background: COLOR[kind] }} /> Illustrative zones, not live rider positions
        </span>
      </div>
    </div>
  );
}
