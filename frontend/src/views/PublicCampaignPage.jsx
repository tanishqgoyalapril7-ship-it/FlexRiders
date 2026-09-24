import React, { useEffect, useState } from 'react';
import { Bike, CalendarDays, Camera, CheckCircle2, Clock, MapPin, Shirt, Smartphone } from 'lucide-react';
import { api } from '../services/api';

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
        document.title = `${d.name} · Super Riders`;
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

  const facts = [
    [CalendarDays, 'Campaign dates', `${fmtDate(data.start_date)} – ${fmtDate(data.end_date)}`],
    data.location_area ? [MapPin, 'Location / area', data.location_area] : null,
    [Bike, 'Vehicle type', data.eligible_vehicles],
    [Shirt, 'Brand T-shirt', data.tshirt.required ? `Provided (sizes ${data.tshirt.sizes.join(', ')})` : 'Not required'],
  ].filter(Boolean);

  return (
    <div className="pub-page">
      <header className="pub-top">
        <span className="pub-logo">SR</span>
        <span className="pub-brandline">Super Riders · Brand campaign</span>
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
                <li>Install the Super Riders app and register (or log in).</li>
                <li>Open this campaign under Campaigns and tap Join Campaign{data.tshirt.required ? ', choosing your T-shirt size' : ''}.</li>
                <li>Once approved, submit your Morning, Evening and Night photos every campaign day.</li>
              </ol>
              <a className="pub-cta" href={data.app_link}>
                <Smartphone size={18} /> Join in the Super Riders app
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
      <footer className="pub-footer">Powered by Super Riders</footer>
    </div>
  );
}
