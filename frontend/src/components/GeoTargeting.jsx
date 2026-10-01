import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, MapPin, Pause, Play, Plus, Search, X } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Search real places (backend geocoder) and pick one: onPick({label, lat, lng}). */
export function AreaSearch({ value, onPick, placeholder = 'Search area, sector or locality' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      setError('');
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const found = await api.searchAreas(q.trim());
        setResults(found);
        if (!found.length) setError('No places found. Try adding the city, e.g. "Sector 54 Gurugram".');
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div className="area-search">
      {value ? (
        <div className="area-chosen">
          <MapPin size={15} color="#2563EB" />
          <span>
            <strong>{value.label}</strong>
            <small>
              {Number(value.lat).toFixed(5)}, {Number(value.lng).toFixed(5)}
            </small>
          </span>
          <button type="button" className="icon-btn" onClick={() => onPick(null)} aria-label="Change area">
            <X size={15} />
          </button>
        </div>
      ) : (
        <>
          <div className="area-input">
            <Search size={15} color="#94A3B8" />
            <input className="form-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
          </div>
          {busy ? <div className="form-hint">Searching…</div> : null}
          {error ? <div className="form-hint" style={{ color: '#B45309' }}>{error}</div> : null}
          {results.length ? (
            <div className="area-results">
              {results.map((r) => (
                <button
                  type="button"
                  key={`${r.lat},${r.lng}`}
                  onClick={() => {
                    onPick({ label: r.label, lat: r.lat, lng: r.lng });
                    setQ('');
                    setResults([]);
                  }}
                >
                  <strong>{r.label}</strong>
                  <small>{r.description}</small>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Target + radius expansion inputs for campaign forms. `form` holds the same keys the API uses. */
export function GeoFields({ form, set }) {
  const target = form.target_lat != null && form.target_lng != null ? { label: form.location_area, lat: form.target_lat, lng: form.target_lng } : null;
  const num = (key) => (e) => set(key)(e.target.value === '' ? null : Number(e.target.value));
  return (
    <div className="geo-fields">
      <div className="form-group">
        <label className="form-label">Target location</label>
        <AreaSearch
          value={target}
          onPick={(p) => {
            set('target_lat')(p ? p.lat : null);
            set('target_lng')(p ? p.lng : null);
            if (p) set('location_area')(p.label);
          }}
        />
        <span className="form-hint">Riders are matched from this point. Leave empty to show the campaign to all eligible riders.</span>
      </div>
      {target ? (
        <div className="form-row geo-grid">
          <div className="form-group">
            <label className="form-label">Initial radius (km) *</label>
            <input className="form-input" type="number" min="0.1" step="0.1" value={form.initial_radius_km ?? ''} onChange={num('initial_radius_km')} />
          </div>
          <div className="form-group">
            <label className="form-label">Maximum radius (km)</label>
            <input className="form-input" type="number" min="0.1" step="0.1" value={form.max_radius_km ?? ''} onChange={num('max_radius_km')} />
          </div>
          <div className="form-group">
            <label className="form-label">Expand by (km)</label>
            <input className="form-input" type="number" min="0.1" step="0.1" value={form.expansion_step_km ?? ''} onChange={num('expansion_step_km')} />
          </div>
          <div className="form-group">
            <label className="form-label">Every (minutes)</label>
            <input className="form-input" type="number" min="5" step="5" value={form.expansion_interval_min ?? ''} onChange={num('expansion_interval_min')} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const MODE_TONE = { AUTOMATIC: 'pill-on_track', PAUSED: 'pill-at_risk', AT_MAX: 'pill-draft', FILLED: 'pill-approved', WAITING: 'pill-draft', FIXED: 'pill-draft' };

function relative(iso) {
  if (!iso) return null;
  const mins = Math.round((new Date(iso) - Date.now()) / 60000);
  if (mins <= 0) return 'due now';
  return mins < 60 ? `in ${mins} min` : `in ${Math.floor(mins / 60)} h ${mins % 60} min`;
}

/** Admin campaign detail: target, radii and live expansion state, with manual controls and matching. */
export function GeoPanel({ campaign, onChanged }) {
  const geo = campaign.geo;
  const mapEl = useRef(null);
  const [busy, setBusy] = useState(false);
  const [radius, setRadius] = useState('');
  const [matching, setMatching] = useState(null);

  useEffect(() => {
    if (!geo || !geo.targeted || !mapEl.current) return undefined;
    const center = [geo.target_lat, geo.target_lng];
    const map = L.map(mapEl.current, { zoomControl: true, scrollWheelZoom: false }).setView(center, 12);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
    if (geo.max_radius_km) L.circle(center, { radius: geo.max_radius_km * 1000, color: '#94A3B8', weight: 1, dashArray: '4 4', fillOpacity: 0 }).addTo(map);
    const current = L.circle(center, { radius: geo.current_radius_km * 1000, color: '#2563EB', weight: 2, fillOpacity: 0.08 }).addTo(map);
    L.circleMarker(center, { radius: 7, color: '#FFFFFF', weight: 3, fillColor: '#2563EB', fillOpacity: 1 }).bindTooltip(geo.target_label || 'Target').addTo(map);
    map.fitBounds(current.getBounds(), { padding: [20, 20] });
    return () => map.remove();
  }, [geo && geo.target_lat, geo && geo.target_lng, geo && geo.current_radius_km, geo && geo.max_radius_km]);

  if (!geo || !geo.targeted) {
    return (
      <div className="card geo-panel">
        <div className="geo-head">
          <strong>
            <Crosshair size={16} /> Geo-targeting
          </strong>
          <span className="status-pill pill-draft">Not targeted</span>
        </div>
        <p className="form-hint" style={{ margin: 0 }}>
          This campaign has no target location, so every eligible rider can see it. Edit the campaign to add a target and radius.
        </p>
      </div>
    );
  }

  const act = async (action, value) => {
    setBusy(true);
    try {
      await api.campaignGeoAction(campaign.id, action, value);
      toast.success(
        { expand: 'Radius expanded.', pause: 'Automatic expansion paused.', resume: 'Automatic expansion resumed.', set: 'Radius updated.' }[action],
      );
      setRadius('');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadMatching = async () => {
    try {
      setMatching((await api.getCampaignMatching(campaign.id)).riders);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const closed = ['COMPLETED', 'CANCELLED'].includes(campaign.status);
  return (
    <div className="card geo-panel">
      <div className="geo-head">
        <strong>
          <Crosshair size={16} /> Geo-targeting · {geo.target_label || 'Target'}
        </strong>
        <span className={`status-pill ${MODE_TONE[geo.expansion_mode] || 'pill-draft'}`}>{geo.expansion_label}</span>
      </div>
      <div className="geo-body">
        <div ref={mapEl} className="geo-map" />
        <div className="geo-facts">
          <div>
            <span>Initial radius</span>
            <strong>{geo.initial_radius_km} km</strong>
          </div>
          <div>
            <span>Current radius</span>
            <strong>{geo.current_radius_km} km</strong>
          </div>
          <div>
            <span>Maximum radius</span>
            <strong>{geo.max_radius_km != null ? `${geo.max_radius_km} km` : '—'}</strong>
          </div>
          <div>
            <span>Expansion</span>
            <strong>
              {geo.expansion_step_km && geo.expansion_interval_min ? `+${geo.expansion_step_km} km every ${geo.expansion_interval_min} min` : 'Not configured'}
            </strong>
          </div>
          <div>
            <span>Slots</span>
            <strong>
              {geo.filled_riders} / {geo.required_riders}
            </strong>
          </div>
          <div>
            <span>Next expansion</span>
            <strong>{relative(geo.next_expansion_at) || '—'}</strong>
          </div>
          {!closed ? (
            <div className="geo-actions">
              <button className="btn-secondary" disabled={busy || !geo.expansion_step_km} onClick={() => act('expand')}>
                <Plus size={14} /> Expand now
              </button>
              {geo.expansion_paused ? (
                <button className="btn-secondary" disabled={busy} onClick={() => act('resume')}>
                  <Play size={14} /> Resume
                </button>
              ) : (
                <button className="btn-secondary" disabled={busy} onClick={() => act('pause')}>
                  <Pause size={14} /> Pause
                </button>
              )}
              <span className="geo-set">
                <input className="form-input" type="number" min="0.1" step="0.1" placeholder="km" value={radius} onChange={(e) => setRadius(e.target.value)} />
                <button className="btn-secondary" disabled={busy || !radius} onClick={() => act('set', Number(radius))}>
                  Set radius
                </button>
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="geo-matching">
        {matching == null ? (
          <button className="btn-link" onClick={loadMatching}>
            Show riders this campaign reaches
          </button>
        ) : matching.length === 0 ? (
          <p className="form-hint">No riders are currently in reach (by recent location or working area).</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Rider</th>
                <th>Priority</th>
                <th>Distance now</th>
                <th>Working area</th>
                <th>Can join</th>
              </tr>
            </thead>
            <tbody>
              {matching.map((m) => (
                <tr key={m.rider.id}>
                  <td>
                    {m.rider.full_name} <small style={{ color: '#94A3B8' }}>{m.rider.rider_id}</small>
                  </td>
                  <td>
                    {m.tier}. {m.tier_label}
                  </td>
                  <td>{m.distance_km != null ? `${m.distance_km} km` : 'No recent location'}</td>
                  <td>{m.working_area || '—'}</td>
                  <td>{m.can_join ? 'Yes' : <span title={m.reason}>No · {m.reason}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/** Approve / request changes / reject a brand's campaign request, with a note to the brand. */
export function ReviewDialog({ campaign, action, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const copy = {
    approve: { title: 'Approve campaign request', button: 'Approve', hint: 'Optional note to the brand.' },
    request_changes: { title: 'Request changes', button: 'Send to brand', hint: 'Tell the brand what to change (required).' },
    reject: { title: 'Reject campaign request', button: 'Reject', hint: 'Reason shown to the brand (required).' },
  }[action];
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.reviewCampaign(campaign.id, action, note.trim() || null);
      toast.success(
        { approve: 'Approved. Publish it when it should go live for riders.', request_changes: 'Changes requested.', reject: 'Campaign rejected.' }[action],
      );
      onDone();
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 140 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">{copy.title}</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <p className="danger-message">
            <strong>{campaign.name}</strong> ({campaign.code}) from <strong>{campaign.brand_name}</strong>.
            {action === 'approve' ? ' Approval does not make it live: riders see it only after you publish it.' : ''}
          </p>
          <div className="form-group">
            <label className="form-label">Note</label>
            <textarea className="form-input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
            <span className="form-hint">{copy.hint}</span>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={action === 'reject' ? 'btn-danger' : 'btn-primary'} onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : copy.button}
          </button>
        </div>
      </div>
    </div>
  );
}
