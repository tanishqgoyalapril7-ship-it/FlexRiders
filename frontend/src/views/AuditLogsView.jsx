import React from 'react';
import { ShieldCheck, Clock, User, HardDrive } from 'lucide-react';

export default function AuditLogsView({ auditLogs = [] }) {
  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Security & Audit Logs</h1>
          <p className="page-subtitle">Immutable chronological trail of all administrative actions and status updates</p>
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Administrator</th>
                <th>Action</th>
                <th>Target</th>
                <th>Details</th>
                <th>IP Address</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: '0.76rem', color: '#64748B' }}>
                    {new Date(log.created_at).toLocaleString('en-GB')}
                  </td>
                  <td>
                    <strong>{log.admin_email}</strong>
                  </td>
                  <td>
                    <span className="status-pill pill-approved" style={{ fontSize: '0.7rem' }}>
                      {log.action}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '0.78rem', color: '#0F172A', fontWeight: 600 }}>
                      {log.target_type}: {log.target_id || 'System'}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: '#475569' }}>{log.details}</td>
                  <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#94A3B8' }}>{log.ip_address}</td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                    No audit logs recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
