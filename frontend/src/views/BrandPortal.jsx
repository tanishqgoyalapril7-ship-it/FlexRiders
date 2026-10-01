import logoDark from '../assets/fr-mark-dark.png';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, CalendarDays, Camera, Hash, IndianRupee, LogOut, MapPin, Users } from 'lucide-react';
import { subscribeSignals } from '../services/realtime';

/** Brand web portal (/brand, /brand/campaign/<id>): the brand app's campaign view in the browser, so a brand
 *  on an iPhone (or a computer) sees its campaigns, riders, approved photos and rider routes. It uses the same
 *  brand (customer) API and login as the Android app, and its own login, separate from the admin dashboard. */

const API = '/api/v1';
const TOKEN_KEY = 'fr_brand_token';
const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// Clean, light base map for the per-rider activity cards (like a fitness app's activity map).
const CARD_TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const CARD_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ACTIVITY_ORANGE = '#FC4C02';
const ROUTE_COLORS = ['#2563EB', '#16A34A', '#DC2626', '#9333EA', '#EA580C', '#0891B2', '#DB2777', '#65A30D'];
const STATUS_TONE = { LIVE: 'pub-pill-live', APPROVED: 'pub-pill-open', REQUESTED: 'bp-pill-wait', CHANGES_REQUESTED: 'bp-pill-wait' };

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
};
const saveToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private browsing: the login lasts for this page only.
  }
};

class SignedOut extends Error {}

async function brandGet(path, token) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) throw new SignedOut('Please log in again.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.');
  return data;
}

const fmtDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
const inr = (n) => (n == null ? '–' : `₹${Number(n).toLocaleString('en-IN')}`);
const go = (path) => {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

export default function BrandPortal() {
  const [token, setToken] = useState(readToken);
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const logout = useCallback(() => {
    saveToken('');
    setToken('');
  }, []);
  const campaignId = Number((path.match(/^\/brand\/campaign\/(\d+)/) || [])[1]) || null;

  return (
    <div className="pub-page">
      <header className="pub-top">
        <img className="pub-logo-img" src={logoDark} alt="FlexRiders" />
        <span className="pub-brandline">FlexRiders · Brand</span>
        {token ? (
          <button className="bp-link bp-logout" onClick={logout}>
            <LogOut size={15} /> Log out
          </button>
        ) : null}
      </header>
      {!token ? (
        <Login
          onLoggedIn={(t) => {
            saveToken(t);
            setToken(t);
          }}
        />
      ) : campaignId ? (
        <CampaignView id={campaignId} token={token} onSignedOut={logout} />
      ) : (
        <CampaignList token={token} onSignedOut={logout} />
      )}
      <footer className="pub-footer">Powered by FlexRiders</footer>
    </div>
  );
}

function Login({ onLoggedIn }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const id = identifier.trim();
    if (!id || !password) return setError('Enter your mobile number or email and your password.');
    setBusy(true);
    try {
      const isEmail = id.includes('@');
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(isEmail ? { email: id } : { phone: id.replace(/[\s+]/g, '') }), password, role_requested: 'CUSTOMER' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Invalid mobile / email or password.');
      if (data.role !== 'CUSTOMER') throw new Error('This is not a brand account. Riders use the FlexRiders app.');
      onLoggedIn(data.access_token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pub-card bp-login" onSubmit={submit}>
      <h1 className="pub-title">Brand login</h1>
      <p className="pub-muted">See your campaigns, the riders taking part, approved photos and rider routes, live.</p>
      <label className="bp-label">
        Mobile number or email
        <input className="bp-input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="98765 43210 or name@company.com" />
      </label>
      <label className="bp-label">
        Password
        <input className="bp-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error ? <p className="bp-error">{error}</p> : null}
      <button className="pub-cta bp-submit" type="submit" disabled={busy}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
      <p className="pub-muted">Use the same login as the FlexRiders brand app. New brand? Sign up in the FlexRiders app.</p>
    </form>
  );
}

/** Reloads when FlexRiders signals a change to this brand's campaigns (status, riders, photos). */
function useBrandSignals(token, onChange) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    let stop = () => {};
    let cancelled = false;
    brandGet('/customer/realtime', token)
      .then((config) => {
        if (!cancelled) stop = subscribeSignals(config, (payload) => handler.current(payload));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, [token]);
}

function CampaignList({ token, onSignedOut }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    brandGet('/customer/campaigns', token)
      .then(setRows)
      .catch((err) => (err instanceof SignedOut ? onSignedOut() : setError(err.message)));
  }, [token, onSignedOut]);
  useEffect(load, [load]);
  useBrandSignals(token, load);

  if (error) return <div className="pub-card pub-empty">{error}</div>;
  if (!rows) return <div className="pub-card pub-empty">Loading your campaigns…</div>;
  return (
    <main className="pub-card">
      <h1 className="pub-title">Your campaigns</h1>
      {!rows.length ? <p className="pub-muted">No campaigns yet. Create one in the FlexRiders brand app.</p> : null}
      <div className="bp-list">
        {rows.map((c) => (
          <button key={c.id} className="bp-row" onClick={() => go(`/brand/campaign/${c.id}`)}>
            {c.image_url ? <img src={c.image_url} alt="" className="bp-thumb" /> : <span className="bp-thumb bp-thumb-empty">{(c.name || '?').charAt(0)}</span>}
            <span className="bp-row-main">
              <strong>{c.name}</strong>
              <span className="pub-muted bp-row-meta">
                {c.campaign_code} · {fmtDate(c.start_date)} – {fmtDate(c.end_date)}
              </span>
              <span className="pub-muted bp-row-meta">
                {c.joined_riders} / {c.required_riders} riders · {c.approved_photos} approved photos
              </span>
            </span>
            <span className={`pub-pill ${STATUS_TONE[c.brand_status] || ''}`}>{c.status_label}</span>
          </button>
        ))}
      </div>
    </main>
  );
}

function CampaignView({ id, token, onSignedOut }) {
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [version, setVersion] = useState(0); // Bumped by realtime signals so the open tab reloads too
  const load = useCallback(() => {
    brandGet(`/customer/campaigns/${id}`, token)
      .then((d) => {
        setC(d);
        document.title = `${d.name} · FlexRiders`;
      })
      .catch((err) => (err instanceof SignedOut ? onSignedOut() : setError(err.message)));
  }, [id, token, onSignedOut]);
  useEffect(load, [load]);
  useBrandSignals(token, (payload) => {
    if (!payload.campaign_id || Number(payload.campaign_id) === id) {
      load();
      setVersion((v) => v + 1);
    }
  });

  if (error) {
    return (
      <div className="pub-card pub-empty">
        <h1>Campaign not available</h1>
        <p>{error}</p>
        <button className="bp-link" onClick={() => go('/brand')}>
          <ArrowLeft size={15} /> All campaigns
        </button>
      </div>
    );
  }
  if (!c) return <div className="pub-card pub-empty">Loading campaign…</div>;
  const facts = [
    [Hash, 'Campaign ID', c.campaign_code],
    [Users, 'Riders', `${c.joined_riders} / ${c.required_riders}`],
    [CalendarDays, 'Campaign dates', `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`],
    c.location_area ? [MapPin, 'Location / area', c.location_area] : null,
    [Camera, 'Approved photos', String(c.approved_photos)],
    c.daily_rate ? [IndianRupee, 'Rider payout', `${inr(c.daily_rate)} / day`] : null,
  ].filter(Boolean);

  return (
    <main className="pub-card">
      <button className="bp-link" onClick={() => go('/brand')}>
        <ArrowLeft size={15} /> All campaigns
      </button>
      {c.image_url ? <img className="pub-banner bp-banner" src={c.image_url} alt="" /> : null}
      <div className="pub-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pub-brand-name">{c.brand_name}</div>
          <h1 className="pub-title">{c.name}</h1>
        </div>
        <span className={`pub-pill ${STATUS_TONE[c.brand_status] || ''}`}>{c.status_label}</span>
      </div>
      {c.admin_feedback && ['CHANGES_REQUESTED', 'REJECTED'].includes(c.brand_status) ? (
        <div className="bp-feedback">
          <strong>FlexRiders feedback</strong>
          <p>{c.admin_feedback}</p>
        </div>
      ) : null}

      <div className="bp-tabs" role="tablist">
        {[
          ['overview', 'Overview'],
          ['riders', 'Riders'],
          ['photos', 'Photos'],
          ['map', 'Map'],
        ].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <>
          <div className="pub-facts">
            {facts.map(([Icon, label, value]) => (
              <div key={label} className="pub-fact">
                <Icon size={18} />
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              </div>
            ))}
          </div>
          {c.description ? <p className="pub-desc">{c.description}</p> : null}
          {c.contract_amount ? (
            <section className="pub-section">
              <h2>Payments</h2>
              <p className="pub-muted">
                Contract {inr(c.contract_amount)} · Paid {inr(c.total_paid)} · Remaining {inr(c.remaining_amount)}
              </p>
            </section>
          ) : null}
        </>
      ) : null}
      {tab === 'riders' ? <RidersTab id={id} token={token} version={version} onSignedOut={onSignedOut} /> : null}
      {tab === 'photos' ? <PhotosTab id={id} token={token} version={version} onSignedOut={onSignedOut} /> : null}
      {tab === 'map' ? <MapTab id={id} token={token} version={version} onSignedOut={onSignedOut} /> : null}
    </main>
  );
}

/** Loads `path` (again whenever `version` changes); handles sign-out and errors the same way for every tab. */
function useTabData(path, token, version, onSignedOut) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    brandGet(path, token)
      .then((d) => live && (setData(d), setError('')))
      .catch((err) => live && (err instanceof SignedOut ? onSignedOut() : setError(err.message)));
    return () => {
      live = false;
    };
  }, [path, token, version, onSignedOut]);
  return [data, error];
}

function RidersTab({ id, token, version, onSignedOut }) {
  const [data, error] = useTabData(`/customer/campaigns/${id}/riders`, token, version, onSignedOut);
  if (error) return <p className="bp-error">{error}</p>;
  if (!data) return <p className="pub-muted">Loading riders…</p>;
  if (!data.riders.length) return <p className="pub-muted">No riders have joined yet. Riders appear here as soon as they join.</p>;
  return (
    <div className="bp-table-wrap">
      <table className="bp-table">
        <thead>
          <tr>
            <th>Rider</th>
            <th>Status</th>
            <th>Joined</th>
            <th>Approved days</th>
            <th>Approved photos</th>
          </tr>
        </thead>
        <tbody>
          {data.riders.map((r) => (
            <tr key={r.assignment_id}>
              <td>
                <strong>{r.name}</strong>
                <span className="pub-muted bp-row-meta">{r.rider_id}</span>
              </td>
              <td>{r.status_label}</td>
              <td>{fmtDate(r.joined_at)}</td>
              <td>{r.approved_days}</td>
              <td>{r.approved_photos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PhotosTab({ id, token, version, onSignedOut }) {
  const [days] = useTabData(`/customer/campaigns/${id}/photos`, token, version, onSignedOut);
  const [day, setDay] = useState(null);
  const chosen = day || (days && days.days.length ? days.days[0].date : null);
  const [photos, error] = useTabData(chosen ? `/customer/campaigns/${id}/photos?date=${chosen}` : `/customer/campaigns/${id}/photos`, token, version, onSignedOut);
  if (!days) return <p className="pub-muted">Loading photos…</p>;
  if (!days.days.length) return <p className="pub-muted">Approved campaign photos appear here once riders' photos are reviewed by FlexRiders.</p>;
  return (
    <>
      <div className="bp-chips">
        {days.days.map((d) => (
          <button key={d.date} className={d.date === chosen ? 'active' : ''} onClick={() => setDay(d.date)}>
            {fmtDate(d.date)} · {d.approved_photos}
          </button>
        ))}
      </div>
      {error ? <p className="bp-error">{error}</p> : null}
      {photos && photos.photos ? (
        <div className="pub-photos">
          {photos.photos.map((p) => (
            <figure key={p.id}>
              <a href={p.photo_url} target="_blank" rel="noreferrer">
                <img src={p.photo_url} alt={`${p.rider_name || 'Rider'} · ${p.slot_label || ''}`} loading="lazy" />
              </a>
              <figcaption>
                {p.rider_name}
                {p.slot_label ? ` · ${p.slot_label}` : ''}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="pub-muted">Loading photos…</p>
      )}
    </>
  );
}

function MapTab({ id, token, version, onSignedOut }) {
  const [day, setDay] = useState(null);
  const [data, error] = useTabData(`/customer/campaigns/${id}/map${day ? `?date=${day}` : ''}`, token, version, onSignedOut);
  // Open on the latest day with recorded routes.
  useEffect(() => {
    if (!day && data && data.route_dates.length) setDay(data.route_dates[data.route_dates.length - 1]);
  }, [day, data]);
  if (error) return <p className="bp-error">{error}</p>;
  if (!data) return <p className="pub-muted">Loading map…</p>;
  const g = data.geo || {};
  if (!g.targeted && !data.route_dates.length) return <p className="pub-muted">Rider routes appear here once riders record them during the campaign.</p>;
  return (
    <>
      {data.route_dates.length ? (
        <div className="bp-chips">
          {[...data.route_dates].reverse().map((d) => (
            <button key={d} className={d === day ? 'active' : ''} onClick={() => setDay(d)}>
              {fmtDate(d)}
            </button>
          ))}
        </div>
      ) : (
        <p className="pub-muted">No rider routes recorded yet. The circle shows the campaign area.</p>
      )}
      <RoutesMap geo={g} routes={data.routes || []} />
      {data.routes && data.routes.length ? (
        <section className="pub-section">
          <h2>Rider activities · {fmtDate(day)}</h2>
          <div className="bp-activities">
            {data.routes.map((r, i) => (
              <ActivityCard key={`${r.rider_code || r.rider_name}-${i}`} route={r} day={day} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

const fmtDuration = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m` : `${min}m`);

/** One rider's day, like a fitness app activity: who and when, the measured stats, and the route alone. */
function ActivityCard({ route: r, day }) {
  return (
    <article className="bp-activity">
      <header className="bp-activity-head">
        <span className="bp-avatar">{(r.rider_name || '?').charAt(0).toUpperCase()}</span>
        <div className="bp-activity-who">
          <strong>{r.rider_name}</strong>
          <span>
            {fmtDate(day)} · {fmtTime(r.started_at)} – {fmtTime(r.ended_at)}
          </span>
        </div>
        {r.in_progress ? <span className="bp-live">● Today, in progress</span> : null}
      </header>
      <div className="bp-stats">
        <div>
          <span>Distance</span>
          <strong>{Number(r.distance_km).toFixed(1)} km</strong>
        </div>
        <div>
          <span>Time on road</span>
          <strong>{fmtDuration(r.duration_min)}</strong>
        </div>
        <div>
          <span>Approved photos</span>
          <strong>{r.approved_photos}</strong>
        </div>
      </div>
      <ActivityMap points={r.points} />
    </article>
  );
}

/** Just this rider's route on a light map: orange line, green start, dark end. Not draggable, like a card. */
function ActivityMap({ points }) {
  const el = useRef(null);
  useEffect(() => {
    if (!points.length) return undefined;
    const map = L.map(el.current, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false });
    L.tileLayer(CARD_TILE_URL, { maxZoom: 19, attribution: CARD_ATTRIBUTION, subdomains: 'abcd' }).addTo(map);
    map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 16 });
    L.polyline(points, { color: '#FFFFFF', weight: 7, opacity: 0.9 }).addTo(map); // Light edge so the line stands out
    L.polyline(points, { color: ACTIVITY_ORANGE, weight: 4 }).addTo(map);
    L.circleMarker(points[0], { radius: 6, color: '#FFFFFF', weight: 2, fillColor: '#16A34A', fillOpacity: 1 }).bindTooltip('Start').addTo(map);
    L.circleMarker(points[points.length - 1], { radius: 6, color: '#FFFFFF', weight: 2, fillColor: '#0F172A', fillOpacity: 1 }).bindTooltip('End').addTo(map);
    return () => map.remove();
  }, [points]);
  return <div ref={el} className="bp-activity-map" />;
}

/** Campaign area and each rider's route for the chosen day (start in green, end in red), like the brand app. */
function RoutesMap({ geo, routes }) {
  const el = useRef(null);
  useEffect(() => {
    const points = [...(geo.targeted ? [[geo.target_lat, geo.target_lng]] : []), ...routes.flatMap((r) => r.points)];
    if (!points.length) return undefined;
    const map = L.map(el.current, { scrollWheelZoom: false });
    L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map);
    let bounds = L.latLngBounds(points);
    if (geo.targeted) {
      const area = L.latLng(geo.target_lat, geo.target_lng).toBounds(geo.current_radius_km * 2000);
      bounds = routes.length ? bounds.extend(area) : area;
    }
    map.fitBounds(bounds, { padding: [20, 20] });
    if (geo.targeted) {
      L.circle([geo.target_lat, geo.target_lng], { radius: geo.current_radius_km * 1000, color: '#2563EB', weight: 2, fillOpacity: 0.08 })
        .bindTooltip(geo.target_label || 'Campaign area')
        .addTo(map);
    }
    routes.forEach((r, i) => {
      if (!r.points.length) return;
      L.polyline(r.points, { color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: 4 }).bindTooltip(r.rider_name || 'Rider').addTo(map);
      L.circleMarker(r.points[0], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#16A34A', fillOpacity: 1 }).bindTooltip(`Start · ${r.rider_name}`).addTo(map);
      L.circleMarker(r.points[r.points.length - 1], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#DC2626', fillOpacity: 1 })
        .bindTooltip(`End · ${r.rider_name}`)
        .addTo(map);
    });
    return () => map.remove();
  }, [geo, routes]);
  return <div ref={el} className="pub-map bp-map" />;
}
