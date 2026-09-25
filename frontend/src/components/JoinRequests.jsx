import React, { useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Shirt, X } from 'lucide-react';
import { api } from '../services/api';
import { DangerDialog, toast } from './Feedback';
import { EmptyState, VEHICLE_TYPES, formatDate, vehicleLabel } from './CampaignShared';
import { ApproveRequestDialog } from './CampaignFulfillment';

const KIT_PILL = { NOT_REQUIRED: 'pill-draft', PENDING: 'pill-at_risk', COLLECTED: 'pill-on_track' };
const REQUEST_PILL = { REQUESTED: 'pill-requested', APPROVED: 'pill-approved', REJECTED: 'pill-rejected', WITHDRAWN: 'pill-draft' };

/** Confirms the T-shirt was handed over, with the size actually given. */
function KitCollectedDialog({ request, onClose, onDone }) {
  const [size, setSize] = useState(request.tshirt_size || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!size) return setError('Choose the size that was handed over.');
    setBusy(true);
    setError('');
    try {
      await api.setRequestKit(request.campaign.id, request.id, { collected: true, tshirt_size: size });
      toast.success(`${request.rider.full_name}'s T-shirt marked as collected.`);
      onClose();
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 140 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <span className="modal-title">Mark T-shirt as collected</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <p className="danger-message">
            Confirm that <strong>{request.rider.full_name}</strong> ({request.rider.rider_id}) has collected their T-shirt for{' '}
            <strong>{request.campaign.name}</strong>
            {request.pickup_location ? ` at ${request.pickup_location}` : ''}. You can then approve them for the campaign.
          </p>
          <div className="form-group">
            <label className="form-label">Size handed over *</label>
            <select className="form-input" value={size} onChange={(e) => setSize(e.target.value)}>
              <option value="">Select size</option>
              {request.size_options.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {request.tshirt_size ? <span className="form-hint">The rider asked for {request.tshirt_size}.</span> : null}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving…' : 'Mark Collected'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Join requests with T-shirt collection and approval actions. Used per campaign and across campaigns. */
export function JoinRequestsTable({ requests, showCampaign, onChanged, campaignRiders }) {
  const [collecting, setCollecting] = useState(null);
  const [approving, setApproving] = useState(null);
  const [danger, setDanger] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const markPending = async (r) => {
    setBusyId(r.id);
    try {
      await api.setRequestKit(r.campaign.id, r.id, { collected: false });
      toast.success(`${r.rider.full_name}'s T-shirt set back to Pending Collection.`);
      await onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reject = (r) =>
    setDanger({
      title: 'Reject join request',
      message: `Reject ${r.rider.full_name}'s request to join ${r.campaign.name}? No campaign assignment is created and the rider sees your reason.`,
      getAction: () => ({
        label: 'Reject Request',
        tone: 'danger',
        reasonLabel: 'Reason (shown to the rider)',
        reasonRequired: true,
        run: async (reason) => {
          await api.rejectCampaignApplication(r.campaign.id, r.id, reason);
          return `${r.rider.full_name}'s request was rejected.`;
        },
      }),
      onDone: onChanged,
    });

  return (
    <>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rider</th>
              {showCampaign ? <th>Campaign</th> : null}
              <th>T-Shirt Size</th>
              <th>T-Shirt Pickup</th>
              <th>Requested</th>
              <th>Campaign Approval</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const pending = r.status === 'REQUESTED';
              return (
                <tr key={r.id} style={busyId === r.id ? { opacity: 0.6 } : undefined}>
                  <td>
                    <strong>{r.rider.full_name}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{r.rider.rider_id}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.rider.mobile_number}</div>
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{vehicleLabel(r.rider.vehicle_category) || 'Vehicle type not set'}</div>
                    {r.terms_accepted_version ? (
                      <div style={{ fontSize: '0.7rem', color: '#15803D' }}>Accepted terms v{r.terms_accepted_version}</div>
                    ) : null}
                  </td>
                  {showCampaign ? (
                    <td>
                      <strong>{r.campaign.name}</strong>
                    </td>
                  ) : null}
                  <td>
                    {r.tshirt_required ? r.tshirt_size || 'Not set' : '—'}
                    {r.pickup_location ? <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Pickup: {r.pickup_location}</div> : null}
                  </td>
                  <td>
                    <span className={`status-pill ${KIT_PILL[r.kit_status] || ''}`}>{r.kit_status_label}</span>
                    {r.kit_collected_at ? (
                      <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>
                        {formatDate(r.kit_collected_at)}
                        {r.kit_collected_by ? ` · ${r.kit_collected_by}` : ''}
                      </div>
                    ) : null}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{formatDate(r.requested_at)}</td>
                  <td>
                    <span className={`status-pill ${REQUEST_PILL[r.status] || ''}`}>{r.status_label}</span>
                    {r.rejection_reason ? <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4 }}>{r.rejection_reason}</div> : null}
                    {pending && r.approve_blocked_reason ? (
                      <div style={{ fontSize: '0.72rem', color: '#B45309', marginTop: 4 }}>{r.approve_blocked_reason}</div>
                    ) : null}
                  </td>
                  <td>
                    {pending ? (
                      <div className="row-actions">
                        {r.tshirt_required && r.kit_status !== 'COLLECTED' ? (
                          <button className="btn-sm-view" disabled={busyId === r.id} onClick={() => setCollecting(r)}>
                            <Shirt size={12} /> Mark Collected
                          </button>
                        ) : null}
                        {r.tshirt_required && r.kit_status === 'COLLECTED' ? (
                          <button className="card-action-link" style={{ fontSize: '0.72rem' }} disabled={busyId === r.id} onClick={() => markPending(r)}>
                            Undo collected
                          </button>
                        ) : null}
                        <button
                          className="btn-sm-approve"
                          disabled={!r.can_approve || busyId === r.id}
                          title={r.approve_blocked_reason || 'Approve and assign this rider to the campaign'}
                          onClick={() => setApproving(r)}
                        >
                          <CheckCircle2 size={12} /> Approve
                        </button>
                        <button className="btn-sm-reject" disabled={busyId === r.id} onClick={() => reject(r)}>
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                        {formatDate(r.approved_at || r.rejected_at)}
                        {r.reviewed_by ? ` · ${r.reviewed_by}` : ''}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr>
                <td colSpan={showCampaign ? 7 : 6}>
                  <EmptyState icon={Inbox}>No join requests here.</EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {collecting ? <KitCollectedDialog request={collecting} onClose={() => setCollecting(null)} onDone={onChanged} /> : null}
      {approving ? (
        <ApproveRequestDialog
          campaignId={approving.campaign.id}
          application={approving}
          riders={campaignRiders}
          onClose={() => setApproving(null)}
          onSaved={() => {
            toast.success(`${approving.rider.full_name} is now assigned to ${approving.campaign.name}.`);
            setApproving(null);
            onChanged();
          }}
        />
      ) : null}
      {danger ? <DangerDialog {...danger} onClose={() => setDanger(null)} /> : null}
    </>
  );
}

const FILTERS = [
  ['REQUESTED', 'Pending Approval'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['ALL', 'All'],
];

/** Sidebar page: every campaign's join requests in one place. */
export function JoinRequestsView({ onChanged }) {
  const [status, setStatus] = useState('REQUESTED');
  const [campaignId, setCampaignId] = useState('');
  const [vehicle, setVehicle] = useState('ALL');
  const [requests, setRequests] = useState(null);
  const [campaigns, setCampaigns] = useState([]);

  const load = () =>
    api
      .getJoinRequests(status, campaignId)
      .then(setRequests)
      .catch((err) => toast.error(err.message));

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === 'visible' && load(), 15000);
    return () => clearInterval(id);
  }, [status, campaignId]);
  useEffect(() => {
    api.getCampaigns().then(setCampaigns).catch(() => {});
  }, []);

  const changed = async () => {
    await load();
    onChanged && onChanged();
  };
  const waitingForShirt = (requests || []).filter((r) => r.status === 'REQUESTED' && r.approve_blocked_reason === 'Waiting for T-shirt collection').length;

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Campaign Join Requests</h1>
          <p className="page-subtitle">
            A request only becomes a campaign rider after the T-shirt is collected (when required) and you approve it.
          </p>
        </div>
      </div>
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="tabs-header-bar">
            {FILTERS.map(([key, label]) => (
              <button key={key} className={`tab-btn ${status === key ? 'active' : ''}`} onClick={() => setStatus(key)}>
                {label}
              </button>
            ))}
          </div>
          <select className="form-input" style={{ width: 'auto' }} value={vehicle} onChange={(e) => setVehicle(e.target.value)} aria-label="Vehicle type">
            <option value="ALL">All vehicles</option>
            {VEHICLE_TYPES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <select className="form-input" style={{ width: 240, maxWidth: '100%' }} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {status === 'REQUESTED' && waitingForShirt ? (
          <div className="form-hint" style={{ marginTop: 10 }}>
            {waitingForShirt} request{waitingForShirt === 1 ? ' is' : 's are'} waiting for T-shirt collection before they can be approved.
          </div>
        ) : null}
      </div>
      <div className="card">
        {requests ? (
          <JoinRequestsTable requests={requests.filter((r) => vehicle === 'ALL' || r.rider.vehicle_category === vehicle)} showCampaign onChanged={changed} />
        ) : (
          <EmptyState icon={Inbox}>Loading requests…</EmptyState>
        )}
      </div>
    </div>
  );
}
