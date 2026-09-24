import React from 'react';

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
