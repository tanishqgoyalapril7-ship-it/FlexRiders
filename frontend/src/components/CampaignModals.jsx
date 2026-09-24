import React, { useEffect, useState } from 'react';
import { X, Check, CheckCircle2, XCircle, Clock, ImageOff, Flame, Trophy, CalendarDays, Wallet } from 'lucide-react';
import { api } from '../services/api';
import { formatDate, formatINR, StatusPill, EmptyState } from './CampaignShared';

const STEPS = ['Basics', 'Slots & Payout', 'Details'];

const toInputDate = (d) => d.toISOString().slice(0, 10);

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
  };
}

export function CampaignFormModal({ brands = [], campaign, onClose, onSaved }) {
  const editing = Boolean(campaign);
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
        }
      : emptyForm()
  );
  const [imageFile, setImageFile] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const days = Math.max(Math.round((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1, 0);
  const maxBudget = days * Number(form.total_slots || 0) * Number(form.daily_rate || 0);

  const validate = (index) => {
    if (index === 0) {
      if (!form.brand_id) return 'Please select a brand.';
      if (form.name.trim().length < 3) return 'Please enter a campaign name (at least 3 characters).';
      if (!form.start_date || !form.end_date) return 'Please choose start and end dates.';
      if (form.end_date < form.start_date) return 'End date must be on or after the start date.';
    }
    if (index === 1) {
      if (!(Number(form.total_slots) >= 1)) return 'Total slots must be at least 1.';
      if (editing && Number(form.total_slots) < campaign.stats.assigned_riders)
        return `Total slots cannot be lower than the ${campaign.stats.assigned_riders} riders already approved.`;
      if (!(Number(form.daily_rate) > 0)) return 'Daily payout must be greater than ₹0.';
    }
    return '';
  };

  const next = () => {
    const message = validate(step);
    setError(message);
    if (!message) setStep(step + 1);
  };

  const save = async (visibility) => {
    const message = validate(0) || validate(1);
    if (message) {
      setError(message);
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      brand_id: Number(form.brand_id),
      total_slots: Number(form.total_slots),
      daily_rate: Number(form.daily_rate),
      name: form.name.trim(),
    };
    try {
      let saved = editing
        ? await api.updateCampaign(campaign.id, payload)
        : await api.createCampaign({ ...payload, visibility });
      if (imageFile) saved = await api.uploadCampaignImage(saved.id, imageFile);
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
                <select className="form-input" value={form.brand_id} onChange={set('brand_id')}>
                  <option value="">Select a brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Campaign Name *</label>
                <input className="form-input" value={form.name} onChange={set('name')} placeholder="e.g. Zepto Gurgaon September Campaign" />
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Start Date *</label>
                  <input type="date" className="form-input" value={form.start_date} onChange={set('start_date')} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date *</label>
                  <input type="date" className="form-input" value={form.end_date} min={form.start_date} onChange={set('end_date')} />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Required Riders / Total Slots *</label>
                  <input type="number" min="1" className="form-input" value={form.total_slots} onChange={set('total_slots')} />
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
                  <div className="mini-stat-label">Campaign Length</div>
                  <div className="mini-stat-value">{days} days</div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">Maximum Budget (all slots, every day)</div>
                  <div className="mini-stat-value">{formatINR(maxBudget)}</div>
                </div>
              </div>
            </>
          )}

          {step === 2 && (
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
                      ['PUBLIC', 'Public', 'Eligible riders can see and join it right away.'],
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
  SUBMITTED: Clock,
  DUE: Clock,
};

const DAY_LABELS = { COMPLETED: 'Completed', MISSED: 'Missed', REJECTED: 'Rejected', SUBMITTED: 'In review', DUE: 'Due today' };

// Review controls shared by the activity modal and the Photos tab.
export function PhotoReviewCard({ campaignId, photo, riderName, onPreview, onChanged, onReject }) {
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      await api.approveCampaignActivity(campaignId, photo.id || photo.activity_id);
      onChanged();
    } catch (err) {
      alert(err.message);
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

  const load = () => api.getCampaignRiderActivity(campaignId, assignmentId).then(setData).catch((err) => alert(err.message));
  useEffect(() => {
    load();
  }, [campaignId, assignmentId]);

  const refresh = () => {
    load();
    onChanged && onChanged();
  };

  const photos = data ? data.days.filter((d) => d.activity_id).slice().reverse() : [];

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
                ['Completed / Eligible', `${data.completed_days} / ${data.eligible_days}`, CalendarDays, '#2563EB', '#EFF6FF'],
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
              Missed days: <strong style={{ color: '#0F172A' }}>{data.missed_days}</strong> • Awaiting review:{' '}
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
                      <div key={day.date} className={`activity-day ${day.status.toLowerCase()}`} title={day.rejection_reason || ''}>
                        <span className="activity-day-date">{formatDate(day.date, false)}</span>
                        <span className="activity-day-status">
                          <Icon size={13} />
                          {DAY_LABELS[day.status]}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{formatINR(day.earned)}</span>
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
                      key={p.activity_id}
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
      {rejecting ? (
        <ConfirmDialog
          title="Reject proof"
          message={`Reject the proof for ${formatDate(rejecting.date)}? This day will earn ₹0 unless it's approved later.`}
          confirmLabel="Reject Proof"
          danger
          reasonLabel="Rejection reason"
          onConfirm={async (reason) => {
            await api.rejectCampaignActivity(campaignId, rejecting.activity_id || rejecting.id, reason);
            refresh();
          }}
          onClose={() => setRejecting(null)}
        />
      ) : null}
    </div>
  );
}
