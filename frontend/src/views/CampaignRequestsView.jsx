import React, { useEffect, useState } from 'react';
import { ClipboardList, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { subscribeCampaignSignals } from '../services/realtime';
import { EmptyState, StatusPill, formatDate, formatDateRange } from '../components/CampaignShared';
import { ReviewDialog } from '../components/GeoTargeting';

const TABS = [
  ['PENDING_APPROVAL', 'Awaiting review'],
  ['CHANGES_REQUIRED', 'Changes requested'],
  ['REJECTED', 'Rejected'],
];

const days = (c) => Math.round((new Date(c.end_date) - new Date(c.start_date)) / 86400000) + 1;

/** Campaigns brands submitted from the brand app, waiting for an admin decision. */
export default function CampaignRequestsView({ onOpenCampaign, onChanged }) {
  const [tab, setTab] = useState('PENDING_APPROVAL');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [review, setReview] = useState(null);

  const load = async () => {
    setError('');
    try {
      setRows(await api.getCampaigns({ status: tab, scope: 'requests' }));
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  };
  useEffect(() => {
    setRows(null);
    load();
  }, [tab]);
  useEffect(
    () =>
      subscribeCampaignSignals((p) => {
        if (['campaign_requested', 'campaign_reviewed', 'campaign_updated'].includes(p.event_type)) load();
      }),
    [tab]
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaign Requests</h1>
          <p className="page-subtitle">Campaigns submitted by brands. Approving keeps the same campaign; publish it when it should go live for riders.</p>
        </div>
        <button className="btn-secondary" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="filter-row">
        <div className="tab-chips">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="form-error">{error}</div> : null}
      {rows == null ? (
        <div className="card" style={{ color: '#94A3B8' }}>Loading requests…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={ClipboardList}>No campaign requests here.</EmptyState>
      ) : (
        <div className="request-grid">
          {rows.map((c) => (
            <div key={c.id} className="card request-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>{c.brand_name}</div>
                  <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: '#0F172A', margin: '2px 0' }}>{c.name}</h3>
                  <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>{c.code}</div>
                </div>
                <StatusPill status={c.status} />
              </div>
              <dl>
                <dt>Required riders</dt>
                <dd>{c.total_slots}</dd>
                <dt>Duration</dt>
                <dd>
                  {days(c)} days · {formatDateRange(c.start_date, c.end_date)}
                </dd>
                <dt>Target</dt>
                <dd>
                  {c.location_area || '—'}
                  {c.geo && c.geo.targeted ? ` · ${c.geo.initial_radius_km}–${c.geo.max_radius_km || c.geo.initial_radius_km} km` : ''}
                </dd>
                <dt>Payout / rider / day</dt>
                <dd>{c.daily_rate ? `₹${c.daily_rate}` : 'Not set'}</dd>
                <dt>Submitted</dt>
                <dd>{c.submitted_at ? formatDate(c.submitted_at) : '—'}</dd>
              </dl>
              {c.admin_feedback ? (
                <div style={{ background: '#FEF3C7', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem', color: '#92400E' }}>
                  Note to brand: {c.admin_feedback}
                </div>
              ) : null}
              <div className="request-actions">
                <button className="btn-secondary" onClick={() => onOpenCampaign(c.id)}>
                  View details
                </button>
                {c.status !== 'REJECTED' ? (
                  <>
                    <button className="btn-primary" onClick={() => setReview({ campaign: c, action: 'approve' })}>
                      Approve
                    </button>
                    {c.status === 'PENDING_APPROVAL' ? (
                      <button className="btn-secondary" onClick={() => setReview({ campaign: c, action: 'request_changes' })}>
                        Request changes
                      </button>
                    ) : null}
                    <button className="btn-danger" onClick={() => setReview({ campaign: c, action: 'reject' })}>
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {review ? (
        <ReviewDialog
          campaign={review.campaign}
          action={review.action}
          onClose={() => setReview(null)}
          onDone={() => {
            load();
            onChanged && onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
