import React, { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Phone, User, CalendarDays, Megaphone, Users, Wallet, Flag, Image as ImageIcon, RotateCcw, Pencil } from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../components/Feedback';
import { BrandLogo } from '../components/BrandModals';
import { STATUS_LABELS as DELIVERY_LABELS } from '../components/CampaignFulfillment';
import {
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_STATUSES,
  CampaignStatusPill,
  EmptyState,
  StatCard,
  StatusPill,
  VEHICLE_TYPES,
  formatDate,
  formatDateRange,
  formatINR,
} from '../components/CampaignShared';

const TABS = [
  ['overview', 'Overview'],
  ['campaigns', 'Campaigns'],
  ['riders', 'Riders & Activity'],
  ['payments', 'Payments'],
  ['activity', 'Activity'],
];
const EMPTY_FILTERS = { campaign_id: '', status: '', category: '', vehicle: '', start_from: '', end_to: '' };
const PAYMENT_LABELS = {
  BRAND_RECEIVED: 'Received from customer',
  BRAND_REFUND: 'Refund to customer',
  BRAND_CREDIT: 'Credit to customer',
  RIDER_PAYOUT: 'Rider payout',
};
const titleCase = (value) => (value || '').toLowerCase().replace(/_/g, ' ').replace(/(^|\s)\S/g, (c) => c.toUpperCase());
// Server times are UTC without a zone marker.
const formatWhen = (value) =>
  value
    ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

function Progress({ pct }) {
  const value = Math.max(0, Math.min(Number(pct) || 0, 100));
  return (
    <div className="slot-progress" style={{ minWidth: 110 }}>
      <span className="slot-progress-label">{Math.round((Number(pct) || 0) * 10) / 10}%</span>
      <div className="slot-progress-track">
        <div className={`slot-progress-fill ${value >= 100 ? 'full' : ''}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** One customer (brand): profile, campaigns, delivery, money and activity. Every figure comes from the server. */
export default function CustomerDetailView({ brandId, onBack, onOpenCampaign, onEditBrand, onShowRiders }) {
  const [tab, setTab] = useState('overview');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .getBrandDashboard(brandId, filters)
      .then((res) => !cancelled && (setData(res), setError('')))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [brandId, filters]);

  const setFilter = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  if (error && !data) {
    return (
      <div className="page-container">
        <button className="card-action-link" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={15} /> All customers
        </button>
        <EmptyState icon={Briefcase}>{error}</EmptyState>
      </div>
    );
  }
  if (!data) return <div className="page-container"><EmptyState icon={Briefcase}>Loading customer…</EmptyState></div>;

  const { brand, campaigns, totals: t, payments, activity } = data;

  return (
    <div className="page-container">
      <div>
        <button className="card-action-link" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <ArrowLeft size={15} />
          All customers
        </button>
        <div className="card">
          <div className="campaign-header-card">
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1, minWidth: 260 }}>
              <BrandLogo brand={brand} size={52} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 className="page-title">{brand.name}</h1>
                  <StatusPill status={brand.is_active ? 'ACTIVE' : 'SUSPENDED'} label={brand.is_active ? 'Active' : 'Inactive'} />
                </div>
                <div className="campaign-meta-row">
                  <span><User size={15} />{brand.contact_person || 'No contact person'}</span>
                  <span><Phone size={15} />{brand.contact_number || 'No phone'}</span>
                  <span><CalendarDays size={15} />Customer since {formatDate(brand.created_at)}</span>
                  <span style={{ color: '#94A3B8' }}>Code: {brand.code}</span>
                </div>
                {brand.description ? <p style={{ fontSize: '0.84rem', color: '#475569', marginTop: 6 }}>{brand.description}</p> : null}
              </div>
            </div>
            <div className="row-actions">
              <button className="btn-secondary" onClick={() => onShowRiders(brand)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Users size={15} /> Brand riders
              </button>
              <button className="btn-secondary" onClick={() => onEditBrand(brand)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Pencil size={15} /> Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '14px 18px' }}>
        <div className="filters-row">
          <div className="form-group">
            <label className="form-label">Campaign</label>
            <select className="form-input" value={filters.campaign_id} onChange={setFilter('campaign_id')}>
              <option value="">All campaigns</option>
              {data.campaign_options.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" value={filters.status} onChange={setFilter('status')}>
              <option value="">All statuses</option>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'OPEN' ? 'Public / Open' : s === 'ACTIVE' ? 'Live' : titleCase(s)}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-input" value={filters.category} onChange={setFilter('category')}>
              <option value="">All categories</option>
              {CAMPAIGN_CATEGORIES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Vehicle</label>
            <select className="form-input" value={filters.vehicle} onChange={setFilter('vehicle')}>
              <option value="">All vehicles</option>
              {VEHICLE_TYPES.map(([value, label]) => (
                <option key={value} value={value}>Open to {label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Starts on or after</label>
            <input type="date" className="form-input" value={filters.start_from} onChange={setFilter('start_from')} />
          </div>
          <div className="form-group">
            <label className="form-label">Ends on or before</label>
            <input type="date" className="form-input" value={filters.end_to} onChange={setFilter('end_to')} />
          </div>
          {hasFilters ? (
            <button className="btn-secondary" onClick={() => setFilters(EMPTY_FILTERS)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={14} /> Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className="tabs-header-bar">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
            {key === 'campaigns' ? ` (${campaigns.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stats-grid-4">
            <StatCard title="Campaigns" value={t.campaigns} icon={Megaphone} hint={`${t.live_campaigns} live now`} />
            <StatCard
              title="Rider-days delivered"
              value={`${t.delivered_rider_days} / ${t.contracted_rider_days}`}
              icon={Flag}
              color="#10B981"
              background="#ECFDF5"
              hint={`${t.fulfillment_pct}% fulfilled · ${t.remaining_rider_days} remaining`}
            />
            <StatCard
              title="Riders"
              value={t.active_riders}
              icon={Users}
              color="#8B5CF6"
              background="#F5F3FF"
              hint={`active · ${t.completed_riders} completed · ${t.assigned_riders} assigned`}
            />
            <StatCard
              title="Customer payments"
              value={formatINR(t.received)}
              icon={Wallet}
              color="#F59E0B"
              background="#FFFBEB"
              hint={`of ${formatINR(t.contract_value)} contracted · ${formatINR(t.outstanding)} outstanding`}
            />
          </div>
          <div className="card">
            <div className="card-title-text" style={{ marginBottom: 12 }}>Needs attention</div>
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">Pending join requests</div><div className="kpi-value">{t.pending_requests}</div></div>
              <div className="kpi"><div className="kpi-label">Photos awaiting review</div><div className="kpi-value">{t.pending_photos}</div></div>
              <div className="kpi"><div className="kpi-label">Rejected photos</div><div className={`kpi-value ${t.rejected_photos ? 'negative' : ''}`}>{t.rejected_photos}</div></div>
              <div className="kpi"><div className="kpi-label">Rider payouts pending</div><div className="kpi-value">{formatINR(t.rider_pending)}</div></div>
            </div>
          </div>
          <CampaignTable campaigns={campaigns} onOpenCampaign={onOpenCampaign} compact filtered={hasFilters} />
        </>
      )}

      {tab === 'campaigns' && <CampaignTable campaigns={campaigns} onOpenCampaign={onOpenCampaign} filtered={hasFilters} />}

      {tab === 'riders' && (
        <>
          <div className="card">
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">Assigned riders</div><div className="kpi-value">{t.assigned_riders}</div></div>
              <div className="kpi"><div className="kpi-label">Active riders</div><div className="kpi-value">{t.active_riders}</div></div>
              <div className="kpi"><div className="kpi-label">Completed riders</div><div className="kpi-value">{t.completed_riders}</div></div>
              <div className="kpi"><div className="kpi-label">Rider-days delivered</div><div className="kpi-value positive">{t.delivered_rider_days}</div></div>
              <div className="kpi"><div className="kpi-label">Pending join requests</div><div className="kpi-value">{t.pending_requests}</div></div>
              <div className="kpi"><div className="kpi-label">Photos awaiting review</div><div className="kpi-value">{t.pending_photos}</div></div>
              <div className="kpi"><div className="kpi-label">Rejected photos</div><div className={`kpi-value ${t.rejected_photos ? 'negative' : ''}`}>{t.rejected_photos}</div></div>
              <div className="kpi">
                <div className="kpi-label" title="Past campaign days (up to yesterday) without approved photos: missed, rejected or still in review">Rider-days without approval</div>
                <div className={`kpi-value ${t.rider_days_without_approval ? 'negative' : ''}`}>{t.rider_days_without_approval}</div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Assigned</th>
                    <th>Active</th>
                    <th>Completed</th>
                    <th>Delivered</th>
                    <th>Requests</th>
                    <th>Photos in review</th>
                    <th>Rejected</th>
                    <th>Days without approval</th>
                    <th>Excused</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpenCampaign(c.id)}>
                      <td><strong>{c.name}</strong></td>
                      <td>{c.assigned_riders}</td>
                      <td>{c.active_riders}</td>
                      <td>{c.completed_riders}</td>
                      <td>{c.delivered_rider_days}</td>
                      <td>{c.pending_requests}</td>
                      <td>{c.pending_photos}</td>
                      <td>{c.rejected_photos}</td>
                      <td>{c.rider_days_without_approval}</td>
                      <td>{c.excused_rider_days}</td>
                    </tr>
                  ))}
                  {campaigns.length === 0 ? (
                    <tr><td colSpan={10}><EmptyState icon={Users}>No campaigns {hasFilters ? 'match these filters' : 'yet'}.</EmptyState></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'payments' && (
        <>
          <div className="card">
            <div className="kpi-grid">
              <div className="kpi"><div className="kpi-label">Contracted (customer)</div><div className="kpi-value">{formatINR(t.contract_value)}</div></div>
              <div className="kpi"><div className="kpi-label">Received (net of refunds)</div><div className="kpi-value positive">{formatINR(t.received)}</div></div>
              <div className="kpi"><div className="kpi-label">Outstanding from customer</div><div className={`kpi-value ${t.outstanding ? 'negative' : ''}`}>{formatINR(t.outstanding)}</div></div>
              <div className="kpi"><div className="kpi-label">Rider payouts earned</div><div className="kpi-value">{formatINR(t.rider_earned)}</div></div>
              <div className="kpi"><div className="kpi-label">Rider payouts paid</div><div className="kpi-value">{formatINR(t.rider_paid)}</div></div>
              <div className="kpi"><div className="kpi-label">Rider payouts pending</div><div className="kpi-value">{formatINR(t.rider_pending)}</div></div>
            </div>
          </div>
          <div className="card">
            <div className="card-title-text" style={{ marginBottom: 10 }}>By campaign</div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Contract</th>
                    <th>Received</th>
                    <th>Outstanding</th>
                    <th>Customer payment</th>
                    <th>Rider payouts earned</th>
                    <th>Paid</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpenCampaign(c.id)}>
                      <td><strong>{c.name}</strong></td>
                      <td>{formatINR(c.brand.contract_value)}</td>
                      <td>{formatINR(c.brand.net_received)}</td>
                      <td>{formatINR(c.brand.outstanding)}</td>
                      <td><StatusPill status={c.brand.payment_status} label={titleCase(c.brand.payment_status)} /></td>
                      <td>{formatINR(c.rider_payout.earned)}</td>
                      <td>{formatINR(c.rider_payout.paid)}</td>
                      <td>{formatINR(c.rider_payout.pending)}</td>
                    </tr>
                  ))}
                  {campaigns.length === 0 ? (
                    <tr><td colSpan={8}><EmptyState icon={Wallet}>No campaigns {hasFilters ? 'match these filters' : 'yet'}.</EmptyState></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-title-text" style={{ marginBottom: 10 }}>Transactions</div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Campaign</th>
                    <th>Rider</th>
                    <th>Amount</th>
                    <th>Reference</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p, i) => (
                    <tr key={`${p.type}-${i}`}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.date)}</td>
                      <td>{PAYMENT_LABELS[p.type] || titleCase(p.type)}</td>
                      <td>{p.campaign_name}</td>
                      <td>{p.rider_name || '—'}</td>
                      <td style={{ fontWeight: 700, color: p.type === 'BRAND_RECEIVED' ? '#047857' : undefined }}>{formatINR(p.amount)}</td>
                      <td style={{ fontSize: '0.8rem' }}>{p.reference || '—'}</td>
                      <td>{p.status ? <StatusPill status={p.status} /> : '—'}</td>
                    </tr>
                  ))}
                  {payments.length === 0 ? (
                    <tr><td colSpan={7}><EmptyState icon={Wallet}>No payments recorded{hasFilters ? ' for these filters' : ''}.</EmptyState></td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'activity' && (
        <div className="card">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Details</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((e, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatWhen(e.at)}</td>
                    <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{titleCase(e.action)}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {e.details}
                      {e.campaign_id ? (
                        <button className="card-action-link" style={{ marginLeft: 8 }} onClick={() => onOpenCampaign(e.campaign_id)}>
                          Open campaign
                        </button>
                      ) : null}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{e.by || 'System'}</td>
                  </tr>
                ))}
                {activity.length === 0 ? (
                  <tr><td colSpan={4}><EmptyState icon={CalendarDays}>No activity recorded.</EmptyState></td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CampaignTable({ campaigns, onOpenCampaign, compact, filtered }) {
  return (
    <div className="card">
      {compact ? <div className="card-title-text" style={{ marginBottom: 10 }}>Campaign progress</div> : null}
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Dates</th>
              <th>Vehicles</th>
              <th>Rider-days</th>
              <th>Fulfilment</th>
              <th>Delivery</th>
              {compact ? null : (
                <>
                  <th>Riders</th>
                  <th>Requests</th>
                  <th>Photos</th>
                  <th>Terms</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpenCampaign(c.id)}>
                <td>
                  <strong>{c.name}</strong>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{c.campaign_category_label}</div>
                </td>
                <td><CampaignStatusPill campaign={c} /></td>
                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatDateRange(c.start_date, c.end_date)}</td>
                <td style={{ fontSize: '0.8rem' }}>{c.eligible_vehicle_label}</td>
                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                  {c.delivered_rider_days} / {c.contracted_rider_days}
                  <div style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{c.remaining_rider_days} remaining</div>
                </td>
                <td><Progress pct={c.fulfillment_pct} /></td>
                <td><StatusPill status={c.delivery_status} label={DELIVERY_LABELS[c.delivery_status] || titleCase(c.delivery_status)} /></td>
                {compact ? null : (
                  <>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {c.active_riders} active
                      <div style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{c.completed_riders} completed</div>
                    </td>
                    <td>{c.pending_requests}</td>
                    <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {c.pending_photos} in review
                      {c.rejected_photos ? <div style={{ color: '#B91C1C', fontSize: '0.72rem' }}>{c.rejected_photos} rejected</div> : null}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{c.terms_version ? `v${c.terms_version}` : '—'}</td>
                  </>
                )}
              </tr>
            ))}
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={compact ? 7 : 11}>
                  <EmptyState icon={ImageIcon}>{filtered ? 'No campaigns match these filters.' : 'This customer has no campaigns yet.'}</EmptyState>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
