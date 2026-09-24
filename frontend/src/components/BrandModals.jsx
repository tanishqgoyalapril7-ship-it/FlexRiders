import React, { useEffect, useState } from 'react';
import { X, Plus, Briefcase, Users } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';
import { EmptyState, StatusPill, formatDate } from './CampaignShared';

const todayInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Riders must be approved before they can be assigned to a brand (enforced by the API too).
export const isAssignable = (rider) => rider && (rider.status === 'APPROVED' || rider.status === 'ACTIVE');

export function BrandLogo({ brand, size = 42 }) {
  if (brand.logo) {
    return (
      <img
        src={brand.logo}
        alt=""
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'cover', border: '1px solid #E2E8F0', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: brand.is_active === false ? '#94A3B8' : 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      {brand.name.charAt(0).toUpperCase()}
    </div>
  );
}

export function BrandFormModal({ brand, onClose, onSaved }) {
  const editing = Boolean(brand);
  const [form, setForm] = useState({
    name: brand?.name || '',
    code: brand?.code || '',
    description: brand?.description || '',
    logo: brand?.logo || '',
    contact_person: brand?.contact_person || '',
    contact_number: brand?.contact_number || '',
    is_active: brand ? brand.is_active : true,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setError('Brand name must be at least 2 characters.');
      return;
    }
    if (form.logo && !/^https?:\/\//.test(form.logo.trim())) {
      setError('Logo must be a full image URL starting with http:// or https://');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = editing ? await api.updateBrand(brand.id, form) : await api.createBrand(form);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <span className="modal-title">{editing ? 'Edit Brand' : 'Create Brand'}</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error ? <div className="form-error">{error}</div> : null}
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Brand Name *</label>
                <input className="form-input" value={form.name} onChange={set('name')} placeholder="e.g. Zepto" autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Brand Code</label>
                <input className="form-input" value={form.code} onChange={set('code')} placeholder="e.g. ZEP-001" />
                <span className="form-hint">Leave blank to generate one from the name.</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" rows={2} value={form.description} onChange={set('description')} placeholder="e.g. Quick-commerce delivery partner" />
            </div>
            <div className="form-group">
              <label className="form-label">Logo URL (optional)</label>
              <input className="form-input" value={form.logo} onChange={set('logo')} placeholder="https://…/logo.png" />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Contact Person</label>
                <input className="form-input" value={form.contact_person} onChange={set('contact_person')} placeholder="Full name" />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input className="form-input" value={form.contact_number} onChange={set('contact_number')} placeholder="+91…" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <div className="visibility-options">
                {[
                  [true, 'Active', 'Available for rider assignment and campaigns.'],
                  [false, 'Inactive', 'Hidden from new assignments. History is kept.'],
                ].map(([value, title, text]) => (
                  <button
                    type="button"
                    key={title}
                    className={`visibility-option ${form.is_active === value ? 'selected' : ''}`}
                    onClick={() => setForm((prev) => ({ ...prev, is_active: value }))}
                  >
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Brand'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Assign a rider to a brand. Pass `rider` to fix the rider (from the rider profile), or
 * `brand` to fix the brand (from the Brands page); the other one is chosen in the form.
 */
export function AssignBrandModal({ rider, brand, riders = [], brands = [], onClose, onAssigned, onCreateBrand }) {
  const activeBrands = brands.filter((b) => b.is_active);
  const eligibleRiders = riders.filter(isAssignable);
  const [riderId, setRiderId] = useState(rider ? String(rider.id) : '');
  const [brandId, setBrandId] = useState(brand ? String(brand.id) : '');
  const [assignmentDate, setAssignmentDate] = useState(todayInput());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedRider = rider || eligibleRiders.find((r) => String(r.id) === riderId);
  const noBrands = activeBrands.length === 0 && !brand;

  const submit = async () => {
    if (!selectedRider) return setError('Please select a rider.');
    if (!brandId) return setError('Please select a brand.');
    setSaving(true);
    setError('');
    try {
      const result = await api.assignBrand(selectedRider.id, brandId, { assignmentDate, notes });
      onAssigned(result);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 110 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <span className="modal-title">Assign Brand</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {noBrands ? (
          <>
            <div className="modal-body">
              <EmptyState icon={Briefcase}>No brands available. Create a brand first.</EmptyState>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" onClick={onCreateBrand}>
                <Plus size={15} />
                Create Brand
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              {error ? <div className="form-error">{error}</div> : null}
              <div className="form-group">
                <label className="form-label">Rider</label>
                {rider ? (
                  <div className="mini-stat">
                    <div style={{ fontWeight: 700 }}>{rider.full_name}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                      {rider.rider_id} • Current brand: {rider.current_brand || 'None'}
                    </div>
                  </div>
                ) : eligibleRiders.length === 0 ? (
                  <div className="form-hint">No approved riders yet. Approve a rider application first.</div>
                ) : (
                  <select className="form-input" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                    <option value="">Select an approved rider</option>
                    {eligibleRiders.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name} ({r.rider_id}){r.current_brand ? ` — currently ${r.current_brand}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Brand</label>
                {brand ? (
                  <div className="mini-stat" style={{ fontWeight: 700 }}>{brand.name}</div>
                ) : (
                  <select className="form-input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                    <option value="">Select a brand</option>
                    {activeBrands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Assignment Date</label>
                <input type="date" className="form-input" value={assignmentDate} max={todayInput()} onChange={(e) => setAssignmentDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Notes (optional)</label>
                <input className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Gurugram Sector 29 hub" />
              </div>
              {selectedRider?.current_brand ? (
                <div className="form-hint">
                  {selectedRider.full_name}'s assignment to {selectedRider.current_brand} will end. Past assignments stay in the history.
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="btn-primary" disabled={saving || !selectedRider} onClick={submit}>
                {saving ? 'Assigning…' : 'Assign Brand'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function BrandDetailModal({ brandId, onClose, onEdit, onAssign, onToggleActive, refreshKey }) {
  const [brand, setBrand] = useState(null);

  useEffect(() => {
    api.getBrandDetail(brandId).then(setBrand).catch((err) => toast.error(err.message));
  }, [brandId, refreshKey]);

  const current = brand ? brand.assignments.filter((a) => a.is_current) : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px' }}>
        <div className="modal-header">
          {brand ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <BrandLogo brand={brand} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="modal-title">{brand.name}</span>
                  <span className={`status-pill ${brand.is_active ? 'pill-active' : 'pill-draft'}`}>{brand.is_active ? 'Active' : 'Inactive'}</span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: 2 }}>
                  Code: {brand.code} • Created {formatDate(brand.created_at)}
                </div>
              </div>
            </div>
          ) : (
            <span className="modal-title">Brand</span>
          )}
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {brand ? (
          <div className="modal-body">
            <div className="mini-stat-list">
              <div className="mini-stat">
                <div className="mini-stat-label">Current Riders</div>
                <div className="mini-stat-value">{current.length}</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-label">Contact</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 600, marginTop: 4 }}>
                  {brand.contact_person || '—'} {brand.contact_number ? `• ${brand.contact_number}` : ''}
                </div>
              </div>
            </div>
            {brand.description ? <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.5 }}>{brand.description}</p> : null}

            <div>
              <div className="card-title-text" style={{ marginBottom: 10 }}>Assignment History</div>
              {brand.assignments.length === 0 ? (
                <EmptyState icon={Users}>No riders have been assigned to this brand yet.</EmptyState>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rider</th>
                        <th>Assigned</th>
                        <th>Ended</th>
                        <th>Assigned By</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brand.assignments.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <strong>{a.rider_name}</strong>
                            <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{a.rider_id}</div>
                          </td>
                          <td style={{ fontSize: '0.8rem' }}>{formatDate(a.assignment_date)}</td>
                          <td style={{ fontSize: '0.8rem' }}>{a.removal_date ? formatDate(a.removal_date) : '—'}</td>
                          <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{a.assigned_by || '—'}</td>
                          <td>
                            <StatusPill status={a.is_current ? 'ACTIVE' : 'COMPLETED'} label={a.is_current ? 'Current' : 'Ended'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <EmptyState icon={Briefcase}>Loading brand…</EmptyState>
          </div>
        )}

        {brand ? (
          <div className="modal-footer">
            <button className={brand.is_active ? 'btn-danger-outline' : 'btn-secondary'} onClick={() => onToggleActive(brand)} style={{ marginRight: 'auto' }}>
              {brand.is_active ? 'Deactivate' : 'Activate'}
            </button>
            <button className="btn-secondary" onClick={() => onEdit(brand)}>
              Edit
            </button>
            {brand.is_active ? (
              <button className="btn-primary" onClick={() => onAssign(brand)}>
                Assign Rider
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
