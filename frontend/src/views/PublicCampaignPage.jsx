import logoDark from '../assets/fr-mark-dark.png';
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Bike, CalendarDays, Camera, CheckCircle2, Clock, Hash, MapPin, Shirt, Smartphone, Users } from 'lucide-react';
import { api } from '../services/api';

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** The campaign's target area only (never rider positions). */
function AreaMap({ area, label }) {
  const el = useRef(null);
  useEffect(() => {
    // The view must be set before layers are added (a circle has no bounds until it is on a map with a view).
    const bounds = L.latLng(area.lat, area.lng).toBounds(area.radius_km * 2000);
    const map = L.map(el.current, { scrollWheelZoom: false, attributionControl: true }).fitBounds(bounds, { padding: [16, 16] });
    L.tileLayer(TILE_URL, { maxZoom: 18, attribution: TILE_ATTRIBUTION }).addTo(map);
    const circle = L.circle([area.lat, area.lng], { radius: area.radius_km * 1000, color: '#2563EB', weight: 2, fillOpacity: 0.1 }).addTo(map);
    if (label) circle.bindTooltip(label);
    return () => map.remove();
  }, [area.lat, area.lng, area.radius_km]);
  return <div ref={el} className="pub-map" />;
}

/** Approved campaign photos (newest first), loaded a page at a time. */
function ApprovedPhotos({ slug, initial }) {
  const [items, setItems] = useState(initial.items);
  const [next, setNext] = useState(initial.next_before_id);
  const [busy, setBusy] = useState(false);
  const more = async () => {
    setBusy(true);
    try {
      const page = await api.getPublicCampaignPhotos(slug, next);
      setItems((prev) => [...prev, ...page.items]);
      setNext(page.next_before_id);
    } finally {
      setBusy(false);
    }
  };
  if (!items.length) return <p className="pub-muted">Approved campaign photos will appear here once riders' photos are reviewed.</p>;
  return (
    <>
      <div className="pub-photos">
        {items.map((p) => (
          <figure key={p.id}>
            <a href={p.photo_url} target="_blank" rel="noreferrer">
              <img src={p.photo_url} alt={`Campaign photo, ${fmtDate(p.date)}`} loading="lazy" />
            </a>
            <figcaption>
              {fmtDate(p.date)}
              {p.slot_label ? ` · ${p.slot_label}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
      {next ? (
        <button className="pub-more" onClick={more} disabled={busy}>
          {busy ? 'Loading…' : 'Show more photos'}
        </button>
      ) : null}
    </>
  );
}

const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const STATUS_TONE = { OPEN: 'pub-pill-open', LIVE: 'pub-pill-live', COMPLETED: 'pub-pill-done', PAUSED: 'pub-pill-done', CANCELLED: 'pub-pill-done' };

/** Brand-facing campaign page (/campaign/<slug>). Public: no login, only public campaign details. */
export default function PublicCampaignPage({ slug }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getPublicCampaign(slug)
      .then((d) => {
        setData(d);
        document.title = `${d.name} · FlexRiders`;
      })
      .catch((err) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <div className="pub-page">
        <div className="pub-card pub-empty">
          <h1>Campaign not available</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="pub-page">
        <div className="pub-card pub-empty">Loading campaign…</div>
      </div>
    );
  }

  // CMP-000015 -> 15: the brand portal opens this campaign after the brand logs in.
  const brandCampaignId = Number((String(data.code || '').match(/(\d+)$/) || [])[1]) || null;
  const facts = [
    [Hash, 'Campaign ID', data.code],
    [Users, 'Riders', `${data.riders.joined} / ${data.riders.required}`],
    [CalendarDays, 'Campaign dates', `${fmtDate(data.start_date)} – ${fmtDate(data.end_date)}`],
    data.location_area ? [MapPin, 'Location / area', data.location_area] : null,
    [Bike, 'Vehicle type', data.eligible_vehicles],
    [Shirt, 'Brand T-shirt', data.tshirt.required ? `Provided (sizes ${data.tshirt.sizes.join(', ')})` : 'Not required'],
  ].filter(Boolean);

  return (
    <div className="pub-page">
      <header className="pub-top">
        <img className="pub-logo-img" src={logoDark} alt="FlexRiders" />
        <span className="pub-brandline">FlexRiders · Brand campaign</span>
      </header>

      <main className="pub-card">
        {data.image_url ? <img className="pub-banner" src={data.image_url} alt="" /> : null}
        <div className="pub-head">
          {data.brand.logo_url ? <img className="pub-brand-logo" src={data.brand.logo_url} alt={data.brand.name} /> : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pub-brand-name">{data.brand.name}</div>
            <h1 className="pub-title">{data.name}</h1>
          </div>
          <span className={`pub-pill ${STATUS_TONE[data.status] || ''}`}>{data.status_label}</span>
        </div>
        {data.description ? <p className="pub-desc">{data.description}</p> : null}

        {brandCampaignId ? (
          <div className="pub-brand-login">
            <span>Is this your campaign? See the riders, all approved photos and rider routes.</span>
            <a href={`/brand/campaign/${brandCampaignId}`}>Brand login →</a>
          </div>
        ) : null}

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

        {data.area ? (
          <section className="pub-section">
            <h2>Campaign area</h2>
            <AreaMap area={data.area} label={data.location_area} />
          </section>
        ) : null}

        <section className="pub-section">
          <h2>Campaign activity</h2>
          <p className="pub-muted">{data.approved_photos.total} approved photo{data.approved_photos.total === 1 ? '' : 's'} from riders.</p>
          <ApprovedPhotos slug={data.slug} initial={data.approved_photos} />
        </section>

        {data.requirements.length ? (
          <section className="pub-section">
            <h2>Campaign requirements</h2>
            <ul className="pub-list">
              {data.requirements.map((r) => (
                <li key={r}>
                  <CheckCircle2 size={16} /> {r}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="pub-section">
          <h2>Daily photo schedule</h2>
          <p className="pub-muted">Riders submit one photo in each slot. All three approved make one completed campaign day.</p>
          <div className="pub-slots">
            {data.photo_slots.map((s) => (
              <div key={s.slot} className="pub-slot">
                <Camera size={16} />
                <strong>{s.label}</strong>
                <span>
                  {fmtTime(s.start)} – {fmtTime(s.end)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {data.tshirt.required ? (
          <section className="pub-section">
            <h2>T-shirt / brand kit</h2>
            <p className="pub-muted">
              Riders collect a campaign T-shirt before they start
              {data.tshirt.return_required ? ' and return it after the campaign ends' : ''}.
            </p>
            {data.tshirt.pickup_points.length ? (
              <ul className="pub-list">
                {data.tshirt.pickup_points.map((p) => (
                  <li key={p.name}>
                    <MapPin size={16} /> <span><strong>{p.name}</strong> · {p.address}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="pub-section pub-join">
          <h2>How riders can participate</h2>
          {data.accepting_riders ? (
            <>
              <ol className="pub-steps">
                <li>Install the FlexRiders app and register (or log in).</li>
                <li>Open this campaign under Campaigns and tap Join Campaign{data.tshirt.required ? ', choosing your T-shirt size' : ''}.</li>
                <li>Once approved, submit your Morning, Evening and Night photos every campaign day.</li>
              </ol>
              <a className="pub-cta" href={data.app_link}>
                <Smartphone size={18} /> Join in the FlexRiders app
              </a>
            </>
          ) : (
            <p className="pub-muted">
              <Clock size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {data.status === 'LIVE'
                ? 'This campaign is live. New riders cannot join this campaign.'
                : `This campaign is ${data.status_label.toLowerCase()}. New riders cannot join.`}
            </p>
          )}
        </section>
      </main>
      <footer className="pub-footer">Powered by FlexRiders</footer>
    </div>
  );
}
