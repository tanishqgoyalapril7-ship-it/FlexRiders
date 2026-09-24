import React, { useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, FileText, Check, Shield } from 'lucide-react';

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
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{[rider.vehicle_type, rider.current_role].filter(Boolean).join(' • ') || 'Not provided'}</div>
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
