import React from 'react';
import { Briefcase, Plus, Users, Phone, UserCheck, ShieldCheck } from 'lucide-react';

export default function BrandsView({ brands = [], onCreateBrand, onOpenAssignModal }) {
  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Brand Partners Management</h1>
          <p className="page-subtitle">Configure client brands, operational fleets, and rider allocations</p>
        </div>
        <button className="btn-primary" onClick={onCreateBrand}>
          <Plus size={16} />
          <span>Create New Brand</span>
        </button>
      </div>

      {/* Brands Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {brands.map((b) => (
          <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1.1rem',
                    }}
                  >
                    {b.name.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>{b.name}</h3>
                    <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Code: {b.code}</div>
                  </div>
                </div>
                <span className="status-pill pill-active">Active</span>
              </div>

              <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4', marginBottom: '16px' }}>
                {b.description || 'Enterprise delivery partner operating across NCR urban zones.'}
              </p>

              <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#475569', marginBottom: '4px' }}>
                  <Users size={14} color="#2563EB" />
                  <span>
                    Active Riders Assigned: <strong>{b.active_riders_count || 0}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#475569' }}>
                  <Phone size={14} color="#10B981" />
                  <span>
                    Contact: {b.contact_person || 'Operations Lead'} ({b.contact_number || 'N/A'})
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
              <button
                className="btn-secondary"
                style={{ flex: 1, padding: '7px 12px', fontSize: '0.78rem', textAlign: 'center' }}
                onClick={() => onOpenAssignModal(b)}
              >
                Assign Riders
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
