import React, { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Phone, User, CalendarDays, Megaphone, Users, Wallet, Flag, Image as ImageIcon, RotateCcw, Pencil, Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../components/Feedback';
import { BrandLogo } from '../components/BrandModals';
import { STATUS_LABELS as DELIVERY_LABELS, brandStatusLabel } from '../components/CampaignFulfillment';
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

function RecordBrandPaymentModal({ brandId, brandName, campaigns = [], summary, onClose, onSaved }) {
  const [form, setForm] = useState({
    kind: 'RECEIVED',
    amount: '',
    payment_mode: 'UPI',
    record_date: new Date().toISOString().slice(0, 10),
    campaign_id: '',
    reference: '',
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const remaining = summary ? summary.remaining_amount : 0;
  const contractValue = summary ? summary.contract_value : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (!amountNum || amountNum <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }
    if (form.kind === 'RECEIVED' && !form.payment_mode) {
      setError('Please select a payment mode.');
      return;
    }
    if (form.kind === 'RECEIVED' && contractValue > 0 && amountNum > remaining + 0.01) {
      setError(`Payment cannot exceed the remaining balance of ${formatINR(remaining)}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.recordBrandPayment(brandId, {
        kind: form.kind,
        amount: amountNum,
        payment_mode: form.payment_mode || null,
        record_date: form.record_date,
        campaign_id: form.campaign_id ? Number(form.campaign_id) : null,
        reference: form.reference.trim() || null,
        note: form.note.trim() || null,
      });
      toast.success('Payment recorded successfully.');
      onSaved();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 115 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <span className="modal-title">Record Payment for {brandName}</span>
            <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
              Contract: {formatINR(contractValue)} • Remaining: {formatINR(remaining)}
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error ? <div className="form-error">{error}</div> : null}
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Type *</label>
                <select className="form-input" value={form.kind} onChange={set('kind')}>
                  <option value="RECEIVED">Payment Received</option>
                  <option value="REFUND">Refund to Brand</option>
                  <option value="CREDIT">Credit / Adjustment</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Amount (₹) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  className="form-input"
                  value={form.amount}
                  onChange={set('amount')}
                  placeholder="e.g. 20000"
                  autoFocus
                />
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Payment Mode{form.kind === 'RECEIVED' ? ' *' : ''}</label>
                <select className="form-input" value={form.payment_mode} onChange={set('payment_mode')}>
                  {form.kind !== 'RECEIVED' ? <option value="">—</option> : null}
                  <option value="UPI">UPI</option>
                  <option value="BANK_TRANSFER">Bank Transfer / NEFT</option>
                  <option value="IMPS">IMPS</option>
                  <option value="RTGS">RTGS</option>
                  <option value="CASH">Cash</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Card</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date *</label>
                <input type="date" className="form-input" value={form.record_date} onChange={set('record_date')} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Link to Campaign (Optional)</label>
              <select className="form-input" value={form.campaign_id} onChange={set('campaign_id')}>
                <option value="">General Brand Payment (No Campaign)</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="form-hint" style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Leave as General Brand Payment or select a specific campaign this money is allocated to.
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Transaction / Reference ID</label>
              <input
                className="form-input"
                value={form.reference}
                onChange={set('reference')}
                placeholder="UTR number, UPI ref, cheque number, or receipt"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input
                className="form-input"
                value={form.note}
                onChange={set('note')}
                placeholder="e.g. 50% advance for festive campaign"
              />
            </div>

            <div className="form-hint" style={{ fontSize: '0.74rem', color: '#64748B', marginTop: 8 }}>
              Every payment creates a separate ledger entry. Previous payments are never overwritten.
              Brand payments are recorded against brand receivables and do not affect rider payouts.
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !form.amount || Number(form.amount) <= 0 || (form.kind === 'RECEIVED' && !form.payment_mode)}
            >
              {busy ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
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
  const [paymentAccountData, setPaymentAccountData] = useState(null);
  const [showRecordPayment, setShowRecordPayment] = useState(false);

  const loadPaymentAccount = () => {
    api
      .getBrandPaymentAccount(brandId)
      .then(setPaymentAccountData)
      .catch((err) => console.error('Failed to load brand payment account', err));
  };

  useEffect(() => {
    let cancelled = false;
    api
      .getBrandDashboard(brandId, filters)
      .then((res) => !cancelled && (setData(res), setError('')))
      .catch((err) => !cancelled && setError(err.message));
    loadPaymentAccount();
    return () => {
      cancelled = true;
    };
  }, [brandId, filters]);

  const refreshAll = () => {
    api
      .getBrandDashboard(brandId, filters)
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => setError(err.message));
    loadPaymentAccount();
  };

  const handleCancelBrandPayment = (record) => {
    const reason = window.prompt(
      `Cancel entry of ${formatINR(record.amount)} (${record.payment_mode_label || record.payment_mode || 'Payment'}) from ${formatDate(record.record_date)}?\n\nThis entry will stay in audit history with your reason, but stops counting towards the totals. Reason:`
    );
    if (!reason || !reason.trim()) return;
    api
      .cancelBrandPaymentRecord(brandId, record.id, reason.trim())
      .then(() => {
        toast.success('Payment entry cancelled.');
        refreshAll();
      })
      .catch((err) => toast.error(err.message));
  };

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
          {(() => {
            const summary = paymentAccountData?.summary || {
              contract_value: t.contract_value,
              total_paid: t.received,
              remaining_amount: t.outstanding,
              payment_status: t.payment_status || 'PENDING',
            };
            const brandRecords = paymentAccountData?.records || [];

            return (
              <>
                <div className="card">
                  <div className="card-header-bar" style={{ marginBottom: 14 }}>
                    <div>
                      <span className="card-title-text" style={{ fontSize: '1.05rem' }}>Brand Payment Account</span>
                      <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>
                        Accounting ledger and commercial contract balance for {brand.name}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <StatusPill
                        status={summary.payment_status}
                        label={summary.remaining_amount === 0 && summary.contract_value > 0 ? 'Paid in Full' : brandStatusLabel(summary.payment_status)}
                      />
                      <button className="btn-primary" onClick={() => setShowRecordPayment(true)}>
                        <Plus size={15} />
                        Record Payment
                      </button>
                    </div>
                  </div>
                  <div className="kpi-grid">
                    <div className="kpi">
                      <div className="kpi-label">Total Contract Value</div>
                      <div className="kpi-value">{formatINR(summary.contract_value)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Total Paid</div>
                      <div className="kpi-value positive">{formatINR(summary.total_paid)}</div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Remaining Amount</div>
                      <div className={`kpi-value ${summary.remaining_amount > 0 ? 'negative' : 'positive'}`}>
                        {summary.remaining_amount === 0 ? 'Paid in Full' : formatINR(summary.remaining_amount)}
                      </div>
                    </div>
                    <div className="kpi">
                      <div className="kpi-label">Payment Status</div>
                      <div className="kpi-value" style={{ fontSize: '1.15rem' }}>
                        {summary.remaining_amount === 0 && summary.contract_value > 0 ? 'Paid in Full' : brandStatusLabel(summary.payment_status)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header-bar" style={{ marginBottom: 12 }}>
                    <div>
                      <span className="card-title-text">Payment History</span>
                      <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: 2 }}>
                        Immutable ledger of payments received from, refunded to, or credited to {brand.name}
                      </div>
                    </div>
                    <button className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setShowRecordPayment(true)}>
                      <Plus size={14} />
                      Record Payment
                    </button>
                  </div>

                  {brandRecords.length === 0 ? (
                    <EmptyState icon={Wallet}>No payments recorded yet.</EmptyState>
                  ) : (
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Payment ID</th>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Payment Mode</th>
                            <th>Reference ID</th>
                            <th>Campaign</th>
                            <th>Status</th>
                            <th>Notes</th>
                            <th>Added By</th>
                            <th>Created At</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brandRecords.map((r) => {
                            const cancelled = r.status === 'CANCELLED';
                            return (
                              <tr key={r.id} style={cancelled ? { opacity: 0.6 } : null}>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>#BP-{r.id}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.record_date)}</td>
                                <td>
                                  <StatusPill status={r.kind === 'RECEIVED' ? 'PAID' : r.kind === 'REFUND' ? 'REFUNDED' : 'CREDIT_ISSUED'} label={r.kind} />
                                </td>
                                <td>
                                  <strong style={{ color: r.kind === 'RECEIVED' ? '#047857' : undefined, textDecoration: cancelled ? 'line-through' : undefined }}>
                                    {formatINR(r.amount)}
                                  </strong>
                                </td>
                                <td style={{ fontSize: '0.82rem' }}>{r.payment_mode_label || r.payment_mode || '—'}</td>
                                <td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{r.reference || '—'}</td>
                                <td style={{ fontSize: '0.82rem' }}>
                                  {r.campaign_id ? (
                                    <span style={{ color: '#2563EB', cursor: 'pointer', fontWeight: 500 }} onClick={() => onOpenCampaign(r.campaign_id)}>
                                      {r.campaign_name}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#64748B', fontStyle: 'italic' }}>General Brand Payment</span>
                                  )}
                                </td>
                                <td>
                                  {cancelled ? (
                                    <span title={`${r.cancel_reason || ''}${r.cancelled_by ? ` — ${r.cancelled_by}` : ''}`}>
                                      <StatusPill status="CANCELLED" label="Cancelled" />
                                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 2 }}>{r.cancel_reason}</div>
                                    </span>
                                  ) : (
                                    <StatusPill status="PAID" label="Recorded" />
                                  )}
                                </td>
                                <td style={{ fontSize: '0.8rem', maxWidth: 180 }}>{r.note || '—'}</td>
                                <td style={{ fontSize: '0.78rem', color: '#64748B' }}>{r.created_by || '—'}</td>
                                <td style={{ fontSize: '0.75rem', color: '#94A3B8', whiteSpace: 'nowrap' }}>{formatWhen(r.created_at)}</td>
                                <td>
                                  {!cancelled ? (
                                    <button className="btn-sm-view" onClick={() => handleCancelBrandPayment(r)} title="Cancel this entry">
                                      Cancel
                                    </button>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Cancelled</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="card-header-bar" style={{ marginBottom: 10 }}>
                    <div>
                      <span className="card-title-text">Campaigns Financial Breakdown</span>
                      <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                        Separate breakdown of brand contract delivery vs. rider payouts earned and paid
                      </div>
                    </div>
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Campaign</th>
                          <th>Brand Contract</th>
                          <th>Net Received</th>
                          <th>Outstanding</th>
                          <th>Customer Status</th>
                          <th>Rider Payouts Earned</th>
                          <th>Rider Paid</th>
                          <th>Rider Pending</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaigns.map((c) => (
                          <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpenCampaign(c.id)}>
                            <td><strong>{c.name}</strong></td>
                            <td>{formatINR(c.brand.contract_value)}</td>
                            <td>{formatINR(c.brand.net_received)}</td>
                            <td>{formatINR(c.brand.outstanding)}</td>
                            <td><StatusPill status={c.brand.payment_status} label={brandStatusLabel(c.brand.payment_status)} /></td>
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
              </>
            );
          })()}
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

      {showRecordPayment && (
        <RecordBrandPaymentModal
          brandId={brand.id}
          brandName={brand.name}
          campaigns={campaigns}
          summary={paymentAccountData?.summary || {
            contract_value: t.contract_value,
            total_paid: t.received,
            remaining_amount: t.outstanding,
            payment_status: t.payment_status || 'PENDING',
          }}
          onClose={() => setShowRecordPayment(false)}
          onSaved={() => {
            setShowRecordPayment(false);
            refreshAll();
          }}
        />
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
