import React, { useState } from 'react';
import { Search, Eye, Pencil, Trash2, UserPlus } from 'lucide-react';
import { RiderAvatar } from '../components/AdminCrud';

const STATUS_TABS = [
  ['ALL', 'All Riders'],
  ['PENDING', 'Pending'],
  ['APPROVED', 'Approved'],
  ['ACTIVE', 'Active'],
  ['SUSPENDED', 'Suspended'],
  ['REJECTED', 'Rejected'],
  ['ARCHIVED', 'Archived'],
];

export default function RidersView({
  riders = [],
  archivedRiders = [],
  filterStatus = 'ALL',
  setFilterStatus,
  onViewRider,
  onApproveRider,
  onRejectRider,
  onAddNewRider,
  onAssignBrand,
  onEditRider,
  onDeleteRider,
  onRestoreRider,
  showTabs = true,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('ALL');
  const archivedTab = filterStatus === 'ARCHIVED';
  const source = archivedTab ? archivedRiders : riders;
  const cities = [...new Set(source.map((r) => r.primary_city).filter(Boolean))].sort();
  const term = searchTerm.trim().toLowerCase();

  const filteredRiders = source.filter((r) => {
    const matchesStatus = archivedTab || filterStatus === 'ALL' || r.status === filterStatus;
    const matchesSearch =
      !term ||
      [r.full_name, r.rider_id, r.mobile_number, r.current_company, r.vehicle_number, r.email, r.upi_id].some((v) =>
        (v || '').toLowerCase().includes(term)
      );
    const matchesCity = cityFilter === 'ALL' || r.primary_city === cityFilter;
    return matchesStatus && matchesSearch && matchesCity;
  });

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Riders Management</h1>
          <p className="page-subtitle">Review applications, assign brands, and manage rider fleet</p>
        </div>
        <button className="btn-primary" onClick={onAddNewRider}>
          <UserPlus size={16} />
          <span>Add New Rider</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          {/* Status Tabs */}
          {showTabs ? (
            <div className="tabs-header-bar" style={{ flexWrap: 'wrap' }}>
              {STATUS_TABS.map(([st, label]) => (
                <button key={st} className={`tab-btn ${filterStatus === st ? 'active' : ''}`} onClick={() => setFilterStatus(st)}>
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          {/* Search & City Filter */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="search-container" style={{ width: '260px' }}>
              <Search size={15} color="#94A3B8" />
              <input
                type="text"
                className="search-input"
                placeholder="Name, ID, phone, vehicle no…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="form-input"
              style={{ padding: '7px 12px', fontSize: '0.82rem' }}
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              <option value="ALL">All Cities</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Riders Table Card */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Rider ID</th>
                <th>Rider Profile</th>
                <th>Company / Role</th>
                <th>Vehicle & Location</th>
                <th>Payment Info</th>
                <th>Assigned Brand</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRiders.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong style={{ color: '#2563EB', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                      {r.rider_id}
                    </strong>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <RiderAvatar rider={r} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{r.mobile_number}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{r.current_company || '—'}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{r.current_role}</div>
                  </td>
                  <td>
                    <div>{r.vehicle_type || '—'}</div>
                    {r.vehicle_number ? <div style={{ fontSize: '0.72rem', fontWeight: 600 }}>{r.vehicle_number}</div> : null}
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.primary_city}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.78rem' }}>{r.upi_id || 'Not set'}</div>
                  </td>
                  <td>
                    {r.current_brand ? (
                      <span style={{ fontWeight: 600, color: '#2563EB' }}>{r.current_brand}</span>
                    ) : (
                      <span style={{ color: '#94A3B8', fontSize: '0.76rem', fontStyle: 'italic' }}>Unassigned</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-pill pill-${r.status?.toLowerCase()}`}>{r.status}</span>
                    {r.archived_at ? (
                      <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: 4 }} title={r.archive_reason}>
                        Archived {new Date(r.archived_at).toLocaleDateString()}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-sm-view" onClick={() => onViewRider(r)} title="View full profile">
                        <Eye size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                        View
                      </button>
                      {r.archived_at ? (
                        <button className="btn-sm-approve" onClick={() => onRestoreRider(r)}>
                          Restore
                        </button>
                      ) : (
                        <>
                          <button className="btn-sm-view" onClick={() => onEditRider(r)} title="Edit rider" aria-label={`Edit ${r.full_name}`}>
                            <Pencil size={13} />
                          </button>
                          <button className="btn-sm-reject" onClick={() => onDeleteRider(r)} title="Delete or archive rider" aria-label={`Delete ${r.full_name}`}>
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                      {!r.archived_at && (r.status === 'APPROVED' || r.status === 'ACTIVE') && onAssignBrand && (
                        <button className="btn-sm-approve" onClick={() => onAssignBrand(r)} title="Assign this rider to a brand">
                          {r.current_brand ? 'Change Brand' : 'Assign Brand'}
                        </button>
                      )}
                      {!r.archived_at && r.status === 'PENDING' && (
                        <>
                          <button
                            className="btn-sm-approve"
                            onClick={() => onApproveRider(r.id)}
                            title="Approve rider application"
                          >
                            Approve
                          </button>
                          <button
                            className="btn-sm-reject"
                            onClick={() => onRejectRider(r)}
                            title="Reject rider application"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRiders.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                    {source.length === 0
                      ? archivedTab
                        ? 'No archived riders.'
                        : 'No riders yet. Riders appear here when they register in the app or when you add one.'
                      : 'No riders match the current filter or search criteria.'}
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
