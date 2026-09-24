import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Users,
  UserPlus,
  UserCheck,
  PlayCircle,
  CheckCircle2,
  Layers,
  CalendarCheck,
  Wallet,
  Clock,
  BadgeCheck,
  Download,
  Pencil,
  Send,
  PauseCircle,
  XCircle,
  Flag,
  Image as ImageIcon,
  Inbox,
} from 'lucide-react';
import { api } from '../services/api';
import { ConfirmDialog, CampaignFormModal, PhotoLightbox, PhotoReviewCard, RiderActivityModal } from '../components/CampaignModals';
import { EmptyState, SlotProgress, StatCard, StatusPill, formatDate, formatDateRange, formatINR } from '../components/CampaignShared';

const TABS = [
  ['overview', 'Overview'],
  ['riders', 'Riders'],
  ['requests', 'Requests'],
  ['photos', 'Photos'],
  ['payouts', 'Payouts'],
];

export default function CampaignDetailView({ campaignId, brands = [], onBack, onViewRider, onChanged }) {
  const [campaign, setCampaign] = useState(null);
  const [riders, setRiders] = useState([]);
  const [applications, setApplications] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [tab, setTab] = useState('overview');
  const [photoFilter, setPhotoFilter] = useState('PENDING');
  const [photoRider, setPhotoRider] = useState('ALL');
  const [highlightPayout, setHighlightPayout] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [editing, setEditing] = useState(false);
  const [activityFor, setActivityFor] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    try {
      const [c, r, a, p, pay] = await Promise.all([
        api.getCampaign(campaignId),
        api.getCampaignRiders(campaignId),
        api.getCampaignApplications(campaignId),
        api.getCampaignPhotos(campaignId),
        api.getCampaignPayouts(campaignId),
      ]);
      setCampaign(c);
      setRiders(r);
      setApplications(a);
      setPhotos(p);
      setPayouts(pay);
    } catch (err) {
      console.error('Error loading campaign:', err);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [campaignId]);

  const reload = () => {
    load();
    onChanged && onChanged();
  };

  // Opens a confirmation dialog; `run` receives the optional reason.
  const ask = (options, run) =>
    setConfirm({
      ...options,
      onConfirm: async (reason) => {
        await run(reason);
        reload();
      },
    });

  if (!campaign) {
    return (
      <div className="page-container">
        <EmptyState icon={Clock}>Loading campaign…</EmptyState>
      </div>
    );
  }

  const s = campaign.stats;
  const status = campaign.status;
  const closed = status === 'COMPLETED' || status === 'CANCELLED';
  const published = ['OPEN', 'FULL', 'ACTIVE'].includes(status);
  const pendingRequests = applications.filter((a) => a.status === 'REQUESTED');
  const visiblePhotos = photos.filter(
    (p) => (photoFilter === 'ALL' || p.photo_status === photoFilter) && (photoRider === 'ALL' || String(p.rider.id) === photoRider)
  );

  const statusAction = (action, label, message, danger) =>
    ask({ title: label, message, confirmLabel: label, danger }, () => api.changeCampaignStatus(campaign.id, action));

  const exportReport = () => api.downloadCampaignReport(campaign.id).catch((err) => alert(err.message));

  return (
    <div className="page-container">
      <div>
        <button className="card-action-link" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <ArrowLeft size={15} />
          All campaigns
        </button>
        <div className="card">
          <div className="campaign-header-card">
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 className="page-title">{campaign.name}</h1>
                <StatusPill status={status} />
              </div>
              <div className="campaign-meta-row">
                <span>
                  <Layers size={15} />
                  {campaign.brand_name}
                </span>
                <span>
                  <CalendarDays size={15} />
                  {formatDate(campaign.start_date)} — {formatDate(campaign.end_date)}
                </span>
                <span>
                  <Users size={15} />
                  {s.assigned_riders} / {campaign.total_slots} riders • {s.remaining_slots} slots available
                </span>
                <span>
                  <Wallet size={15} />
                  {formatINR(campaign.daily_rate)} / day
                </span>
              </div>
            </div>
            <div className="row-actions">
              <button className="btn-secondary" onClick={exportReport} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Download size={15} />
                Export Report
              </button>
              {!closed && (
                <button className="btn-secondary" onClick={() => setEditing(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Pencil size={15} />
                  Edit
                </button>
              )}
              {status === 'DRAFT' && (
                <button
                  className="btn-primary"
                  onClick={() => statusAction('publish', 'Publish Campaign', 'Eligible riders will be able to see this campaign and request to join.')}
                >
                  <Send size={15} />
                  Publish Campaign
                </button>
              )}
              {published && (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    statusAction('pause', 'Pause Campaign', 'Riders will not be able to join or submit daily proof while the campaign is paused.')
                  }
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <PauseCircle size={15} />
                  Pause
                </button>
              )}
              {status === 'PAUSED' && (
                <button className="btn-primary" onClick={() => statusAction('resume', 'Resume Campaign', 'Riders will be able to join and submit proof again.')}>
                  <PlayCircle size={15} />
                  Resume
                </button>
              )}
              {!closed && status !== 'DRAFT' && (
                <button
                  className="btn-primary"
                  onClick={() =>
                    statusAction(
                      'complete',
                      'Complete Campaign',
                      'This ends the campaign for all riders and calculates their final payouts. Activity and payout history is kept. This cannot be undone.'
                    )
                  }
                >
                  <Flag size={15} />
                  Complete
                </button>
              )}
              {!closed && (
                <button
                  className="btn-danger-outline"
                  onClick={() =>
                    statusAction(
                      'cancel',
                      'Cancel Campaign',
                      'All assigned riders will be released and pending requests rejected. Earnings for approved days are kept. This cannot be undone.',
                      true
                    )
                  }
                >
                  <XCircle size={15} />
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="tabs-header-bar">
        {TABS.map(([key, label]) => (
          <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
            {key === 'requests' && pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}
            {key === 'photos' && s.pending_photos > 0 ? ` (${s.pending_photos})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="stats-grid-5">
            <StatCard title="Total Slots" value={s.total_slots} icon={Layers} />
            <StatCard title="Requested Riders" value={s.requested_riders} icon={UserPlus} color="#F59E0B" background="#FFFBEB" />
            <StatCard title="Approved Riders" value={s.approved_riders} icon={UserCheck} color="#1D4ED8" background="#DBEAFE" />
            <StatCard title="Active Riders" value={s.active_riders} icon={PlayCircle} color="#10B981" background="#ECFDF5" />
            <StatCard title="Completed Riders" value={s.completed_riders} icon={CheckCircle2} color="#15803D" background="#DCFCE7" />
            <StatCard title="Remaining Slots" value={s.remaining_slots} icon={Users} color="#8B5CF6" background="#F5F3FF" />
            <StatCard title="Total Eligible Days" value={s.total_eligible_days} icon={CalendarCheck} hint="Approved rider-days" />
            <StatCard title="Payout Generated" value={formatINR(s.total_payout_generated)} icon={Wallet} color="#0284C7" background="#F0F9FF" />
            <StatCard title="Payout Pending" value={formatINR(s.total_payout_pending)} icon={Clock} color="#F59E0B" background="#FFFBEB" />
            <StatCard title="Payout Paid" value={formatINR(s.total_payout_paid)} icon={BadgeCheck} color="#10B981" background="#ECFDF5" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 20 }}>
            <div className="card">
              <div className="card-header-bar">
                <span className="card-title-text">About this campaign</span>
              </div>
              {campaign.image_url ? <img src={campaign.image_url} alt="" className="campaign-banner" style={{ marginBottom: 14 }} /> : null}
              <p style={{ fontSize: '0.86rem', color: '#475569', lineHeight: 1.6 }}>{campaign.description || 'No description added.'}</p>
              <div className="card-title-text" style={{ margin: '18px 0 8px' }}>Rules & requirements</div>
              {campaign.rules.length ? (
                <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.86rem', color: '#334155' }}>
                  {campaign.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '0.84rem', color: '#94A3B8' }}>No requirements added.</p>
              )}
            </div>
            <div className="card">
              <div className="card-header-bar">
                <span className="card-title-text">Slots</span>
              </div>
              <SlotProgress used={s.assigned_riders} total={campaign.total_slots} />
              <div className="mini-stat-list" style={{ marginTop: 16 }}>
                <div className="mini-stat">
                  <div className="mini-stat-label">Join requests</div>
                  <div className="mini-stat-value">{s.requested_riders}</div>
                </div>
                <div className="mini-stat">
                  <div className="mini-stat-label">Photos to review</div>
                  <div className="mini-stat-value">{s.pending_photos}</div>
                </div>
              </div>
              {pendingRequests.length > 0 && (
                <button className="btn-secondary" style={{ width: '100%', marginTop: 14 }} onClick={() => setTab('requests')}>
                  Review join requests
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'riders' && (
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Assigned Riders</span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Days Completed</th>
                  <th>Current Streak</th>
                  <th>Photos</th>
                  <th>Daily Rate</th>
                  <th>Earned</th>
                  <th>Pending</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr key={r.assignment_id}>
                    <td>
                      <strong>{r.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{r.rider.rider_id}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{r.rider.mobile_number}</td>
                    <td>
                      <StatusPill status={r.status} />
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{formatDate(r.joined_at)}</td>
                    <td>{r.completed_days} days</td>
                    <td>{r.current_streak} day streak</td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {r.photos_approved} approved / {r.photos_submitted} submitted
                    </td>
                    <td>{formatINR(r.daily_rate)}/day</td>
                    <td>
                      <strong>{formatINR(r.earned)}</strong>
                    </td>
                    <td>{formatINR(r.pending)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-sm-view" onClick={() => onViewRider(r.rider)}>
                          Rider
                        </button>
                        <button className="btn-sm-view" onClick={() => setActivityFor(r.assignment_id)}>
                          Activity
                        </button>
                        <button
                          className="btn-sm-view"
                          onClick={() => {
                            setPhotoRider(String(r.rider.id));
                            setPhotoFilter('ALL');
                            setTab('photos');
                          }}
                        >
                          Photos
                        </button>
                        <button
                          className="btn-sm-view"
                          onClick={() => {
                            setHighlightPayout(r.payout_id);
                            setTab('payouts');
                          }}
                        >
                          Payout
                        </button>
                        {(r.status === 'ACTIVE' || r.status === 'ASSIGNED') && (
                          <button
                            className="btn-sm-reject"
                            onClick={() =>
                              ask(
                                {
                                  title: 'Remove rider',
                                  message: `Remove ${r.rider.full_name} from this campaign? Their slot is released and they can join another campaign. Earnings for approved days are kept.`,
                                  confirmLabel: 'Remove Rider',
                                  danger: true,
                                  reasonLabel: 'Reason (shown to the rider)',
                                },
                                (reason) => api.removeCampaignRider(campaign.id, r.assignment_id, reason)
                              )
                            }
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {riders.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      <EmptyState icon={Users}>No riders assigned yet. Approved join requests appear here.</EmptyState>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Join Requests</span>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{s.remaining_slots} slots available</span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Phone</th>
                  <th>Rider Status</th>
                  <th>Requested</th>
                  <th>Request Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{a.rider.rider_id}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{a.rider.mobile_number}</td>
                    <td>
                      <StatusPill status={a.rider.status} />
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{formatDate(a.requested_at)}</td>
                    <td>
                      <StatusPill status={a.status} />
                      {a.rejection_reason ? <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4 }}>{a.rejection_reason}</div> : null}
                    </td>
                    <td>
                      {a.status === 'REQUESTED' ? (
                        <div className="row-actions">
                          <button
                            className="btn-sm-approve"
                            disabled={s.remaining_slots === 0 || Boolean(a.rider_busy_in_campaign) || !published}
                            title={
                              a.rider_busy_in_campaign
                                ? `Already active in ${a.rider_busy_in_campaign}`
                                : s.remaining_slots === 0
                                ? 'No slots available'
                                : !published
                                ? 'Campaign is not accepting riders'
                                : ''
                            }
                            onClick={() =>
                              api
                                .approveCampaignApplication(campaign.id, a.id)
                                .then(reload)
                                .catch((err) => alert(err.message))
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="btn-sm-reject"
                            onClick={() =>
                              ask(
                                {
                                  title: 'Reject request',
                                  message: `Reject ${a.rider.full_name}'s request to join this campaign?`,
                                  confirmLabel: 'Reject Request',
                                  danger: true,
                                  reasonLabel: 'Reason (shown to the rider)',
                                },
                                (reason) => api.rejectCampaignApplication(campaign.id, a.id, reason)
                              )
                            }
                          >
                            Reject
                          </button>
                          {a.rider_busy_in_campaign ? (
                            <span style={{ fontSize: '0.72rem', color: '#B45309' }}>Active in {a.rider_busy_in_campaign}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{formatDate(a.approved_at || a.rejected_at)}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {applications.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState icon={Inbox}>No join requests yet.</EmptyState>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'photos' && (
        <div className="card">
          <div className="card-header-bar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="tabs-header-bar">
              {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((f) => (
                <button key={f} className={`tab-btn ${photoFilter === f ? 'active' : ''}`} onClick={() => setPhotoFilter(f)}>
                  {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <select className="form-input" value={photoRider} onChange={(e) => setPhotoRider(e.target.value)} style={{ width: 220 }}>
              <option value="ALL">All riders</option>
              {riders.map((r) => (
                <option key={r.assignment_id} value={r.rider.id}>
                  {r.rider.full_name} ({r.rider.rider_id})
                </option>
              ))}
            </select>
          </div>
          {visiblePhotos.length === 0 ? (
            <EmptyState icon={ImageIcon}>No photos to show.</EmptyState>
          ) : (
            <div className="photo-grid">
              {visiblePhotos.map((p) => (
                <PhotoReviewCard
                  key={p.id}
                  campaignId={campaign.id}
                  photo={p}
                  riderName={`${p.rider.full_name} · ${p.rider.rider_id}`}
                  onPreview={setPreview}
                  onChanged={reload}
                  onReject={(photo) =>
                    ask(
                      {
                        title: 'Reject proof',
                        message: `Reject ${photo.rider.full_name}'s proof for ${formatDate(photo.date)}? This day will earn ₹0 unless it's approved later.`,
                        confirmLabel: 'Reject Proof',
                        danger: true,
                        reasonLabel: 'Rejection reason',
                      },
                      (reason) => api.rejectCampaignActivity(campaign.id, photo.id, reason)
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'payouts' && (
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Rider Payouts</span>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
              Earned = approved days × daily rate. Paid payouts are recorded in Payments.
            </span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Rider Status</th>
                  <th>Approved Days</th>
                  <th>Daily Rate</th>
                  <th>Earned</th>
                  <th>Paid</th>
                  <th>Pending</th>
                  <th>Payout Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} style={p.id === highlightPayout ? { outline: '2px solid #BFDBFE', outlineOffset: -2 } : undefined}>
                    <td>
                      <strong>{p.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{p.rider.rider_id}</div>
                    </td>
                    <td>
                      <StatusPill status={p.assignment_status} />
                    </td>
                    <td>{p.eligible_days}</td>
                    <td>{formatINR(p.daily_rate)}</td>
                    <td>
                      <strong>{formatINR(p.total_amount)}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                        {p.eligible_days} × {formatINR(p.daily_rate)}
                      </div>
                    </td>
                    <td>{formatINR(p.paid_amount)}</td>
                    <td>{formatINR(p.pending_amount)}</td>
                    <td>
                      <StatusPill status={p.status} />
                      {p.paid_at ? <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4 }}>Paid {formatDate(p.paid_at)}</div> : null}
                    </td>
                    <td>
                      <div className="row-actions">
                        {(p.status === 'PENDING' || p.status === 'FAILED') && p.pending_amount > 0 && (
                          <button
                            className="btn-sm-view"
                            onClick={() =>
                              api
                                .approveCampaignPayout(campaign.id, p.id)
                                .then(reload)
                                .catch((err) => alert(err.message))
                            }
                          >
                            Approve
                          </button>
                        )}
                        {p.status === 'APPROVED' && (
                          <button
                            className="btn-sm-approve"
                            onClick={() =>
                              ask(
                                {
                                  title: 'Mark payout as paid',
                                  message: `Record a UPI payment of ${formatINR(p.pending_amount)} to ${p.rider.full_name} (${p.rider.upi_id || 'no UPI ID on file'})? It will appear in Payments.`,
                                  confirmLabel: 'Mark as Paid',
                                },
                                () => api.payCampaignPayout(campaign.id, p.id)
                              )
                            }
                          >
                            Mark Paid
                          </button>
                        )}
                        {p.status === 'PAID' && p.pending_amount === 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', color: '#10B981', fontWeight: 600 }}>
                            <CheckCircle2 size={14} />
                            Settled
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState icon={Wallet}>Payouts appear here once riders are approved.</EmptyState>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing ? (
        <CampaignFormModal
          brands={brands}
          campaign={campaign}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      ) : null}
      {confirm ? <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} /> : null}
      {activityFor ? (
        <RiderActivityModal campaignId={campaign.id} assignmentId={activityFor} onClose={() => setActivityFor(null)} onChanged={reload} />
      ) : null}
      <PhotoLightbox url={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
