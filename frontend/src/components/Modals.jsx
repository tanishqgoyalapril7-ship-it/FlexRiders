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
  onAssignBrand,
}) {
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  if (!rider) return null;

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
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: '2px' }}>{rider.current_company || 'Independent'}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{rider.vehicle_type || 'Bike'} • {rider.current_role}</div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>LOCATION</div>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginTop: '2px' }}>{rider.primary_city}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{rider.primary_area || 'Central'} (Radius: {rider.preferred_radius || '10 km'})</div>
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
                Govt ID, Driving License & RC uploaded digitally via mobile registration.
              </div>
            )}
          </div>

          {/* Brand Assignment Section */}
          <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              BRAND ASSIGNMENT
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select
                className="form-input"
                style={{ flex: 1 }}
                value={selectedBrandId}
                onChange={(e) => setSelectedBrandId(e.target.value)}
              >
                <option value="">Select Brand to Assign...</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.active_riders_count || 0} active riders)
                  </option>
                ))}
              </select>
              <button
                className="btn-primary"
                disabled={!selectedBrandId}
                onClick={() => onAssignBrand(rider.id, selectedBrandId)}
                style={{ opacity: selectedBrandId ? 1 : 0.5 }}
              >
                Assign Brand
              </button>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>
              Assigning a brand activates the rider account and allows them to receive payouts.
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

          {rider.status === 'PENDING' && (
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

          {rider.status === 'ACTIVE' && (
            <button
              className="btn-sm-reject"
              style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              onClick={() => onSuspend(rider.id, 'Administrative suspension')}
            >
              Suspend Account
            </button>
          )}

          {rider.status === 'SUSPENDED' && (
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

export function CreateBrandModal({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    contact_person: '',
    contact_number: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) return;
    onSubmit(formData);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <span className="modal-title">Create New Brand</span>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Brand Name *</label>
              <input
                className="form-input"
                placeholder="e.g. Brand F Express"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Brand Code</label>
              <input
                className="form-input"
                placeholder="e.g. brand_f"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                placeholder="Business line / delivery specialty"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Person</label>
              <input
                className="form-input"
                placeholder="Full Name"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Contact Phone</label>
              <input
                className="form-input"
                placeholder="+91..."
                value={formData.contact_number}
                onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary">Create Brand</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CreatePaymentModal({ riders = [], brands = [], onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    rider_id: riders[0]?.id || '',
    brand_id: brands[0]?.id || '',
    amount: '',
    payment_period: 'September 2026',
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
