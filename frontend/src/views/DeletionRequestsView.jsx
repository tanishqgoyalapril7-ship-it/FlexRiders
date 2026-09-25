import React, { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { api } from '../services/api';
import { toast } from '../components/Feedback';
import { ConfirmDialog } from '../components/CampaignModals';
import { EmptyState, StatusPill, formatDate } from '../components/CampaignShared';

/** Account deletion requests sent from flexriders.in/delete-account (Google Play requirement). */
export default function DeletionRequestsView() {
  const [status, setStatus] = useState('NEW');
  const [rows, setRows] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = () =>
    api
      .getDeletionRequests(status)
      .then(setRows)
      .catch((err) => toast.error(err.message));
  useEffect(() => {
    load();
  }, [status]);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Account Deletion Requests</h1>
          <p className="page-subtitle">
            Sent from the public page flexriders.in/delete-account. Call the number to confirm the person owns the account before completing.
          </p>
        </div>
      </div>
      <div className="tabs-header-bar">
        {['NEW', 'COMPLETED', 'REJECTED', 'ALL'].map((s) => (
          <button key={s} className={`tab-btn ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Name given</th>
                <th>Mobile</th>
                <th>Matching rider</th>
                <th>Message</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
                  <td>{r.full_name}</td>
                  <td>{r.mobile_number}</td>
                  <td style={{ fontSize: '0.8rem' }}>{r.rider ? `${r.rider.full_name} · ${r.rider.rider_id}${r.rider.archived ? ' (archived)' : ''}` : 'No account with this number'}</td>
                  <td style={{ fontSize: '0.8rem', maxWidth: 260 }}>{r.message || '—'}</td>
                  <td>
                    <StatusPill status={r.status === 'NEW' ? 'PENDING' : r.status} label={r.status.charAt(0) + r.status.slice(1).toLowerCase()} />
                    {r.resolution ? <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4 }}>{r.resolution}</div> : null}
                  </td>
                  <td>
                    {r.status === 'NEW' ? (
                      <div className="row-actions">
                        <button
                          className="btn-sm-reject"
                          onClick={() =>
                            setDialog({
                              title: 'Delete this account',
                              message: r.rider
                                ? `Delete ${r.rider.full_name} (${r.rider.rider_id})? Without history the account is removed completely; otherwise personal data (selfie, contact, payment and location details) is erased and payout/campaign records are kept. This can't be undone.`
                                : 'No account uses this number. The request will be closed.',
                              confirmLabel: 'Complete Request',
                              danger: true,
                              reasonLabel: 'Note (e.g. how the owner was confirmed)',
                              onConfirm: async (note) => {
                                await api.completeDeletionRequest(r.id, note);
                                toast.success('Request completed.');
                                load();
                              },
                            })
                          }
                        >
                          Complete
                        </button>
                        <button
                          className="btn-sm-approve"
                          style={{ background: '#F1F5F9', color: '#334155' }}
                          onClick={() =>
                            setDialog({
                              title: 'Reject request',
                              message: 'Reject this request (for example, the owner could not be confirmed)?',
                              confirmLabel: 'Reject',
                              reasonLabel: 'Reason (required)',
                              onConfirm: async (note) => {
                                if (!note) throw new Error('Please give a reason.');
                                await api.rejectDeletionRequest(r.id, note);
                                load();
                              },
                            })
                          }
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
              {rows && rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={UserX}>No {status === 'ALL' ? '' : status.toLowerCase()} requests.</EmptyState>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {dialog ? <ConfirmDialog {...dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
