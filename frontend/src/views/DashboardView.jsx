import React from 'react';
import {
  Users,
  Clock,
  UserCheck,
  Bike,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  PlusCircle,
  Briefcase,
  FileSpreadsheet,
  CreditCard,
  Download,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { RegistrationsBarChart, PaymentsOverviewChart, BrandDonutChart } from '../components/Charts';

export function DashboardView({
  dashboardData,
  notifications = [],
  onViewRider,
  onApproveRider,
  onRejectRider,
  onQuickAction,
  onDownloadReport,
}) {
  const stats = dashboardData?.stats || {
    total_riders: 0,
    pending_approvals: 0,
    approved_riders: 0,
    active_riders: 0,
    suspended_riders: 0,
    total_payments: 0,
    pending_payments: 0,
    today_payments: 0,
    growth_riders: 0.0,
    growth_active: 0.0,
    growth_payments: 0.0,
  };

  const pendingRiders = dashboardData?.pending_riders || [];
  const recentRegistrations = dashboardData?.recent_registrations || [];
  const recentPayments = dashboardData?.recent_payments || [];
  const monthlyReport = dashboardData?.monthly_report || {
    this_month: 0,
    last_month: 0,
    last_3_months: 0,
    growth: 0.0,
  };

  return (
    <div className="page-container">
      {/* Page Title */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your riders, brands and payments</p>
        </div>
      </div>

      {/* Row 1: 5 Rider KPI Cards */}
      <div className="stats-grid-5">
        {/* Total Riders */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Total Riders</span>
            <div className="stat-icon-wrapper" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <Users size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.total_riders}</div>
          <div className={`stat-trend ${stats.total_riders > 0 ? 'trend-up' : 'trend-neutral'}`}>
            {stats.total_riders > 0 && <TrendingUp size={13} />}
            <span>{stats.total_riders > 0 ? `${stats.total_riders} registered` : '0%'}</span>
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Pending Approvals</span>
            <div className="stat-icon-wrapper" style={{ background: '#FFFBEB', color: '#D97706' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.pending_approvals}</div>
          <div className={`stat-trend ${stats.pending_approvals > 0 ? 'trend-down' : 'trend-neutral'}`}>
            <span>{stats.pending_approvals > 0 ? `${stats.pending_approvals} awaiting action` : '0%'}</span>
          </div>
        </div>

        {/* Approved Riders */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Approved Riders</span>
            <div className="stat-icon-wrapper" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <UserCheck size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.approved_riders}</div>
          <div className={`stat-trend ${stats.approved_riders > 0 ? 'trend-up' : 'trend-neutral'}`}>
            {stats.approved_riders > 0 && <TrendingUp size={13} />}
            <span>{stats.approved_riders > 0 ? `${stats.approved_riders} approved` : '0%'}</span>
          </div>
        </div>

        {/* Active Riders */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Active Riders</span>
            <div className="stat-icon-wrapper" style={{ background: '#ECFDF5', color: '#059669' }}>
              <Bike size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.active_riders}</div>
          <div className={`stat-trend ${stats.active_riders > 0 ? 'trend-up' : 'trend-neutral'}`}>
            {stats.active_riders > 0 && <TrendingUp size={13} />}
            <span>{stats.active_riders > 0 ? `${stats.active_riders} on duty` : '0%'}</span>
          </div>
        </div>

        {/* Suspended Riders */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Suspended Riders</span>
            <div className="stat-icon-wrapper" style={{ background: '#FEF2F2', color: '#EF4444' }}>
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="stat-value">{stats.suspended_riders}</div>
          <div className="stat-trend trend-neutral">
            <span>{stats.suspended_riders > 0 ? `${stats.suspended_riders} suspended` : '0%'}</span>
          </div>
        </div>
      </div>

      {/* Row 2: 3 Financial Cards */}
      <div className="stats-grid-3">
        {/* Total Payments */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Total Payments</span>
            <div className="stat-icon-wrapper" style={{ background: '#EFF6FF', color: '#2563EB' }}>
              <CreditCard size={18} />
            </div>
          </div>
          <div className="stat-value">₹{stats.total_payments.toLocaleString('en-IN')}</div>
          <div className={`stat-trend ${stats.total_payments > 0 ? 'trend-up' : 'trend-neutral'}`}>
            {stats.total_payments > 0 && <TrendingUp size={13} />}
            <span>{stats.total_payments > 0 ? 'Live ledger' : '₹0.00 settled'}</span>
          </div>
        </div>

        {/* Pending Payments */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Pending Payments</span>
            <div className="stat-icon-wrapper" style={{ background: '#FFFBEB', color: '#D97706' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="stat-value">₹{stats.pending_payments.toLocaleString('en-IN')}</div>
          <div className="stat-trend trend-neutral">
            <span>{stats.pending_payments > 0 ? `₹${stats.pending_payments.toLocaleString('en-IN')} pending` : 'All cleared'}</span>
          </div>
        </div>

        {/* Today's Payments */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-card-title">Today's Payments</span>
            <div className="stat-icon-wrapper" style={{ background: '#ECFDF5', color: '#10B981' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="stat-value">₹{stats.today_payments.toLocaleString('en-IN')}</div>
          <div className={`stat-trend ${stats.today_payments > 0 ? 'trend-up' : 'trend-neutral'}`}>
            {stats.today_payments > 0 && <TrendingUp size={13} />}
            <span>{stats.today_payments > 0 ? `₹${stats.today_payments.toLocaleString('en-IN')} today` : '₹0 today'}</span>
          </div>
        </div>
      </div>

      {/* Row 3: Middle Grid (Charts + Right Side Widgets) */}
      <div className="dashboard-middle-grid">
        {/* Left: Charts Column */}
        <div className="charts-column">
          <RegistrationsBarChart data={dashboardData?.registration_chart} />

          <div className="charts-row-split">
            <PaymentsOverviewChart data={dashboardData?.payments_chart} />
            <BrandDonutChart data={dashboardData?.brand_distribution} />
          </div>
        </div>

        {/* Right: Side Widgets Column */}
        <div className="side-widgets-column">
          {/* Pending Approvals Widget */}
          <div className="card">
            <div className="card-header-bar">
              <span className="card-title-text">Pending Approvals</span>
              <span className="card-action-link" onClick={() => onQuickAction('pending_riders')}>
                View all
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pendingRiders.slice(0, 5).map((r) => (
                <div key={r.id} className="pending-rider-card">
                  <div className="pending-rider-info">
                    <span className="pending-rider-id">{r.rider_id}</span>
                    <span className="pending-rider-name">{r.full_name}</span>
                    <span className="pending-rider-meta">
                      {r.current_company || 'Independent'} • {r.primary_city}
                    </span>
                  </div>
                  <div className="pending-rider-actions">
                    <button className="btn-sm-view" onClick={() => onViewRider(r)}>
                      View
                    </button>
                    <button className="btn-sm-approve" onClick={() => onApproveRider(r.id)}>
                      Approve
                    </button>
                    <button className="btn-sm-reject" onClick={() => onRejectRider(r.id)}>
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="card">
            <div className="card-header-bar">
              <span className="card-title-text">Quick Actions</span>
            </div>
            <div>
              <button className="quick-action-btn" onClick={() => onQuickAction('add_rider')}>
                <PlusCircle size={18} color="#2563EB" />
                <span>Add New Rider</span>
              </button>
              <button className="quick-action-btn" onClick={() => onQuickAction('create_brand')}>
                <Briefcase size={18} color="#10B981" />
                <span>Create Brand</span>
              </button>
              <button className="quick-action-btn" onClick={() => onQuickAction('reports')}>
                <FileSpreadsheet size={18} color="#F59E0B" />
                <span>Generate Report</span>
              </button>
              <button className="quick-action-btn" onClick={() => onQuickAction('payments')}>
                <CreditCard size={18} color="#8B5CF6" />
                <span>View All Payments</span>
              </button>
            </div>
          </div>

          {/* Recent Notifications Widget */}
          <div className="card">
            <div className="card-header-bar">
              <span className="card-title-text">Recent Notifications</span>
              <span className="card-action-link" onClick={() => onQuickAction('notifications')}>
                View all
              </span>
            </div>
            <div>
              {notifications && notifications.length > 0 ? (
                notifications.slice(0, 5).map((n) => (
                  <div key={n.id} className="notif-row">
                    <div className="notif-icon-circle" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                      <Users size={14} />
                    </div>
                    <div className="notif-content-text">
                      <span className="notif-title-row">{n.title}: {n.message}</span>
                      <span className="notif-time-ago">
                        {n.created_at ? new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                  No notifications yet. Real-time alerts will appear here as riders register and payments are made.
                </div>
              )}
            </div>
          </div>

          {/* Monthly Payment Report Card */}
          <div className="card" style={{ background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)', color: '#FFFFFF' }}>
            <div className="card-header-bar" style={{ marginBottom: '12px' }}>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#FFFFFF' }}>Monthly Payment Report</span>
              <button
                className="btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.72rem', background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', borderColor: 'transparent' }}
                onClick={onDownloadReport}
              >
                <Download size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                Download Report
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px', marginTop: '10px' }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>This Month</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#38BDF8' }}>₹{monthlyReport.this_month?.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: '0.68rem', color: (monthlyReport.growth || 0) >= 0 ? '#34D399' : '#EF4444', marginTop: '2px' }}>
                  {monthlyReport.growth > 0 ? `↑ ${monthlyReport.growth}%` : '0%'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Last Month</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>₹{monthlyReport.last_month?.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Last 3 Months</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>₹{monthlyReport.last_3_months?.toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Bottom Tables Row (Recent Registrations & Recent Payments) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Recent Rider Registrations Table */}
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Recent Rider Registrations</span>
            <span className="card-action-link" onClick={() => onQuickAction('all_riders')}>
              View all riders
            </span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider ID</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentRegistrations.slice(0, 6).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong style={{ color: '#2563EB', fontSize: '0.78rem' }}>{r.rider_id}</strong>
                    </td>
                    <td>{r.full_name}</td>
                    <td>{r.current_company || 'Independent'}</td>
                    <td>{r.primary_city}</td>
                    <td>
                      <span className={`status-pill pill-${r.status?.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>
                      <button className="btn-sm-view" onClick={() => onViewRider(r)}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Payments Table */}
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">Recent Payments</span>
            <span className="card-action-link" onClick={() => onQuickAction('payments')}>
              View all payments
            </span>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Brand</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.slice(0, 6).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div>
                        <strong>{p.rider_name}</strong>
                        <div style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{p.rider_sr_id}</div>
                      </div>
                    </td>
                    <td>{p.brand_name || '-'}</td>
                    <td>
                      <strong>₹{p.amount?.toLocaleString('en-IN')}</strong>
                    </td>
                    <td style={{ fontSize: '0.76rem', color: '#64748B' }}>
                      {new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <span className={`status-pill pill-${p.status?.toLowerCase()}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
