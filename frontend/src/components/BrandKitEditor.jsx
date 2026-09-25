import React, { useEffect, useState } from 'react';
import { ExternalLink, MapPin, Pencil, Phone, Plus, RotateCcw, Shirt, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { DangerDialog, toast } from './Feedback';
import { EmptyState, formatDate, formatINR } from './CampaignShared';

export const KIT_STATUS_LABELS = {
  NOT_REQUIRED: 'Not Required',
  PENDING: 'Pending Collection',
  READY_FOR_PICKUP: 'Ready for Pickup',
  COLLECTED: 'Collected',
};
const KIT_PILL = { NOT_REQUIRED: 'pill-draft', PENDING: 'pill-at_risk', READY_FOR_PICKUP: 'pill-open', COLLECTED: 'pill-on_track' };
const RETURN_PILL = { NOT_REQUIRED: 'pill-draft', PENDING: 'pill-at_risk', RETURNED: 'pill-open', INCENTIVE_CREDITED: 'pill-on_track' };
const isReturn = (l) => l.purpose === 'RETURN';

const LOCATION_FIELDS = [
  'name', 'address', 'map_url', 'available_from', 'available_to', 'available_days', 'start_time', 'end_time',
  'contact_name', 'contact_phone', 'instructions', 'purpose',
];

const to12h = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "12 Oct – 20 Oct · Monday–Saturday · 10 AM – 6 PM" */
export function pickupWindow(l) {
  const dates =
    l.available_from && l.available_to
      ? `${formatDate(l.available_from, false)} – ${formatDate(l.available_to, false)}`
      : l.available_from
      ? `From ${formatDate(l.available_from, false)}`
      : l.available_to
      ? `Until ${formatDate(l.available_to, false)}`
      : '';
  const hours = l.start_time && l.end_time ? `${to12h(l.start_time)} – ${to12h(l.end_time)}` : l.start_time ? `From ${to12h(l.start_time)}` : '';
  return [dates, l.available_days, hours].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Draft model shared by the campaign form and the Brand Kit tab
// ---------------------------------------------------------------------------

let draftKey = 0;
export const kitToDraft = (kit) => ({
  tshirt_required: Boolean(kit && kit.tshirt_required),
  size_options: ((kit && kit.size_options) || ['S', 'M', 'L', 'XL', 'XXL']).join(', '),
  instructions: (kit && kit.instructions) || '',
  return_required: kit ? kit.return_required_setting !== false : true,
  return_incentive: String(kit && kit.return_incentive != null ? kit.return_incentive : 50),
  return_instructions: (kit && kit.return_instructions) || '',
  // Pickup and return points share one list; `purpose` tells them apart.
  locations: [...((kit && kit.locations) || []), ...((kit && kit.return_locations) || [])].map((l) => ({ ...l, _key: `l${l.id}` })),
});

const cleanLocation = (l) =>
  Object.fromEntries(LOCATION_FIELDS.map((f) => [f, typeof l[f] === 'string' ? l[f].trim() || null : l[f] || null]));

const sameLocation = (a, b) => LOCATION_FIELDS.every((f) => (a[f] || null) === (b[f] || null)) && a.is_active === b.is_active;

/** Saves kit settings and location changes. Returns warnings (e.g. locations in use were deactivated). */
export async function syncBrandKit(campaignId, draft, originalKit) {
  const warnings = [];
  const original = kitToDraft(originalKit);
  const settingsChanged =
    !originalKit ||
    draft.tshirt_required !== original.tshirt_required ||
    draft.size_options.replace(/\s/g, '') !== original.size_options.replace(/\s/g, '') ||
    draft.instructions.trim() !== original.instructions.trim() ||
    draft.return_required !== original.return_required ||
    Number(draft.return_incentive || 0) !== Number(original.return_incentive || 0) ||
    draft.return_instructions.trim() !== original.return_instructions.trim();
  if (settingsChanged) {
    await api.updateBrandKit(campaignId, {
      tshirt_required: draft.tshirt_required,
      size_options: draft.size_options,
      instructions: draft.instructions,
      return_required: draft.return_required,
      return_incentive: Number(draft.return_incentive || 0),
      return_instructions: draft.return_instructions,
    });
  }
  const kept = new Set(draft.locations.filter((l) => l.id).map((l) => l.id));
  for (const removed of original.locations.filter((l) => !kept.has(l.id))) {
    try {
      await api.deletePickupLocation(campaignId, removed.id);
    } catch (err) {
      // Riders were given this location: keep it for them, but stop offering it.
      await api.updatePickupLocation(campaignId, removed.id, { is_active: false });
      warnings.push(`${removed.name} has riders assigned, so it was deactivated instead of deleted.`);
    }
  }
  for (const location of draft.locations) {
    if (!location.id) {
      await api.addPickupLocation(campaignId, cleanLocation(location));
      continue;
    }
    const before = original.locations.find((l) => l.id === location.id);
    if (before && !sameLocation(before, location)) {
      await api.updatePickupLocation(campaignId, location.id, { ...cleanLocation(location), is_active: location.is_active });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Editor UI
// ---------------------------------------------------------------------------

function LocationFormModal({ location, onClose, onSave }) {
  const [form, setForm] = useState(() => Object.fromEntries(LOCATION_FIELDS.map((f) => [f, (location && location[f]) || ''])));
  const kind = form.purpose === 'RETURN' ? 'Return' : 'Pickup';
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError(`Enter the ${kind.toLowerCase()} location name.`);
    if (form.address.trim().length < 5) return setError(`Enter the full ${kind.toLowerCase()} address.`);
    if (form.map_url && !/^https?:\/\//.test(form.map_url.trim())) return setError('The map link must start with http:// or https://');
    if (form.start_time && form.end_time && form.start_time >= form.end_time) return setError('The end time must be after the start time.');
    if (form.available_from && form.available_to && form.available_from > form.available_to) return setError('The last date must be on or after the first.');
    onSave({ ...location, ...form });
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 130 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <span className="modal-title">{location && location.name ? `Edit ${location.name}` : `Add ${kind} Location`}</span>
          <button onClick={onClose} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error ? <div className="form-error">{error}</div> : null}
            <div className="form-group">
              <label className="form-label">Location Name *</label>
              <input className="form-input" value={form.name} onChange={set('name')} placeholder="e.g. FlexRiders Office – Gurugram" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Full Address *</label>
              <textarea className="form-input" rows={2} value={form.address} onChange={set('address')} placeholder="e.g. Sector 44, Gurugram, Haryana" />
            </div>
            <div className="form-group">
              <label className="form-label">Google Maps Link</label>
              <input className="form-input" value={form.map_url} onChange={set('map_url')} placeholder="https://maps.google.com/…" />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Available From</label>
                <input className="form-input" type="date" value={form.available_from} onChange={set('available_from')} />
              </div>
              <div className="form-group">
                <label className="form-label">Available Until</label>
                <input className="form-input" type="date" value={form.available_to} onChange={set('available_to')} />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Days</label>
                <input className="form-input" value={form.available_days} onChange={set('available_days')} placeholder="e.g. Monday–Saturday" />
              </div>
              <div className="form-row-2" style={{ gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input className="form-input" type="time" value={form.start_time} onChange={set('start_time')} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input className="form-input" type="time" value={form.end_time} onChange={set('end_time')} />
                </div>
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Contact Person</label>
                <input className="form-input" value={form.contact_name} onChange={set('contact_name')} placeholder="e.g. Rahul" />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input className="form-input" value={form.contact_phone} onChange={set('contact_phone')} placeholder="10-digit number" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{kind} Instructions</label>
              <textarea
                className="form-input"
                rows={2}
                value={form.instructions}
                onChange={set('instructions')}
                placeholder={kind === 'Return' ? 'e.g. Wash and fold the T-shirt; hand it to the front desk.' : 'e.g. Carry your original ID and collect the T-shirt from reception.'}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {location && location.name ? 'Update Location' : 'Add Location'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LocationCard({ location, actions }) {
  return (
    <div className={`pickup-card ${location.is_active === false ? 'row-muted' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>
          <MapPin size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {location.name}
        </strong>
        {location.is_active === false ? <span className="status-pill pill-draft">Inactive</span> : null}
      </div>
      <div className="pickup-line">{location.address}</div>
      {pickupWindow(location) ? <div className="pickup-line">{pickupWindow(location)}</div> : null}
      {location.contact_name || location.contact_phone ? (
        <div className="pickup-line">
          <Phone size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
          {[location.contact_name, location.contact_phone].filter(Boolean).join(' · ')}
        </div>
      ) : null}
      {location.instructions ? <div className="pickup-line" style={{ fontStyle: 'italic' }}>{location.instructions}</div> : null}
      <div className="row-actions" style={{ marginTop: 8 }}>
        {location.map_url ? (
          <a className="btn-sm-view" href={location.map_url} target="_blank" rel="noreferrer">
            <ExternalLink size={12} style={{ verticalAlign: '-1px' }} /> Map
          </a>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

function LocationList({ title, addLabel, locations, onAdd, onEdit, onToggle, onRemove, emptyText, hint }) {
  return (
    <>
      <div className="card-header-bar" style={{ marginTop: 6 }}>
        <span className="card-title-text" style={{ fontSize: '0.92rem' }}>
          {title}
        </span>
        <button type="button" className="btn-secondary" onClick={onAdd}>
          <Plus size={14} /> {addLabel}
        </button>
      </div>
      {locations.length === 0 ? (
        <div className="impact-note">{emptyText}</div>
      ) : (
        <>
          {hint ? <span className="form-hint">{hint}</span> : null}
          <div className="pickup-grid">
            {locations.map((l) => (
              <LocationCard
                key={l._key}
                location={l}
                actions={
                  <>
                    <button type="button" className="btn-sm-view" onClick={() => onEdit(l)}>
                      <Pencil size={12} /> Edit
                    </button>
                    {l.id ? (
                      <button type="button" className="btn-sm-view" onClick={() => onToggle(l)}>
                        {l.is_active === false ? 'Activate' : 'Deactivate'}
                      </button>
                    ) : null}
                    <button type="button" className="btn-sm-reject" onClick={() => onRemove(l)} aria-label={`Remove ${l.name}`}>
                      <Trash2 size={12} />
                    </button>
                  </>
                }
              />
            ))}
          </div>
          <span className="form-hint">Removing a location riders were given deactivates it instead, so they keep its details.</span>
        </>
      )}
    </>
  );
}

/** Required toggle, sizes, instructions, pickup and return locations, edited as a draft. */
export function KitSettingsEditor({ draft, setDraft }) {
  const [editing, setEditing] = useState(null); // location draft or {} for new
  const set = (key, value) => setDraft((prev) => ({ ...prev, [key]: value }));
  const saveLocation = (location) => {
    setDraft((prev) => ({
      ...prev,
      locations: location._key
        ? prev.locations.map((l) => (l._key === location._key ? location : l))
        : [...prev.locations, { ...location, is_active: true, _key: `new${++draftKey}` }],
    }));
    setEditing(null);
  };
  const update = (key, patch) => setDraft((prev) => ({ ...prev, locations: prev.locations.map((l) => (l._key === key ? { ...l, ...patch } : l)) }));
  const remove = (key) => setDraft((prev) => ({ ...prev, locations: prev.locations.filter((l) => l._key !== key) }));

  return (
    <div>
      <label className="toggle-row" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={draft.tshirt_required} onChange={(e) => set('tshirt_required', e.target.checked)} />
        <div>
          <strong>T-shirt / brand kit required</strong>
          <span>Riders choose a size (and a pickup location, if there are several) when they join. Off: nothing is asked or shown.</span>
        </div>
      </label>
      {draft.tshirt_required ? (
        <>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">T-shirt Sizes *</label>
              <input className="form-input" value={draft.size_options} onChange={(e) => set('size_options', e.target.value)} placeholder="S, M, L, XL, XXL" />
              <span className="form-hint">Comma separated. Riders pick one of these.</span>
            </div>
            <div className="form-group">
              <label className="form-label">General Instructions</label>
              <input className="form-input" value={draft.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="e.g. Wear the T-shirt on every campaign day" />
            </div>
          </div>
          <LocationList
            title="Pickup Locations"
            addLabel="Add Location"
            locations={draft.locations.filter((l) => !isReturn(l))}
            onAdd={() => setEditing({ purpose: 'PICKUP' })}
            onEdit={setEditing}
            onToggle={(l) => update(l._key, { is_active: l.is_active === false })}
            onRemove={(l) => remove(l._key)}
            emptyText="No pickup location yet. Riders can still join; they'll see “pickup details coming soon” until you add one."
            hint={
              draft.locations.filter((l) => !isReturn(l) && l.is_active !== false).length > 1
                ? 'Riders choose one of the active locations when they join. They can’t change it later; you can.'
                : 'With one active location, every rider is assigned to it automatically.'
            }
          />

          <label className="toggle-row" style={{ margin: '18px 0 12px' }}>
            <input type="checkbox" checked={draft.return_required} onChange={(e) => set('return_required', e.target.checked)} />
            <div>
              <strong>T-shirt return required after the campaign</strong>
              <span>Riders who collected a T-shirt see return instructions when the campaign ends. You mark each return; the incentive is credited once.</span>
            </div>
          </label>
          {draft.return_required ? (
            <>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Return Incentive (₹)</label>
                  <input type="number" min="0" className="form-input" value={draft.return_incentive} onChange={(e) => set('return_incentive', e.target.value)} />
                  <span className="form-hint">Credited to the rider’s wallet when you mark the T-shirt returned. 0 = no incentive.</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Return Instructions</label>
                  <input
                    className="form-input"
                    value={draft.return_instructions}
                    onChange={(e) => set('return_instructions', e.target.value)}
                    placeholder="e.g. Return it washed within 7 days of the campaign ending"
                  />
                </div>
              </div>
              <LocationList
                title="Return Locations"
                addLabel="Add Return Location"
                locations={draft.locations.filter(isReturn)}
                onAdd={() => setEditing({ purpose: 'RETURN' })}
                onEdit={setEditing}
                onToggle={(l) => update(l._key, { is_active: l.is_active === false })}
                onRemove={(l) => remove(l._key)}
                emptyText="No return location yet. Add where riders hand the T-shirt back, with dates and timings."
              />
            </>
          ) : null}
        </>
      ) : null}
      {editing ? <LocationFormModal location={editing} onClose={() => setEditing(null)} onSave={saveLocation} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand Kit tab
// ---------------------------------------------------------------------------

export function BrandKitPanel({ campaignId }) {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyKit, setBusyKit] = useState(null);
  const [danger, setDanger] = useState(null);

  const load = (resetDraft) =>
    api.getBrandKit(campaignId).then((d) => {
      setData(d);
      if (resetDraft) setDraft(kitToDraft(d.kit));
      return d;
    });

  useEffect(() => {
    load(true).catch((err) => toast.error(err.message));
  }, [campaignId]);

  if (!data || !draft) return <EmptyState icon={Shirt}>Loading brand kit…</EmptyState>;

  const save = async () => {
    setSaving(true);
    try {
      const warnings = await syncBrandKit(campaignId, draft, data.kit);
      await load(true);
      toast.success('Pickup settings saved.');
      warnings.forEach((w) => toast.info(w));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateRider = async (kit, changes) => {
    setBusyKit(kit.id);
    try {
      await api.updateRiderKit(campaignId, kit.id, changes);
      await load(false);
      toast.success(`${kit.rider.full_name}'s kit updated.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyKit(null);
    }
  };

  const markReturned = (k) =>
    setDanger({
      title: 'Mark T-shirt as returned',
      message: `Confirm that ${k.rider.full_name} (${k.rider.rider_id}) has returned their campaign T-shirt.`,
      getAction: () => ({
        label: 'Mark Returned',
        tone: 'primary',
        note:
          data.return_summary.incentive > 0
            ? `${formatINR(data.return_summary.incentive)} T-shirt Return Incentive is credited to the rider’s wallet (a pending payment). It can only be credited once.`
            : 'No incentive is set for this campaign.',
        run: async () => {
          await api.markKitReturned(campaignId, k.id);
          await load(false);
          return `${k.rider.full_name}'s T-shirt marked as returned.`;
        },
      }),
      onDone: () => {},
    });

  const s = data.summary;
  const r = data.return_summary;
  const kit = data.kit;
  const sizes = kit ? kit.size_options : [];
  const locations = kit ? kit.locations : [];
  const locationName = (id) => (locations.find((l) => l.id === id) || {}).name;

  return (
    <>
      {kit && kit.tshirt_required ? (
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">T-Shirt Requirement</span>
          </div>
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
            {[
              ['Assigned riders', s.assigned_riders],
              ['T-shirts needed', s.kits_needed],
              ['Pending pickup', s.pending],
              ['Ready for pickup', s.ready],
              ['Collected', s.collected],
            ].map(([label, value]) => (
              <div key={label} className="kpi">
                <div className="kpi-label">{label}</div>
                <div className="kpi-value">{value}</div>
              </div>
            ))}
          </div>
          {r.required ? (
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', marginTop: 12 }}>
              {[
                ['Return pending', r.pending],
                ['Returned', r.returned],
                ['Incentive credited', r.incentive_credited],
                ['Incentive / rider', formatINR(r.incentive)],
              ].map(([label, value]) => (
                <div key={label} className="kpi">
                  <div className="kpi-label">{label}</div>
                  <div className="kpi-value">{value}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="impact-heading" style={{ marginTop: 16 }}>Size-wise requirement</div>
          <div className="size-chips">
            {s.sizes.map((x) => (
              <div key={x.size} className="size-chip">
                <span>{x.size}</span>
                <strong>{x.count}</strong>
              </div>
            ))}
          </div>
          {s.by_location.length > 1 || (s.by_location.length === 1 && s.by_location[0].location_id == null) ? (
            <>
              <div className="impact-heading" style={{ marginTop: 16 }}>By pickup location</div>
              <div className="size-chips">
                {s.by_location.map((x) => (
                  <div key={x.location_id || 'none'} className="size-chip">
                    <span>{x.location_id ? locationName(x.location_id) : 'Not assigned'}</span>
                    <strong>{x.count}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">T-Shirt / Brand Kit Pickup & Return</span>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Kit Settings'}
          </button>
        </div>
        <KitSettingsEditor draft={draft} setDraft={setDraft} />
      </div>

      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">Rider Pickups & Returns</span>
        </div>
        {data.riders.length === 0 ? (
          <EmptyState icon={Shirt}>
            {kit && kit.tshirt_required ? 'Riders appear here once they are approved for this campaign.' : 'Turn on “T-shirt / brand kit required” to track pickups.'}
          </EmptyState>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Size</th>
                  <th>Pickup Location</th>
                  <th>Pickup Status</th>
                  <th>Pickup Date</th>
                  <th>Collected</th>
                  <th>T-shirt Return</th>
                </tr>
              </thead>
              <tbody>
                {data.riders.map((k) => (
                  <tr key={k.id} style={busyKit === k.id ? { opacity: 0.6 } : undefined}>
                    <td>
                      <strong>{k.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {k.rider.rider_id} · {k.rider.mobile_number}
                      </div>
                    </td>
                    <td>
                      <select className="form-input" style={{ width: 90 }} value={k.tshirt_size || ''} disabled={busyKit === k.id} onChange={(e) => updateRider(k, { tshirt_size: e.target.value })}>
                        <option value="">—</option>
                        {sizes.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="form-input"
                        style={{ minWidth: 170 }}
                        value={k.pickup_location ? k.pickup_location.id : ''}
                        disabled={busyKit === k.id || locations.length === 0}
                        onChange={(e) => e.target.value && updateRider(k, { pickup_location_id: Number(e.target.value) })}
                      >
                        <option value="">{locations.length ? 'Not assigned' : 'No locations yet'}</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                            {l.is_active ? '' : ' (inactive)'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className={`form-input status-select ${KIT_PILL[k.status] || ''}`}
                        value={k.status}
                        disabled={busyKit === k.id}
                        onChange={(e) => updateRider(k, { status: e.target.value })}
                      >
                        {data.statuses.map((st) => (
                          <option key={st.value} value={st.value}>
                            {st.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        className="form-input"
                        style={{ width: 150 }}
                        value={k.pickup_date || ''}
                        disabled={busyKit === k.id}
                        onChange={(e) => updateRider(k, e.target.value ? { pickup_date: e.target.value } : { clear_pickup_date: true })}
                      />
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {k.collected_date ? (
                        <>
                          {formatDate(k.collected_date)}
                          {k.issued_by ? <div style={{ fontSize: '0.7rem', color: '#64748B' }}>by {k.issued_by}</div> : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <span className={`status-pill ${RETURN_PILL[k.return_status] || ''}`}>{k.return_status_label}</span>
                      {k.returned_at ? (
                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>
                          {formatDate(k.returned_at)}
                          {k.returned_by ? ` · ${k.returned_by}` : ''}
                          {k.return_incentive_amount ? ` · ${formatINR(k.return_incentive_amount)} ${k.return_incentive_status === 'PAID' ? 'paid' : 'credited'}` : ''}
                        </div>
                      ) : null}
                      {k.return_status === 'PENDING' ? (
                        <div style={{ marginTop: 6 }}>
                          <button className="btn-sm-approve" disabled={busyKit === k.id} onClick={() => markReturned(k)}>
                            <RotateCcw size={12} /> Mark Returned
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {danger ? <DangerDialog {...danger} onClose={() => setDanger(null)} /> : null}
    </>
  );
}
