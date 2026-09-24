import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { formatDate } from './CampaignShared';

// Map tiles: OpenStreetMap needs no API key (fine for light admin use). To use a paid provider,
// set VITE_MAP_TILE_URL (and VITE_MAP_ATTRIBUTION) in frontend/.env.
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const LIVE_REFRESH_MS = 30000; // Today's route refreshes while the map is open

// One colour per rider on the "all riders" map (green and red are reserved for start/end).
const ROUTE_COLORS = ['#2563EB', '#7C3AED', '#EA580C', '#0891B2', '#DB2777', '#4F46E5', '#CA8A04', '#0D9488'];

const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Campaign days up to today (newest first), for the date picker. */
function campaignDays(campaign) {
  const days = [];
  const start = new Date(`${campaign.start_date}T00:00:00`);
  const end = new Date(`${campaign.effective_end_date || campaign.end_date}T00:00:00`);
  const today = new Date(`${toISO(new Date())}T00:00:00`);
  for (let d = new Date(Math.min(end, today)); d >= start; d.setDate(d.getDate() - 1)) days.push(toISO(d));
  return days;
}

function marker(latlng, color) {
  return L.circleMarker(latlng, { radius: 8, color: '#FFFFFF', weight: 3, fillColor: color, fillOpacity: 1 });
}

/**
 * Visual route only: rider, campaign, date and the route line with start (green) and end (red).
 * `assignment` = one rider's row from the Riders tab; omit it for all riders.
 */
export function RouteMapModal({ campaign, assignment, onClose }) {
  const mapEl = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const days = campaignDays(campaign);
  const [day, setDay] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [error, setError] = useState('');
  const assignmentId = assignment ? assignment.assignment_id : null;

  // Default to the most recent day that has a route.
  useEffect(() => {
    api
      .getRouteDates(campaign.id, assignmentId)
      .then((dates) => setDay(dates.length ? dates[dates.length - 1] : days[0] || toISO(new Date())))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    map.current = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([28.4595, 77.0266], 11);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  // Load the day's routes; today's keeps refreshing so a route being recorded appears as it comes in.
  const fitted = useRef(false);
  useEffect(() => {
    if (!day) return undefined;
    setRoutes(null);
    fitted.current = false;
    const load = () =>
      api
        .getRoutes(campaign.id, day, assignmentId)
        .then((data) => setRoutes(data.routes))
        .catch((err) => setError(err.message));
    load();
    if (day !== toISO(new Date())) return undefined;
    const id = setInterval(load, LIVE_REFRESH_MS);
    return () => clearInterval(id);
  }, [day]);

  // Draw the routes and fit the map to them.
  useEffect(() => {
    if (!routes || !layer.current) return;
    layer.current.clearLayers();
    const bounds = L.latLngBounds([]);
    routes.forEach((route, i) => {
      const color = assignmentId ? ROUTE_COLORS[0] : ROUTE_COLORS[i % ROUTE_COLORS.length];
      const name = route.rider ? route.rider.full_name : 'Rider';
      // A soft white casing under the line keeps it readable on any map background.
      L.polyline(route.points, { color: '#FFFFFF', weight: 9, opacity: 0.85, lineJoin: 'round', lineCap: 'round' }).addTo(layer.current);
      const line = L.polyline(route.points, { color, weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(layer.current);
      if (!assignmentId) line.bindTooltip(name, { sticky: true, className: 'route-tooltip' });
      marker(route.points[0], '#16A34A').bindTooltip(`Start${assignmentId ? '' : ` · ${name}`}`).addTo(layer.current);
      marker(route.points[route.points.length - 1], '#DC2626').bindTooltip(`End${assignmentId ? '' : ` · ${name}`}`).addTo(layer.current);
      bounds.extend(line.getBounds());
    });
    // Zoom to the route once per day; refreshes keep the admin's own pan/zoom.
    if (bounds.isValid() && !fitted.current) {
      map.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
      fitted.current = true;
    }
  }, [routes]);

  const title = assignment ? assignment.rider.full_name : 'All riders';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog route-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="route-header">
          <div className="route-meta">
            <div>
              <span className="route-meta-label">Rider</span>
              <strong>{title}</strong>
            </div>
            <div>
              <span className="route-meta-label">Campaign</span>
              <strong>{campaign.name}</strong>
            </div>
            <div>
              <span className="route-meta-label">Date</span>
              <select className="form-input route-date" value={day || ''} onChange={(e) => setDay(e.target.value)} aria-label="Route date">
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDate(d)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={22} />
          </button>
        </div>
        <div className="route-map-wrap">
          <div ref={mapEl} className="route-map" />
          {error ? <div className="route-empty">{error}</div> : null}
          {!error && routes && routes.length === 0 ? <div className="route-empty">No route available for this day.</div> : null}
        </div>
      </div>
    </div>
  );
}
