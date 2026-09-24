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
  Eye,
  EyeOff,
  PauseCircle,
  XCircle,
  Flag,
  Image as ImageIcon,
  Inbox,
} from 'lucide-react';
import { api } from '../services/api';
import { CampaignAddRiderModal } from '../components/AdminCrud';
import { DangerDialog, toast } from '../components/Feedback';
import { JoinRequestsTable } from '../components/JoinRequests';
import { ConfirmDialog, CampaignFormModal, PhotoLightbox, PhotoReviewCard, RiderActivityModal } from '../components/CampaignModals';
import { EmptyState, SlotProgress, StatCard, StatusPill, formatDate, formatDateRange, formatINR } from '../components/CampaignShared';
import {
  BrandKitPanel,
  DeliveryPanel,
  ExtensionDialog,
  ExtensionsPanel,
  FinancialsPanel,
  HistoryPanel,
  ReplacementSlotsDialog,
} from '../components/CampaignFulfillment';

const TABS = [
  ['overview', 'Delivery'],
  ['riders', 'Riders'],
  ['requests', 'Requests'],
  ['photos', 'Photos'],
  ['payouts', 'Payouts'],
  ['extensions', 'Extensions'],
  ['kit', 'Brand Kit'],
  ['financials', 'Financials'],
  ['history', 'History'],
];

// Rider performance from Photo Streaks (thresholds live in the backend config).
const RIDER_PERFORMANCE = {
  ACTIVE: { label: 'Active', pill: 'pill-on_track' },
  AT_RISK: { label: 'At Risk', pill: 'pill-at_risk' },
  INACTIVE: { label: 'Inactive', pill: 'pill-behind_target' },
};

// Whether riders can see this campaign in the app, and who can join it (same rule as the rider API).
function RiderVisibility({ campaign, onPublish }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.getCampaignRiderVisibility(campaign.id).then(setData).catch(() => setData(null));
  }, [campaign.id, campaign.status, campaign.visibility, campaign.stats.assigned_riders]);
  if (!data) return null;

  if (!data.visible_to_riders) {
    return (
      <div className="visibility-banner visibility-hidden" role="status">
        <EyeOff size={18} />
        <div style={{ flex: 1 }}>
          <strong>Riders can't see this campaign.</strong> {data.hidden_reason}.
          {campaign.status === 'DRAFT' ? ' Publish it to show it in the rider app.' : ''}
        </div>
        {campaign.status === 'DRAFT' ? (
          <button className="btn-primary" onClick={onPublish}>
            <Send size={15} /> Publish
          </button>
        ) : null}
      </div>
    );
  }
  const blocked = data.riders.filter((r) => !r.can_join);
  return (
    <div className="visibility-banner visibility-shown" role="status">
      <Eye size={18} />
      <div style={{ flex: 1 }}>
        <strong>Visible in the rider app.</strong> {data.remaining_slots} slot{data.remaining_slots === 1 ? '' : 's'} left ·{' '}
        {data.riders_who_can_join} rider{data.riders_who_can_join === 1 ? '' : 's'} can join now.
        {blocked.length ? (
          <button className="card-action-link" style={{ marginLeft: 8 }} onClick={() => setOpen(!open)}>
            {open ? 'Hide' : `Why can't ${blocked.length} join?`}
          </button>
        ) : null}
        {open ? (
          <ul className="visibility-list">
            {blocked.map((r) => (
              <li key={r.rider.id}>
                <strong>{r.rider.full_name}</strong> ({r.rider.rider_id}): {r.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

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
  const [danger, setDanger] = useState(null);
  const [addingRider, setAddingRider] = useState(false);
  const [fulfillment, setFulfillment] = useState(null);
  const [ridersAvailable, setRidersAvailable] = useState('');
  const [showSlots, setShowSlots] = useState(false);
  const [showExtension, setShowExtension] = useState(false);

  const load = async () => {
    try {
      const [c, r, a, p, pay, f] = await Promise.all([
        api.getCampaign(campaignId),
        api.getCampaignRiders(campaignId),
        api.getCampaignApplications(campaignId),
        api.getCampaignPhotos(campaignId),
        api.getCampaignPayouts(campaignId),
        api.getCampaignFulfillment(campaignId, ridersAvailable),
      ]);
      setFulfillment(f);
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
  }, [campaignId, ridersAvailable]);

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

  const exportReport = () => api.downloadCampaignReport(campaign.id).catch((err) => toast.error(err.message));

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
                  {campaign.effective_end_date !== campaign.end_date ? ` (extended to ${formatDate(campaign.effective_end_date)})` : ''}
                </span>
                <span>
                  <Flag size={15} />
                  {campaign.contracted_rider_days} contracted rider-days
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
              {(published || status === 'PAUSED') && applications.length === 0 && (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    statusAction(
                      'unpublish',
                      'Unpublish Campaign',
                      'The campaign goes back to draft and disappears from the rider app. Dates, slots and payout can be edited again. Only possible while no rider has requested to join.'
                    )
                  }
                >
                  Unpublish
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
              {(status === 'DRAFT' || status === 'CANCELLED') && (
                <button
                  className="btn-danger-outline"
                  onClick={() =>
                    setDanger({
                      title: 'Delete campaign',
                      message: `Permanently delete ${campaign.name}?`,
                      loadImpact: () => api.getCampaignDeleteImpact(campaign.id),
                      getAction: (impact) =>
                        impact.can_hard_delete
                          ? {
                              label: 'Delete Permanently',
                              tone: 'danger',
                              typeToConfirm: 'DELETE',
                              note: 'The campaign, its join requests, extensions and brand kit settings are removed. This cannot be undone.',
                              run: async () => {
                                await api.deleteCampaign(campaign.id);
                                return `${campaign.name} was deleted.`;
                              },
                            }
                          : null,
                      renderDetails: (impact) =>
                        impact.can_hard_delete ? null : (
                          <div className="impact-note impact-note-danger">
                            This campaign has riders, activity or money records, so it can't be deleted. It stays as a cancelled campaign to keep that history.
                          </div>
                        ),
                      onDone: () => {
                        onChanged && onChanged();
                        onBack();
                      },
                    })
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <RiderVisibility
        campaign={campaign}
        onPublish={() => statusAction('publish', 'Publish Campaign', 'Eligible riders will be able to see this campaign and request to join.')}
      />

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
          <DeliveryPanel
            campaign={campaign}
            fulfillment={fulfillment}
            ridersAvailable={ridersAvailable}
            setRidersAvailable={setRidersAvailable}
            onOpenSlots={() => setShowSlots(true)}
            onExtend={() => setShowExtension(true)}
          />
          <div className="stats-grid-5">
            <StatCard
              title="Total Slots"
              value={s.slot_capacity > s.total_slots ? `${s.total_slots} + ${s.slot_capacity - s.total_slots}` : s.total_slots}
              icon={Layers}
              hint={s.slot_capacity > s.total_slots ? 'Includes replacement slots' : null}
            />
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
              <SlotProgress used={s.assigned_riders} total={s.slot_capacity} />
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
            {published ? (
              <button className="btn-primary" onClick={() => setAddingRider(true)}>
                <Users size={15} /> <span>Add Rider</span>
              </button>
            ) : null}
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Status</th>
                  <th>Today's Photos</th>
                  <th>Current Streak</th>
                  <th>Longest Streak</th>
                  <th>Photo-Days</th>
                  <th>Target</th>
                  <th>Remaining</th>
                  <th>Completion</th>
                  <th>Excused</th>
                  <th>Earned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {riders.map((r) => (
                  <tr key={r.assignment_id}>
                    <td>
                      <strong>{r.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{r.rider.rider_id}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {r.rider.mobile_number} · Joined {formatDate(r.joined_at)}
                      </div>
                    </td>
                    <td>
                      <StatusPill status={r.status} />
                      {r.rider_status !== 'ENDED' ? (
                        <div className={`status-pill ${RIDER_PERFORMANCE[r.rider_status].pill}`} style={{ marginTop: 4 }}>
                          {RIDER_PERFORMANCE[r.rider_status].label}
                        </div>
                      ) : null}
                      {r.replacement_for ? <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }}>Replaces {r.replacement_for}</div> : null}
                    </td>
                    <td>
                      {r.today_photos.in_window ? (
                        <>
                          <strong style={{ color: r.today_photos.completed ? '#047857' : '#0F172A' }}>
                            {Math.min(r.today_photos.valid, r.photos_required)}/{r.photos_required}
                          </strong>
                          {r.today_photos.pending ? (
                            <div style={{ fontSize: '0.7rem', color: '#B45309' }}>{r.today_photos.pending} in review</div>
                          ) : null}
                        </>
                      ) : (
                        <span style={{ color: '#94A3B8' }}>—</span>
                      )}
                    </td>
                    <td>
                      {r.current_streak} days
                      {r.streak_broken ? (
                        <div style={{ fontSize: '0.7rem', color: '#B91C1C' }}>Broken {formatDate(r.streak_broken_on, false)}</div>
                      ) : null}
                    </td>
                    <td>{r.longest_streak} days</td>
                    <td>
                      <strong>{r.completed_days}</strong>
                    </td>
                    <td>{r.target_days} days</td>
                    <td>{r.remaining_target_days} days</td>
                    <td>{r.completion_pct == null ? '—' : `${r.completion_pct}%`}</td>
                    <td>{r.excused_days}</td>
                    <td>
                      <strong>{formatINR(r.earned)}</strong>
                      <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{formatINR(r.daily_rate)}/day</div>
                    </td>
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
                    <td colSpan={12}>
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
          <JoinRequestsTable requests={applications} campaignRiders={riders} onChanged={reload} />
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
                  key={p.id ? `p${p.id}` : `a${p.activity_id}`}
                  campaignId={campaign.id}
                  photo={p}
                  riderName={`${p.rider.full_name} · ${p.rider.rider_id}`}
                  onPreview={setPreview}
                  onChanged={reload}
                  onReject={(photo) =>
                    ask(
                      {
                        title: photo.id ? 'Reject photo' : 'Reject proof',
                        message: `Reject this ${photo.id ? 'photo' : 'proof'} from ${photo.rider.full_name} for ${formatDate(photo.date)}? The day only counts with ${
                          photo.photos_required || 3
                        } valid photos; otherwise it earns ₹0.${photo.photo_status === 'APPROVED' ? ' It was already approved, so a reason is required and the change is logged.' : ''}`,
                        confirmLabel: photo.id ? 'Reject Photo' : 'Reject Proof',
                        danger: true,
                        reasonLabel: 'Rejection reason',
                      },
                      (reason) =>
                        photo.id ? api.rejectCampaignPhoto(campaign.id, photo.id, reason) : api.rejectCampaignActivity(campaign.id, photo.activity_id, reason)
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
                                .catch((err) => toast.error(err.message))
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

      {tab === 'extensions' && <ExtensionsPanel campaign={campaign} onExtend={() => setShowExtension(true)} />}
      {tab === 'kit' && <BrandKitPanel campaignId={campaign.id} />}
      {tab === 'financials' && <FinancialsPanel campaignId={campaign.id} fulfillment={fulfillment} onChanged={reload} />}
      {tab === 'history' && <HistoryPanel campaign={campaign} />}

      {showSlots ? (
        <ReplacementSlotsDialog
          campaign={campaign}
          recommended={fulfillment?.recovery?.replacement_riders_needed}
          onClose={() => setShowSlots(false)}
          onSaved={() => {
            setShowSlots(false);
            reload();
          }}
        />
      ) : null}
      {showExtension ? (
        <ExtensionDialog
          campaign={campaign}
          fulfillment={fulfillment}
          onClose={() => setShowExtension(false)}
          onSaved={() => {
            setShowExtension(false);
            reload();
          }}
        />
      ) : null}
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
      {danger ? <DangerDialog {...danger} onClose={() => setDanger(null)} /> : null}
      {addingRider ? (
        <CampaignAddRiderModal
          campaign={campaign}
          currentRiderIds={riders.filter((r) => ['ACTIVE', 'ASSIGNED'].includes(r.status)).map((r) => r.rider.id)}
          onClose={() => setAddingRider(false)}
          onSaved={() => {
            setAddingRider(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
