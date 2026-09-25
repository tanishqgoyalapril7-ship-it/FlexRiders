import logoLight from '../assets/fr-mark-light.png';
import React, { useState } from 'react';
import {
  Inbox,
  LayoutDashboard,
  Users,
  Briefcase,
  Layers,
  CreditCard,
  Bell,
  BarChart3,
  HelpCircle,
  ShieldCheck,
  UserCog,
  Settings,
  ChevronDown,
  ChevronRight,
  Megaphone,
  X,
} from 'lucide-react';

export default function Sidebar({ open = false, onClose, activeView, setActiveView, riderFilter, setRiderFilter, paymentFilter, setPaymentFilter, pendingCount = 0, campaignRequestCount = 0 }) {
  const [ridersOpen, setRidersOpen] = useState(true);
  const [paymentsOpen, setPaymentsOpen] = useState(false);

  const handleRiderNav = (sub) => {
    setActiveView('riders');
    setRiderFilter(sub);
  };

  const handlePaymentNav = (sub) => {
    setActiveView('payments');
    setPaymentFilter(sub);
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      {/* Brand Header */}
      <div className="sidebar-header">
        <img src={logoLight} alt="FlexRiders" className="brand-logo-img" />
        <div className="brand-text">
          <span className="brand-title">
            FLEX<span style={{ color: '#3B9EFF' }}>RIDERS</span>
          </span>
          <span className="brand-subtitle">FLEET & PAYMENTS</span>
        </div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>

      {/* Nav List */}
      <nav className="sidebar-nav">
        {/* Dashboard */}
        <div
          className={`nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <div className="nav-item-left">
            <LayoutDashboard size={18} />
            <span>Dashboard</span>
          </div>
        </div>

        {/* Riders Section */}
        <div>
          <div
            className={`nav-item ${activeView === 'riders' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('riders');
              setRidersOpen(!ridersOpen);
            }}
          >
            <div className="nav-item-left">
              <Users size={18} />
              <span>Riders</span>
            </div>
            {ridersOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </div>

          {ridersOpen && (
            <div className="nav-subitems">
              <div
                className={`nav-subitem ${activeView === 'riders' && riderFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => handleRiderNav('ALL')}
              >
                All Riders
              </div>
              <div
                className={`nav-subitem ${activeView === 'riders' && riderFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => handleRiderNav('PENDING')}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>Pending Approval</span>
                {pendingCount > 0 && <span className="badge-counter badge-orange">{pendingCount}</span>}
              </div>
              <div
                className={`nav-subitem ${activeView === 'riders' && riderFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => handleRiderNav('ACTIVE')}
              >
                Active Riders
              </div>
              <div
                className={`nav-subitem ${activeView === 'riders' && riderFilter === 'SUSPENDED' ? 'active' : ''}`}
                onClick={() => handleRiderNav('SUSPENDED')}
              >
                Suspended Riders
              </div>
            </div>
          )}
        </div>

        {/* Brands */}
        <div
          className={`nav-item ${activeView === 'brands' || activeView === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveView('brands')}
        >
          <div className="nav-item-left">
            <Briefcase size={18} />
            <span>Brands / Customers</span>
          </div>
        </div>

        {/* Campaigns */}
        <div
          className={`nav-item ${activeView === 'campaigns' || activeView === 'campaign-detail' ? 'active' : ''}`}
          onClick={() => setActiveView('campaigns')}
        >
          <div className="nav-item-left">
            <Megaphone size={18} />
            <span>Campaigns</span>
          </div>
        </div>

        {/* Campaign join requests across all campaigns */}
        <div className={`nav-item ${activeView === 'join-requests' ? 'active' : ''}`} onClick={() => setActiveView('join-requests')}>
          <div className="nav-item-left">
            <Inbox size={18} />
            <span>Join Requests</span>
          </div>
          {campaignRequestCount > 0 && <span className="badge-counter badge-orange">{campaignRequestCount}</span>}
        </div>

        {/* Assignments */}
        <div
          className={`nav-item ${activeView === 'assignments' ? 'active' : ''}`}
          onClick={() => setActiveView('assignments')}
        >
          <div className="nav-item-left">
            <Layers size={18} />
            <span>Assignments</span>
          </div>
        </div>

        {/* Payments Section */}
        <div>
          <div
            className={`nav-item ${activeView === 'payments' ? 'active' : ''}`}
            onClick={() => {
              setActiveView('payments');
              setPaymentsOpen(!paymentsOpen);
            }}
          >
            <div className="nav-item-left">
              <CreditCard size={18} />
              <span>Payments</span>
            </div>
            {paymentsOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </div>

          {paymentsOpen && (
            <div className="nav-subitems">
              <div
                className={`nav-subitem ${activeView === 'payments' && paymentFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => handlePaymentNav('ALL')}
              >
                All Payments
              </div>
              <div
                className={`nav-subitem ${activeView === 'payments' && paymentFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => handlePaymentNav('PENDING')}
              >
                Pending
              </div>
              <div
                className={`nav-subitem ${activeView === 'payments' && paymentFilter === 'PAID' ? 'active' : ''}`}
                onClick={() => handlePaymentNav('PAID')}
              >
                Paid
              </div>
              <div
                className={`nav-subitem ${activeView === 'payments' && paymentFilter === 'FAILED' ? 'active' : ''}`}
                onClick={() => handlePaymentNav('FAILED')}
              >
                Failed
              </div>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div
          className={`nav-item ${activeView === 'notifications' ? 'active' : ''}`}
          onClick={() => setActiveView('notifications')}
        >
          <div className="nav-item-left">
            <Bell size={18} />
            <span>Notifications</span>
          </div>
        </div>

        {/* Reports */}
        <div
          className={`nav-item ${activeView === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveView('reports')}
        >
          <div className="nav-item-left">
            <BarChart3 size={18} />
            <span>Reports</span>
          </div>
        </div>

        {/* Support */}
        <div
          className={`nav-item ${activeView === 'support' ? 'active' : ''}`}
          onClick={() => setActiveView('support')}
        >
          <div className="nav-item-left">
            <HelpCircle size={18} />
            <span>Support</span>
          </div>
        </div>

        {/* Audit Logs */}
        <div
          className={`nav-item ${activeView === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveView('audit')}
        >
          <div className="nav-item-left">
            <ShieldCheck size={18} />
            <span>Audit Logs</span>
          </div>
        </div>

        {/* Admin Users */}
        <div
          className={`nav-item ${activeView === 'admins' ? 'active' : ''}`}
          onClick={() => setActiveView('admins')}
        >
          <div className="nav-item-left">
            <UserCog size={18} />
            <span>Admin Users</span>
          </div>
        </div>

        {/* Settings */}
        <div
          className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveView('settings')}
        >
          <div className="nav-item-left">
            <Settings size={18} />
            <span>Settings</span>
          </div>
        </div>
      </nav>
    </aside>
  );
}
