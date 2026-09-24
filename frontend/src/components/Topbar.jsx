import React, { useState } from 'react';
import { Search, Bell, LogOut } from 'lucide-react';

export default function Topbar({
  onSearch,
  searchValue,
  notifications = [],
  adminUser,
  onLogout,
  onViewAllNotifications,
}) {
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <header className="topbar">
      {/* Global Search Bar */}
      <div className="search-container">
        <Search size={16} color="#94A3B8" />
        <input
          type="text"
          className="search-input"
          placeholder="Search riders, brands, campaigns..."
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {/* Topbar Actions */}
      <div className="topbar-actions">

        {/* Notifications Icon with Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn-round"
            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && <span className="notification-dot" />}
          </button>

          {showNotifDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '46px',
                right: '0',
                width: '320px',
                backgroundColor: '#ffffff',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                padding: '16px',
                zIndex: 50,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Recent Notifications</span>
                <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600 }}>{unreadCount} unread</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '280px', overflowY: 'auto' }}>
                {notifications.length === 0 ? <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No notifications.</div> : null}
                {notifications.slice(0, 5).map((n) => (
                  <div key={n.id} style={{ fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{n.title}</div>
                    <div style={{ color: '#64748B', fontSize: '0.74rem' }}>{n.message}</div>
                  </div>
                ))}
              </div>
              <button
                className="card-action-link"
                style={{ marginTop: 10, fontSize: '0.8rem' }}
                onClick={() => {
                  setShowNotifDropdown(false);
                  onViewAllNotifications && onViewAllNotifications();
                }}
              >
                View all notifications
              </button>
            </div>
          )}
        </div>

        {/* Admin Profile Pill */}
        <div className="user-profile-badge">
          <div className="user-avatar-circle">{(adminUser?.email || 'A').charAt(0).toUpperCase()}</div>
          <div className="user-info-text">
            <span className="user-name-text">{adminUser?.email || 'Admin'}</span>
            <span className="user-role-text">{(adminUser?.role || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</span>
          </div>
        </div>
        <button className="icon-btn-round" onClick={onLogout} title="Log out" aria-label="Log out">
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
