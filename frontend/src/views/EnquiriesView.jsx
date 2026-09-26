import React, { useCallback, useEffect, useState } from 'react';
import { Inbox, Phone, Mail, Search, Briefcase } from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../components/Feedback';
import { EmptyState } from '../components/CampaignShared';

const STATUSES = [
  ['NEW', 'New'],
  ['CONTACTED', 'Contacted'],
  ['IN_PROGRESS', 'In progress'],
  ['CONVERTED', 'Converted'],
  ['CLOSED', 'Closed'],
];
const PILL = { NEW: 'pill-pending', CONTACTED: 'pill-open', IN_PROGRESS: 'pill-requested', CONVERTED: 'pill-completed', CLOSED: 'pill-draft' };
const KINDS = { business: 'Brand', rider: 'Rider', driver: 'Auto driver' };
const when = (value) =>
  value
    ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`).toLocaleString('en-GB', {
        timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '';

/** Leads from the website's enquiry forms. Only admins can see them. */
export default function EnquiriesView({ brands = [], onChanged }) {
  const [status, setStatus] = useState('NEW');
  const [kind, setKind] = useState('ALL');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(
    () =>
      api
        .getEnquiries({ status: status === 'ALL' ? '' : status, kind: kind === 'ALL' ? '' : kind, search: search.trim() })
        .then(setData)
        .catch((err) => toast.error(err.message)),
    [status, kind, search]
  );
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const rows = data ? data.enquiries : [];
  const selected = rows.find((e) => e.id === selectedId) || null;
  const counts = data ? data.counts : {};

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Enquiries</h1>
          <p className="page-subtitle">Leads from the website: brands that want to promote, and riders or auto drivers who want to join.</p>
        </div>
      </div>

      <div className="tabs-header-bar">
        {[...STATUSES, ['ALL', 'All']].map(([key, label]) => (
          <button key={key} className={`tab-btn ${status === key ? 'active' : ''}`} onClick={() => setStatus(key)}>
            {label}
            {key !== 'ALL' && counts[key] ? ` (${counts[key]})` : ''}
          </button>
        ))}
      </div>

      <div className="support-layout">
        <div className="card support-list">
          <div className="support-list-tools">
            <div className="search-container support-search">
              <Search size={15} color="#94A3B8" />
              <input className="search-input" placeholder="Name, company, phone, email or city…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <label className="support-filter">
              <span>From</span>
              <select className="form-input" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="ALL">Everyone</option>
                <option value="business">Brands</option>
                <option value="rider">Riders</option>
                <option value="driver">Auto drivers</option>
              </select>
            </label>
          </div>
          <div className="support-items">
            {rows.map((e) => (
              <button key={e.id} className={`support-item ${e.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(e.id)}>
                <div className="support-item-top">
                  <strong>{e.company_name || e.name}</strong>
                  <span className="support-item-time">{when(e.created_at)}</span>
                </div>
                <div className="support-item-subject">
                  {KINDS[e.kind]} · {e.name} · {e.phone}
                </div>
                <div className="support-item-preview">{e.campaign_requirement || e.message || e.city || ''}</div>
                <div className="support-item-meta">
                  <span className={`status-pill ${PILL[e.status] || ''}`}>{e.status_label}</span>
                  {e.vehicle_interest_label ? <span className="support-chip">{e.vehicle_interest_label}</span> : null}
                </div>
              </button>
            ))}
            {data && rows.length === 0 ? <EmptyState icon={Inbox}>No enquiries here.</EmptyState> : null}
            {!data ? <EmptyState icon={Inbox}>Loading…</EmptyState> : null}
          </div>
        </div>

        <div className="card support-chat">
          {selected ? (
            <Detail
              key={selected.id}
              enquiry={selected}
              brands={brands}
              onSaved={() => {
                load();
                if (onChanged) onChanged();
              }}
            />
          ) : (
            <EmptyState icon={Inbox}>Select an enquiry to see the details and follow up.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

function Detail({ enquiry: e, brands, onSaved }) {
  const [notes, setNotes] = useState(e.notes || '');
  const [linkBrand, setLinkBrand] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rows = [
    ['From', KINDS[e.kind]],
    ['Name', e.name],
    ['Company / brand', e.company_name],
    ['Phone', e.phone],
    ['Email', e.email],
    ['City', e.city],
    ['Vehicle interest', e.vehicle_interest_label],
    ['What they want to promote', e.campaign_requirement],
    ['Campaign duration', e.campaign_duration],
    ['Message', e.message],
    ['Received', when(e.created_at)],
    ['Last handled by', e.handled_by],
  ].filter(([, v]) => v);

  return (
    <div className="chat-wrap">
      <div className="chat-header">
        <div style={{ minWidth: 0 }}>
          <div className="chat-title">{e.company_name || e.name}</div>
          <div className="chat-sub">Enquiry #{e.id}</div>
        </div>
        <div className="chat-actions">
          <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} href={`tel:+91${e.phone}`}>
            <Phone size={15} /> Call
          </a>
          {e.email ? (
            <a className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 5 }} href={`mailto:${e.email}`}>
              <Mail size={15} /> Email
            </a>
          ) : null}
          <select
            className="form-input"
            value={e.status}
            disabled={busy || e.status === 'CONVERTED'}
            onChange={(ev) => run(() => api.updateEnquiry(e.id, { status: ev.target.value }), 'Status updated.')}
            title="Status"
          >
            {STATUSES.filter(([k]) => k !== 'CONVERTED' || e.status === 'CONVERTED').map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="chat-messages" style={{ background: '#fff' }}>
        <table className="data-table">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ width: 200, color: '#64748B', fontWeight: 600 }}>{label}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">Internal notes (admins only)</label>
          <textarea className="form-input" rows={4} value={notes} onChange={(ev) => setNotes(ev.target.value)} placeholder="e.g. Called on 26 Sep, sending a quote" />
          <div>
            <button className="btn-secondary" disabled={busy || notes === (e.notes || '')} onClick={() => run(() => api.updateEnquiry(e.id, { notes }), 'Notes saved.')}>
              Save notes
            </button>
          </div>
        </div>

        {e.kind === 'business' ? (
          <div className="card" style={{ marginTop: 8, background: '#F8FAFC' }}>
            <div className="card-title-text" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <Briefcase size={16} /> Customer
            </div>
            {e.brand ? (
              <p style={{ fontSize: '0.86rem' }}>
                Converted to customer <strong>{e.brand.name}</strong>. Find it under Brands / Customers.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <p style={{ fontSize: '0.82rem', color: '#475569' }}>
                  When they sign up, convert the lead: create a new customer from this enquiry, or link a customer that already exists.
                </p>
                <div className="row-actions" style={{ flexWrap: 'wrap' }}>
                  <button className="btn-primary" disabled={busy || !e.company_name} onClick={() => run(() => api.convertEnquiry(e.id), 'Customer created.')}>
                    Create customer "{e.company_name}"
                  </button>
                  <select className="form-input" style={{ width: 'auto' }} value={linkBrand} onChange={(ev) => setLinkBrand(ev.target.value)}>
                    <option value="">Or link an existing customer…</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {linkBrand ? (
                    <button className="btn-secondary" disabled={busy} onClick={() => run(() => api.convertEnquiry(e.id, Number(linkBrand)), 'Linked to customer.')}>
                      Link
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
