import React, { useState } from 'react';
import { Briefcase, Plus, Users, Phone, Search, Trash2 } from 'lucide-react';
import { BrandLogo } from '../components/BrandModals';

export default function BrandsView({ brands = [], onCreateBrand, onViewBrand, onEditBrand, onAssignRider, onToggleActive, onDeleteBrand }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const term = search.trim().toLowerCase();
  const visible = brands.filter(
    (b) =>
      (status === 'ALL' || (status === 'ACTIVE') === b.is_active) &&
      (!term || [b.name, b.code, b.contact_person, b.description].some((v) => (v || '').toLowerCase().includes(term)))
  );
  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Brand Partners Management</h1>
          <p className="page-subtitle">Configure client brands, operational fleets, and rider allocations</p>
        </div>
        <button className="btn-primary" onClick={onCreateBrand}>
          <Plus size={16} />
          <span>Create Brand</span>
        </button>
      </div>

      {brands.length > 0 ? (
        <div className="card" style={{ padding: '14px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div className="tabs-header-bar">
              {[
                ['ALL', 'All'],
                ['ACTIVE', 'Active'],
                ['INACTIVE', 'Inactive'],
              ].map(([key, label]) => (
                <button key={key} className={`tab-btn ${status === key ? 'active' : ''}`} onClick={() => setStatus(key)}>
                  {label}
                </button>
              ))}
            </div>
            <div className="search-container" style={{ width: 260 }}>
              <Search size={15} color="#94A3B8" />
              <input className="search-input" placeholder="Search name, code, contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>
      ) : null}

      {brands.length > 0 && visible.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 36, color: '#94A3B8' }}>No brands match this search or filter.</div>
      ) : null}

      {brands.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '56px 16px' }}>
            <Briefcase size={36} color="#CBD5E1" />
            <strong style={{ color: '#0F172A', fontSize: '1rem' }}>No brands found</strong>
            <span>Create your first brand to start assigning riders and running campaigns.</span>
            <button className="btn-primary" onClick={onCreateBrand} style={{ marginTop: 8 }}>
              <Plus size={16} />
              <span>Create Brand</span>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {visible.map((b) => (
            <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: b.is_active ? 1 : 0.85 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => onViewBrand(b)}>
                    <BrandLogo brand={b} />
                    <div>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>{b.name}</h3>
                      <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Code: {b.code}</div>
                    </div>
                  </div>
                  <span className={`status-pill ${b.is_active ? 'pill-active' : 'pill-draft'}`}>{b.is_active ? 'Active' : 'Inactive'}</span>
                </div>

                {b.description ? (
                  <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4', marginBottom: '16px' }}>{b.description}</p>
                ) : null}

                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#475569' }}>
                    <Users size={14} color="#2563EB" />
                    <span>
                      Current Riders: <strong>{b.active_riders_count || 0}</strong>
                    </span>
                  </div>
                  {b.contact_person || b.contact_number ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
                      <Phone size={14} color="#10B981" />
                      <span>
                        {[b.contact_person, b.contact_number].filter(Boolean).join(' • ')}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                <button className="btn-secondary" style={{ flex: 1, padding: '7px 10px', fontSize: '0.78rem' }} onClick={() => onViewBrand(b)}>
                  Details
                </button>
                <button className="btn-secondary" style={{ flex: 1, padding: '7px 10px', fontSize: '0.78rem' }} onClick={() => onEditBrand(b)}>
                  Edit
                </button>
                {b.is_active ? (
                  <button className="btn-primary" style={{ flex: 1.3, padding: '7px 10px', fontSize: '0.78rem', justifyContent: 'center' }} onClick={() => onAssignRider(b)}>
                    Assign Rider
                  </button>
                ) : (
                  <button className="btn-primary" style={{ flex: 1.3, padding: '7px 10px', fontSize: '0.78rem', justifyContent: 'center' }} onClick={() => onToggleActive(b)}>
                    Activate
                  </button>
                )}
                <button
                  className="btn-danger-outline"
                  style={{ padding: '7px 10px' }}
                  onClick={() => onDeleteBrand(b)}
                  title="Delete or deactivate this brand"
                  aria-label={`Delete ${b.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
