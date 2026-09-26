import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { vehicleLabel } from './CampaignShared';
import { X, CheckCircle, XCircle, AlertTriangle, FileText, Check, Shield } from 'lucide-react';

/** Issues a temporary password (shown once) for a rider who can't reset by email. */
function ResetPasswordButton({ rider }) {
  const [step, setStep] = useState('idle'); // idle | confirm | working | done
  const [temp, setTemp] = useState('');
  const [error, setError] = useState('');
  const reset = async () => {
    setStep('working');
    setError('');
    try {
      const res = await api.resetRiderPassword(rider.id);
      setTemp(res.temporary_password);
      setStep('done');
    } catch (err) {
      setError(err.message);
      setStep('confirm');
    }
  };
  return (
    <>
      <button className="btn-sm-view" style={{ padding: '8px 14px', fontSize: '0.82rem' }} onClick={() => setStep('confirm')}>
        Reset Password
      </button>
      {step !== 'idle' ? (
        <div className="modal-overlay" style={{ zIndex: 130 }} onClick={() => step !== 'working' && setStep('idle')}>
          <div className="modal-dialog" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Reset password for {rider.full_name}</span>
            </div>
            <div className="modal-body" style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.55 }}>
              {step === 'done' ? (
                <>
                  <p>Temporary password (shown only now):</p>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 700, letterSpacing: 2, background: '#F1F5F9', borderRadius: 10, padding: '12px 16px', margin: '10px 0', color: '#0F172A', userSelect: 'all' }}>
                    {temp}
                  </div>
                  <p>
                    Read it to the rider on a call to <strong>{rider.mobile_number}</strong>. They'll be asked to choose a new password when they log in.
                    Their other logins have been signed out.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Use this only after <strong>calling the rider on {rider.mobile_number}</strong> to confirm it's really them. Riders with an email can reset it
                    themselves from the app (Forgot password).
                  </p>
                  <p style={{ marginTop: 8 }}>Their current password stops working and they're signed out everywhere.</p>
                  {error ? <div className="form-error">{error}</div> : null}
                </>
              )}
            </div>
            <div className="modal-footer">
              {step === 'done' ? (
                <>
                  <button className="btn-secondary" onClick={() => navigator.clipboard && navigator.clipboard.writeText(temp)}>
                    Copy
                  </button>
                  <button className="btn-primary" onClick={() => setStep('idle')}>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" disabled={step === 'working'} onClick={() => setStep('idle')}>
                    Cancel
                  </button>
                  <button className="btn-danger" disabled={step === 'working'} onClick={reset}>
                    {step === 'working' ? 'Resetting…' : 'Reset Password'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The rider's registration selfie, loaded privately with the admin's login. */
function RiderSelfie({ rider }) {
  const [url, setUrl] = useState(null);
  const [state, setState] = useState(rider.profile_photo ? 'loading' : 'none');
  const [large, setLarge] = useState(false);
  useEffect(() => {
    if (!rider.profile_photo) return undefined;
    let objectUrl = null;
    let cancelled = false;
    api
      .getRiderSelfieUrl(rider.id)
      .then((u) => {
        objectUrl = u;
        if (cancelled) return;
        setUrl(u);
        setState(u ? 'ready' : 'missing');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rider.id, rider.profile_photo]);

  const size = large ? 220 : 76;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {state === 'ready' ? (
        <img
          src={url}
          alt={`Selfie of ${rider.full_name}`}
          onClick={() => setLarge(!large)}
          title={large ? 'Click to shrink' : 'Click to enlarge'}
          style={{ width: size, height: size, borderRadius: large ? 14 : '50%', objectFit: 'cover', border: '1px solid #E2E8F0', cursor: 'zoom-in' }}
        />
      ) : (
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: '#F1F5F9', border: '1px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', color: '#94A3B8', textAlign: 'center', padding: 6 }}>
          {state === 'loading' ? 'Loading…' : 'No selfie'}
        </div>
      )}
      <div style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: 1.5 }}>
        <div style={{ fontWeight: 700, color: '#0F172A' }}>Driver selfie</div>
        {state === 'ready' ? 'Taken at registration. Private: visible to admins only.' : null}
        {state === 'none' ? 'No selfie on file (added by an admin, or registered before selfies were required).' : null}
        {state === 'missing' ? 'The selfie file could not be found.' : null}
        {state === 'error' ? 'The selfie could not be loaded. Try again later.' : null}
      </div>
    </div>
  );
}

/** Platform Terms & Privacy acceptances (versions and times; history is kept). */
function RiderConsents({ rider }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    api
      .getRiderConsents(rider.id)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setData(false));
    return () => {
      cancelled = true;
    };
  }, [rider.id]);
  if (data === null) return null;
  const latest = data && data.acceptances[0];
  const when = (value) => new Date(value.endsWith('Z') ? value : `${value}Z`).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div style={{ fontSize: '0.75rem', color: '#64748B', lineHeight: 1.5, marginTop: -4 }}>
      <span style={{ fontWeight: 700, color: '#0F172A' }}>Terms & Privacy: </span>
      {data === false
        ? 'could not be loaded.'
        : latest
          ? `accepted v${latest.terms_version} / v${latest.privacy_version} on ${when(latest.accepted_at)} (${latest.source === 'REGISTRATION' ? 'at registration' : 'in the app'})` +
            (data.is_current ? '' : ' — a newer version is waiting for acceptance') +
            (data.acceptances.length > 1 ? `; ${data.acceptances.length - 1} earlier acceptance(s) kept` : '')
          : 'not accepted yet (registered before the Terms checkbox, or added by an admin). The app asks at next login.'}
    </div>
  );
}

export function RiderDetailModal({
  rider,
  brands = [],
  onClose,
  onApprove,
  onReject,
  onSuspend,
  onReactivate,
  onOpenAssign,
  onEndAssignment,
  onEdit,
  onDelete,
  onRestore,
  onAddToCampaign,
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  if (!rider) return null;
  const archived = Boolean(rider.archived_at);
  const canAssign = !archived && (rider.status === 'APPROVED' || rider.status === 'ACTIVE');
  const currentAssignment = (rider.brand_history || []).find((a) => a.is_current);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="modal-title">{rider.full_name}</span>
              <span className={`status-pill pill-${rider.status?.toLowerCase()}`}>{rider.status}</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
              Rider ID: <strong>{rider.rider_id}</strong> • Registered: {new Date(rider.created_at).toLocaleDateString()}
            </div>
            {archived ? (
              <div className="impact-note" style={{ marginTop: 8 }}>
                Archived on {new Date(rider.archived_at).toLocaleDateString()}: {rider.archive_reason}. Login is disabled; history is kept.
              </div>
            ) : null}
          </div>
          <button onClick={onClose} style={{ color: '#94A3B8' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          <RiderSelfie rider={rider} />
          <RiderConsents rider={rider} />
          {/* Section: Overview Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>CONTACT</div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: '2px' }}>{rider.mobile_number}</div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{rider.email || 'No email provided'}</div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>WORK & VEHICLE</div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: '2px' }}>{rider.current_company || 'Not provided'}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{[vehicleLabel(rider.vehicle_category), rider.vehicle_type, rider.current_role].filter(Boolean).join(' • ') || 'Not provided'}</div>
              <div style={{ fontSize: '0.75rem', color: '#0F172A', fontWeight: 600 }}>{rider.vehicle_number ? `Reg. No. ${rider.vehicle_number}` : 'Vehicle number not provided'}</div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>LOCATION</div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: '2px' }}>{rider.primary_city}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{rider.primary_area || 'Area not provided'}{rider.preferred_radius ? ` (Radius: ${rider.preferred_radius})` : ''}</div>
            </div>
          </div>

          {/* Payment Details */}
          <div style={{ background: '#F8FAFC', padding: '14px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700, marginBottom: '6px' }}>
              PAYMENT INFORMATION
            </div>
            <div style={{ display: 'flex', gap: '24px', fontSize: '0.84rem' }}>
              <div>
                <span style={{ color: '#64748B' }}>UPI ID: </span>
                <strong style={{ color: '#0F172A' }}>{rider.upi_id || 'Not set'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>GPay Mobile: </span>
                <strong style={{ color: '#0F172A' }}>{rider.gpay_number || rider.mobile_number}</strong>
              </div>
              <div>
                <span style={{ color: '#64748B' }}>Current Brand: </span>
                <strong style={{ color: '#2563EB' }}>{rider.current_brand || 'Unassigned'}</strong>
              </div>
            </div>
          </div>

          {/* Documents Section */}
          <div>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              VERIFICATION DOCUMENTS
            </div>
            {rider.documents && rider.documents.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rider.documents.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      background: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <FileText size={18} color="#2563EB" />
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{doc.doc_type}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{doc.file_name}</div>
                      </div>
                    </div>
                    <span className="status-pill pill-approved" style={{ fontSize: '0.68rem' }}>
                      {doc.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic' }}>
                No documents uploaded. Verify the rider's Driving Licence, Aadhaar and vehicle RC offline.
              </div>
            )}
          </div>

          {/* Brand Assignment Section */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              BRAND ASSIGNMENT
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: rider.current_brand ? '#2563EB' : '#94A3B8' }}>
                  {rider.current_brand || 'No brand assigned'}
                </div>
                {currentAssignment ? (
                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                    Assigned {new Date(currentAssignment.assignment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {currentAssignment.assigned_by_name ? ` by ${currentAssignment.assigned_by_name}` : ''}
                  </div>
                ) : null}
              </div>
              {canAssign ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {rider.current_brand ? (
                    <button className="btn-danger-outline" style={{ padding: '7px 14px', fontSize: '0.8rem' }} onClick={() => onEndAssignment(rider)}>
                      End Assignment
                    </button>
                  ) : null}
                  <button className="btn-primary" style={{ padding: '7px 14px', fontSize: '0.8rem' }} onClick={() => onOpenAssign(rider)}>
                    {rider.current_brand ? 'Change Brand' : 'Assign Brand'}
                  </button>
                </div>
              ) : null}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '6px' }}>
              {canAssign
                ? 'Assigning a brand activates the rider account and allows them to receive payouts.'
                : 'Approve this rider before assigning a brand.'}
            </div>
          </div>

          {/* Rejection Prompt if triggered */}
          {showRejectInput && (
            <div style={{ background: '#FEF2F2', padding: '12px', borderRadius: '8px', border: '1px solid #FCA5A5' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#991B1B', marginBottom: '6px' }}>
                Reason for Rejection
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Expired driving license or mismatch in documents"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{ width: '100%', marginBottom: '8px' }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => setShowRejectInput(false)}>
                  Cancel
                </button>
                <button
                  className="btn-sm-reject"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                  onClick={() => onReject(rider.id, rejectReason)}
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {archived ? (
            <button className="btn-sm-approve" style={{ padding: '8px 16px', fontSize: '0.82rem' }} onClick={() => onRestore(rider)}>
              Restore Rider
            </button>
          ) : (
            <>
              <button className="btn-danger-outline" style={{ padding: '8px 14px', fontSize: '0.82rem', marginRight: 'auto', order: -1 }} onClick={() => onDelete(rider)}>
                Delete / Archive
              </button>
              <button className="btn-sm-view" style={{ padding: '8px 14px', fontSize: '0.82rem' }} onClick={() => onEdit(rider)}>
                Edit Details
              </button>
              <ResetPasswordButton rider={rider} />
              {canAssign ? (
                <button className="btn-sm-view" style={{ padding: '8px 14px', fontSize: '0.82rem' }} onClick={() => onAddToCampaign(rider)}>
                  Add to Campaign
                </button>
              ) : null}
            </>
          )}

          {!archived && rider.status === 'PENDING' && (
            <>
              <button
                className="btn-sm-reject"
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                onClick={() => setShowRejectInput(true)}
              >
                Reject Rider
              </button>
              <button
                className="btn-sm-approve"
                style={{ padding: '8px 18px', fontSize: '0.82rem' }}
                onClick={() => onApprove(rider.id)}
              >
                Approve Application
              </button>
            </>
          )}

          {!archived && (rider.status === 'ACTIVE' || rider.status === 'APPROVED') && (
            <button
              className="btn-sm-reject"
              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              onClick={() => onSuspend(rider)}
            >
              Suspend Account
            </button>
          )}

          {!archived && rider.status === 'SUSPENDED' && (
            <button
              className="btn-sm-approve"
              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              onClick={() => onReactivate(rider.id)}
            >
              Reactivate Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


export function CreatePaymentModal({ riders = [], brands = [], onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    rider_id: riders[0]?.id || '',
    brand_id: brands[0]?.id || '',
    amount: '',
    payment_period: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    payment_type: 'UPI',
    notes: 'Weekly rider payout',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.rider_id || !formData.amount) return;
    onSubmit({
      ...formData,
      amount: parseFloat(formData.amount),
      rider_id: parseInt(formData.rider_id),
      brand_id: formData.brand_id ? parseInt(formData.brand_id) : undefined,
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <span className="modal-title">Record New Payment</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Select Rider *</label>
              <select
                className="form-input"
                required
                value={formData.rider_id}
                onChange={(e) => setFormData({ ...formData, rider_id: e.target.value })}
              >
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.full_name} ({r.rider_id}) — {r.primary_city}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Brand</label>
              <select
                className="form-input"
                value={formData.brand_id}
                onChange={(e) => setFormData({ ...formData, brand_id: e.target.value })}
              >
                <option value="">Default Brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="e.g. 1250"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Period</label>
              <input
                className="form-input"
                value={formData.payment_period}
                onChange={(e) => setFormData({ ...formData, payment_period: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input
                className="form-input"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Generate Payment Record</button>
          </div>
        </form>
      </div>
    </div>
  );
}
