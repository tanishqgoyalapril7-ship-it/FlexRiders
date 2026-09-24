import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { api } from '../services/api';
import { AdminUserFormModal, PasswordInput } from '../components/AdminCrud';
import { DangerDialog, toast } from '../components/Feedback';

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export function LoginView({ onLoggedIn }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!phone.trim() || !password) return setError('Enter your phone number and password.');
    setBusy(true);
    setError('');
    try {
      await api.login(phone.trim(), password);
      onLoggedIn();
    } catch (err) {
      api.logout();
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <ShieldCheck size={24} color="#2563EB" /> Super Riders Admin
        </div>
        <p style={{ fontSize: '0.86rem', color: '#64748B', margin: 0 }}>Sign in with your admin phone number and password.</p>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="form-group">
          <label className="form-label">Phone Number</label>
          <input className="form-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" autoComplete="username" autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <button type="submit" className="btn-primary" disabled={busy} style={{ justifyContent: 'center' }}>
          {busy ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin accounts
// ---------------------------------------------------------------------------

export function AdminsView({ currentAdmin }) {
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [editing, setEditing] = useState(null); // {} = new
  const [danger, setDanger] = useState(null);
  const isSuper = currentAdmin?.role === 'SUPER_ADMIN';

  const load = () => {
    api.getAdminUsers().then(setUsers).catch((err) => toast.error(err.message));
    api.getAdminRoles().then(setRoles).catch(() => {});
  };
  useEffect(load, []);

  const toggleActive = (u) =>
    u.is_active
      ? setDanger({
          title: 'Deactivate admin',
          message: `${u.email} will no longer be able to log in to the dashboard. Their past actions stay in the audit log.`,
          getAction: () => ({
            label: 'Deactivate',
            tone: 'danger',
            note: 'Admin accounts are deactivated, never deleted, so the audit trail stays complete.',
            run: async () => {
              await api.deactivateAdminUser(u.id);
              return `${u.email} was deactivated.`;
            },
          }),
        })
      : api
          .updateAdminUser(u.id, { is_active: true })
          .then(() => {
            toast.success(`${u.email} was reactivated.`);
            load();
          })
          .catch((err) => toast.error(err.message));

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Admin Accounts</h1>
          <p className="page-subtitle">Who can sign in to this dashboard and what they can do</p>
        </div>
        {isSuper ? (
          <button className="btn-primary" onClick={() => setEditing({})}>
            <UserPlus size={16} /> <span>Add Admin</span>
          </button>
        ) : null}
      </div>
      {!isSuper ? <div className="impact-note">Only a super admin can add, edit or deactivate admin accounts.</div> : null}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Status</th>
                {isSuper ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id} className={u.is_active ? '' : 'row-muted'}>
                  <td>
                    <strong>{u.email || '—'}</strong>
                    {u.id === currentAdmin?.id ? <span style={{ fontSize: '0.72rem', color: '#2563EB', marginLeft: 6 }}>(you)</span> : null}
                  </td>
                  <td>{u.phone}</td>
                  <td>
                    <span className="status-pill pill-approved">{u.role.replace(/_/g, ' ')}</span>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4 }}>{u.role_description}</div>
                  </td>
                  <td>
                    <span className={`status-pill ${u.is_active ? 'pill-active' : 'pill-rejected'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span>
                  </td>
                  {isSuper ? (
                    <td>
                      <div className="row-actions">
                        <button className="btn-sm-view" onClick={() => setEditing(u)}>
                          Edit
                        </button>
                        {u.id !== currentAdmin?.id ? (
                          <button className={u.is_active ? 'btn-sm-reject' : 'btn-sm-approve'} onClick={() => toggleActive(u)}>
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {users && users.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: '#94A3B8' }}>
                    No admin accounts.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {editing ? (
        <AdminUserFormModal
          user={editing.id ? editing : null}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
      {danger ? <DangerDialog {...danger} onDone={load} onClose={() => setDanger(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings: read-only rules + reset
// ---------------------------------------------------------------------------

export function SettingsView({ currentAdmin, onDataReset }) {
  const [rules, setRules] = useState([]);
  const [preview, setPreview] = useState(null);
  const [resetting, setResetting] = useState(null);
  const isSuper = currentAdmin?.role === 'SUPER_ADMIN';

  const loadPreview = () => {
    if (isSuper) api.getResetPreview().then(setPreview).catch((err) => toast.error(err.message));
  };
  useEffect(() => {
    api.getSystemSettings().then(setRules).catch((err) => toast.error(err.message));
    loadPreview();
  }, [isSuper]);

  const groups = rules.reduce((acc, r) => ({ ...acc, [r.group]: [...(acc[r.group] || []), r] }), {});

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">System Settings</h1>
          <p className="page-subtitle">Operating rules in effect, and data reset</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 760 }}>
        <div className="card-header-bar">
          <span className="card-title-text">Operating Rules</span>
        </div>
        <p className="form-hint" style={{ marginTop: 0 }}>
          These are set in the backend configuration (<code>backend/.env</code>) and apply everywhere. They are shown here for reference.
        </p>
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} style={{ marginTop: 12 }}>
            <div className="impact-heading">{group}</div>
            {items.map((r) => (
              <div key={r.label} className="settings-row">
                <span>{r.label}</span>
                <strong>{String(r.value)}</strong>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="card danger-zone" style={{ maxWidth: 760 }}>
        <div className="card-header-bar">
          <span className="card-title-text" style={{ color: '#B91C1C' }}>
            Reset Data
          </span>
        </div>
        {!isSuper ? (
          <div className="impact-note">Only a super admin can reset data.</div>
        ) : !preview ? (
          <div className="impact-loading">Loading…</div>
        ) : (
          <>
            <p className="form-hint" style={{ marginTop: 0 }}>
              Permanently deletes application data. Admin accounts, the audit log, the database structure and configuration are never touched.
              Every reset is recorded in the audit log.
            </p>
            {preview.scopes.map((scope) => {
              const total = Object.values(scope.counts).reduce((a, b) => a + b, 0);
              return (
                <div key={scope.scope} className="reset-scope">
                  <div>
                    <strong>{scope.label}</strong>
                    <div className="reset-scope-desc">{scope.description}</div>
                  </div>
                  <button className="btn-danger-outline" onClick={() => setResetting(scope)} disabled={total === 0} title={total === 0 ? 'Nothing to reset' : ''}>
                    <Trash2 size={14} /> Reset
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {resetting ? (
        <DangerDialog
          title={`Reset: ${resetting.label}`}
          message={resetting.description}
          loadImpact={async () => ({ counts: resetting.counts })}
          getAction={() => ({
            label: `Permanently reset ${resetting.label.toLowerCase()}`,
            tone: 'danger',
            typeToConfirm: preview.confirmation,
            note: 'This cannot be undone. Take a database backup first if you may need this data again.',
            run: async () => {
              const res = await api.resetData(resetting.scope, preview.confirmation);
              const removed = Object.values(res.removed).reduce((a, b) => a + b, 0);
              return `${res.label} reset: ${removed} record${removed === 1 ? '' : 's'} removed.`;
            },
          })}
          onDone={() => {
            loadPreview();
            onDataReset && onDataReset();
          }}
          onClose={() => setResetting(null)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function NotificationsView({ notifications, onChanged }) {
  const [danger, setDanger] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const readCount = notifications.filter((n) => n.is_read).length;

  const remove = async (n) => {
    setBusyId(n.id);
    try {
      await api.deleteNotification(n.id);
      toast.success('Notification deleted.');
      await onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const clear = (readOnly) =>
    setDanger({
      title: readOnly ? 'Delete read notifications' : 'Delete all notifications',
      message: readOnly
        ? `Delete the ${readCount} notification${readCount === 1 ? '' : 's'} you have already read?`
        : `Delete all ${notifications.length} notifications? Records they refer to (riders, payments, campaigns) are not affected.`,
      getAction: () => ({
        label: readOnly ? 'Delete Read' : 'Delete All',
        tone: 'danger',
        run: async () => {
          const res = await api.clearNotifications(readOnly);
          return `${res.removed} notification${res.removed === 1 ? '' : 's'} deleted.`;
        },
      }),
    });

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Alerts for registrations, payments, campaigns and documents</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-secondary"
            disabled={notifications.every((n) => n.is_read)}
            onClick={() =>
              api
                .markAllNotificationsRead()
                .then(onChanged)
                .then(() => toast.success('All notifications marked as read.'))
                .catch((err) => toast.error(err.message))
            }
          >
            <CheckCheck size={15} /> Mark All Read
          </button>
          <button className="btn-danger-outline" disabled={readCount === 0} onClick={() => clear(true)}>
            Delete Read
          </button>
          <button className="btn-danger-outline" disabled={notifications.length === 0} onClick={() => clear(false)}>
            <Trash2 size={14} /> Delete All
          </button>
        </div>
      </div>
      <div className="card">
        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
            <Bell size={28} style={{ marginBottom: 8 }} />
            <div>You're all caught up. New alerts will appear here.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notifications.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: n.is_read ? '#FFFFFF' : '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>
                    {!n.is_read ? <span className="notification-dot" style={{ position: 'static', display: 'inline-block', marginRight: 6 }} /> : null}
                    {n.title}
                  </div>
                  <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: 3 }}>{n.message}</div>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <span className="status-pill pill-approved">{n.category}</span>
                {!n.is_read ? (
                  <button className="btn-sm-view" onClick={() => api.markNotificationRead(n.id).then(onChanged).catch((err) => toast.error(err.message))}>
                    Mark Read
                  </button>
                ) : null}
                <button className="btn-sm-reject" onClick={() => remove(n)} disabled={busyId === n.id} aria-label={`Delete ${n.title}`}>
                  {busyId === n.id ? '…' : <Trash2 size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {danger ? <DangerDialog {...danger} onDone={onChanged} onClose={() => setDanger(null)} /> : null}
    </div>
  );
}

