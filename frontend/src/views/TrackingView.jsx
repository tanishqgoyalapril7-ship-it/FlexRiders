import React, { Suspense, useEffect, useState } from 'react';
import { Map as MapIcon, Route } from 'lucide-react';
import { api } from '../services/api';
import { EmptyState, StatusPill, formatDateRange } from '../components/CampaignShared';

const RouteMapModal = React.lazy(() => import('../components/RouteMap').then((m) => ({ default: m.RouteMapModal })));

/** Pick a campaign, see its riders and open the recorded GPS routes (all riders or one). */
export default function TrackingView() {
  const [campaigns, setCampaigns] = useState(null);
  useEffect(() => {
    api.getCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
  }, []);
  const running = (campaigns || []).filter((c) => ['ACTIVE', 'OPEN', 'FULL', 'PAUSED', 'COMPLETED'].includes(c.status));
  const [campaignId, setCampaignId] = useState('');
  const [riders, setRiders] = useState(null);
  const [error, setError] = useState('');
  const [map, setMap] = useState(null);
  const campaign = running.find((c) => String(c.id) === String(campaignId));

  useEffect(() => {
    if (!campaignId && running.length) setCampaignId(String((running.find((c) => c.status === 'ACTIVE') || running[0]).id));
  }, [running.length]);

  useEffect(() => {
    if (!campaignId) return;
    setRiders(null);
    setError('');
    api
      .getCampaignRiders(campaignId)
      .then(setRiders)
      .catch((err) => {
        setError(err.message);
        setRiders([]);
      });
  }, [campaignId]);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tracking</h1>
          <p className="page-subtitle">GPS routes riders recorded during their campaign days. Routes are only recorded while a rider is on an active campaign.</p>
        </div>
      </div>

      {campaigns == null ? (
        <div className="card" style={{ color: '#94A3B8' }}>Loading campaigns…</div>
      ) : running.length === 0 ? (
        <EmptyState icon={MapIcon}>No live or completed campaigns to track yet.</EmptyState>
      ) : (
        <>
          <div className="filter-row">
            <select className="form-input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign" style={{ maxWidth: 420 }}>
              {running.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name} ({c.brand_name})
                </option>
              ))}
            </select>
            {campaign ? (
              <button className="btn-primary" onClick={() => setMap({ campaign, assignment: null })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Route size={15} /> All riders map
              </button>
            ) : null}
          </div>
          {campaign ? (
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.9rem' }}>
              <span>
                <StatusPill status={campaign.status} />
              </span>
              <span>
                Riders: <strong>{campaign.stats ? `${campaign.stats.assigned_riders} / ${campaign.stats.slot_capacity}` : '—'}</strong>
              </span>
              <span>
                Area: <strong>{campaign.location_area || '—'}</strong>
              </span>
              <span>
                Period: <strong>{formatDateRange(campaign.start_date, campaign.effective_end_date || campaign.end_date)}</strong>
              </span>
            </div>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          {riders == null ? (
            <div className="card" style={{ color: '#94A3B8' }}>Loading riders…</div>
          ) : riders.length === 0 ? (
            <EmptyState icon={MapIcon}>No riders have joined this campaign yet.</EmptyState>
          ) : (
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rider</th>
                    <th>Rider ID</th>
                    <th>Status</th>
                    <th>Approved days</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {riders.map((r) => (
                    <tr key={r.assignment_id}>
                      <td>{r.rider.full_name}</td>
                      <td>{r.rider.rider_id}</td>
                      <td>
                        <StatusPill status={r.status} />
                      </td>
                      <td>{r.completed_days ?? '—'}</td>
                      <td>
                        <button className="btn-secondary" onClick={() => setMap({ campaign, assignment: r })} style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                          View route
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {map ? (
        <Suspense fallback={null}>
          <RouteMapModal campaign={map.campaign} assignment={map.assignment} onClose={() => setMap(null)} />
        </Suspense>
      ) : null}
    </div>
  );
}
