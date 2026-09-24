import React, { useState } from 'react';

export function RegistrationsBarChart({ data = [] }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const chartData = data.length > 0 ? data : [
    { date: '16 Sep', count: 0 },
    { date: '17 Sep', count: 0 },
    { date: '18 Sep', count: 0 },
    { date: '19 Sep', count: 0 },
    { date: '20 Sep', count: 0 },
    { date: '21 Sep', count: 0 },
    { date: '22 Sep', count: 0 },
  ];
  const maxVal = Math.max(...chartData.map((d) => d.count), 10);

  return (
    <div className="card">
      <div className="card-header-bar">
        <span className="card-title-text">Rider Registrations</span>
        <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Last 7 Days</span>
      </div>

      <div className="bar-chart-container">
        {chartData.map((item, idx) => {
          const heightPercent = item.count > 0 ? Math.max((item.count / maxVal) * 100, 14) : 8;
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={idx}
              className="bar-col"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: '#2563EB',
                    marginBottom: '2px',
                  }}
                >
                  {item.count}
                </div>
              )}
              <div
                className="bar-pill"
                style={{
                  height: `${heightPercent}%`,
                  background: item.count > 0
                    ? isHovered
                      ? 'linear-gradient(180deg, #60A5FA 0%, #2563EB 100%)'
                      : 'linear-gradient(180deg, #3B82F6 0%, #1D4ED8 100%)'
                    : '#E2E8F0',
                }}
              />
              <span className="bar-label">{item.date}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PaymentsOverviewChart({ data = [] }) {
  const points = data.length > 0 ? data : [
    { date: '16 Sep', paid: 0, pending: 0, failed: 0 },
    { date: '17 Sep', paid: 0, pending: 0, failed: 0 },
    { date: '18 Sep', paid: 0, pending: 0, failed: 0 },
    { date: '19 Sep', paid: 0, pending: 0, failed: 0 },
    { date: '20 Sep', paid: 0, pending: 0, failed: 0 },
    { date: '21 Sep', paid: 0, pending: 0, failed: 0 },
    { date: '22 Sep', paid: 0, pending: 0, failed: 0 },
  ];

  const width = 440;
  const height = 150;
  const paddingX = 30;
  const paddingY = 20;

  const maxVal = Math.max(...points.map((p) => Math.max(p.paid || 0, p.pending || 0, p.failed || 0)), 10000);
  const getX = (idx) => paddingX + (idx / (points.length - 1)) * (width - 2 * paddingX);
  const getY = (val) => height - paddingY - (val / maxVal) * (height - 2 * paddingY);

  const paidPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.paid || 0)}`).join(' ');
  const pendingPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.pending || 0)}`).join(' ');
  const failedPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.failed || 0)}`).join(' ');

  return (
    <div className="card">
      <div className="card-header-bar">
        <span className="card-title-text">Payments Overview</span>
        <div style={{ display: 'flex', gap: '14px', fontSize: '0.74rem', fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10B981' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981' }} />
            Paid
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#F59E0B' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
            Pending
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#EF4444' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#EF4444' }} />
            Failed
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', height: '180px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Gridlines */}
          <line x1={paddingX} y1={getY(2500)} x2={width - paddingX} y2={getY(2500)} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={paddingX} y1={getY(5000)} x2={width - paddingX} y2={getY(5000)} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />
          <line x1={paddingX} y1={getY(7500)} x2={width - paddingX} y2={getY(7500)} stroke="#F1F5F9" strokeWidth="1" strokeDasharray="3 3" />

          {/* Lines */}
          <path d={paidPath} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
          <path d={pendingPath} fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="4 2" strokeLinecap="round" />
          <path d={failedPath} fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" />

          {/* Dots on Paid line */}
          {points.map((p, i) => (
            <circle key={i} cx={getX(i)} cy={getY(p.paid || 0)} r="3.5" fill="#10B981" stroke="#ffffff" strokeWidth="1.5" />
          ))}
        </svg>

        {/* Date Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', marginTop: '-12px' }}>
          {points.map((p, i) => (
            <span key={i} style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{p.date}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BrandDonutChart({ data = [] }) {
  const brands = data;

  const totalRiders = brands.reduce((acc, curr) => acc + (curr.rider_count || 0), 0);
  const colors = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

  return (
    <div className="card">
      <div className="card-header-bar">
        <span className="card-title-text">Brand-wise Fleet Allocation</span>
        <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600 }}>Active Fleet</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', padding: '10px 0' }}>
        {/* SVG Donut */}
        <div style={{ position: 'relative', width: '130px', height: '130px' }}>
          <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="18" cy="18" r="14" fill="none" stroke="#F1F5F9" strokeWidth="4" />
            {totalRiders > 0 &&
              brands.map((b, idx) => {
                const percent = (b.rider_count / totalRiders) * 100;
                const dashOffset = brands.slice(0, idx).reduce((acc, prev) => acc + (prev.rider_count / totalRiders) * 100, 0);
                return (
                  <circle
                    key={idx}
                    cx="18"
                    cy="18"
                    r="14"
                    fill="none"
                    stroke={colors[idx % colors.length]}
                    strokeWidth="4"
                    strokeDasharray={`${percent} ${100 - percent}`}
                    strokeDashoffset={-dashOffset}
                  />
                );
              })}
          </svg>
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{totalRiders}</div>
            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Riders</div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {brands.length === 0 && (
            <span style={{ fontSize: '0.78rem', color: '#64748B' }}>No brands yet</span>
          )}
          {brands.map((b, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: colors[idx % colors.length] }} />
              <span style={{ color: '#334155', fontWeight: 600 }}>{b.brand_name}</span>
              <span style={{ color: '#64748B', marginLeft: 'auto', fontWeight: 700 }}>
                {b.rider_count || 0}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
