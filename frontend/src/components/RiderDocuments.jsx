import React, { useEffect, useState } from 'react';
import { Check, Eye, FileText, X } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';

const PILL = { PENDING: 'pill-at_risk', VERIFIED: 'pill-approved', REJECTED: 'pill-rejected' };

/** Identity and vehicle documents the rider uploaded in the app: view (private file), verify or reject. */
export default function RiderDocuments({ riderId }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [preview, setPreview] = useState(null); // { url, type, label }

  const load = () =>
    api
      .getRiderDocuments(riderId)
      .then(setDocs)
      .catch((err) => {
        setError(err.message);
        setDocs([]);
      });
  useEffect(() => {
    load();
    return () => preview && URL.revokeObjectURL(preview.url);
  }, [riderId]);

  const view = async (d) => {
    try {
      const blob = await api.getRiderDocumentFile(riderId, d.id);
      setPreview({ url: URL.createObjectURL(blob), type: blob.type, label: d.label });
    } catch (err) {
      toast.error(err.message);
    }
  };

  const review = async (d, approve) => {
    let note = null;
    if (!approve) {
      note = window.prompt(`Why is the ${d.label} being rejected? The rider sees this and re-uploads.`);
      if (!note || !note.trim()) return;
    }
    setBusy(d.id);
    try {
      await api.reviewRiderDocument(riderId, d.id, approve, note);
      toast.success(approve ? `${d.label} verified.` : `${d.label} rejected. The rider was asked to re-upload.`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (docs == null) return <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Loading documents…</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error ? <div className="form-error">{error}</div> : null}
      {docs.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: '#94A3B8', fontStyle: 'italic' }}>
          No documents uploaded yet. Riders upload their ID and vehicle proof from the app after signing up.
        </div>
      ) : (
        docs.map((d) => (
          <div key={d.id} className="doc-row">
            <FileText size={18} color="#2563EB" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                {d.label} <span style={{ color: '#94A3B8', fontWeight: 500 }}>· {d.group === 'IDENTITY' ? 'Identity' : 'Vehicle'}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.file_name} · {new Date(d.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
              {d.rejection_note ? (
                <div style={{ fontSize: '0.72rem', color: d.status === 'SUPERSEDED' ? '#64748B' : '#B91C1C' }}>
                  {d.status === 'SUPERSEDED' ? d.rejection_note : `Rejected: ${d.rejection_note}`}
                </div>
              ) : null}
            </div>
            <span className={`status-pill ${PILL[d.status] || 'pill-draft'}`} style={{ fontSize: '0.68rem' }}>
              {d.status === 'SUPERSEDED' ? 'REPLACED' : d.status}
            </span>
            <button className="btn-secondary doc-btn" onClick={() => view(d)} title="View">
              <Eye size={14} />
            </button>
            {d.status !== 'VERIFIED' && d.status !== 'SUPERSEDED' ? (
              <button className="btn-primary doc-btn" disabled={busy === d.id} onClick={() => review(d, true)} title="Verify">
                <Check size={14} />
              </button>
            ) : null}
            {d.status !== 'REJECTED' && d.status !== 'SUPERSEDED' ? (
              <button className="btn-danger doc-btn" disabled={busy === d.id} onClick={() => review(d, false)} title="Reject">
                <X size={14} />
              </button>
            ) : null}
          </div>
        ))
      )}
      {preview ? (
        <div className="modal-overlay" style={{ zIndex: 160 }} onClick={() => setPreview(null)}>
          <div className="modal-dialog" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{preview.label}</span>
              <button onClick={() => setPreview(null)} style={{ color: '#94A3B8' }} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              {preview.type === 'application/pdf' ? (
                <iframe title={preview.label} src={preview.url} style={{ width: '100%', height: '70vh', border: 0 }} />
              ) : (
                <img src={preview.url} alt={preview.label} style={{ maxWidth: '100%', maxHeight: '70vh' }} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
