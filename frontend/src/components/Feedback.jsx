import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Toasts: toast.success('Saved') from anywhere; <Toaster /> renders them.
// ---------------------------------------------------------------------------

let nextId = 1;
const listeners = new Set();
let toasts = [];

function emit() {
  listeners.forEach((fn) => fn(toasts));
}

function push(kind, message) {
  const id = nextId++;
  toasts = [...toasts, { id, kind, message }];
  emit();
  setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
}

function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message) => push('success', message),
  error: (message) => push('error', message),
  info: (message) => push('info', message),
};

const TOAST_ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function Toaster() {
  const [items, setItems] = useState(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => listeners.delete(setItems);
  }, []);
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => {
        const Icon = TOAST_ICONS[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <Icon size={18} />
            <span>{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DangerDialog: every destructive action goes through this.
// ---------------------------------------------------------------------------

const COUNT_LABELS = {
  payments: 'Payment records',
  brand_assignments: 'Brand assignments (incl. history)',
  campaign_assignments: 'Campaign participations',
  campaign_days: 'Campaign rider-days',
  campaign_photos: 'Campaign photos',
  campaign_requests: 'Campaign join requests',
  documents: 'Documents',
  notifications: 'Notifications',
  campaigns: 'Campaigns',
  current_riders: 'Riders currently assigned',
  assignment_history: 'Rider assignments (incl. history)',
  requests: 'Join requests',
  riders: 'Riders',
  photos: 'Photos',
  payouts_paid: 'Paid rider payouts',
  brand_payment_records: 'Brand payment records',
  extensions: 'Extensions',
};

/** Human list of the non-zero counts in an impact report. */
export function ImpactList({ counts }) {
  const rows = Object.entries(counts || {}).filter(([, v]) => v > 0);
  if (!rows.length) return <div className="impact-empty">Nothing else is linked to this record.</div>;
  return (
    <ul className="impact-list">
      {rows.map(([key, value]) => (
        <li key={key}>
          <span>{COUNT_LABELS[key] || key.replace(/_/g, ' ')}</span>
          <strong>{value}</strong>
        </li>
      ))}
    </ul>
  );
}

/**
 * props:
 *  title, message
 *  loadImpact?: () => Promise<impact>     shown while loading, then passed to the render props
 *  renderDetails?: (impact) => node       extra content (lists of campaigns/riders…)
 *  getAction: (impact) => ({ label, tone: 'danger'|'primary', reasonLabel?, reasonRequired?, typeToConfirm?,
 *                            note?, run: async (reason) => successMessage }) | null
 *  onDone: () => void                      called after success (refresh data)
 *  onClose
 */
export function DangerDialog({ title, message, loadImpact, renderDetails, getAction, onDone, onClose }) {
  const [impact, setImpact] = useState(null);
  const [loading, setLoading] = useState(Boolean(loadImpact));
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loadImpact) return;
    loadImpact()
      .then(setImpact)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const action = loading ? null : getAction(impact);
  const needsReason = action && action.reasonRequired && reason.trim().length < 3;
  const needsTyping = action && action.typeToConfirm && typed.trim() !== action.typeToConfirm;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await action.run(reason.trim());
      toast.success(result || 'Done');
      onClose();
      onDone && onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose} style={{ zIndex: 140 }}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }} role="alertdialog" aria-labelledby="danger-title">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className={`danger-icon ${action && action.tone !== 'danger' ? 'danger-icon-soft' : ''}`}>
              <AlertTriangle size={18} />
            </div>
            <span className="modal-title" id="danger-title">{title}</span>
          </div>
          <button onClick={onClose} disabled={busy} style={{ color: '#94A3B8' }} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {message ? <p className="danger-message">{message}</p> : null}
          {loading ? (
            <div className="impact-loading">
              <Loader2 size={16} className="spin" /> Checking what this affects…
            </div>
          ) : (
            <>
              {impact && impact.counts ? (
                <div>
                  <div className="impact-heading">Linked records</div>
                  <ImpactList counts={impact.counts} />
                </div>
              ) : null}
              {renderDetails && impact ? renderDetails(impact) : null}
              {action && action.note ? <div className={`impact-note ${action.tone === 'danger' ? 'impact-note-danger' : ''}`}>{action.note}</div> : null}
              {!action && !error ? <div className="impact-note">No action is available for this record.</div> : null}
              {action && action.reasonLabel ? (
                <div className="form-group">
                  <label className="form-label">
                    {action.reasonLabel}
                    {action.reasonRequired ? ' *' : ''}
                  </label>
                  <textarea className="form-input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              ) : null}
              {action && action.typeToConfirm ? (
                <div className="form-group">
                  <label className="form-label">
                    Type <code className="confirm-code">{action.typeToConfirm}</code> to confirm
                  </label>
                  <input className="form-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </div>
              ) : null}
            </>
          )}
          {error ? <div className="form-error">{error}</div> : null}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {action ? (
            <button
              className={action.tone === 'danger' ? 'btn-danger' : 'btn-primary'}
              disabled={busy || needsReason || needsTyping}
              onClick={run}
            >
              {busy ? 'Working…' : action.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
