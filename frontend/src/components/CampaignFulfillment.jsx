import React, { useEffect, useState } from 'react';
import { X, Info, CalendarPlus, UserPlus, Wallet, History, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';
import { EmptyState, StatusPill, formatDate, formatINR } from './CampaignShared';

const STATUS_LABELS = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  BEHIND_TARGET: 'Behind Target',
  EXTENDED: 'Extended',
  FULFILLED: 'Fulfilled',
  COMPLETED_WITH_SHORTFALL: 'Completed with Shortfall',
  NOT_STARTED: 'Not Started',
  CANCELLED: 'Cancelled',
  DRAFT: 'Draft',
};

const pct = (value) => (value == null ? 'N/A' : `${Math.round(value * 1000) / 10}%`);
const num = (value) => (value == null ? '—' : Number(value).toLocaleString('en-IN'));
const addDays = (iso, n) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function Kpi({ label, value, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone || ''}`}>{value}</div>
    </div>
  );
}

function Modal({ title, onClose, children, footer, width = 480 }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 115 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: width }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>
  );
}

// Runs an async action inside a dialog, showing any API error in place.
function useSubmit(action, onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await action();
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

// ---------------------------------------------------------------------------
// Expected vs actual chart
// ---------------------------------------------------------------------------

export function ExpectedActualChart({ points, contracted }) {
  if (!points || points.length === 0) {
    return <EmptyState icon={Info}>The chart starts after the first full campaign day.</EmptyState>;
  }
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = Math.max(contracted, ...points.map((p) => Math.max(p.expected, p.actual)), 1);
  const x = (i) => pad.l + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
  const y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const line = (key) => points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const labelEvery = Math.max(Math.ceil(points.length / 8), 1);

  return (
    <div>
      <div className="chart-legend" style={{ marginBottom: 8 }}>
        <span>
          <i style={{ background: '#94A3B8' }} />
          Expected rider-days
        </span>
        <span>
          <i style={{ background: '#2563EB' }} />
          Actual rider-days
        </span>
        <span>
          <i style={{ background: '#10B981' }} />
          Contracted ({num(contracted)})
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Expected versus actual rider-days">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#EDF2F7" />
            <text x={pad.l - 6} y={y(t) + 4} fontSize="10" textAnchor="end" fill="#94A3B8">
              {t}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(contracted)} y2={y(contracted)} stroke="#10B981" strokeDasharray="4 4" />
        <path d={line('expected')} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 4" />
        <path d={line('actual')} fill="none" stroke="#2563EB" strokeWidth="2.5" />
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text key={p.date} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill={p.period === 'EXTENSION' ? '#B45309' : '#94A3B8'}>
              {formatDate(p.date, false)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delivery tab
// ---------------------------------------------------------------------------

export function DeliveryPanel({ campaign, fulfillment: f, ridersAvailable, setRidersAvailable, onOpenSlots, onExtend }) {
  if (!f) return <EmptyState icon={Info}>Calculating delivery…</EmptyState>;
  const r = f.recovery;
  const closed = campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED';

  return (
    <>
      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">Campaign Delivery</span>
          <StatusPill status={f.delivery_status} label={STATUS_LABELS[f.delivery_status]} />
        </div>
        <div className="delivery-hero">
          <div>
            <div className="kpi-label">Delivered photo-days of contracted rider-days</div>
            <div className="delivery-big" style={{ marginTop: 6 }}>
              {num(f.contract_rider_days_delivered)} <small>/ {num(f.contracted_rider_days)}</small>
            </div>
            <div className="progress-lg">
              <div style={{ width: `${Math.min(f.fulfillment_pct, 100)}%`, background: f.fulfilled ? '#10B981' : '#2563EB' }} />
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748B' }}>
              <strong style={{ color: '#0F172A' }}>{f.fulfillment_pct}%</strong> fulfilled • {f.required_riders} riders × {f.contract_days} days
              {f.surplus_rider_days > 0 ? ` • ${f.surplus_rider_days} surplus` : ''}
            </div>
            <div className="form-hint" style={{ marginTop: 6 }}>
              1 delivered rider-day = Morning, Evening and Night photos all approved for one rider on one date (1 Photo-Day).
            </div>
            {f.fulfilled && !campaign.continue_after_fulfillment && !closed ? (
              <div className="form-hint" style={{ marginTop: 8 }}>
                Campaign target reached. New uploads are stopped; complete the campaign when you're ready.
              </div>
            ) : null}
          </div>
          <div className="kpi-grid">
            <Kpi label="Required rider-days" value={num(f.contracted_rider_days)} />
            <Kpi label="Delivered photo-days" value={num(f.delivered_rider_days)} />
            <Kpi label="Remaining" value={num(f.remaining_rider_days)} tone={f.remaining_rider_days > 0 ? '' : 'positive'} />
            <Kpi label="Excused rider-days" value={num(f.excused_rider_days)} />
            <Kpi label="Expected by today" value={num(f.expected_to_date)} />
            <Kpi label="Actual by today" value={num(f.actual_to_date)} />
            <Kpi label="Variance" value={f.variance > 0 ? `+${f.variance}` : f.variance} tone={f.variance < 0 ? 'negative' : 'positive'} />
            <Kpi label="Daily average" value={f.daily_average == null ? 'N/A' : f.daily_average} />
            <Kpi label="Projected shortfall" value={num(r.projected_shortfall)} tone={r.projected_shortfall > 0 ? 'negative' : ''} />
            <Kpi label="Replacement riders needed" value={r.replacement_riders_needed == null ? '—' : r.replacement_riders_needed} />
            <Kpi label="Estimated extension" value={r.estimated_extension_days == null ? 'N/A' : `${r.estimated_extension_days} days`} />
            <Kpi label="Active riders" value={num(f.active_riders)} />
            <Kpi label="Riders at risk / inactive" value={`${f.riders_behind_target} / ${f.inactive_riders}`} />
          </div>
        </div>
        {f.delivered_extension_period > 0 ? (
          <div className="form-hint" style={{ marginTop: 12 }}>
            {f.delivered_original_period} rider-days delivered in the contract period and {f.delivered_extension_period} in extensions.
          </div>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 }}>
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Expected vs Actual</span>
            <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Cumulative rider-days, up to yesterday</span>
          </div>
          <ExpectedActualChart points={f.chart} contracted={f.contracted_rider_days} />
        </div>

        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Recovery Plan</span>
            {r.preliminary ? <span className="status-pill pill-at_risk">Preliminary – not enough data</span> : null}
          </div>
          <div>
            <div className="formula-row">
              <span>
                Remaining obligation <code>contracted − delivered</code>
              </span>
              <strong>{num(r.remaining_obligation)}</strong>
            </div>
            <div className="formula-row">
              <span>Days remaining (incl. today)</span>
              <strong>{r.days_remaining}</strong>
            </div>
            <div className="formula-row">
              <span>Active riders</span>
              <strong>{r.active_riders}</strong>
            </div>
            <div className="formula-row">
              <span>
                Historical attendance <code>{r.data_quality.replace('_', ' ').toLowerCase()}</code>
              </span>
              <strong>{r.attendance_rate == null ? 'N/A' : pct(r.attendance_rate)}</strong>
            </div>
            <div className="formula-row">
              <span>
                Projected capacity{' '}
                <code>
                  {r.active_riders} × {r.days_remaining} × {pct(r.attendance_rate_used)}
                </code>
              </span>
              <strong>{num(r.projected_capacity)}</strong>
            </div>
            <div className="formula-row">
              <span>
                Projected shortfall <code>remaining − capacity</code>
              </span>
              <strong>{num(r.projected_shortfall)}</strong>
            </div>
            <div className="formula-row">
              <span>
                Replacement riders needed <code>⌈shortfall ÷ days remaining⌉</code>
              </span>
              <strong>{r.replacement_riders_needed == null ? 'Use an extension' : r.replacement_riders_needed}</strong>
            </div>
            <div className="formula-row" style={{ alignItems: 'center' }}>
              <span>
                Estimated extension <code>⌈{num(r.extension_basis)} ÷ ({r.riders_available_for_extension} riders × {pct(r.attendance_rate_used)})⌉</code>
              </span>
              <strong>{r.estimated_extension_days == null ? 'N/A' : `${r.estimated_extension_days} days`}</strong>
            </div>
            <div className="formula-row" style={{ alignItems: 'center' }}>
              <span>Riders available during an extension</span>
              <input
                type="number"
                min="0"
                className="form-input"
                style={{ width: 90, padding: '5px 8px' }}
                value={ridersAvailable}
                placeholder={String(r.active_riders)}
                onChange={(e) => setRidersAvailable(e.target.value)}
              />
            </div>
          </div>
          {!closed && campaign.status !== 'DRAFT' ? (
            <div className="row-actions" style={{ marginTop: 14 }}>
              <button className="btn-secondary" onClick={onOpenSlots} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <UserPlus size={15} />
                Replacement Slots
              </button>
              <button className="btn-secondary" onClick={onExtend} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <CalendarPlus size={15} />
                Approve Extension
              </button>
            </div>
          ) : null}
          <div className="form-hint" style={{ marginTop: 10 }}>
            Recommendations only. Extensions and extra slots never change the contracted rider-days.
          </div>
        </div>
      </div>
    </>
  );
}

export function ReplacementSlotsDialog({ campaign, recommended, onClose, onSaved }) {
  const [count, setCount] = useState(campaign.extra_replacement_slots || 0);
  const { busy, error, submit } = useSubmit(() => api.setReplacementSlots(campaign.id, count), onSaved);
  return (
    <Modal
      title="Replacement Slots"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={submit}>
            Save
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.5 }}>
        Extra slots let replacement riders join while inactive riders still hold a slot. The contract stays at{' '}
        <strong>{num(campaign.contracted_rider_days)} rider-days</strong>.
      </p>
      <div className="form-group">
        <label className="form-label">Extra replacement slots</label>
        <input type="number" min="0" className="form-input" value={count} onChange={(e) => setCount(e.target.value)} />
        {recommended ? <span className="form-hint">The recovery plan suggests {recommended} replacement rider(s).</span> : null}
      </div>
    </Modal>
  );
}

export function ExtensionDialog({ campaign, fulfillment, onClose, onSaved }) {
  const start = addDays(campaign.effective_end_date, 1);
  const suggested = fulfillment?.recovery?.estimated_extension_days || 5;
  const [end, setEnd] = useState(addDays(start, Math.max(suggested, 1) - 1));
  const [reason, setReason] = useState('');
  const { busy, error, submit } = useSubmit(
    () => api.addCampaignExtension(campaign.id, { start_date: start, end_date: end, reason }),
    onSaved
  );
  return (
    <Modal
      title="Approve Extension"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || reason.trim().length < 3} onClick={submit}>
            Approve Extension
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.5 }}>
        Adds dates to recover the <strong>{num(fulfillment?.remaining_rider_days)} rider-days</strong> still owed. Contracted rider-days
        stay at {num(campaign.contracted_rider_days)}. The recovery plan estimates {suggested} day(s).
      </p>
      <div className="form-row-2">
        <div className="form-group">
          <label className="form-label">Start date</label>
          <input type="date" className="form-input" value={start} disabled />
          <span className="form-hint">The day after the current end date.</span>
        </div>
        <div className="form-group">
          <label className="form-label">End date</label>
          <input type="date" className="form-input" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Reason *</label>
        <textarea className="form-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Recover shortfall from 3 riders leaving mid-campaign" />
      </div>
    </Modal>
  );
}

export function ExtensionsPanel({ campaign, onExtend }) {
  const closed = campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED';
  return (
    <div className="card">
      <div className="card-header-bar">
        <span className="card-title-text">Extensions</span>
        {!closed && campaign.status !== 'DRAFT' ? (
          <button className="btn-primary" onClick={onExtend}>
            <CalendarPlus size={15} />
            Approve Extension
          </button>
        ) : null}
      </div>
      <div style={{ fontSize: '0.84rem', color: '#64748B', marginBottom: 12 }}>
        Contract period: {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)} • Current end: {formatDate(campaign.effective_end_date)}
      </div>
      {campaign.extensions.length === 0 ? (
        <EmptyState icon={CalendarPlus}>No extensions. Approve one from the recovery plan if the campaign can't meet its commitment.</EmptyState>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dates</th>
                <th>Days</th>
                <th>Rider-days owed at approval</th>
                <th>Reason</th>
                <th>Approved</th>
              </tr>
            </thead>
            <tbody>
              {campaign.extensions.map((e) => (
                <tr key={e.id}>
                  <td>
                    {formatDate(e.start_date)} – {formatDate(e.end_date)}
                  </td>
                  <td>{e.days}</td>
                  <td>{e.rider_day_target}</td>
                  <td style={{ fontSize: '0.8rem' }}>{e.reason}</td>
                  <td style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    {e.approved_by || '—'}
                    <div>{formatDate(e.approved_at)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand kit tab
// ---------------------------------------------------------------------------

// BrandKitPanel lives in BrandKitEditor.jsx (shared with the campaign form).
export { BrandKitPanel } from './BrandKitEditor';

function BrandPaymentDialog({ campaignId, onClose, onSaved }) {
  const [form, setForm] = useState({ kind: 'RECEIVED', amount: '', record_date: new Date().toISOString().slice(0, 10), reference: '', note: '' });
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const { busy, error, submit } = useSubmit(() => api.addBrandPayment(campaignId, { ...form, amount: Number(form.amount) }), onSaved);
  return (
    <Modal
      title="Record Brand Payment"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy || !(Number(form.amount) > 0)} onClick={submit}>
            Save Record
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <div className="form-row-2">
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="form-input" value={form.kind} onChange={set('kind')}>
            <option value="RECEIVED">Payment received</option>
            <option value="REFUND">Refund to brand</option>
            <option value="CREDIT">Credit / adjustment</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Amount (₹)</label>
          <input type="number" min="0" className="form-input" value={form.amount} onChange={set('amount')} />
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" className="form-input" value={form.record_date} onChange={set('record_date')} />
        </div>
        <div className="form-group">
          <label className="form-label">Reference</label>
          <input className="form-input" value={form.reference} onChange={set('reference')} placeholder="Invoice / UTR" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Note</label>
        <input className="form-input" value={form.note} onChange={set('note')} />
      </div>
      <div className="form-hint">Every brand payment, refund and credit is recorded manually. Delivery shortfalls never change these.</div>
    </Modal>
  );
}

export function FinancialsPanel({ campaignId, fulfillment: f, onChanged }) {
  const [payments, setPayments] = useState(null);
  const [adjustments, setAdjustments] = useState([]);
  const [showPayment, setShowPayment] = useState(false);

  const load = () =>
    Promise.all([api.getBrandPayments(campaignId), api.getAdjustments(campaignId)]).then(([p, a]) => {
      setPayments(p);
      setAdjustments(a);
    });
  useEffect(() => {
    load().catch((err) => toast.error(err.message));
  }, [campaignId]);

  if (!f || !payments) return <EmptyState icon={Wallet}>Loading financials…</EmptyState>;
  const b = payments.summary;
  const rp = f.rider_payout;

  const resolve = (adj, status) => {
    const note = window.prompt(status === 'RECOVERED' ? 'How was the amount recovered?' : 'Why is this being waived?') || '';
    api
      .resolveAdjustment(campaignId, adj.id, status, note)
      .then(() => {
        load();
        onChanged && onChanged();
      })
      .catch((err) => toast.error(err.message));
  };

  return (
    <>
      <div className="stats-grid-3">
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Brand</span>
            <StatusPill status={b.payment_status} />
          </div>
          <div className="mini-stat-list">
            <Kpi label="Contract value" value={formatINR(b.contract_value)} />
            <Kpi label="Received" value={formatINR(b.received)} />
            <Kpi label="Outstanding" value={formatINR(b.outstanding)} tone={b.outstanding > 0 ? 'negative' : ''} />
            <Kpi label="Refunds / credits" value={`${formatINR(b.refunded)} / ${formatINR(b.credits)}`} />
          </div>
        </div>
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Rider Payout</span>
          </div>
          <div className="mini-stat-list">
            <Kpi label="Planned budget" value={formatINR(rp.planned_budget)} />
            <Kpi label="Earned" value={formatINR(rp.earned)} />
            <Kpi label="Pending" value={formatINR(rp.pending)} />
            <Kpi label="Paid" value={formatINR(rp.paid)} />
          </div>
          {rp.overpaid_open > 0 ? (
            <div className="form-error" style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <AlertTriangle size={14} />
              Overpaid (open): {formatINR(rp.overpaid_open)}
            </div>
          ) : null}
        </div>
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Platform</span>
          </div>
          <div className="mini-stat-list">
            <Kpi label="Potential margin" value={formatINR(f.platform.potential_margin)} />
            <Kpi label="Current margin" value={formatINR(f.platform.current_margin)} />
            <Kpi label="Remaining rider budget" value={formatINR(f.platform.remaining_rider_budget)} />
            <Kpi label="Fulfilment" value={`${f.fulfillment_pct}%`} />
          </div>
          <div className="form-hint" style={{ marginTop: 8 }}>
            Potential = contract − planned budget. Current = net received − rider payout earned.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">Brand Payment Records</span>
          <button className="btn-primary" onClick={() => setShowPayment(true)}>
            <Wallet size={15} />
            Record Payment
          </button>
        </div>
        {payments.records.length === 0 ? (
          <EmptyState icon={Wallet}>No brand payments recorded.</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Note</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {payments.records.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.record_date)}</td>
                    <td>
                      <StatusPill status={r.kind === 'RECEIVED' ? 'PAID' : r.kind === 'REFUND' ? 'REFUNDED' : 'CREDIT_ISSUED'} label={r.kind} />
                    </td>
                    <td>
                      <strong>{formatINR(r.amount)}</strong>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{r.reference || '—'}</td>
                    <td style={{ fontSize: '0.8rem' }}>{r.note || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748B' }}>{r.created_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">Rider Payout Adjustments</span>
          <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Created when a correction leaves a rider overpaid. Nothing is deducted automatically.</span>
        </div>
        {adjustments.length === 0 ? (
          <EmptyState icon={Wallet}>No adjustments.</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{a.rider.rider_id}</div>
                    </td>
                    <td>{formatINR(a.amount)}</td>
                    <td>
                      <StatusPill status={a.status === 'OPEN' ? 'AT_RISK' : a.status} label={a.status} />
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{a.note}</td>
                    <td style={{ fontSize: '0.78rem' }}>{formatDate(a.created_at)}</td>
                    <td>
                      {a.status === 'OPEN' ? (
                        <div className="row-actions">
                          <button className="btn-sm-approve" onClick={() => resolve(a, 'RECOVERED')}>
                            Recovered
                          </button>
                          <button className="btn-sm-view" onClick={() => resolve(a, 'WAIVED')}>
                            Waive
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.76rem', color: '#94A3B8' }}>{formatDate(a.resolved_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPayment ? (
        <BrandPaymentDialog
          campaignId={campaignId}
          onClose={() => setShowPayment(false)}
          onSaved={() => {
            setShowPayment(false);
            load();
            onChanged && onChanged();
          }}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// History tab: activity corrections and the closing snapshot
// ---------------------------------------------------------------------------

export function HistoryPanel({ campaign }) {
  const [log, setLog] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const closed = campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED';

  useEffect(() => {
    api.getActivityLog(campaign.id).then(setLog).catch(() => setLog([]));
    if (closed) api.getCampaignSnapshot(campaign.id).then(setSnapshot).catch(() => setSnapshot(null));
  }, [campaign.id, closed]);

  return (
    <>
      {snapshot ? (
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Final Fulfilment Summary</span>
            <StatusPill status={snapshot.final_status} label={STATUS_LABELS[snapshot.final_status]} />
          </div>
          <div className="kpi-grid">
            <Kpi label="Contracted" value={num(snapshot.contracted_rider_days)} />
            <Kpi label="Delivered" value={num(snapshot.delivered_rider_days)} />
            <Kpi label="Shortfall" value={num(snapshot.shortfall_rider_days)} />
            <Kpi label="Fulfilment" value={`${snapshot.fulfillment_pct}%`} />
            <Kpi label="Riders (full / partial)" value={`${snapshot.riders_fully_completed} / ${snapshot.riders_partially_completed}`} />
            <Kpi label="Rider payout" value={formatINR(snapshot.rider_payout.earned)} />
            <Kpi label="Brand contract" value={formatINR(snapshot.brand.contract_value)} />
            <Kpi label="Brand received" value={formatINR(snapshot.brand.received)} />
          </div>
          <div className="form-hint" style={{ marginTop: 10 }}>
            Saved {formatDate(snapshot.created_at)} and never changed. Extensions: {snapshot.extensions.length ? snapshot.extensions.map((e) => `${formatDate(e.start, false)}–${formatDate(e.end)}`).join(', ') : 'none'}.
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">Activity Change History</span>
        </div>
        {!log ? (
          <EmptyState icon={History}>Loading…</EmptyState>
        ) : log.length === 0 ? (
          <EmptyState icon={History}>No changes recorded yet.</EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Rider</th>
                  <th>Day</th>
                  <th>Change</th>
                  <th>Earned</th>
                  <th>Reason</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontSize: '0.78rem' }}>
                      {new Date(l.changed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {l.after_closure ? <div className="status-pill pill-at_risk" style={{ marginTop: 4 }}>After closure</div> : null}
                    </td>
                    <td>
                      <strong>{l.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{l.rider.rider_id}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{formatDate(l.date)}</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {l.old_status || 'New'} → {l.new_status}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {l.old_earned == null ? '—' : formatINR(l.old_earned)} → {formatINR(l.new_earned)}
                    </td>
                    <td style={{ fontSize: '0.8rem', maxWidth: 260 }}>{l.reason || '—'}</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748B' }}>{l.changed_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// Approve a join request, optionally as a replacement for an existing rider.
export function ApproveRequestDialog({ campaignId, application, riders, onClose, onSaved }) {
  // From the global Join Requests page the campaign's riders aren't loaded yet.
  const [loadedRiders, setLoadedRiders] = useState(riders || []);
  useEffect(() => {
    if (!riders) api.getCampaignRiders(campaignId).then(setLoadedRiders).catch(() => {});
  }, [campaignId]);
  const candidates = loadedRiders.filter((r) => r.inactive || r.status === 'REMOVED' || r.behind_target);
  const [replacementFor, setReplacementFor] = useState('');
  const { busy, error, submit } = useSubmit(
    () => api.approveCampaignApplication(campaignId, application.id, replacementFor ? Number(replacementFor) : null),
    onSaved
  );
  return (
    <Modal
      title="Approve Request"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={busy} onClick={submit}>
            Approve Rider
          </button>
        </>
      }
    >
      {error ? <div className="form-error">{error}</div> : null}
      <p style={{ fontSize: '0.86rem', color: '#475569' }}>
        Approve <strong>{application.rider.full_name}</strong> ({application.rider.rider_id})
        {application.tshirt_size ? `, T-shirt size ${application.tshirt_size}` : ''}? They become an official campaign rider and the
        campaign appears under their active campaigns.
        {application.kit_status === 'COLLECTED' ? ' T-shirt collection is confirmed.' : ''}
      </p>
      <div className="form-group">
        <label className="form-label">Replacement for (optional)</label>
        <select className="form-input" value={replacementFor} onChange={(e) => setReplacementFor(e.target.value)}>
          <option value="">Not a replacement</option>
          {candidates.map((r) => (
            <option key={r.assignment_id} value={r.assignment_id}>
              {r.rider.full_name} ({r.rider.rider_id}) — {r.status === 'REMOVED' ? 'removed' : r.inactive ? 'inactive' : 'behind target'}
            </option>
          ))}
        </select>
        <span className="form-hint">Replacement days count toward the same contracted rider-days.</span>
      </div>
    </Modal>
  );
}
