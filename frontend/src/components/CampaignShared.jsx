import React from 'react';

// Rider vehicle types (value, label, description). The backend enforces the same list.
export const VEHICLE_TYPES = [
  ['CYCLE', 'Cycle', 'Bicycle or pedal cycle'],
  ['TWO_WHEELER', 'Bike / Two Wheeler', 'Motorbike or scooter'],
  ['AUTO', 'Auto', 'Passenger auto-rickshaw'],
  ['THREE_WHEELER', 'Three Wheeler', 'Cargo / loader or other non-passenger three-wheeler'],
];
export const vehicleLabel = (value) => (VEHICLE_TYPES.find(([v]) => v === value) || [])[1] || '';

// Campaign categories are labels for grouping and filtering; they add no workflow.
export const CAMPAIGN_CATEGORIES = [
  ['STANDARD', 'Standard'],
  ['BIKE', 'Bike'],
  ['CYCLE', 'Cycle'],
  ['AUTO', 'Auto'],
  ['TV', 'TV'],
  ['GOOGLE', 'Google'],
  ['BRAND_PARTNERSHIP', 'Brand Partnership'],
  ['OTHER', 'Other'],
];

export const CAMPAIGN_STATUSES = ['DRAFT', 'OPEN', 'FULL', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

const STATUS_LABELS = {
  OPEN: 'Public / Open',
  UNDER_REVIEW: 'Under Review',
};

export const formatINR = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const formatDate = (value, withYear = true) =>
  value
    ? new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
    : '—';

export const formatDateRange = (start, end) => `${formatDate(start, false)} – ${formatDate(end)}`;

export function StatusPill({ status, label }) {
  if (!status) return null;
  return (
    <span className={`status-pill pill-${status.toLowerCase()}`}>
      {label || STATUS_LABELS[status] || status.replace('_', ' ')}
    </span>
  );
}

/** Campaign status as riders and brands see it: Open for Joining → Live → Completed. */
export function CampaignStatusPill({ campaign }) {
  const key = campaign.lifecycle && campaign.lifecycle.key;
  let label;
  if (key === 'LIVE') label = 'Live';
  else if (key === 'OPEN') label = campaign.status === 'FULL' ? 'Full · Not Live' : 'Open for Joining';
  else if (key === 'COMPLETED' && campaign.status !== 'COMPLETED') label = 'Ended';
  return <StatusPill status={campaign.status} label={label} />;
}

export function SlotProgress({ used, total }) {
  const percent = total ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="slot-progress">
      <span className="slot-progress-label">
        {used} / {total} riders
      </span>
      <div className="slot-progress-track">
        <div className={`slot-progress-fill ${used >= total ? 'full' : ''}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function StatCard({ title, value, icon: Icon, color = '#2563EB', background = '#EFF6FF', hint }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <span className="stat-card-title">{title}</span>
        {Icon ? (
          <div className="stat-icon-wrapper" style={{ background, color }}>
            <Icon size={18} />
          </div>
        ) : null}
      </div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="stat-trend trend-neutral" style={{ color: '#64748B', fontWeight: 500 }}>{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, children }) {
  return (
    <div className="empty-state">
      {Icon ? <Icon size={28} color="#CBD5E1" /> : null}
      <span>{children}</span>
    </div>
  );
}

const SLOT_STATE = {
  APPROVED: { text: '✓', label: 'Approved', color: '#047857' },
  PENDING: { text: 'Pending', label: 'In review', color: '#1D4ED8' },
  REJECTED: { text: 'Rejected', label: 'Rejected', color: '#B91C1C' },
  NOT_STARTED: { text: '—', label: 'Not taken', color: '#94A3B8' },
};

/** Morning / Evening / Night photo status for one day. */
export function SlotStatuses({ slots, inline }) {
  if (!slots) return null;
  return (
    <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: inline ? 10 : 2, fontSize: '0.74rem', flexWrap: 'wrap' }}>
      {slots.map((s) => {
        const state = SLOT_STATE[s.status] || SLOT_STATE.NOT_STARTED;
        return (
          <span key={s.slot} title={`${s.label}: ${state.label}${s.rejection_reason ? ` (${s.rejection_reason})` : ''}`}>
            <span style={{ color: '#64748B' }}>{inline ? s.label.charAt(0) : s.label}:</span>{' '}
            <strong style={{ color: state.color }}>{state.text}</strong>
          </span>
        );
      })}
    </div>
  );
}
