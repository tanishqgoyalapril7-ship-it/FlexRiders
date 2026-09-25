import React, { useEffect, useState } from 'react';
import { VEHICLE_TYPES } from './CampaignShared';
import { Eye, EyeOff, X } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';
import WebcamSelfie from './WebcamSelfie';

// Same formats the backend accepts: HR26DK8337, DL3C1234, 22BH1234AA.
export const normalizeVehicleNumber = (value) => (value || '').replace(/[\s.-]/g, '').toUpperCase();
export const isValidVehicleNumber = (value) => {
  const v = normalizeVehicleNumber(value);
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(v) || /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/.test(v);
};

export function RiderAvatar({ rider, size = 32 }) {
  const initials = (rider.full_name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: rider.archived_at ? '#CBD5E1' : '#DBEAFE',
        color: rider.archived_at ? '#475569' : '#1D4ED8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: width }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PasswordInput({ value, onChange, placeholder, autoComplete = 'new-password' }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrap">
      <input
        className="form-input"
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button type="button" className="password-toggle" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

const RIDER_FIELDS = [
  'full_name', 'mobile_number', 'email', 'dob', 'current_company', 'current_role', 'vehicle_type',
  'vehicle_number', 'vehicle_category', 'primary_city', 'primary_area', 'upi_id', 'gpay_number',
];

// "DD-MM-YYYY" (stored) <-> "YYYY-MM-DD" (date input)
const dobToInput = (dob) => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
const inputToDob = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

/** Create (rider = null) or edit a rider. */
export function RiderFormModal({ rider, onClose, onSaved }) {
  const editing = Boolean(rider);
  const [form, setForm] = useState(() => {
    const base = Object.fromEntries(RIDER_FIELDS.map((f) => [f, (rider && rider[f]) || '']));
    return { ...base, current_role: base.current_role || 'Rider', password: '', status: 'APPROVED' };
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [selfie, setSelfie] = useState(null); // Required for new riders
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const vehicleOk = !form.vehicle_number || isValidVehicleNumber(form.vehicle_number);

  const submit = async (e) => {
    e.preventDefault();
    if (form.full_name.trim().length < 2) return setError('Enter the rider’s full name.');
    if (form.mobile_number.replace(/\D/g, '').length < 10) return setError('Enter a valid 10-digit mobile number.');
    if (!form.primary_city.trim()) return setError('Enter the primary working city.');
    if (!vehicleOk) return setError('Enter a valid vehicle number, e.g. HR26DK8337.');
    if (!form.vehicle_category) return setError('Select the rider’s vehicle type.');
    if (form.vehicle_category !== 'CYCLE' && !form.vehicle_number.trim())
      return setError('Enter the vehicle registration number (only Cycle may be left blank).');
    if (!editing && form.password.length < 6) return setError('Set a password of at least 6 characters for the rider’s login.');
    if (!editing && !selfie) return setError('Take the rider’s driver selfie with the camera. It is required for every new rider.');
    setSaving(true);
    setError('');
    try {
      let saved;
      if (editing) {
        // Send only changed fields; an empty value clears an optional field.
        const changes = Object.fromEntries(RIDER_FIELDS.filter((f) => (rider[f] || '') !== form[f]).map((f) => [f, form[f]]));
        saved = Object.keys(changes).length ? await api.updateRider(rider.id, changes) : rider;
      } else {
        const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
        saved = await api.createRider({ ...payload, selfie });
      }
      toast.success(editing ? `${saved.full_name}'s details were updated.` : `${saved.full_name} was added as ${saved.rider_id}.`);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${rider.full_name}` : 'Add New Rider'} onClose={onClose} width={640}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input className="form-input" value={form.full_name} onChange={set('full_name')} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input className="form-input" value={form.mobile_number} onChange={set('mobile_number')} placeholder="10-digit number" />
              {editing ? <span className="form-hint">The rider logs in with this number.</span> : null}
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" value={form.email} onChange={set('email')} />
            </div>
            <div className="form-group">
              <label className="form-label">Date of Birth</label>
              <input className="form-input" type="date" value={dobToInput(form.dob)} onChange={(e) => setForm((p) => ({ ...p, dob: inputToDob(e.target.value) }))} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Current / Previous Company</label>
              <input className="form-input" value={form.current_company} onChange={set('current_company')} />
            </div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <input className="form-input" value={form.current_role} onChange={set('current_role')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Vehicle Type</label>
            <select className="form-input" value={form.vehicle_category} onChange={set('vehicle_category')}>
              <option value="">Select vehicle type</option>
              {VEHICLE_TYPES.map(([value, label, description]) => (
                <option key={value} value={value}>
                  {label} ({description})
                </option>
              ))}
            </select>
            <span className="form-hint">Decides which campaigns the rider can join.</span>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Vehicle Model</label>
              <input className="form-input" value={form.vehicle_type} onChange={set('vehicle_type')} placeholder="e.g. Honda Activa" />
            </div>
            <div className="form-group">
              <label className="form-label">Vehicle Number</label>
              <input
                className="form-input"
                value={form.vehicle_number}
                onChange={(e) => setForm((p) => ({ ...p, vehicle_number: e.target.value.toUpperCase() }))}
                placeholder="e.g. HR26DK8337"
              />
              <span className="form-hint" style={!vehicleOk ? { color: 'var(--danger)' } : undefined}>
                {!form.vehicle_number ? 'As printed on the RC. Must be unique.' : vehicleOk ? `Valid: ${normalizeVehicleNumber(form.vehicle_number)}` : 'Not a valid vehicle number'}
              </span>
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Primary City *</label>
              <input className="form-input" value={form.primary_city} onChange={set('primary_city')} />
            </div>
            <div className="form-group">
              <label className="form-label">Area / Zone</label>
              <input className="form-input" value={form.primary_area} onChange={set('primary_area')} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">UPI ID</label>
              <input className="form-input" value={form.upi_id} onChange={set('upi_id')} placeholder="name@upi" />
            </div>
            <div className="form-group">
              <label className="form-label">GPay / PhonePe Number</label>
              <input className="form-input" value={form.gpay_number} onChange={set('gpay_number')} />
            </div>
          </div>
          {!editing ? (
            <div className="form-group">
              <label className="form-label">Driver Selfie *</label>
              <WebcamSelfie value={selfie} onChange={setSelfie} />
            </div>
          ) : null}
          {!editing ? (
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Login Password *</label>
                <PasswordInput value={form.password} onChange={set('password')} placeholder="At least 6 characters" />
                <span className="form-hint">Share it with the rider; they log in to the app with their mobile number.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Starting Status</label>
                <select className="form-input" value={form.status} onChange={set('status')}>
                  <option value="APPROVED">Approved (documents verified)</option>
                  <option value="PENDING">Pending review</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Rider'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Size + pickup location when the campaign needs a T-shirt (same rules as a rider joining). */
function KitChoiceFields({ kit, size, setSize, locationId, setLocationId }) {
  if (!kit || !kit.tshirt_required) return null;
  const active = (kit.locations || []).filter((l) => l.is_active !== false);
  return (
    <>
      <div className="form-group">
        <label className="form-label">T-shirt Size *</label>
        <select className="form-input" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Select size</option>
          {kit.size_options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      {active.length > 1 ? (
        <div className="form-group">
          <label className="form-label">Pickup Location *</label>
          <select className="form-input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Select pickup location</option>
            {active.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.address}
              </option>
            ))}
          </select>
        </div>
      ) : active.length === 1 ? (
        <span className="form-hint">T-shirt pickup: {active[0].name}</span>
      ) : (
        <span className="form-hint">No pickup location is set up yet; you can assign one later from the Brand Kit tab.</span>
      )}
    </>
  );
}

const needsLocation = (kit) => Boolean(kit && kit.tshirt_required && (kit.locations || []).filter((l) => l.is_active !== false).length > 1);

/** Admin adds an approved rider straight into a running campaign. */
export function AddToCampaignModal({ rider, onClose, onSaved }) {
  const [campaigns, setCampaigns] = useState(null);
  const [campaignId, setCampaignId] = useState('');
  const [size, setSize] = useState('');
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getCampaigns()
      .then((list) => setCampaigns(list.filter((c) => ['OPEN', 'ACTIVE'].includes(c.status) && c.stats.remaining_slots > 0)))
      .catch((err) => setError(err.message));
  }, []);

  const selected = (campaigns || []).find((c) => String(c.id) === campaignId);
  const kit = selected && selected.brand_kit;
  const needsSize = Boolean(kit && kit.tshirt_required);

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) return setError('Choose a campaign.');
    if (needsSize && !size) return setError('Choose the rider’s T-shirt size.');
    if (needsLocation(kit) && !locationId) return setError('Choose the rider’s T-shirt pickup location.');
    setSaving(true);
    setError('');
    try {
      await api.addRiderToCampaign(selected.id, { rider_id: rider.id, tshirt_size: size || null, pickup_location_id: locationId ? Number(locationId) : null });
      toast.success(`${rider.full_name} was added to ${selected.name}.`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={`Add ${rider.full_name} to a campaign`} onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          {campaigns && campaigns.length === 0 ? (
            <div className="impact-note">There are no published campaigns with free slots. Publish a campaign or open a replacement slot first.</div>
          ) : (
            <div className="form-group">
              <label className="form-label">Campaign *</label>
              <select
                className="form-input"
                value={campaignId}
                onChange={(e) => {
                  setCampaignId(e.target.value);
                  setLocationId('');
                }}
                disabled={!campaigns}
              >
                <option value="">{campaigns ? 'Select a campaign' : 'Loading campaigns…'}</option>
                {(campaigns || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.brand_name} · {c.stats.remaining_slots} slot{c.stats.remaining_slots === 1 ? '' : 's'} left
                  </option>
                ))}
              </select>
              <span className="form-hint">The same rules as a join request apply: one current campaign per rider.</span>
            </div>
          )}
          <KitChoiceFields kit={kit} size={size} setSize={setSize} locationId={locationId} setLocationId={setLocationId} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving || !campaigns || campaigns.length === 0}>
            {saving ? 'Adding…' : 'Add to Campaign'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AdminUserFormModal({ user, roles, onClose, onSaved }) {
  const editing = Boolean(user);
  const [form, setForm] = useState({ email: user?.email || '', phone: user?.phone || '', role: user?.role || 'OPERATIONS_ADMIN', password: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError('Enter a valid email address.');
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Enter a valid phone number.');
    if ((!editing || form.password) && form.password.length < 8) return setError('The password must be at least 8 characters.');
    setSaving(true);
    setError('');
    try {
      const payload = { email: form.email.trim(), phone: form.phone.trim(), role: form.role };
      if (form.password) payload.password = form.password;
      const saved = editing ? await api.updateAdminUser(user.id, payload) : await api.createAdminUser(payload);
      toast.success(editing ? `${saved.email} was updated.` : `${saved.email} can now log in to the dashboard.`);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? `Edit ${user.email}` : 'Add Admin'} onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-group">
            <label className="form-label">Email *</label>
            <input className="form-input" type="email" value={form.email} onChange={set('email')} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Phone (used to log in) *</label>
            <input className="form-input" value={form.phone} onChange={set('phone')} placeholder="+91…" />
          </div>
          <div className="form-group">
            <label className="form-label">Role *</label>
            <select className="form-input" value={form.role} onChange={set('role')}>
              {roles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role.replace(/_/g, ' ')} — {r.description}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <PasswordInput value={form.password} onChange={set('password')} placeholder="At least 8 characters" />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Admin'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function PaymentEditModal({ payment, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: String(payment.amount),
    payment_period: payment.payment_period || '',
    payment_type: payment.payment_type || 'UPI',
    upi_id: payment.upi_id || '',
    notes: payment.notes || '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!(amount > 0)) return setError('Enter an amount greater than zero.');
    setSaving(true);
    setError('');
    try {
      const saved = await api.editPayment(payment.id, { ...form, amount });
      toast.success('Payment updated.');
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={`Edit payment for ${payment.rider_name}`} onClose={onClose} width={480}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input className="form-input" type="number" min="1" step="0.01" value={form.amount} onChange={set('amount')} />
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <select className="form-input" value={form.payment_type} onChange={set('payment_type')}>
                {['UPI', 'Bank Transfer', 'IMPS', 'Cash'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Period</label>
              <input className="form-input" value={form.payment_period} onChange={set('payment_period')} />
            </div>
            <div className="form-group">
              <label className="form-label">UPI ID</label>
              <input className="form-input" value={form.upi_id} onChange={set('upi_id')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-input" rows={2} value={form.notes} onChange={set('notes')} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** From a campaign: pick an approved rider to add directly. */
export function CampaignAddRiderModal({ campaign, currentRiderIds = [], onClose, onSaved }) {
  const [riders, setRiders] = useState(null);
  const [riderId, setRiderId] = useState('');
  const [search, setSearch] = useState('');
  const [size, setSize] = useState('');
  const [locationId, setLocationId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const kit = campaign.brand_kit;
  const needsSize = Boolean(kit && kit.tshirt_required);

  useEffect(() => {
    api
      .getRiders()
      .then((list) => setRiders(list.filter((r) => ['APPROVED', 'ACTIVE'].includes(r.status) && !currentRiderIds.includes(r.id))))
      .catch((err) => setError(err.message));
  }, []);

  const term = search.trim().toLowerCase();
  const matches = (riders || []).filter((r) => !term || [r.full_name, r.rider_id, r.mobile_number].some((v) => (v || '').toLowerCase().includes(term)));

  const submit = async (e) => {
    e.preventDefault();
    if (!riderId) return setError('Choose a rider.');
    if (needsSize && !size) return setError('Choose the rider’s T-shirt size.');
    if (needsLocation(kit) && !locationId) return setError('Choose the rider’s T-shirt pickup location.');
    setSaving(true);
    setError('');
    try {
      const row = await api.addRiderToCampaign(campaign.id, {
        rider_id: Number(riderId),
        tshirt_size: size || null,
        pickup_location_id: locationId ? Number(locationId) : null,
      });
      toast.success(`${row.rider.full_name} was added to ${campaign.name}.`);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal title={`Add rider to ${campaign.name}`} onClose={onClose} width={500}>
      <form onSubmit={submit}>
        <div className="modal-body">
          {error ? <div className="form-error">{error}</div> : null}
          <div className="form-group">
            <label className="form-label">Search approved riders</label>
            <input className="form-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, rider ID or phone" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Rider *</label>
            <select className="form-input" size={Math.min(Math.max(matches.length, 2), 7)} value={riderId} onChange={(e) => setRiderId(e.target.value)}>
              {!riders ? <option disabled>Loading riders…</option> : null}
              {riders && matches.length === 0 ? <option disabled>No approved riders match</option> : null}
              {matches.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name} · {r.rider_id} · {r.mobile_number}
                </option>
              ))}
            </select>
            <span className="form-hint">Riders already in another active campaign will be refused.</span>
          </div>
          <KitChoiceFields kit={kit} size={size} setSize={setSize} locationId={locationId} setLocationId={setLocationId} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add Rider'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
