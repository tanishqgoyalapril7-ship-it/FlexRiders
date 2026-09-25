import React, { useEffect, useState } from 'react';
import { FileText, History, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { DangerDialog, toast } from './Feedback';
import { EmptyState, formatDate } from './CampaignShared';

/** Campaign Terms & Conditions: current version, acceptance, publishing a new version, full history.
 *  The text is always exactly what an admin enters; FlexRiders never writes terms itself. */
export function TermsPanel({ campaignId }) {
  const [data, setData] = useState(null);
  const [body, setBody] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [openVersion, setOpenVersion] = useState(null);

  const load = () =>
    api
      .getCampaignTerms(campaignId)
      .then(setData)
      .catch((err) => toast.error(err.message));
  useEffect(() => {
    load();
  }, [campaignId]);

  if (!data) return <EmptyState icon={FileText}>Loading terms…</EmptyState>;
  const current = data.current;

  const startEdit = () => {
    setBody(current ? current.body : '');
    setNote('');
    setEditing(true);
  };

  const publish = () =>
    setConfirm({
      title: current ? `Publish version ${current.version + 1}` : 'Publish Terms & Conditions',
      message: current
        ? `Riders already in this campaign keep working and get a notification to review and accept version ${current.version + 1}. New join requests (and approvals) need the new version. Version ${current.version} and every acceptance are kept.`
        : 'Riders must accept these terms to request to join this campaign.',
      getAction: () => ({
        label: 'Publish',
        tone: 'primary',
        note: 'Only publish text you are allowed to use (your own terms, or the brand’s terms with their permission).',
        run: async () => {
          const res = await api.publishCampaignTerms(campaignId, { body, change_note: note });
          setData(res);
          setEditing(false);
          return `Terms version ${res.current.version} published.`;
        },
      }),
      onDone: () => {},
    });

  return (
    <>
      <div className="card">
        <div className="card-header-bar">
          <span className="card-title-text">Terms &amp; Conditions</span>
          {!editing ? (
            <button className="btn-primary" onClick={startEdit}>
              {current ? 'Publish New Version' : 'Add Terms'}
            </button>
          ) : null}
        </div>

        {!current && !editing ? (
          <EmptyState icon={FileText}>
            No terms for this campaign. Riders can join without accepting any. Add the campaign’s terms here (your own text, or the brand’s with
            their permission).
          </EmptyState>
        ) : null}

        {current && !editing ? (
          <>
            <div className="terms-meta">
              <span className="status-pill pill-open">Version {current.version}</span>
              <span>Published {formatDate(current.published_at)}</span>
              {current.change_note ? <span>· {current.change_note}</span> : null}
            </div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', margin: '12px 0' }}>
              <div className="kpi">
                <div className="kpi-label">Current riders</div>
                <div className="kpi-value">{data.current_riders}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Accepted version {current.version}</div>
                <div className={`kpi-value ${data.current_riders_accepted < data.current_riders ? 'negative' : 'positive'}`}>
                  {data.current_riders_accepted} / {data.current_riders}
                </div>
              </div>
            </div>
            <div className="terms-body">{current.body}</div>
          </>
        ) : null}

        {editing ? (
          <>
            <div className="impact-note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
              <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Paste the exact terms you are allowed to use. FlexRiders doesn’t write or change terms. Publishing creates a new version; older
                versions and acceptances are never changed.
              </span>
            </div>
            <div className="form-group">
              <label className="form-label">Terms &amp; Conditions text *</label>
              <textarea className="form-input" rows={12} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Paste the campaign’s Terms & Conditions" />
              <span className="form-hint">{body.trim().length.toLocaleString('en-IN')} characters</span>
            </div>
            {current ? (
              <div className="form-group">
                <label className="form-label">What changed (shown to riders)</label>
                <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Updated photo requirements" />
              </div>
            ) : null}
            <div className="row-actions">
              <button className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={body.trim().length < 20} onClick={publish}>
                {current ? `Publish Version ${current.version + 1}` : 'Publish Terms'}
              </button>
            </div>
          </>
        ) : null}
      </div>

      {data.versions.length ? (
        <div className="card">
          <div className="card-header-bar">
            <span className="card-title-text">
              <History size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
              Version History
            </span>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Published</th>
                  <th>By</th>
                  <th>What changed</th>
                  <th>Acceptances</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.versions.map((v) => (
                  <React.Fragment key={v.version}>
                    <tr>
                      <td>
                        <strong>v{v.version}</strong> {v.version === current.version ? <span className="status-pill pill-open">Current</span> : null}
                      </td>
                      <td>{formatDate(v.published_at)}</td>
                      <td style={{ fontSize: '0.8rem' }}>{v.published_by || '—'}</td>
                      <td style={{ fontSize: '0.8rem' }}>{v.change_note || '—'}</td>
                      <td>{v.acceptances}</td>
                      <td>
                        <button className="card-action-link" onClick={() => setOpenVersion(openVersion === v.version ? null : v.version)}>
                          {openVersion === v.version ? 'Hide text' : 'View text'}
                        </button>
                      </td>
                    </tr>
                    {openVersion === v.version ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="terms-body">{v.body}</div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {confirm ? <DangerDialog {...confirm} onClose={() => setConfirm(null)} /> : null}
    </>
  );
}
