import React, { useEffect, useState } from 'react';
import { Camera, Check, RefreshCw, X } from 'lucide-react';
import { api } from '../services/api';
import { subscribeCampaignSignals } from '../services/realtime';
import { toast } from '../components/Feedback';
import { EmptyState, StatusPill, formatDate } from '../components/CampaignShared';

const STATUSES = [
  ['PENDING', 'Pending'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
];

/** Proof photos across every campaign. Only approved photos ever reach brands and public pages. */
export default function PhotoVerificationView({ onChanged }) {
  const [campaigns, setCampaigns] = useState([]);
  useEffect(() => {
    api.getCampaigns().then(setCampaigns).catch(() => setCampaigns([]));
  }, []);
  const [status, setStatus] = useState('PENDING');
  const [campaignId, setCampaignId] = useState('');
  const [photos, setPhotos] = useState(null);
  const [next, setNext] = useState(null);
  const [pendingTotal, setPendingTotal] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = async (beforeId = null) => {
    setError('');
    try {
      const data = await api.getPhotoQueue({ status, campaign_id: campaignId, before_id: beforeId });
      setPhotos((prev) => (beforeId && prev ? [...prev, ...data.photos] : data.photos));
      setNext(data.next_before_id);
      setPendingTotal(data.pending_total);
    } catch (err) {
      setError(err.message);
      setPhotos((prev) => prev || []);
    }
  };
  useEffect(() => {
    setPhotos(null);
    load();
  }, [status, campaignId]);
  // New submissions appear without a manual refresh.
  useEffect(
    () =>
      subscribeCampaignSignals((p) => {
        if (['photo_submitted', 'photo_approved'].includes(p.event_type) && (!campaignId || String(p.campaign_id) === String(campaignId))) load();
      }),
    [status, campaignId]
  );

  const review = async (p, approve) => {
    let reason = null;
    if (!approve) {
      reason = window.prompt(`Reason for rejecting this photo from ${p.rider.full_name}:`);
      if (!reason || !reason.trim()) return;
    }
    setBusyId(p.id);
    try {
      if (approve) await api.approveCampaignPhoto(p.campaign_id, p.id);
      else await api.rejectCampaignPhoto(p.campaign_id, p.id, reason.trim());
      toast.success(approve ? 'Photo approved.' : 'Photo rejected.');
      setPhotos((prev) => (status === 'PENDING' ? prev.filter((x) => x.id !== p.id) : prev.map((x) => (x.id === p.id ? { ...x, status: approve ? 'APPROVED' : 'REJECTED' } : x))));
      setPendingTotal((n) => (n != null && status === 'PENDING' ? n - 1 : n));
      onChanged && onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Photo Verification</h1>
          <p className="page-subtitle">
            Review riders' daily campaign photos. Brands and public campaign pages only ever show approved photos.
            {pendingTotal != null ? ` ${pendingTotal} waiting for review.` : ''}
          </p>
        </div>
        <button className="btn-secondary" onClick={() => load()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="filter-row">
        <div className="tab-chips">
          {STATUSES.map(([key, label]) => (
            <button key={key} className={status === key ? 'active' : ''} onClick={() => setStatus(key)}>
              {label}
            </button>
          ))}
        </div>
        <select className="form-input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign">
          <option value="">All campaigns</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} · ` : ''}
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <div className="form-error">{error}</div> : null}
      {photos == null ? (
        <div className="card" style={{ color: '#94A3B8' }}>Loading photos…</div>
      ) : photos.length === 0 ? (
        <EmptyState icon={Camera}>No {status.toLowerCase()} photos.</EmptyState>
      ) : (
        <>
          <div className="photo-grid">
            {photos.map((p) => (
              <div key={p.id} className="card photo-card">
                <a href={p.photo_url} target="_blank" rel="noreferrer">
                  <img src={p.photo_url} alt={`Proof photo by ${p.rider.full_name}`} loading="lazy" />
                </a>
                <div className="photo-meta">
                  <strong>{p.campaign_name}</strong>
                  <span>
                    {p.campaign_code} · {p.rider.full_name} ({p.rider.rider_id})
                  </span>
                  <span>
                    {formatDate(p.date)}
                    {p.slot_label ? ` · ${p.slot_label}` : ''}
                    {p.rider.plate_in_photos && p.rider.vehicle_number ? ` · Plate ${p.rider.vehicle_number}` : ''}
                  </span>
                  <span>
                    <StatusPill status={p.status} />
                  </span>
                  {p.rejection_reason ? <span style={{ color: '#B91C1C' }}>{p.rejection_reason}</span> : null}
                </div>
                {p.status === 'PENDING' ? (
                  <div className="request-actions">
                    <button className="btn-primary" disabled={busyId === p.id} onClick={() => review(p, true)}>
                      <Check size={14} /> Approve
                    </button>
                    <button className="btn-danger" disabled={busyId === p.id} onClick={() => review(p, false)}>
                      <X size={14} /> Reject
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {next ? (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn-secondary" onClick={() => load(next)}>
                Load more
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
