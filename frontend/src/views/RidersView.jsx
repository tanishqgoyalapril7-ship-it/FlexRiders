import React, { useState } from 'react';
import { Search, Filter, Plus, Check, X, Shield, Eye, Bike, UserPlus } from 'lucide-react';

export default function RidersView({
  riders = [],
  filterStatus = 'ALL',
  setFilterStatus,
  onViewRider,
  onApproveRider,
  onRejectRider,
  onAddNewRider,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('ALL');

  const filteredRiders = riders.filter((r) => {
    const matchesStatus = filterStatus === 'ALL' || r.status === filterStatus;
    const matchesSearch =
      !searchTerm ||
      r.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.rider_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.mobile_number?.includes(searchTerm) ||
      r.current_company?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCity = cityFilter === 'ALL' || r.primary_city?.toLowerCase().includes(cityFilter.toLowerCase());
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
          <div className="tabs-header-bar">
            {['ALL', 'PENDING', 'ACTIVE', 'SUSPENDED'].map((st) => (
              <button
                key={st}
                className={`tab-btn ${filterStatus === st ? 'active' : ''}`}
                onClick={() => setFilterStatus(st)}
              >
                {st === 'ALL' ? 'All Riders' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {/* Search & City Filter */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div className="search-container" style={{ width: '260px' }}>
              <Search size={15} color="#94A3B8" />
              <input
                type="text"
                className="search-input"
                placeholder="Filter by name, ID, phone..."
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
              <option value="Gurugram">Gurugram</option>
              <option value="Noida">Noida</option>
              <option value="Delhi">Delhi</option>
              <option value="Faridabad">Faridabad</option>
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
                      <img
                        src={r.profile_photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.rider_id}`}
                        alt={r.full_name}
                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
                      />
                      <div>
                        <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                        <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{r.mobile_number}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>{r.current_company || 'Independent'}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>{r.current_role}</div>
                  </td>
                  <td>
                    <div>{r.vehicle_type || 'Bike'}</div>
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
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn-sm-view" onClick={() => onViewRider(r)} title="View full profile">
                        <Eye size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                        View
                      </button>
                      {r.status === 'PENDING' && (
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
                            onClick={() => onRejectRider(r.id)}
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
                    No riders match the current filter or search criteria.
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
