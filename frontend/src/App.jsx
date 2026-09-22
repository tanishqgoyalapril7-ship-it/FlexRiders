import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { DashboardView } from './views/DashboardView';
import RidersView from './views/RidersView';
import BrandsView from './views/BrandsView';
import PaymentsView from './views/PaymentsView';
import AuditLogsView from './views/AuditLogsView';
import ReportsView from './views/ReportsView';
import { RiderDetailModal, CreateBrandModal, CreatePaymentModal } from './components/Modals';
import MobileSimulator from './components/MobileSimulator';
import { api, setAuthToken } from './services/api';

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [riderFilter, setRiderFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [globalSearch, setGlobalSearch] = useState('');

  // Data states
  const [dashboardData, setDashboardData] = useState(null);
  const [riders, setRiders] = useState([]);
  const [brands, setBrands] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [inspectedRider, setInspectedRider] = useState(null);
  const [showCreateBrandModal, setShowCreateBrandModal] = useState(false);
  const [showCreatePaymentModal, setShowCreatePaymentModal] = useState(false);
  const [showMobileSimulator, setShowMobileSimulator] = useState(false);

  // Initial Load & Auth
  const refreshAllData = async () => {
    try {
      // 1. Authenticate as admin if token not set
      try {
        await api.login('+919999999999', 'admin123');
      } catch (authErr) {
        console.warn('Initial admin login check:', authErr.message);
      }

      // 2. Fetch all collections in parallel
      const [dash, rList, bList, pList, nList, aList] = await Promise.all([
        api.getDashboard().catch(() => null),
        api.getRiders().catch(() => []),
        api.getBrands().catch(() => []),
        api.getPayments().catch(() => []),
        api.getNotifications().catch(() => []),
        api.getAuditLogs().catch(() => []),
      ]);

      if (dash) setDashboardData(dash);
      if (rList) setRiders(rList);
      if (bList) setBrands(bList);
      if (pList) setPayments(pList);
      if (nList) setNotifications(nList);
      if (aList) setAuditLogs(aList);
    } catch (e) {
      console.error('Error loading data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAllData();
    const interval = setInterval(() => {
      refreshAllData();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Actions
  const handleApproveRider = async (id) => {
    try {
      await api.approveRider(id);
      if (inspectedRider?.id === id) {
        setInspectedRider((prev) => ({ ...prev, status: 'APPROVED' }));
      }
      refreshAllData();
    } catch (err) {
      alert('Error approving rider: ' + err.message);
    }
  };

  const handleRejectRider = async (id, reason) => {
    try {
      await api.rejectRider(id, reason);
      if (inspectedRider?.id === id) setInspectedRider(null);
      refreshAllData();
    } catch (err) {
      alert('Error rejecting rider: ' + err.message);
    }
  };

  const handleSuspendRider = async (id, reason) => {
    try {
      await api.suspendRider(id, reason);
      if (inspectedRider?.id === id) {
        setInspectedRider((prev) => ({ ...prev, status: 'SUSPENDED' }));
      }
      refreshAllData();
    } catch (err) {
      alert('Error suspending rider: ' + err.message);
    }
  };

  const handleReactivateRider = async (id) => {
    try {
      await api.reactivateRider(id);
      if (inspectedRider?.id === id) {
        setInspectedRider((prev) => ({ ...prev, status: 'ACTIVE' }));
      }
      refreshAllData();
    } catch (err) {
      alert('Error reactivating rider: ' + err.message);
    }
  };

  const handleAssignBrand = async (riderId, brandId) => {
    try {
      await api.assignBrand(riderId, brandId);
      const bObj = brands.find((b) => b.id === parseInt(brandId));
      if (inspectedRider?.id === riderId) {
        setInspectedRider((prev) => ({
          ...prev,
          status: 'ACTIVE',
          current_brand: bObj?.name || 'Assigned',
        }));
      }
      refreshAllData();
      alert(`Brand ${bObj?.name} assigned successfully! Rider is now ACTIVE.`);
    } catch (err) {
      alert('Error assigning brand: ' + err.message);
    }
  };

  const handleCreateBrand = async (brandData) => {
    try {
      await api.createBrand(brandData);
      setShowCreateBrandModal(false);
      refreshAllData();
      alert('Brand created successfully!');
    } catch (err) {
      alert('Error creating brand: ' + err.message);
    }
  };

  const handleCreatePayment = async (paymentData) => {
    try {
      await api.createPayment(paymentData);
      setShowCreatePaymentModal(false);
      refreshAllData();
      alert('Payment record generated successfully!');
    } catch (err) {
      alert('Error creating payment: ' + err.message);
    }
  };

  const handleProcessPayment = async (id, action) => {
    try {
      await api.processPayment(id, action);
      refreshAllData();
    } catch (err) {
      alert('Error processing payment: ' + err.message);
    }
  };

  const handleQuickAction = (action) => {
    if (action === 'pending_riders') {
      setActiveView('riders');
      setRiderFilter('PENDING');
    } else if (action === 'all_riders') {
      setActiveView('riders');
      setRiderFilter('ALL');
    } else if (action === 'add_rider') {
      setShowMobileSimulator(true);
    } else if (action === 'create_brand') {
      setShowCreateBrandModal(true);
    } else if (action === 'payments') {
      setActiveView('payments');
      setPaymentFilter('ALL');
    } else if (action === 'reports') {
      setActiveView('reports');
    } else if (action === 'notifications') {
      setActiveView('notifications');
    }
  };

  const handleViewRiderFull = async (r) => {
    try {
      const fullDetail = await api.getRiderDetail(r.id);
      setInspectedRider(fullDetail);
    } catch (e) {
      setInspectedRider(r);
    }
  };

  const pendingApprovalsCount = riders.filter((r) => r.status === 'PENDING').length || dashboardData?.stats?.pending_approvals || 0;

  return (
    <div className="app-container">
      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        riderFilter={riderFilter}
        setRiderFilter={setRiderFilter}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
        pendingCount={pendingApprovalsCount}
      />

      {/* Main Wrapper */}
      <div className="main-wrapper">
        <Topbar
          searchValue={globalSearch}
          onSearch={setGlobalSearch}
          notifications={notifications}
          onOpenMobilePreview={() => setShowMobileSimulator(true)}
          adminUser={{ name: 'Admin', role: 'Super Admin' }}
        />

        {/* View Router */}
        {activeView === 'dashboard' && (
          <DashboardView
            dashboardData={dashboardData}
            notifications={notifications}
            onViewRider={handleViewRiderFull}
            onApproveRider={handleApproveRider}
            onRejectRider={(id) => handleRejectRider(id, 'Documents not verified')}
            onQuickAction={handleQuickAction}
            onDownloadReport={() => window.open(api.getPaymentsExportUrl(), '_blank')}
          />
        )}

        {activeView === 'riders' && (
          <RidersView
            riders={riders}
            filterStatus={riderFilter}
            setFilterStatus={setRiderFilter}
            onViewRider={handleViewRiderFull}
            onApproveRider={handleApproveRider}
            onRejectRider={(id) => handleRejectRider(id, 'Documents not verified')}
            onAddNewRider={() => setShowMobileSimulator(true)}
          />
        )}

        {activeView === 'brands' && (
          <BrandsView
            brands={brands}
            onCreateBrand={() => setShowCreateBrandModal(true)}
            onOpenAssignModal={(b) => {
              setActiveView('riders');
              setRiderFilter('APPROVED');
            }}
          />
        )}

        {activeView === 'assignments' && (
          <RidersView
            riders={riders.filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED')}
            filterStatus="ALL"
            setFilterStatus={setRiderFilter}
            onViewRider={handleViewRiderFull}
            onApproveRider={handleApproveRider}
            onRejectRider={(id) => handleRejectRider(id, 'Assignment review failed')}
            onAddNewRider={() => setShowMobileSimulator(true)}
          />
        )}

        {activeView === 'payments' && (
          <PaymentsView
            payments={payments}
            filterStatus={paymentFilter}
            setFilterStatus={setPaymentFilter}
            onCreatePayment={() => setShowCreatePaymentModal(true)}
            onProcessPayment={handleProcessPayment}
            onDownloadCsv={() => window.open(api.getPaymentsExportUrl(), '_blank')}
          />
        )}

        {activeView === 'notifications' && (
          <div className="page-container">
            <div className="page-header-row">
              <div>
                <h1 className="page-title">Operational Notifications</h1>
                <p className="page-subtitle">Real-time alerts for registrations, payments, and document updates</p>
              </div>
              <button
                className="btn-secondary"
                onClick={async () => {
                  await api.markAllNotificationsRead();
                  refreshAllData();
                }}
              >
                Mark All as Read
              </button>
            </div>
            <div className="card">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      background: n.is_read ? '#FFFFFF' : '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>{n.title}</div>
                      <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '3px' }}>{n.message}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '4px' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className="status-pill pill-approved">{n.category}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeView === 'reports' && <ReportsView dashboardData={dashboardData} />}

        {activeView === 'audit' && <AuditLogsView auditLogs={auditLogs} />}

        {activeView === 'admins' && (
          <div className="page-container">
            <div className="page-header-row">
              <div>
                <h1 className="page-title">Admin Roles & Permissions</h1>
                <p className="page-subtitle">Role-Based Access Control (RBAC) configuration</p>
              </div>
            </div>
            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin Name / Email</th>
                    <th>Role</th>
                    <th>Permissions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Super Administrator</strong> (admin@superriders.com)</td>
                    <td><span className="status-pill pill-approved">SUPER_ADMIN</span></td>
                    <td>Full platform access, brand configuration, payments, audits</td>
                    <td><span className="status-pill pill-active">Active</span></td>
                  </tr>
                  <tr>
                    <td><strong>Operations Admin</strong> (ops@superriders.com)</td>
                    <td><span className="status-pill pill-approved">OPERATIONS_ADMIN</span></td>
                    <td>Rider review, approval queue, brand fleet assignment</td>
                    <td><span className="status-pill pill-active">Active</span></td>
                  </tr>
                  <tr>
                    <td><strong>Finance Admin</strong> (finance@superriders.com)</td>
                    <td><span className="status-pill pill-approved">FINANCE_ADMIN</span></td>
                    <td>Payment generation, UPI settlements, audit reports</td>
                    <td><span className="status-pill pill-active">Active</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeView === 'settings' && (
          <div className="page-container">
            <div className="page-header-row">
              <div>
                <h1 className="page-title">System Settings</h1>
                <p className="page-subtitle">Platform configuration, UPI gateway keys, and operational rules</p>
              </div>
            </div>
            <div className="card" style={{ maxWidth: '640px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Default Rider Prefix</label>
                  <input className="form-input" value="SR-" disabled />
                </div>
                <div className="form-group">
                  <label className="form-label">Multi-Brand Assignment Mode</label>
                  <select className="form-input" defaultValue="single">
                    <option value="single">Single Active Brand per Rider (Default)</option>
                    <option value="multi">Multiple Active Brands allowed</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Gateway Mode</label>
                  <select className="form-input" defaultValue="simulated">
                    <option value="simulated">UPI Provider Simulation (Dev & Staging)</option>
                    <option value="razorpay">RazorpayX Direct UPI</option>
                    <option value="cashfree">Cashfree Payouts</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Auto-Approval on Document Verification</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569' }}>
                    <input type="checkbox" defaultChecked={false} /> Require manual admin sign-off for all riders (Recommended)
                  </label>
                </div>
                <button className="btn-primary" style={{ width: 'fit-content' }}>Save Configuration</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Rider Detail Dossier & Approval Modal */}
      {inspectedRider && (
        <RiderDetailModal
          rider={inspectedRider}
          brands={brands}
          onClose={() => setInspectedRider(null)}
          onApprove={handleApproveRider}
          onReject={handleRejectRider}
          onSuspend={handleSuspendRider}
          onReactivate={handleReactivateRider}
          onAssignBrand={handleAssignBrand}
        />
      )}

      {/* Create Brand Modal */}
      {showCreateBrandModal && (
        <CreateBrandModal
          onClose={() => setShowCreateBrandModal(false)}
          onSubmit={handleCreateBrand}
        />
      )}

      {/* Create Payment Modal */}
      {showCreatePaymentModal && (
        <CreatePaymentModal
          riders={riders}
          brands={brands}
          onClose={() => setShowCreatePaymentModal(false)}
          onSubmit={handleCreatePayment}
        />
      )}

      {/* Rider Mobile Simulator Modal */}
      {showMobileSimulator && (
        <MobileSimulator onClose={() => setShowMobileSimulator(false)} />
      )}
    </div>
  );
}
