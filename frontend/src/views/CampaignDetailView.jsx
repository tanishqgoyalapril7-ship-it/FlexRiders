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
  Map as MapIcon,
  Eye,
  EyeOff,
  PauseCircle,
  XCircle,
  Flag,
  Image as ImageIcon,
  Inbox,
  Radio,
  Share2,
  Link2,
  Copy,
  ExternalLink,
  MapPin,
  Bike,
} from 'lucide-react';
import { api } from '../services/api';
import { CampaignAddRiderModal } from '../components/AdminCrud';
import { DangerDialog, toast } from '../components/Feedback';
import { JoinRequestsTable } from '../components/JoinRequests';
// The map (Leaflet) only loads when an admin opens a route.
const RouteMapModal = React.lazy(() => import('../components/RouteMap').then((m) => ({ default: m.RouteMapModal })));
import { ConfirmDialog, CampaignFormModal, PhotoLightbox, PhotoReviewCard, RiderActivityModal } from '../components/CampaignModals';
import { CampaignStatusPill, EmptyState, SlotProgress, SlotStatuses, StatCard, StatusPill, VEHICLE_TYPES, formatDate, formatINR, vehicleLabel } from '../components/CampaignShared';
import { TermsPanel } from '../components/CampaignTerms';
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
  ['terms', 'Terms'],
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
  if (campaign.live_at && ['OPEN', 'FULL', 'ACTIVE'].includes(campaign.status)) {
    return (
      <div className="visibility-banner visibility-shown" role="status">
        <Radio size={18} />
        <div style={{ flex: 1 }}>
          <strong>Live since {formatDate(campaign.live_at)}.</strong> Joining is closed for new riders; the{' '}
          {campaign.stats.assigned_riders} approved rider{campaign.stats.assigned_riders === 1 ? '' : 's'} continue with their daily photo slots.
          You can still add a replacement rider from the Riders tab.
        </div>
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

const matchesVehicle = (rider, filter) => filter === 'ALL' || (filter === 'NONE' ? !rider.vehicle_category : rider.vehicle_category === filter);

function VehicleFilter({ value, onChange }) {
  return (
    <select className="form-input" style={{ width: 'auto' }} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Vehicle type">
      <option value="ALL">All vehicles</option>
      {VEHICLE_TYPES.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
      <option value="NONE">Type not set</option>
    </select>
  );
}

const publicUrl = (campaign) => `${window.location.origin}/campaign/${campaign.public_slug}`;

/** Shareable public page for the brand: turn it on, then copy / share / open the link. */
function ShareCampaignCard({ campaign, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(null);
  const link = url || (campaign.public_slug ? publicUrl(campaign) : '');
  const setEnabled = async (enabled) => {
    setBusy(true);
    try {
      const res = await api.shareCampaign(campaign.id, enabled);
      setUrl(res.url);
      toast.success(enabled ? 'Public campaign page is on. Share the link with the brand.' : 'Public campaign page turned off.');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  // The public page shows the banner only after an admin confirms FlexRiders may use it publicly.
  const setBannerApproved = async (approved) => {
    setBusy(true);
    try {
      const fields = ['name', 'brand_id', 'start_date', 'end_date', 'total_slots', 'daily_rate'];
      await api.updateCampaign(campaign.id, { ...Object.fromEntries(fields.map((f) => [f, campaign[f]])), public_image_approved: approved });
      toast.success(approved ? 'Banner will show on the public page.' : 'Banner hidden from the public page.');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link copied.');
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: campaign.name, text: `${campaign.name} on FlexRiders`, url: link });
      } catch {
        /* Share sheet closed */
      }
    } else {
      copy();
    }
  };
  if (campaign.status === 'DRAFT') return null;
  return (
    <div className="share-card">
      <div className="share-card-icon">
        <Share2 size={18} />
      </div>
      <div className="share-card-body">
        <strong>Share Campaign</strong>
        {campaign.public_share_enabled ? (
          <>
            <span className="share-link" title={link}>
              <Link2 size={13} /> {link}
            </span>
            {campaign.image_url ? (
              <label className="share-rights">
                <input type="checkbox" checked={campaign.public_image_approved} disabled={busy} onChange={(e) => setBannerApproved(e.target.checked)} />
                Show the campaign banner on the public page (we have the rights to it)
              </label>
            ) : null}
          </>
        ) : (
          <span>Give the brand a public page with this campaign’s details. No rider, payout or internal data is shown.</span>
        )}
      </div>
      <div className="row-actions">
        {campaign.public_share_enabled ? (
          <>
            <button className="btn-secondary" onClick={copy}>
              <Copy size={14} /> Copy Link
            </button>
            <button className="btn-secondary" onClick={share}>
              <Share2 size={14} /> Share Link
            </button>
            <a className="btn-secondary" href={link} target="_blank" rel="noreferrer">
              <ExternalLink size={14} /> Open Public Page
            </a>
            <button className="card-action-link" disabled={busy} onClick={() => setEnabled(false)}>
              Turn off
            </button>
          </>
        ) : (
          <button className="btn-primary" disabled={busy} onClick={() => setEnabled(true)}>
            <Link2 size={14} /> {busy ? 'Creating…' : 'Create Public Link'}
          </button>
        )}
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
  const [routeFor, setRouteFor] = useState(null); // assignment row, or 'ALL'
  const [fulfillment, setFulfillment] = useState(null);
  const [ridersAvailable, setRidersAvailable] = useState('');
  const [showSlots, setShowSlots] = useState(false);
  const [showExtension, setShowExtension] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState('ALL');
  const [requestStatus, setRequestStatus] = useState('ALL');

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
    // Refresh while visible (each refresh is several remote database round trips).
    const interval = setInterval(() => document.visibilityState === 'visible' && load(), 20000);
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
                <CampaignStatusPill campaign={campaign} />
                <span className="status-pill pill-draft">{campaign.campaign_category_label}</span>
                {campaign.terms_version ? <span className="status-pill pill-open">Terms v{campaign.terms_version}</span> : null}
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
                {campaign.location_area ? (
                  <span>
                    <MapPin size={15} />
                    {campaign.location_area}
                  </span>
                ) : null}
                <span>
                  <Bike size={15} />
                  {campaign.eligible_vehicle_label}
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
              {published && !campaign.live_at && (
                <button
                  className="btn-primary"
                  onClick={() =>
                    statusAction(
                      'go-live',
                      'Go Live',
                      `New riders will no longer be able to join. Every approved rider (${s.assigned_riders}) gets a “Campaign is now LIVE” notification. ` +
                        `It also goes live automatically on ${formatDate(campaign.start_date)}. Pending join requests can still be approved.`
                    )
                  }
                >
                  <Radio size={15} />
                  Go Live
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
      <ShareCampaignCard campaign={campaign} onChanged={load} />

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
            <VehicleFilter value={vehicleFilter} onChange={setVehicleFilter} />
            <button className="btn-secondary" onClick={() => setRouteFor('ALL')} style={{ marginLeft: 'auto', marginRight: 8 }}>
              <MapIcon size={15} /> <span>View All Rider Routes</span>
            </button>
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
                {riders.filter((r) => matchesVehicle(r.rider, vehicleFilter)).map((r) => (
                  <tr key={r.assignment_id}>
                    <td>
                      <strong>{r.rider.full_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{r.rider.rider_id}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        {r.rider.mobile_number} · Joined {formatDate(r.joined_at)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{vehicleLabel(r.rider.vehicle_category) || 'Vehicle type not set'}</div>
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
                            {r.today_photos.completed ? ' · Photo-Day completed' : ''}
                          </strong>
                          <SlotStatuses slots={r.today_photos.slots} />
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
                        <button className="btn-sm-view" onClick={() => setRouteFor(r)}>
                          View Route
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
          <div className="card-header-bar" style={{ gap: 12, flexWrap: 'wrap' }}>
            <span className="card-title-text">Join Requests</span>
            <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{s.remaining_slots} slots available</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto' }}>
              <select className="form-input" style={{ width: 'auto' }} value={requestStatus} onChange={(e) => setRequestStatus(e.target.value)} aria-label="Request status">
                <option value="ALL">All statuses</option>
                <option value="REQUESTED">Pending approval</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="WITHDRAWN">Withdrawn</option>
              </select>
              <VehicleFilter value={vehicleFilter} onChange={setVehicleFilter} />
            </div>
          </div>
          <JoinRequestsTable
            requests={applications.filter((a) => (requestStatus === 'ALL' || a.status === requestStatus) && matchesVehicle(a.rider, vehicleFilter))}
            campaignRiders={riders}
            onChanged={reload}
          />
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
              Earned = approved Photo-Days (Morning, Evening and Night all approved) × daily rate. Same figures as the rider app.
            </span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>UPI ID</th>
                  <th>Campaign</th>
                  <th>Approved Photo-Days</th>
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
                      <div style={{ marginTop: 4 }}>
                        <StatusPill status={p.assignment_status} />
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      {p.rider.upi_id ? <code className="confirm-code">{p.rider.upi_id}</code> : <span style={{ color: '#B45309' }}>Not on file</span>}
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{campaign.name}</td>
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
      {tab === 'terms' && <TermsPanel campaignId={campaign.id} />}
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
      {routeFor ? (
        <React.Suspense fallback={null}>
          <RouteMapModal campaign={campaign} assignment={routeFor === 'ALL' ? null : routeFor} onClose={() => setRouteFor(null)} />
        </React.Suspense>
      ) : null}
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
