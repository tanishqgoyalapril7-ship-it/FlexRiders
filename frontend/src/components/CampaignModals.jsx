import React, { useEffect, useState } from 'react';
import { X, Check, CheckCircle2, XCircle, Clock, ImageOff, Flame, Trophy, CalendarDays, Wallet } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';
import { KitSettingsEditor, kitToDraft, syncBrandKit } from './BrandKitEditor';
import { formatDate, formatINR, StatusPill, EmptyState, SlotStatuses, VEHICLE_TYPES, CAMPAIGN_CATEGORIES } from './CampaignShared';

const STEPS = ['Basics', 'Slots & Payout', 'T-Shirt & Pickup', 'Details'];

const toInputDate = (d) => d.toISOString().slice(0, 10);

const DEFAULT_SLOTS = { MORNING: ['06:00', '11:00'], EVENING: ['12:00', '15:00'], NIGHT: ['17:00', '21:00'] };
const SLOT_LABELS = { MORNING: 'Morning', EVENING: 'Evening', NIGHT: 'Night' };
const ALL_VEHICLES = VEHICLE_TYPES.map(([value]) => value);
// Stored empty = every type may join; the form shows that as all boxes ticked.
const vehicleChoice = (categories) => (categories && categories.length ? categories : ALL_VEHICLES);

function emptyForm() {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 29);
  return {
    brand_id: '',
    name: '',
    start_date: toInputDate(start),
    end_date: toInputDate(end),
    total_slots: 10,
    daily_rate: 10,
    description: '',
    rules: '',
    visibility: 'DRAFT',
    brand_contract_value: 0,
    allow_payout_beyond_contract: false,
    continue_after_fulfillment: false,
    location_area: '',
    vehicle_choice: ALL_VEHICLES,
    campaign_category: 'STANDARD',
    photo_slot_windows: DEFAULT_SLOTS,
  };
}

export function CampaignFormModal({ brands = [], campaign, onClose, onSaved, onCreateBrand }) {
  const editing = Boolean(campaign);
  // Only active, admin-created brands can be used; keep the current brand selectable when editing.
  const brandOptions = brands.filter((b) => b.is_active || (editing && b.id === campaign.brand_id));
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() =>
    editing
      ? {
          brand_id: campaign.brand_id,
          name: campaign.name,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          total_slots: campaign.total_slots,
          daily_rate: campaign.daily_rate,
          description: campaign.description || '',
          rules: campaign.rules_text || '',
          visibility: campaign.visibility,
          brand_contract_value: campaign.brand_contract_value || 0,
          allow_payout_beyond_contract: campaign.allow_payout_beyond_contract,
          continue_after_fulfillment: campaign.continue_after_fulfillment,
          location_area: campaign.location_area || '',
          vehicle_choice: vehicleChoice(campaign.eligible_vehicle_categories),
          campaign_category: campaign.campaign_category || 'STANDARD',
          photo_slot_windows: campaign.photo_slot_windows || DEFAULT_SLOTS,
        }
      : emptyForm()
  );
  const locked = editing && campaign.commitment_locked;
  const [brandRate, setBrandRate] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Pickup settings are saved through the brand-kit endpoints after the campaign itself.
  const [kitOriginal, setKitOriginal] = useState(null);
  const [kitDraft, setKitDraft] = useState(() => kitToDraft(null));
  const [kitLoaded, setKitLoaded] = useState(!editing);
  useEffect(() => {
    if (!editing) return;
    api
      .getBrandKit(campaign.id)
      .then((d) => {
        setKitOriginal(d.kit);
        setKitDraft(kitToDraft(d.kit));
      })
      .catch((err) => setError(err.message))
      .finally(() => setKitLoaded(true));
  }, []);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const days = Math.max(Math.round((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1, 0);
  const riderDays = days * Number(form.total_slots || 0);
  const maxBudget = riderDays * Number(form.daily_rate || 0);
  const toggle = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }));

  const validate = (index) => {
    if (index === 0) {
      if (!form.brand_id) return 'Please select a brand.';
      if (form.name.trim().length < 3) return 'Please enter a campaign name (at least 3 characters).';
      if (!form.start_date || !form.end_date) return 'Please choose start and end dates.';
      if (form.end_date < form.start_date) return 'End date must be on or after the start date.';
      if (!form.vehicle_choice.length) return 'Tick at least one eligible vehicle type.';
    }
    if (index === 1) {
      if (!(Number(form.total_slots) >= 1)) return 'Total slots must be at least 1.';
      if (editing && Number(form.total_slots) < campaign.stats.assigned_riders)
        return `Total slots cannot be lower than the ${campaign.stats.assigned_riders} riders already approved.`;
      if (!(Number(form.daily_rate) > 0)) return 'Daily payout must be greater than ₹0.';
      const order = ['MORNING', 'EVENING', 'NIGHT'].map((k) => form.photo_slot_windows[k]);
      for (const [i, [start, end]] of order.entries()) {
        if (!start || !end || start >= end) return `The ${Object.values(SLOT_LABELS)[i]} slot must end after it starts.`;
        if (i > 0 && start < order[i - 1][1]) return 'Photo slots can’t overlap: Morning, then Evening, then Night.';
      }
    }
    if (index === 2 && kitDraft.tshirt_required && !kitDraft.size_options.split(',').some((x) => x.trim())) {
      return 'Add at least one T-shirt size.';
    }
    return '';
  };

  const next = () => {
    const message = validate(step);
    setError(message);
    if (!message) setStep(step + 1);
  };

  const save = async (visibility) => {
    const message = validate(0) || validate(1) || validate(2);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError('');
    const { vehicle_choice: vehicleChoiceValue, ...rest } = form;
    const payload = {
      ...rest,
      eligible_vehicle_categories: vehicleChoiceValue.length === ALL_VEHICLES.length ? [] : ALL_VEHICLES.filter((v) => vehicleChoiceValue.includes(v)),
      location_area: form.location_area.trim(),
      brand_id: Number(form.brand_id),
      total_slots: Number(form.total_slots),
      daily_rate: Number(form.daily_rate),
      brand_contract_value: Number(form.brand_contract_value || 0),
      name: form.name.trim(),
    };
    try {
      let saved = editing
        ? await api.updateCampaign(campaign.id, payload)
        : await api.createCampaign({ ...payload, visibility });
      if (imageFile) saved = await api.uploadCampaignImage(saved.id, imageFile);
      const kitTouched = kitOriginal || kitDraft.tshirt_required || kitDraft.locations.length > 0;
      if (kitTouched) {
        try {
          const warnings = await syncBrandKit(saved.id, kitDraft, kitOriginal);
          warnings.forEach((w) => toast.info(w));
        } catch (err) {
          // The campaign is saved; report the pickup problem so it can be fixed from the Brand Kit tab.
          toast.error(`Campaign saved, but pickup settings weren't: ${err.message}`);
        }
      }
      if (!editing && saved.status === 'DRAFT') {
        toast.info('Saved as a draft. Riders can’t see it until you publish it.');
      }
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <div>
            <span className="modal-title">{editing ? 'Edit Campaign' : 'Create Campaign'}</span>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
              Step {step + 1} of {STEPS.length}: {STEPS[step]}
            </div>
          </div>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="wizard-steps">
            {STEPS.map((name, i) => (
              <div key={name} className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
                <span className="wizard-step-dot">{i < step ? <Check size={13} /> : i + 1}</span>
                <span>{name}</span>
              </div>
            ))}
          </div>

          {error ? <div className="form-error">{error}</div> : null}

          {step === 0 && (
            <>
              <div className="form-group">
                <label className="form-label">Brand *</label>
                {brandOptions.length === 0 ? (
                  <div className="mini-stat" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: '0.84rem', color: '#64748B' }}>No active brands. Create a brand first.</span>
                    {onCreateBrand ? (
                      <button type="button" className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={onCreateBrand}>
                        Create Brand
                      </button>
                    ) : null}
                  </div>
                ) : (
                <select className="form-input" value={form.brand_id} onChange={set('brand_id')}>
                  <option value="">Select a brand</option>
                  {brandOptions.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Campaign Name *</label>
                <input className="form-input" value={form.name} onChange={set('name')} placeholder="e.g. Zepto Gurgaon September Campaign" />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={set('start_date')} disabled={locked} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input type="date" className="form-input" value={form.end_date} min={form.start_date} onChange={set('end_date')} disabled={locked} />
                </div>
              </div>
              {locked ? (
                <span className="form-hint">Dates and required riders are locked after publishing. Use an extension or replacement slots instead.</span>
              ) : null}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Location / Area</label>
                  <input className="form-input" value={form.location_area} onChange={set('location_area')} placeholder="e.g. Sector 57, Gurugram" />
                  <span className="form-hint">Shown to riders and on the public campaign page.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Campaign Category</label>
                  <select className="form-input" value={form.campaign_category} onChange={set('campaign_category')}>
                    {CAMPAIGN_CATEGORIES.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span className="form-hint">A label for grouping and filtering campaigns.</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Eligible Vehicle Types *</label>
                <div className="vehicle-checks">
                  {VEHICLE_TYPES.map(([value, label, description]) => {
                    const checked = form.vehicle_choice.includes(value);
                    return (
                      <label key={value} className={`vehicle-check ${checked ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              vehicle_choice: checked ? prev.vehicle_choice.filter((v) => v !== value) : [...prev.vehicle_choice, value],
                            }))
                          }
                        />
                        <span>
                          <strong>{label}</strong>
                          <small>{description}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <span className="form-hint">Only riders with a ticked vehicle type can join; the server checks each rider’s registered type.</span>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Required Riders / Total Slots *</label>
                  <input type="number" min="1" className="form-input" value={form.total_slots} onChange={set('total_slots')} disabled={locked} />
                  <span className="form-hint">Only approved riders use a slot.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Daily Rider Payout (₹) *</label>
                  <input type="number" min="1" step="0.5" className="form-input" value={form.daily_rate} onChange={set('daily_rate')} />
                  <span className="form-hint">Paid for each day with approved proof.</span>
                </div>
              </div>
              {editing && campaign.stats.assigned_riders > 0 ? (
                <div className="form-hint">
                  Riders already approved keep the rate they joined at. A new rate applies to riders approved from now on.
                </div>
              ) : null}
              <div className="mini-stat-list">
                <div className="mini-stat">
                  <div className="mini-stat-label">Contracted Rider-Days</div>
                  <div className="mini-stat-value">
                    {riderDays} <span style={{ fontSize: '0.78rem', color: '#64748B' }}>({form.total_slots} × {days} days)</span>
                  </div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">Planned Rider Budget</div>
                  <div className="mini-stat-value">{formatINR(maxBudget)}</div>
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Brand Contract Value (₹)</label>
                  <input type="number" min="0" className="form-input" value={form.brand_contract_value} onChange={set('brand_contract_value')} />
                  <span className="form-hint">What the brand pays. Independent of rider payout.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Helper: brand price per rider-day (₹)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={brandRate}
                    onChange={(e) => {
                      setBrandRate(e.target.value);
                      setForm((prev) => ({ ...prev, brand_contract_value: Math.round(Number(e.target.value || 0) * riderDays * 100) / 100 }));
                    }}
                    placeholder="Optional"
                  />
                  <span className="form-hint">Fills the contract value as rate × {riderDays} rider-days.</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Daily Photo Slots (IST)</label>
                <div className="slot-window-grid">
                  {['MORNING', 'EVENING', 'NIGHT'].map((slot) => (
                    <div key={slot} className="slot-window">
                      <strong>{SLOT_LABELS[slot]}</strong>
                      {[0, 1].map((i) => (
                        <input
                          key={i}
                          type="time"
                          className="form-input"
                          aria-label={`${SLOT_LABELS[slot]} ${i ? 'end' : 'start'}`}
                          value={form.photo_slot_windows[slot][i]}
                          onChange={(e) =>
                            setForm((prev) => {
                              const pair = [...prev.photo_slot_windows[slot]];
                              pair[i] = e.target.value;
                              return { ...prev, photo_slot_windows: { ...prev.photo_slot_windows, [slot]: pair } };
                            })
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <span className="form-hint">
                  One photo per slot; all 3 approved = 1 Photo-Day. Riders get a reminder when each slot opens and before it closes.
                </span>
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={form.continue_after_fulfillment} onChange={toggle('continue_after_fulfillment')} />
                <div>
                  <strong>Continue rider activity after fulfilment</strong>
                  <span>Off: riders stop uploading once {riderDays} rider-days are delivered. Extra days are tracked as surplus.</span>
                </div>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={form.allow_payout_beyond_contract} onChange={toggle('allow_payout_beyond_contract')} />
                <div>
                  <strong>Allow payout beyond contracted rider-days</strong>
                  <span>Off: surplus days are recorded but not paid, which caps rider payout at the planned budget.</span>
                </div>
              </label>
            </>
          )}

          {step === 2 &&
            (kitLoaded ? (
              <KitSettingsEditor draft={kitDraft} setDraft={setKitDraft} />
            ) : (
              <EmptyState icon={Clock}>Loading pickup settings…</EmptyState>
            ))}

          {step === 3 && (
            <>
              <div className="form-group">
                <label className="form-label">Campaign Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.description}
                  onChange={set('description')}
                  placeholder="What riders will do in this campaign"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Rules / Requirements</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={form.rules}
                  onChange={set('rules')}
                  placeholder={'One requirement per line, e.g.\nUpload a photo of the completed activity every day\nWear the brand T-shirt during deliveries'}
                />
                <span className="form-hint">Each line is shown to riders as a separate requirement.</span>
              </div>
              <div className="form-group">
                <label className="form-label">Campaign Banner (optional)</label>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="form-input" onChange={(e) => setImageFile(e.target.files[0] || null)} />
              </div>
              {!editing && (
                <div className="form-group">
                  <label className="form-label">Visibility</label>
                  <div className="visibility-options">
                    {[
                      ['DRAFT', 'Draft', 'Only admins can see it. Publish it later.'],
                      ['PUBLIC', 'Public', 'Eligible riders can see and join it until it goes live.'],
                    ].map(([value, title, text]) => (
                      <button
                        type="button"
                        key={value}
                        className={`visibility-option ${form.visibility === value ? 'selected' : ''}`}
                        onClick={() => setForm((prev) => ({ ...prev, visibility: value }))}
                      >
                        <strong>{title}</strong>
                        <span>{text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          {step > 0 ? (
            <button className="btn-secondary" onClick={() => setStep(step - 1)} style={{ marginRight: 'auto' }}>
              Back
            </button>
          ) : null}
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" onClick={next}>
              Continue
            </button>
          ) : (
            <button className="btn-primary" disabled={saving} onClick={() => save(form.visibility)}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : form.visibility === 'PUBLIC' ? 'Create & Publish' : 'Save as Draft'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Confirmation for destructive or irreversible actions, optionally asking for a reason.
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, reasonLabel, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 120 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5 }}>{message}</p>
          {reasonLabel ? (
            <div className="form-group">
              <label className="form-label">{reasonLabel}</label>
              <textarea className="form-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={confirm}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PhotoLightbox({ url, onClose }) {
  if (!url) return null;
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 130 }}>
      <img src={url} alt="Campaign proof" className="lightbox" />
    </div>
  );
}

const DAY_ICONS = {
  COMPLETED: CheckCircle2,
  MISSED: XCircle,
  REJECTED: XCircle,
  INCOMPLETE: XCircle,
  SUBMITTED: Clock,
  DUE: Clock,
  EXCUSED: Clock,
};

const DAY_LABELS = {
  COMPLETED: 'Completed',
  MISSED: 'Missed',
  REJECTED: 'Rejected',
  INCOMPLETE: 'Incomplete',
  SUBMITTED: 'In review',
  DUE: 'Due today',
  EXCUSED: 'Excused',
  NOT_ELIGIBLE: 'Not eligible',
};

// Review controls shared by the activity modal and the Photos tab.
export function PhotoReviewCard({ campaignId, photo, riderName, onPreview, onChanged, onReject }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      // Per-photo proofs are reviewed one by one; legacy single-photo days as a whole day.
      if (photo.id) await api.approveCampaignPhoto(campaignId, photo.id);
      else await api.approveCampaignActivity(campaignId, photo.activity_id);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const status = photo.photo_status;
  return (
    <div className="photo-card">
      {photo.photo_url ? (
        <img src={photo.photo_url} alt={`Proof for ${photo.date}`} onClick={() => onPreview(photo.photo_url)} />
      ) : (
        <div className="photo-placeholder">
          <ImageOff size={26} />
        </div>
      )}
      <div className="photo-card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <strong>{riderName || formatDate(photo.date)}</strong>
          <StatusPill status={status} />
        </div>
        {riderName ? <span style={{ color: '#64748B' }}>{formatDate(photo.date)}</span> : null}
        {photo.slot_label ? <span style={{ fontWeight: 700, color: '#1D4ED8' }}>{photo.slot_label} photo</span> : null}
        {photo.photos_required ? (
          <span style={{ color: photo.day_valid >= photo.photos_required ? '#047857' : '#64748B', fontWeight: 600 }}>
            Day: {Math.min(photo.day_valid, photo.photos_required)}/{photo.photos_required} valid photos
            {photo.day_valid >= photo.photos_required ? ' · Streak day complete' : ''}
          </span>
        ) : null}
        {photo.rejection_reason ? <span style={{ color: '#B91C1C' }}>Reason: {photo.rejection_reason}</span> : null}
        <div className="row-actions">
          {status !== 'APPROVED' && (
            <button className="btn-sm-approve" disabled={busy} onClick={approve}>
              Approve
            </button>
          )}
          {status !== 'REJECTED' && (
            <button className="btn-sm-reject" disabled={busy} onClick={() => onReject(photo)}>
              Reject
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function RiderActivityModal({ campaignId, assignmentId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [excusing, setExcusing] = useState(null);

  const load = () => api.getCampaignRiderActivity(campaignId, assignmentId).then(setData).catch((err) => toast.error(err.message));
  useEffect(() => {
    load();
  }, [campaignId, assignmentId]);

  const refresh = () => {
    load();
    onChanged && onChanged();
  };

  // One card per photo (legacy single-photo days show as one card for the whole day).
  const photos = data
    ? data.days
        .filter((d) => d.activity_id)
        .slice()
        .reverse()
        .flatMap((d) => {
          const day = { activity_id: d.activity_id, date: d.date, day_valid: d.photos_valid, photos_required: d.photos_required };
          if (d.photos.length === 0) {
            return d.photo_url ? [{ ...day, id: null, photo_url: d.photo_url, photo_status: d.photo_status, rejection_reason: d.rejection_reason }] : [];
          }
          const labels = { MORNING: 'Morning', EVENING: 'Evening', NIGHT: 'Night' };
          return d.photos.map((p) => ({
            ...day,
            id: p.id,
            photo_url: p.photo_url,
            photo_status: p.status,
            rejection_reason: p.rejection_reason,
            slot_label: labels[p.slot] || null,
          }));
        })
    : [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '860px' }}>
        <div className="modal-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="modal-title">{data ? data.rider.full_name : 'Rider Activity'}</span>
              {data ? <StatusPill status={data.status} /> : null}
            </div>
            {data ? (
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                {data.rider.rider_id} • {data.rider.mobile_number} • Joined {formatDate(data.joined_at)} • {formatINR(data.daily_rate)}/day
              </div>
            ) : null}
          </div>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {!data ? (
          <div className="modal-body">
            <EmptyState icon={Clock}>Loading activity…</EmptyState>
          </div>
        ) : (
          <div className="modal-body">
            <div className="stats-grid-4">
              {[
                ['Current Streak', `${data.current_streak} days`, Flame, '#F59E0B', '#FFFBEB'],
                ['Longest Streak', `${data.longest_streak} days`, Trophy, '#8B5CF6', '#F5F3FF'],
                ['Photo-Days / Target', `${data.completed_days} / ${data.target_days}`, CalendarDays, '#2563EB', '#EFF6FF'],
                ['Total Earned', formatINR(data.earned), Wallet, '#10B981', '#ECFDF5'],
              ].map(([title, value, Icon, color, bg]) => (
                <div key={title} className="stat-card" style={{ padding: '14px 16px' }}>
                  <div className="stat-card-top">
                    <span className="stat-card-title">{title}</span>
                    <div className="stat-icon-wrapper" style={{ background: bg, color, width: 30, height: 30 }}>
                      <Icon size={16} />
                    </div>
                  </div>
                  <div className="stat-value" style={{ fontSize: '1.3rem' }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Today:{' '}
              <strong style={{ color: '#0F172A' }}>
                {data.today_photos.in_window ? `${Math.min(data.today_photos.valid, data.photos_required)}/${data.photos_required} photos` : '—'}
              </strong>{' '}
              • Remaining: <strong style={{ color: '#0F172A' }}>{data.remaining_target_days} days</strong> • Completion:{' '}
              <strong style={{ color: '#0F172A' }}>{data.completion_pct == null ? '—' : `${data.completion_pct}%`}</strong>
              {data.streak_broken ? (
                <>
                  {' '}• <strong style={{ color: '#B91C1C' }}>Streak broken {formatDate(data.streak_broken_on)}</strong>
                </>
              ) : null}{' '}
              • Missed days:{' '}
              <strong style={{ color: '#0F172A' }}>{data.missed_days}</strong> • Excused: <strong style={{ color: '#0F172A' }}>{data.excused_days}</strong> • Awaiting review:{' '}
              <strong style={{ color: '#0F172A' }}>{data.pending_review_days}</strong> • Paid:{' '}
              <strong style={{ color: '#0F172A' }}>{formatINR(data.paid)}</strong> • Pending payout:{' '}
              <strong style={{ color: '#0F172A' }}>{formatINR(data.pending)}</strong>
            </div>

            <div>
              <div className="card-title-text" style={{ marginBottom: '10px' }}>Daily Timeline</div>
              {data.days.length === 0 ? (
                <EmptyState icon={CalendarDays}>No campaign days yet for this rider.</EmptyState>
              ) : (
                <div className="activity-calendar">
                  {data.days.map((day) => {
                    const Icon = DAY_ICONS[day.status] || Clock;
                    return (
                      <div
                        key={day.date}
                        className={`activity-day ${day.status.toLowerCase()}`}
                        title={day.rejection_reason || day.excuse_reason || ''}
                        style={day.period === 'EXTENSION' ? { borderStyle: 'dashed' } : undefined}
                      >
                        <span className="activity-day-date">{formatDate(day.date, false)}</span>
                        <span className="activity-day-status">
                          <Icon size={13} />
                          {DAY_LABELS[day.status]}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          Photos {Math.min(day.photos_valid, day.photos_required)}/{day.photos_required}
                          {day.status === 'COMPLETED' ? ' · Photo-Day completed' : ''}
                        </span>
                        <SlotStatuses slots={day.slots} />
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>
                          {day.unpaid_surplus ? 'Surplus – unpaid' : formatINR(day.earned)}
                        </span>
                        {['MISSED', 'REJECTED', 'INCOMPLETE'].includes(day.status) && day.date <= new Date().toISOString().slice(0, 10) ? (
                          <button className="card-action-link" style={{ fontSize: '0.7rem', textAlign: 'left' }} onClick={() => setExcusing(day)}>
                            Excuse
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="card-title-text" style={{ marginBottom: '10px' }}>Submitted Photos</div>
              {photos.length === 0 ? (
                <EmptyState icon={ImageOff}>No photos submitted yet.</EmptyState>
              ) : (
                <div className="photo-grid">
                  {photos.map((p) => (
                    <PhotoReviewCard
                      key={p.id ? `p${p.id}` : `a${p.activity_id}`}
                      campaignId={campaignId}
                      photo={p}
                      onPreview={setPreview}
                      onChanged={refresh}
                      onReject={setRejecting}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <PhotoLightbox url={preview} onClose={() => setPreview(null)} />
      {excusing ? (
        <ConfirmDialog
          title="Excuse absence"
          message={`Mark ${formatDate(excusing.date)} as an excused absence (e.g. medical or emergency)? It won't count against the rider, but it isn't delivered or paid.`}
          confirmLabel="Excuse Day"
          reasonLabel="Reason (required)"
          onConfirm={async (reason) => {
            if (!reason) throw new Error('Please give a reason.');
            await api.excuseRiderDay(campaignId, assignmentId, excusing.date, reason);
            refresh();
          }}
          onClose={() => setExcusing(null)}
        />
      ) : null}
      {rejecting ? (
        <ConfirmDialog
          title={rejecting.id ? 'Reject photo' : 'Reject proof'}
          message={`Reject this ${rejecting.id ? 'photo' : 'proof'} for ${formatDate(rejecting.date)}? The day only counts with ${
            rejecting.photos_required || 3
          } valid photos; otherwise it earns ₹0.${
            rejecting.photo_status === 'APPROVED' ? ' It was already approved, so a reason is required and the change is logged.' : ''
          }`}
          confirmLabel="Reject Proof"
          danger
          reasonLabel="Rejection reason"
          onConfirm={async (reason) => {
            if (rejecting.id) await api.rejectCampaignPhoto(campaignId, rejecting.id, reason);
            else await api.rejectCampaignActivity(campaignId, rejecting.activity_id, reason);
            refresh();
          }}
          onClose={() => setRejecting(null)}
        />
      ) : null}
    </div>
  );
}
