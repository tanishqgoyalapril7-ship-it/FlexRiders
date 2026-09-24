import React, { useEffect, useState } from 'react';
import {
  Users,
  Clock,
  Bike,
  Megaphone,
  Wallet,
  CreditCard,
  CalendarDays,
  TrendingUp,
  UserPlus,
  UserCheck,
  UserX,
  Briefcase,
  Inbox,
  Camera,
  ShieldCheck,
  Bell,
  CircleDollarSign,
  ChevronRight,
} from 'lucide-react';
import { api } from '../services/api';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const dayMonth = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const dayMonthYear = (iso) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const asDate = (value) => new Date(/Z|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);

/** "13:08" today, "Yesterday", or "22 Sep". */
function feedTime(value) {
  if (!value) return '';
  const d = asDate(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

const STATUS = {
  ACTIVE: ['Active', 'dpill-green'],
  OPEN: ['Open', 'dpill-blue'],
  FULL: ['Full', 'dpill-amber'],
  PAUSED: ['Paused', 'dpill-gray'],
  COMPLETED: ['Completed', 'dpill-blue'],
  PAID: ['Paid', 'dpill-green'],
  PENDING: ['Pending', 'dpill-amber'],
  FAILED: ['Failed', 'dpill-red'],
  CANCELLED: ['Cancelled', 'dpill-gray'],
  PROCESSING: ['Processing', 'dpill-blue'],
};

const FEED_ICONS = {
  REGISTRATION: [UserPlus, '#2563EB', '#EFF6FF'],
  CAMPAIGN: [Megaphone, '#7C3AED', '#F5F3FF'],
  PAYMENT: [CircleDollarSign, '#059669', '#ECFDF5'],
  PHOTO: [Camera, '#16A34A', '#F0FDF4'],
  RIDER: [Users, '#2563EB', '#EFF6FF'],
  BRAND: [Briefcase, '#0891B2', '#ECFEFF'],
  ADMIN: [ShieldCheck, '#EA580C', '#FFF7ED'],
  SYSTEM: [Bell, '#475569', '#F1F5F9'],
};

function Kpi({ label, value, icon: Icon, color, bg, sub, subTone, onClick }) {
  return (
    <button type="button" className="dkpi" onClick={onClick} disabled={!onClick}>
      <div className="dkpi-top">
        <span className="dkpi-label">{label}</span>
        <span className="dkpi-icon" style={{ color, background: bg }}>
          <Icon size={17} />
        </span>
      </div>
      <span className="dkpi-value">{value}</span>
      <span className={`dkpi-sub ${subTone || ''}`}>{sub}</span>
    </button>
  );
}

function Pill({ status }) {
  const [label, cls] = STATUS[status] || [status, 'dpill-gray'];
  return <span className={`dpill ${cls}`}>{label}</span>;
}

function Empty({ icon: Icon, text, action, onAction }) {
  return (
    <div className="dempty">
      <span className="dempty-icon">
        <Icon size={20} />
      </span>
      <span>{text}</span>
      {action ? (
        <button className="btn-secondary" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}

function BrandMark({ name, logo }) {
  if (logo) return <img src={logo} alt={name} className="dbrand-logo" />;
  return <span className="dbrand-name">{name}</span>;
}

const fulfilColor = (pct) => (pct >= 75 ? '#16A34A' : pct >= 40 ? '#F59E0B' : '#EF4444');

/** Admin home. Every figure comes from GET /reports/operations (real records, existing rules). */
export function DashboardView({ onQuickAction, onOpenCampaign }) {
  const [ops, setOps] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () =>
      api
        .getOperationsOverview()
        .then((d) => {
          setOps(d);
          setError('');
        })
        .catch((err) => setError(err.message));
    load();
    const id = setInterval(() => document.visibilityState === 'visible' && load(), 15000);
    return () => clearInterval(id);
  }, []);

  const k = ops ? ops.kpis : null;
  const ra = ops ? ops.rider_activity : null;
  const pay = ops ? ops.payments : null;
  const dash = (v) => (ops ? v : '—');

  return (
    <div className="page-container dashboard">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your riders, campaigns and payments</p>
        </div>
        {ops ? (
          <span className="ddate">
            <CalendarDays size={15} /> {dayMonthYear(ops.today)}
          </span>
        ) : null}
      </div>

      {error ? <div className="form-error">Could not load the dashboard: {error}</div> : null}

      <div className="dkpi-row">
        <Kpi label="Total Riders" value={dash(k?.total_riders)} icon={Users} color="#2563EB" bg="#EFF6FF" sub={<><TrendingUp size={12} /> {k?.approved_riders ?? 0} approved</>} subTone="green" onClick={() => onQuickAction('all_riders')} />
        <Kpi label="Active Riders" value={dash(k?.active_riders)} icon={Bike} color="#16A34A" bg="#F0FDF4" sub={<><TrendingUp size={12} /> {k?.active_riders ?? 0} on duty</>} subTone="green" onClick={() => onQuickAction('all_riders')} />
        <Kpi
          label="Pending Approvals"
          value={dash(k?.pending_approvals)}
          icon={Clock}
          color="#F59E0B"
          bg="#FFFBEB"
          sub={k?.pending_approvals ? `${k.pending_approvals} awaiting review` : 'All caught up'}
          subTone="amber"
          onClick={() => onQuickAction('pending_riders')}
        />
        <Kpi
          label="Active Campaigns"
          value={dash(k?.active_campaigns)}
          icon={Megaphone}
          color="#7C3AED"
          bg="#F5F3FF"
          sub={<><span className="ddot" /> {k?.running_campaigns ?? 0} running</>}
          onClick={() => onQuickAction('campaigns')}
        />
        <Kpi
          label="Pending Payments"
          value={pay ? inr(pay.pending_payout) : '—'}
          icon={Wallet}
          color="#EA580C"
          bg="#FFF7ED"
          sub={pay && pay.pending_payout ? 'Earned, not yet paid' : 'All cleared'}
          subTone="amber"
          onClick={() => onQuickAction('payments')}
        />
        <Kpi label="Total Payments" value={pay ? inr(pay.total_paid) : '—'} icon={CreditCard} color="#2563EB" bg="#EFF6FF" sub={pay ? `${inr(pay.this_month)} this month` : ''} subTone="green" onClick={() => onQuickAction('payments')} />
      </div>

      <div className="drow-main">
        <section className="card dcard">
          <div className="dcard-head">
            <h2>Campaign Overview</h2>
            <button className="dlink" onClick={() => onQuickAction('campaigns')}>
              View all campaigns
            </button>
          </div>
          {!ops ? (
            <Empty icon={Megaphone} text="Loading campaigns…" />
          ) : ops.campaigns.length === 0 ? (
            <Empty icon={Megaphone} text="No active campaigns" action="Create Campaign" onAction={() => onQuickAction('campaigns')} />
          ) : (
            <div className="table-responsive">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Brand</th>
                    <th>Status</th>
                    <th className="num">Required Rider-Days</th>
                    <th className="num">Assigned Riders</th>
                    <th className="num">Delivered Rider-Days</th>
                    <th>Fulfillment</th>
                    <th>Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.campaigns.map((c) => (
                    <tr key={c.id} className="drow-click" onClick={() => onOpenCampaign(c.id)}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>
                        <BrandMark name={c.brand} logo={c.brand_logo} />
                      </td>
                      <td>
                        <Pill status={c.status} />
                      </td>
                      <td className="num">{c.contracted_rider_days}</td>
                      <td className="num">
                        {c.assigned_riders}
                        <span className="dmuted"> / {c.required_riders}</span>
                      </td>
                      <td className="num">{c.delivered_rider_days}</td>
                      <td>
                        <span className="dpct">{Math.round(c.fulfillment_pct)}%</span>
                        <div className="dbar">
                          <div style={{ width: `${Math.min(c.fulfillment_pct, 100)}%`, background: fulfilColor(c.fulfillment_pct) }} />
                        </div>
                      </td>
                      <td className="ddates">
                        {dayMonth(c.start_date)} –<br />
                        {dayMonthYear(c.end_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card dcard">
          <div className="dcard-head">
            <h2>Rider Activity (Today)</h2>
          </div>
          <div className="dtiles">
            {[
              [Bike, '#16A34A', '#F0FDF4', 'Active Riders Today', ra?.active_today, 'On duty', 'all_riders'],
              [UserCheck, '#16A34A', '#F0FDF4', 'Activity Submitted', ra?.submitted_today, `${ra?.completed_today ?? 0} completed 3/3`, null],
              [UserX, '#DC2626', '#FEF2F2', 'Missing Activity', ra?.missing_today, 'Yet to submit', null],
              [Clock, '#F59E0B', '#FFFBEB', 'Pending Approvals', ra?.pending_join_requests, 'New join requests', 'join_requests'],
            ].map(([Icon, color, bg, label, value, sub, action]) => (
              <button type="button" key={label} className="dtile" onClick={action ? () => onQuickAction(action) : undefined} disabled={!action}>
                <span className="dtile-icon" style={{ color, background: bg }}>
                  <Icon size={17} />
                </span>
                <span className="dtile-body">
                  <span className="dtile-label">{label}</span>
                  <span className="dtile-value">{ra ? value : '—'}</span>
                  <span className="dtile-sub">{sub}</span>
                </span>
              </button>
            ))}
          </div>
          {ra && ra.missing.length ? (
            <div className="dmissing">
              <span className="dsub-title">Yet to submit today</span>
              {ra.missing.map((m) => (
                <button type="button" key={`${m.rider_id}-${m.campaign_id}`} className="dmissing-row" onClick={() => onOpenCampaign(m.campaign_id)}>
                  <span>
                    <strong>{m.rider}</strong> <span className="dmuted">{m.rider_id}</span>
                  </span>
                  <span className="dmuted">{m.campaign}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <div className="drow-bottom">
        <section className="card dcard">
          <div className="dcard-head">
            <h2>Payments Overview</h2>
            <button className="dlink" onClick={() => onQuickAction('payments')}>
              View all payments
            </button>
          </div>
          <div className="dpay-tiles">
            {[
              ['Total Paid', pay ? inr(pay.total_paid) : '—', 'All time', 'green'],
              ['Pending Payout', pay ? inr(pay.pending_payout) : '—', pay && pay.pending_payout ? 'Earned, unpaid' : 'All cleared', 'amber'],
              ["Today's Payouts", pay ? inr(pay.paid_today) : '—', `${pay?.paid_today_count ?? 0} transactions`, 'blue'],
              ['Failed Payouts', pay ? inr(pay.failed_amount) : '—', `${pay?.failed_count ?? 0} transactions`, 'red'],
            ].map(([label, value, sub, tone]) => (
              <div key={label} className="dpay-tile">
                <span className="dtile-label">{label}</span>
                <span className="dpay-value">{value}</span>
                <span className={`dkpi-sub ${tone}`}>{sub}</span>
              </div>
            ))}
          </div>
          <div className="dsubcard">
            <span className="dsub-title">Recent Payout Transactions</span>
            <table className="dtable dtable-sm">
              <thead>
                <tr>
                  <th>Rider</th>
                  <th>Campaign</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {pay && pay.recent.length
                  ? pay.recent.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.rider}</strong>
                        </td>
                        <td className="dmuted">{p.for}</td>
                        <td>
                          <strong>{inr(p.amount)}</strong>
                        </td>
                        <td>
                          <Pill status={p.status} />
                        </td>
                        <td className="dmuted">{p.date ? dayMonth(p.date) : ''}</td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
            {pay && pay.recent.length === 0 ? <Empty icon={Inbox} text="No payout transactions found." /> : null}
          </div>
        </section>

        <section className="card dcard">
          <div className="dcard-head">
            <h2>Recent Activity</h2>
            <button className="dlink" onClick={() => onQuickAction('notifications')}>
              View all
            </button>
          </div>
          {!ops ? (
            <Empty icon={Bell} text="Loading…" />
          ) : ops.activity.length === 0 ? (
            <Empty icon={Bell} text="No activity yet" />
          ) : (
            <div className="dfeed">
              {ops.activity.map((e, i) => {
                const [Icon, color, bg] = FEED_ICONS[e.kind] || FEED_ICONS.SYSTEM;
                return (
                  <div key={i} className="dfeed-row">
                    <span className="dfeed-icon" style={{ color, background: bg }}>
                      <Icon size={15} />
                    </span>
                    <span className="dfeed-title">{e.title}</span>
                    <span className="dfeed-time">{feedTime(e.at)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="card dcard">
          <div className="dcard-head">
            <h2>Quick Actions</h2>
          </div>
          <div className="dquick">
            {[
              [UserPlus, '#2563EB', '#EFF6FF', 'Add New Rider', 'add_rider'],
              [Briefcase, '#16A34A', '#F0FDF4', 'Create Brand', 'create_brand'],
              [Megaphone, '#7C3AED', '#F5F3FF', 'Create Campaign', 'campaigns'],
              [Users, '#EA580C', '#FFF7ED', 'Review Join Requests', 'join_requests'],
              [CreditCard, '#2563EB', '#EFF6FF', 'View All Payments', 'payments'],
            ].map(([Icon, color, bg, label, action]) => (
              <button key={label} type="button" className="dquick-row" onClick={() => onQuickAction(action)}>
                <span className="dquick-icon" style={{ color, background: bg }}>
                  <Icon size={17} />
                </span>
                <span>{label}</span>
                <ChevronRight size={16} className="dquick-arrow" />
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
