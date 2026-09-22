import React, { useState } from 'react';
import { Search, Bell, Smartphone, LogOut, CheckCheck } from 'lucide-react';

export default function Topbar({
  onSearch,
  searchValue,
  notifications = [],
  onOpenMobilePreview,
  adminUser = { name: 'Admin', role: 'Super Admin' },
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
          placeholder="Search riders, brands, etc..."
          value={searchValue}
          onChange={(e) => onSearch(e.target.value)}
        />
      </div>

      {/* Topbar Actions */}
      <div className="topbar-actions">
        {/* iOS Simulator Connected Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            borderRadius: '20px',
            fontSize: '0.76rem',
            color: '#065F46',
            fontWeight: 600,
          }}
          title="Direct bidirectional link with React Native App in iOS Simulator"
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
          <span>iOS Simulator Linked</span>
        </div>

        {/* Quick Launch Mobile Simulator Button */}
        <button
          className="btn-primary"
          style={{ padding: '6px 14px', fontSize: '0.8rem', background: '#2563EB' }}
          onClick={onOpenMobilePreview}
          title="Open interactive Rider Mobile Simulator"
        >
          <Smartphone size={16} />
          <span>Rider Web View</span>
        </button>

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
                {notifications.slice(0, 5).map((n) => (
                  <div key={n.id} style={{ fontSize: '0.8rem', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{n.title}</div>
                    <div style={{ color: '#64748B', fontSize: '0.74rem' }}>{n.message}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Admin Profile Pill */}
        <div className="user-profile-badge">
          <div className="user-avatar-circle">A</div>
          <div className="user-info-text">
            <span className="user-name-text">{adminUser.name || 'Admin'}</span>
            <span className="user-role-text">{adminUser.role || 'Super Admin'}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
