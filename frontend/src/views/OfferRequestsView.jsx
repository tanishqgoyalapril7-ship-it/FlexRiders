import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Flag, MapPin, RefreshCw, Search, Ticket, X, ZoomIn, ZoomOut } from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../components/Feedback';
import { EmptyState } from '../components/CampaignShared';

const TABS = [
  ['open', 'To review'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['all', 'All'],
];

const STATUS_TEXT = { SUBMITTED: 'New', UNDER_REVIEW: 'Under review', APPROVED: 'Approved', REJECTED: 'Rejected' };
const STATUS_PILL = { SUBMITTED: 'pending', UNDER_REVIEW: 'pending', APPROVED: 'approved', REJECTED: 'rejected' };

const when = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Redeem Offer requests: a guest's photo of a branded rider. Approving one is the only way a voucher is
 *  created; the brand then sees it in its portal. Automatic checks only flag, they never decide. */
export default function OfferRequestsView({ onChanged }) {
  const [tab, setTab] = useState('open');
  const [flagged, setFlagged] = useState(false);
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setError('');
    try {
      const data = await api.getOfferSubmissions({ status: tab, flagged, q: query.trim() });
      setRows(data.submissions);
      setCounts(data.counts);
    } catch (err) {
      setError(err.message);
      setRows((prev) => prev || []);
    }
  };
  useEffect(() => {
    setRows(null);
    load();
  }, [tab, flagged]);

  const onDecided = () => {
    setSelectedId(null);
    load();
    onChanged && onChanged();
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Offer Requests</h1>
          <p className="page-subtitle">
            Photos of FlexRiders riders sent by customers to claim a brand offer. A voucher is created only when you approve.
            {counts.open ? ` ${counts.open} waiting for review.` : ''}
          </p>
        </div>
        <button className="btn-secondary" onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="filter-row">
        <div className="tab-chips">
          {TABS.map(([key, label]) => (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}
              {key === 'open' && counts.open ? ` (${counts.open})` : ''}
            </button>
          ))}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
          <input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Flagged only
        </label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          style={{ display: 'flex', gap: 6 }}
        >
          <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ID, name or mobile" aria-label="Search" />
          <button className="btn-secondary" type="submit" aria-label="Search">
            <Search size={15} />
          </button>
        </form>
      </div>

      {error ? <div className="form-error">{error}</div> : null}
      {rows == null ? (
        <div className="card" style={{ color: '#94A3B8' }}>Loading requests…</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Ticket}>{tab === 'open' ? 'No requests waiting for review.' : 'No requests here.'}</EmptyState>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Request</th>
                <th>Customer</th>
                <th>Received</th>
                <th>Rider match</th>
                <th>Checks</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setSelectedId(r.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <strong>{r.submission_id}</strong>
                    {r.brand_hint ? <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Saw: {r.brand_hint.brand_name}</div> : null}
                  </td>
                  <td>
                    {r.customer_name}
                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>{r.mobile}</div>
                  </td>
                  <td>{when(r.received_at)}</td>
                  <td>
                    {r.suggested ? (
                      <>
                        {r.suggested.rider?.name || '—'}
                        <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                          {r.suggested.campaign?.brand_name} · {r.suggested.distance_m} m
                        </div>
                      </>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>None</span>
                    )}
                  </td>
                  <td>
                    {r.flagged_suspicious ? <span className="status-pill pill-rejected">Suspicious</span> : null}{' '}
                    {r.flags.length ? (
                      <span title={r.flags.map((f) => f.text).join('\n')} style={{ color: '#B45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={14} /> {r.flags.length}
                      </span>
                    ) : !r.flagged_suspicious ? (
                      <span style={{ color: '#15803D' }}>OK</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`status-pill pill-${STATUS_PILL[r.status]}`}>{STATUS_TEXT[r.status]}</span>
                    {r.voucher ? <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: 2 }}>{r.voucher.code}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId ? <OfferReview id={selectedId} onClose={() => { setSelectedId(null); load(); }} onDecided={onDecided} /> : null}
    </div>
  );
}

function OfferReview({ id, onClose, onDecided }) {
  const [item, setItem] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [stamped, setStamped] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [campaignId, setCampaignId] = useState('');
  const [riderId, setRiderId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getOfferSubmission(id)
      .then((data) => {
        setItem(data);
        const suggested = data.suggested;
        const choice = suggested?.campaign && data.campaign_choices.some((c) => c.id === suggested.campaign.id)
          ? suggested.campaign.id
          : data.brand_hint
            ? data.campaign_choices.find((c) => c.brand_name === data.brand_hint.brand_name)?.id
            : '';
        setCampaignId(choice ? String(choice) : '');
        setRiderId(suggested?.rider ? String(suggested.rider.id) : '');
      })
      .catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    setPhoto(null);
    api
      .getOfferPhotoUrl(id, stamped)
      .then((u) => {
        url = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setPhoto(u);
      })
      .catch(() => setPhoto(''));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, stamped]);

  const open = item && ['SUBMITTED', 'UNDER_REVIEW'].includes(item.status);
  const riders = item ? item.nearby_riders.filter((n) => !campaignId || String(n.campaign?.id) === campaignId) : [];

  const act = async (fn, success) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      toast.success(success);
      onDecided();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = () => {
    if (!campaignId) return setError('Choose the campaign whose brand is in the photo.');
    act(() => api.approveOfferSubmission(id, Number(campaignId), riderId ? Number(riderId) : null), 'Approved. The voucher is now active for the customer and the brand.');
  };
  const reject = () => {
    const reason = window.prompt('Reason for rejecting (the customer sees this):', "The brand isn't clearly visible in the photo.");
    if (!reason || !reason.trim()) return;
    act(() => api.rejectOfferSubmission(id, reason.trim()), 'Request rejected.');
  };
  const toggleFlag = async () => {
    const suspicious = !item.flagged_suspicious;
    const note = suspicious ? window.prompt('Why is it suspicious? (optional)') : null;
    try {
      setItem({ ...item, ...(await api.flagOfferSubmission(id, suspicious, note)) });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" style={{ maxWidth: 1040, width: '96vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{item ? `Offer request ${item.submission_id}` : 'Offer request'}</span>
          <button onClick={onClose} aria-label="Close" style={{ color: '#94A3B8' }}>
            <X size={18} />
          </button>
        </div>
        {!item ? (
          <div style={{ padding: 20, color: '#94A3B8' }}>{error || 'Loading…'}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: 20, padding: 20 }} className="offer-review-grid">
            <div>
              <div style={{ background: '#0F172A', borderRadius: 10, overflow: 'auto', height: 460, display: 'grid', placeItems: zoom === 1 ? 'center' : 'start' }}>
                {photo === null ? (
                  <span style={{ color: '#94A3B8' }}>Loading photo…</span>
                ) : photo === '' ? (
                  <span style={{ color: '#FCA5A5' }}>Photo couldn't be loaded.</span>
                ) : (
                  <img src={photo} alt="Customer's photo of the rider" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none', display: 'block' }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn-secondary" onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom === 1} aria-label="Zoom out">
                  <ZoomOut size={15} />
                </button>
                <span style={{ fontSize: '0.85rem', minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
                <button className="btn-secondary" onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom === 4} aria-label="Zoom in">
                  <ZoomIn size={15} />
                </button>
                <label style={{ marginLeft: 'auto', fontSize: '0.85rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={stamped} onChange={(e) => setStamped(e.target.checked)} /> Show date stamp
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.88rem' }}>
              <section>
                <div><strong>{item.customer_name}</strong> · {item.mobile}</div>
                <div style={{ color: '#64748B', marginTop: 4 }}>
                  Received {when(item.received_at)} (server time)
                  {item.device_captured_at ? ` · phone clock ${when(item.device_captured_at)}` : ''}
                </div>
                {item.latitude != null ? (
                  <a href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 4 }}>
                    <MapPin size={14} /> {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                    {item.accuracy_m ? ` (±${Math.round(item.accuracy_m)} m)` : ''}
                  </a>
                ) : (
                  <div style={{ color: '#B45309', marginTop: 4 }}>No location shared</div>
                )}
                {item.brand_hint ? <div style={{ marginTop: 4 }}>Customer says they saw: <strong>{item.brand_hint.brand_name}</strong></div> : null}
              </section>

              {item.flags.length || item.flagged_suspicious ? (
                <section style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 10 }}>
                  {item.flagged_suspicious ? <div style={{ color: '#B91C1C', fontWeight: 600 }}>Marked suspicious by an admin</div> : null}
                  {item.flags.map((f) => (
                    <div key={f.code} style={{ display: 'flex', gap: 6, color: '#92400E' }}>
                      <AlertTriangle size={14} style={{ flex: 'none', marginTop: 2 }} /> {f.text}
                    </div>
                  ))}
                </section>
              ) : (
                <section style={{ color: '#15803D' }}>Automatic checks found nothing unusual.</section>
              )}

              {item.same_number_history.length ? (
                <section>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Earlier requests from this number</div>
                  {item.same_number_history.slice(0, 5).map((h) => (
                    <div key={h.id} style={{ color: '#64748B' }}>
                      {h.submission_id} · {when(h.received_at)} · {h.status.replace('_', ' ').toLowerCase()}
                    </div>
                  ))}
                </section>
              ) : null}

              {open ? (
                <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="form-group">
                    <span className="form-label">Campaign (brand in the photo)</span>
                    <select className="form-input" value={campaignId} onChange={(e) => { setCampaignId(e.target.value); setRiderId(''); }}>
                      <option value="">Choose…</option>
                      {item.campaign_choices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.brand_name} · {c.name} · {c.discount}
                        </option>
                      ))}
                    </select>
                  </label>
                  {item.campaign_choices.length === 0 ? (
                    <div style={{ color: '#B45309' }}>No campaign has its Redeem Offer switched on, so nothing can be approved yet.</div>
                  ) : null}
                  <label className="form-group">
                    <span className="form-label">Rider in the photo (optional)</span>
                    <select className="form-input" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
                      <option value="">Not sure</option>
                      {riders.map((n) => (
                        <option key={`${n.rider.id}-${n.campaign?.id}`} value={n.rider.id}>
                          {n.rider.name} ({n.rider.code}) · {n.distance_m} m away
                        </option>
                      ))}
                    </select>
                  </label>
                  {error ? <div className="form-error">{error}</div> : null}
                  <div className="request-actions">
                    <button className="btn-primary" disabled={busy} onClick={approve}>
                      <Check size={14} /> Approve & create voucher
                    </button>
                    <button className="btn-danger" disabled={busy} onClick={reject}>
                      <X size={14} /> Reject
                    </button>
                  </div>
                </section>
              ) : (
                <section>
                  <div>
                    <span className={`status-pill pill-${STATUS_PILL[item.status]}`}>{STATUS_TEXT[item.status]}</span>
                    {item.reviewed_by ? <span style={{ color: '#64748B' }}> by {item.reviewed_by}, {when(item.reviewed_at)}</span> : null}
                  </div>
                  {item.reject_reason ? <div style={{ marginTop: 6 }}>Reason: {item.reject_reason}</div> : null}
                  {item.voucher ? (
                    <div style={{ marginTop: 6 }}>
                      Voucher <strong>{item.voucher.code}</strong> · {item.voucher.status.toLowerCase()} · expires {when(item.voucher.expires_at)}
                      {item.campaign ? <div style={{ color: '#64748B' }}>{item.campaign.brand_name} · {item.campaign.name}</div> : null}
                    </div>
                  ) : null}
                </section>
              )}

              <button className="btn-secondary" onClick={toggleFlag} style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <Flag size={14} /> {item.flagged_suspicious ? 'Remove suspicious mark' : 'Mark as suspicious'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
