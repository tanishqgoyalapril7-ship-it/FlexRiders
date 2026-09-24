import React, { useEffect, useState } from 'react';
import { Plus, Search, Megaphone, PlayCircle, Users, Wallet, RotateCcw } from 'lucide-react';
import { api } from '../services/api';
import { CampaignFormModal } from '../components/CampaignModals';
import { CAMPAIGN_STATUSES, CampaignStatusPill, EmptyState, SlotProgress, StatCard, formatDateRange, formatINR } from '../components/CampaignShared';

const EMPTY_FILTERS = { search: '', status: 'ALL', brand_id: '', start_from: '', end_to: '' };

export default function CampaignsView({ brands = [], summary, initialSearch = '', onOpenCampaign, onChanged, onCreateBrand }) {
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, search: initialSearch });
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () =>
    api
      .getCampaigns(filters)
      .then(setCampaigns)
      .catch((err) => console.error('Error loading campaigns:', err))
      .finally(() => setLoading(false));

  useEffect(() => {
    const timer = setTimeout(load, 250); // debounce typing in the search box
    const interval = setInterval(() => document.visibilityState === 'visible' && load(), 20000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [filters]);

  const setFilter = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-subtitle">Manage campaigns, rider assignments, performance, streaks and payouts</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          <span>Create Campaign</span>
        </button>
      </div>

      <div className="stats-grid-4">
        <StatCard title="Active Campaigns" value={summary?.active_campaigns ?? 0} icon={PlayCircle} color="#10B981" background="#ECFDF5" />
        <StatCard
          title="Open / Full Campaigns"
          value={`${summary?.open_campaigns ?? 0} / ${summary?.full_campaigns ?? 0}`}
          icon={Megaphone}
          hint={summary?.pending_requests ? `${summary.pending_requests} join requests awaiting review` : null}
        />
        <StatCard title="Assigned Riders" value={summary?.total_assigned_riders ?? 0} icon={Users} color="#8B5CF6" background="#F5F3FF" />
        <StatCard
          title="Total Campaign Payout"
          value={formatINR(summary?.total_campaign_payout)}
          icon={Wallet}
          color="#F59E0B"
          background="#FFFBEB"
          hint={`${formatINR(summary?.total_campaign_paid)} paid`}
        />
      </div>

      <div className="card" style={{ padding: '16px 20px' }}>
        <div className="filters-row">
          <div className="form-group" style={{ flex: 1, minWidth: '220px' }}>
            <label className="form-label">Search</label>
            <div className="search-container" style={{ width: '100%' }}>
              <Search size={15} color="#94A3B8" />
              <input className="search-input" placeholder="Search by campaign or brand…" value={filters.search} onChange={setFilter('search')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input" value={filters.status} onChange={setFilter('status')}>
              <option value="ALL">All statuses</option>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'OPEN' ? 'Public / Open' : s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Brand</label>
            <select className="form-input" value={filters.brand_id} onChange={setFilter('brand_id')}>
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Starts on or after</label>
            <input type="date" className="form-input" value={filters.start_from} onChange={setFilter('start_from')} />
          </div>
          <div className="form-group">
            <label className="form-label">Ends on or before</label>
            <input type="date" className="form-input" value={filters.end_to} onChange={setFilter('end_to')} />
          </div>
          {hasFilters ? (
            <button className="btn-secondary" onClick={() => setFilters(EMPTY_FILTERS)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <RotateCcw size={14} />
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th>Brand</th>
                <th>Dates</th>
                <th>Slots</th>
                <th>Assigned</th>
                <th>Requests</th>
                <th>Status</th>
                <th>Payout</th>
                <th>Earned</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onOpenCampaign(c.id)}>
                  <td>
                    <strong>{c.name}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>CMP-{String(c.id).padStart(4, '0')}</div>
                  </td>
                  <td>{c.brand_name}</td>
                  <td style={{ fontSize: '0.8rem', color: '#475569', whiteSpace: 'nowrap' }}>{formatDateRange(c.start_date, c.end_date)}</td>
                  <td>{c.total_slots}</td>
                  <td>
                    <SlotProgress used={c.stats.assigned_riders} total={c.total_slots} />
                  </td>
                  <td>
                    {c.stats.requested_riders > 0 ? (
                      <span className="badge-counter badge-orange">{c.stats.requested_riders}</span>
                    ) : (
                      <span style={{ color: '#94A3B8' }}>—</span>
                    )}
                  </td>
                  <td>
                    <CampaignStatusPill campaign={c} />
                    {c.status === 'DRAFT' ? <div style={{ fontSize: '0.7rem', color: '#B45309', marginTop: 4 }}>Hidden from riders</div> : null}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong>{formatINR(c.daily_rate)}</strong>
                    <span style={{ color: '#94A3B8' }}>/day</span>
                  </td>
                  <td>{formatINR(c.stats.total_payout_generated)}</td>
                  <td>
                    <button
                      className="btn-sm-view"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCampaign(c.id);
                      }}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && campaigns.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <EmptyState icon={Megaphone}>
                      {hasFilters ? 'No campaigns match these filters.' : 'No campaigns yet. Create your first campaign to start assigning riders.'}
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate ? (
        <CampaignFormModal
          brands={brands}
          onCreateBrand={() => {
            setShowCreate(false);
            onCreateBrand();
          }}
          onClose={() => setShowCreate(false)}
          onSaved={(campaign) => {
            setShowCreate(false);
            onChanged && onChanged();
            onOpenCampaign(campaign.id);
          }}
        />
      ) : null}
    </div>
  );
}
