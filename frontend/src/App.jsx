import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { DashboardView } from './views/DashboardView';
import RidersView from './views/RidersView';
import BrandsView from './views/BrandsView';
import PaymentsView from './views/PaymentsView';
import AuditLogsView from './views/AuditLogsView';
import ReportsView from './views/ReportsView';
import CampaignsView from './views/CampaignsView';
import CampaignDetailView from './views/CampaignDetailView';
import { JoinRequestsView } from './components/JoinRequests';
import { AdminsView, LoginView, NotificationsView, SettingsView } from './views/AdminPages';
import { RiderDetailModal, CreatePaymentModal } from './components/Modals';
import { AssignBrandModal, BrandDetailModal, BrandFormModal } from './components/BrandModals';
import { ConfirmDialog } from './components/CampaignModals';
import { AddToCampaignModal, PaymentEditModal, RiderFormModal } from './components/AdminCrud';
import { DangerDialog, Toaster, toast } from './components/Feedback';
import { api, getAuthToken } from './services/api';

const REFRESH_MS = 15000;

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getAuthToken()));
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [activeView, setActiveView] = useState('dashboard');
  const [riderFilter, setRiderFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [globalSearch, setGlobalSearch] = useState('');

  // Data states
  const [dashboardData, setDashboardData] = useState(null);
  const [riders, setRiders] = useState([]);
  const [archivedRiders, setArchivedRiders] = useState([]);
  const [brands, setBrands] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [campaignSummary, setCampaignSummary] = useState(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  // Modals
  const [inspectedRider, setInspectedRider] = useState(null);
  const [riderForm, setRiderForm] = useState(null); // {} = new rider, rider = edit
  const [campaignFor, setCampaignFor] = useState(null);
  const [showCreateBrandModal, setShowCreateBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [viewingBrandId, setViewingBrandId] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null); // { rider } or { brand }
  const [confirmAction, setConfirmAction] = useState(null);
  const [danger, setDanger] = useState(null);
  const [brandRefreshKey, setBrandRefreshKey] = useState(0);
  const [showCreatePaymentModal, setShowCreatePaymentModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const loadingRef = useRef(false);
  const riderFilterRef = useRef(riderFilter);
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  riderFilterRef.current = riderFilter;

  // Session: a 401 from any call returns to the login screen.
  useEffect(() => {
    const expired = () => {
      setAuthed(false);
      setCurrentAdmin(null);
    };
    window.addEventListener('sr-auth-expired', expired);
    return () => window.removeEventListener('sr-auth-expired', expired);
  }, []);

  // Polling skips a tick while a refresh is running; a refresh requested after a user action
  // (force) is queued instead, so the UI always reflects the change.
  const rerunRef = useRef(false);
  const refreshAllData = async (force = true) => {
    if (loadingRef.current) {
      if (force) rerunRef.current = true;
      return;
    }
    loadingRef.current = true;
    try {
      // Only what the current page shows (each request is a remote database round trip), plus the
      // small shared data: notifications for the bell, riders and campaign counts for the sidebar.
      const view = activeViewRef.current;
      const needs = (...views) => views.includes(view);
      const skip = Promise.resolve(null);
      const [dash, rList, archived, bList, pList, nList, aList, cSummary] = await Promise.all([
        needs('reports') ? api.getDashboard().catch(() => null) : skip,
        api.getRiders().catch(() => null),
        needs('riders') && riderFilterRef.current === 'ARCHIVED' ? api.getRiders({ archived: 'only' }).catch(() => null) : skip,
        needs('brands', 'riders', 'assignments', 'campaigns', 'campaign-detail', 'payments') ? api.getBrands().catch(() => null) : skip,
        needs('payments') ? api.getPayments().catch(() => null) : skip,
        api.getNotifications().catch(() => null),
        needs('audit') ? api.getAuditLogs().catch(() => null) : skip,
        api.getCampaignSummary().catch(() => null),
      ]);
      if (dash) setDashboardData(dash);
      if (rList) setRiders(rList);
      if (archived) setArchivedRiders(archived);
      if (bList) setBrands(bList);
      if (pList) setPayments(pList);
      if (nList) setNotifications(nList);
      if (aList) setAuditLogs(aList);
      if (cSummary) setCampaignSummary(cSummary);
    } finally {
      loadingRef.current = false;
      if (rerunRef.current) {
        rerunRef.current = false;
        refreshAllData();
      }
    }
  };

  useEffect(() => {
    if (authed && riderFilter === 'ARCHIVED') api.getRiders({ archived: 'only' }).then(setArchivedRiders).catch(() => {});
  }, [riderFilter, authed]);

  useEffect(() => {
    if (!authed) return undefined;
    api
      .getCurrentAdmin()
      .then(setCurrentAdmin)
      .catch(() => {});
    refreshAllData();
    // Background refresh every 15 s, paused while the browser tab is hidden.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshAllData(false);
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && refreshAllData(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authed]);

  // Opening a page loads its data straight away.
  useEffect(() => {
    activeViewRef.current = activeView;
    if (authed) refreshAllData();
  }, [activeView]);

  const logout = () => {
    api.logout();
    setAuthed(false);
    setCurrentAdmin(null);
    setActiveView('dashboard');
  };

  // Re-fetch the open rider profile so it reflects the latest changes.
  const refreshInspectedRider = async (riderId) => {
    if (inspectedRider?.id === riderId) {
      setInspectedRider(await api.getRiderDetail(riderId).catch(() => null));
    }
  };

  const afterRiderChange = async (riderId) => {
    await refreshAllData();
    if (riderId) await refreshInspectedRider(riderId);
  };

  const riderById = (idOrRider) => (typeof idOrRider === 'object' ? idOrRider : riders.find((r) => r.id === idOrRider) || { id: idOrRider, full_name: 'this rider' });

  // --- Rider status -------------------------------------------------------

  const handleApproveRider = async (id) => {
    try {
      const res = await api.approveRider(id);
      toast.success(res.message || 'Rider approved.');
      await afterRiderChange(id);
    } catch (err) {
      toast.error(`Could not approve: ${err.message}`);
    }
  };

  const handleRejectRider = (idOrRider, presetReason) => {
    const rider = riderById(idOrRider);
    if (presetReason) {
      // The detail modal collects the reason itself.
      return api
        .rejectRider(rider.id, presetReason)
        .then(() => {
          toast.success(`${rider.full_name}'s application was rejected.`);
          setInspectedRider(null);
          return refreshAllData();
        })
        .catch((err) => toast.error(err.message));
    }
    setDanger({
      title: 'Reject application',
      message: `Reject ${rider.full_name}'s registration? The rider is notified with your reason.`,
      getAction: () => ({
        label: 'Reject Application',
        tone: 'danger',
        reasonLabel: 'Reason (shown to the rider)',
        reasonRequired: true,
        run: async (reason) => {
          await api.rejectRider(rider.id, reason);
          return `${rider.full_name}'s application was rejected.`;
        },
      }),
      onDone: () => afterRiderChange(rider.id),
    });
  };

  const handleSuspendRider = (rider) =>
    setDanger({
      title: 'Suspend rider',
      message: `${rider.full_name} will be suspended and notified. You can reactivate them later.`,
      getAction: () => ({
        label: 'Suspend Rider',
        tone: 'danger',
        reasonLabel: 'Reason (shown to the rider)',
        reasonRequired: true,
        run: async (reason) => {
          await api.suspendRider(rider.id, reason);
          return `${rider.full_name} was suspended.`;
        },
      }),
      onDone: () => afterRiderChange(rider.id),
    });

  const handleReactivateRider = async (id) => {
    try {
      await api.reactivateRider(id);
      toast.success('Rider reactivated.');
      await afterRiderChange(id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // --- Rider delete / archive / restore -----------------------------------

  const handleDeleteRider = (rider) =>
    setDanger({
      title: `Delete ${rider.full_name}`,
      message: 'Checking what is linked to this rider before anything is removed.',
      loadImpact: () => api.getRiderDeleteImpact(rider.id),
      renderDetails: (impact) =>
        impact.current_brand || impact.current_campaign ? (
          <div className="impact-subject">
            {impact.current_brand ? (
              <div>
                Current brand: <strong>{impact.current_brand}</strong> (will be ended)
              </div>
            ) : null}
            {impact.current_campaign ? (
              <div>
                Current campaign: <strong>{impact.current_campaign}</strong> (rider will be removed; earnings are kept)
              </div>
            ) : null}
          </div>
        ) : null,
      getAction: (impact) =>
        impact.can_hard_delete
          ? {
              label: 'Delete Permanently',
              tone: 'danger',
              typeToConfirm: 'DELETE',
              note: 'This rider has no payments, brand or campaign history. Their login, profile, documents and notifications are permanently removed.',
              run: async () => {
                await api.deleteRider(rider.id);
                setInspectedRider(null);
                return `${rider.full_name} was permanently deleted.`;
              },
            }
          : {
              label: 'Archive Rider',
              tone: 'danger',
              reasonLabel: 'Reason for archiving',
              reasonRequired: true,
              note: 'This rider has payment, brand or campaign history, so they can’t be permanently deleted. Archiving hides them, blocks their login and ends any current brand or campaign. All history stays in reports, and you can restore them later.',
              run: async (reason) => {
                await api.archiveRider(rider.id, reason);
                return `${rider.full_name} was archived.`;
              },
            },
      onDone: () => afterRiderChange(rider.id),
    });

  const handleRestoreRider = async (rider) => {
    try {
      await api.restoreRider(rider.id);
      toast.success(`${rider.full_name} was restored and can log in again.`);
      await afterRiderChange(rider.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // --- Brands -------------------------------------------------------------

  const handleBrandAssigned = async (result) => {
    const riderId = assignTarget?.rider?.id;
    setAssignTarget(null);
    setBrandRefreshKey((k) => k + 1);
    toast.success(result.message);
    await afterRiderChange(riderId);
  };

  const handleEndAssignment = (rider) =>
    setConfirmAction({
      title: 'End brand assignment',
      message: `End ${rider.full_name}'s assignment to ${rider.current_brand}? The rider goes back to "approved, waiting for a brand". The brand and the assignment history are kept.`,
      confirmLabel: 'End Assignment',
      danger: true,
      onConfirm: async () => {
        await api.unassignBrand(rider.id);
        toast.success('Brand assignment ended.');
        await afterRiderChange(rider.id);
      },
    });

  const handleToggleBrandActive = (brand) => {
    const activate = !brand.is_active;
    const update = async () => {
      await api.updateBrand(brand.id, { is_active: activate });
      setBrandRefreshKey((k) => k + 1);
      await refreshAllData();
      return `${brand.name} was ${activate ? 'activated' : 'deactivated'}.`;
    };
    if (activate) {
      return update()
        .then(toast.success)
        .catch((err) => toast.error(err.message));
    }
    setDanger({
      title: 'Deactivate brand',
      message: `Deactivate ${brand.name}? It will no longer be available for new rider assignments or campaigns. Current and past assignments are kept.`,
      getAction: () => ({ label: 'Deactivate', tone: 'danger', run: update }),
    });
  };

  const handleDeleteBrand = (brand) =>
    setDanger({
      title: `Delete ${brand.name}`,
      message: 'Checking campaigns, riders and payments linked to this brand.',
      loadImpact: () => api.getBrandDeleteImpact(brand.id),
      renderDetails: (impact) => (
        <>
          {impact.campaigns.length ? (
            <div className="impact-subject">
              <div className="impact-heading" style={{ marginTop: 6 }}>Campaigns</div>
              {impact.campaigns.map((c) => (
                <div key={c.id}>
                  {c.name} · {c.status.toLowerCase()}
                </div>
              ))}
            </div>
          ) : null}
          {impact.riders.length ? (
            <div className="impact-subject">
              <div className="impact-heading" style={{ marginTop: 6 }}>Riders currently assigned</div>
              {impact.riders.map((r) => (
                <div key={r.id}>
                  {r.name} ({r.rider_id})
                </div>
              ))}
            </div>
          ) : null}
        </>
      ),
      getAction: (impact) =>
        impact.can_hard_delete
          ? {
              label: 'Delete Permanently',
              tone: 'danger',
              typeToConfirm: 'DELETE',
              note: 'This brand has no campaigns, assignments or payments. It will be permanently removed.',
              run: async () => {
                await api.deleteBrand(brand.id);
                setViewingBrandId(null);
                return `${brand.name} was deleted.`;
              },
            }
          : impact.is_active
          ? {
              label: 'Deactivate Instead',
              tone: 'danger',
              note: 'This brand has campaigns, rider assignments or payments, so deleting it would break that history. Deactivate it instead: it can’t be used for new assignments or campaigns, and all history stays.',
              run: async () => {
                await api.updateBrand(brand.id, { is_active: false });
                return `${brand.name} was deactivated.`;
              },
            }
          : null,
      onDone: async () => {
        setBrandRefreshKey((k) => k + 1);
        await refreshAllData();
      },
    });

  const handleBrandSaved = async (saved) => {
    setShowCreateBrandModal(false);
    setEditingBrand(null);
    setBrandRefreshKey((k) => k + 1);
    toast.success(`${saved.name} was saved.`);
    await refreshAllData();
  };

  // --- Payments -----------------------------------------------------------

  const handleCreatePayment = async (paymentData) => {
    try {
      await api.createPayment(paymentData);
      setShowCreatePaymentModal(false);
      toast.success('Payment record created.');
      refreshAllData();
    } catch (err) {
      toast.error(`Could not create payment: ${err.message}`);
    }
  };

  const handleProcessPayment = async (id, action) => {
    try {
      await api.processPayment(id, action);
      toast.success(action === 'PAID' ? 'Payment marked as paid.' : 'Payment marked as failed.');
      refreshAllData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleCancelPayment = (payment) =>
    setDanger({
      title: 'Cancel payment',
      message: `Cancel the ₹${payment.amount.toLocaleString('en-IN')} payment to ${payment.rider_name}? The record stays in the ledger as Cancelled and no longer counts towards earnings.`,
      getAction: () => ({
        label: 'Cancel Payment',
        tone: 'danger',
        reasonLabel: 'Reason',
        reasonRequired: true,
        run: async (reason) => {
          await api.cancelPayment(payment.id, reason);
          return 'Payment cancelled.';
        },
      }),
      onDone: refreshAllData,
    });

  const handleQuickAction = (action) => {
    if (action === 'pending_riders') {
      setActiveView('riders');
      setRiderFilter('PENDING');
    } else if (action === 'all_riders') {
      setActiveView('riders');
      setRiderFilter('ALL');
    } else if (action === 'add_rider') {
      setRiderForm({});
    } else if (action === 'create_brand') {
      setShowCreateBrandModal(true);
    } else if (action === 'payments') {
      setActiveView('payments');
      setPaymentFilter('ALL');
    } else if (action === 'reports') {
      setActiveView('reports');
    } else if (action === 'notifications') {
      setActiveView('notifications');
    } else if (action === 'campaigns') {
      setActiveView('campaigns');
    } else if (action === 'join_requests') {
      setActiveView('join-requests');
    }
  };

  const handleViewRiderFull = async (r) => {
    try {
      setInspectedRider(await api.getRiderDetail(r.id));
    } catch (e) {
      setInspectedRider(r);
    }
  };

  if (!authed) {
    return (
      <>
        <LoginView onLoggedIn={() => setAuthed(true)} />
        <Toaster />
      </>
    );
  }

  const pendingApprovalsCount = riders.filter((r) => r.status === 'PENDING').length || dashboardData?.stats?.pending_approvals || 0;
  const riderViewProps = {
    archivedRiders,
    onViewRider: handleViewRiderFull,
    onApproveRider: handleApproveRider,
    onRejectRider: handleRejectRider,
    onAddNewRider: () => setRiderForm({}),
    onAssignBrand: (r) => setAssignTarget({ rider: r }),
    onEditRider: setRiderForm,
    onDeleteRider: handleDeleteRider,
    onRestoreRider: handleRestoreRider,
  };

  return (
    <div className="app-container">
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        riderFilter={riderFilter}
        setRiderFilter={setRiderFilter}
        paymentFilter={paymentFilter}
        setPaymentFilter={setPaymentFilter}
        pendingCount={pendingApprovalsCount}
        campaignRequestCount={campaignSummary?.pending_requests || 0}
      />

      <div className="main-wrapper">
        <Topbar
          searchValue={globalSearch}
          onSearch={setGlobalSearch}
          notifications={notifications}
          adminUser={currentAdmin}
          onLogout={logout}
          onViewAllNotifications={() => setActiveView('notifications')}
        />

        {activeView === 'dashboard' && (
          <DashboardView
            dashboardData={dashboardData}
            notifications={notifications}
            onViewRider={handleViewRiderFull}
            onApproveRider={handleApproveRider}
            onRejectRider={(id) => handleRejectRider(id)}
            onQuickAction={handleQuickAction}
            onDownloadReport={() => api.downloadPaymentsExport().catch((err) => toast.error(err.message))}
            onOpenCampaign={(id) => {
              setSelectedCampaignId(id);
              setActiveView('campaign-detail');
            }}
          />
        )}

        {activeView === 'riders' && <RidersView riders={riders} filterStatus={riderFilter} setFilterStatus={setRiderFilter} {...riderViewProps} />}

        {activeView === 'brands' && (
          <BrandsView
            brands={brands}
            onCreateBrand={() => setShowCreateBrandModal(true)}
            onViewBrand={(b) => setViewingBrandId(b.id)}
            onEditBrand={setEditingBrand}
            onAssignRider={(b) => setAssignTarget({ brand: b })}
            onToggleActive={handleToggleBrandActive}
            onDeleteBrand={handleDeleteBrand}
          />
        )}

        {activeView === 'assignments' && (
          <RidersView
            riders={riders.filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED')}
            filterStatus="ALL"
            setFilterStatus={setRiderFilter}
            showTabs={false}
            {...riderViewProps}
          />
        )}

        {activeView === 'payments' && (
          <PaymentsView
            payments={payments}
            filterStatus={paymentFilter}
            setFilterStatus={setPaymentFilter}
            onCreatePayment={() => setShowCreatePaymentModal(true)}
            onProcessPayment={handleProcessPayment}
            onEditPayment={setEditingPayment}
            onCancelPayment={handleCancelPayment}
            onDownloadCsv={() => api.downloadPaymentsExport().catch((err) => toast.error(err.message))}
          />
        )}

        {activeView === 'notifications' && <NotificationsView notifications={notifications} onChanged={refreshAllData} />}

        {activeView === 'campaigns' && (
          <CampaignsView
            brands={brands}
            summary={campaignSummary}
            initialSearch={globalSearch}
            onChanged={refreshAllData}
            onCreateBrand={() => setShowCreateBrandModal(true)}
            onOpenCampaign={(id) => {
              setSelectedCampaignId(id);
              setActiveView('campaign-detail');
            }}
          />
        )}
        {activeView === 'campaign-detail' && selectedCampaignId && (
          <CampaignDetailView
            key={selectedCampaignId}
            campaignId={selectedCampaignId}
            brands={brands}
            onBack={() => setActiveView('campaigns')}
            onViewRider={handleViewRiderFull}
            onChanged={refreshAllData}
          />
        )}
        {activeView === 'join-requests' && <JoinRequestsView onChanged={refreshAllData} />}

        {activeView === 'reports' && <ReportsView dashboardData={dashboardData} />}

        {activeView === 'audit' && <AuditLogsView auditLogs={auditLogs} />}

        {activeView === 'admins' && <AdminsView currentAdmin={currentAdmin} />}

        {activeView === 'settings' && <SettingsView currentAdmin={currentAdmin} onDataReset={refreshAllData} />}
      </div>

      {inspectedRider && (
        <RiderDetailModal
          rider={inspectedRider}
          brands={brands}
          onClose={() => setInspectedRider(null)}
          onApprove={handleApproveRider}
          onReject={handleRejectRider}
          onSuspend={handleSuspendRider}
          onReactivate={handleReactivateRider}
          onOpenAssign={(r) => setAssignTarget({ rider: r })}
          onEndAssignment={handleEndAssignment}
          onEdit={setRiderForm}
          onDelete={handleDeleteRider}
          onRestore={handleRestoreRider}
          onAddToCampaign={setCampaignFor}
        />
      )}

      {riderForm && (
        <RiderFormModal
          rider={riderForm.id ? riderForm : null}
          onClose={() => setRiderForm(null)}
          onSaved={(saved) => {
            setRiderForm(null);
            afterRiderChange(saved.id);
          }}
        />
      )}

      {campaignFor && (
        <AddToCampaignModal
          rider={campaignFor}
          onClose={() => setCampaignFor(null)}
          onSaved={() => {
            const id = campaignFor.id;
            setCampaignFor(null);
            afterRiderChange(id);
          }}
        />
      )}

      {(showCreateBrandModal || editingBrand) && (
        <BrandFormModal
          brand={editingBrand}
          onClose={() => {
            setShowCreateBrandModal(false);
            setEditingBrand(null);
          }}
          onSaved={handleBrandSaved}
        />
      )}

      {viewingBrandId && (
        <BrandDetailModal
          brandId={viewingBrandId}
          refreshKey={brandRefreshKey}
          onClose={() => setViewingBrandId(null)}
          onEdit={(b) => setEditingBrand(b)}
          onAssign={(b) => setAssignTarget({ brand: b })}
          onToggleActive={handleToggleBrandActive}
        />
      )}

      {assignTarget && (
        <AssignBrandModal
          rider={assignTarget.rider}
          brand={assignTarget.brand}
          riders={riders}
          brands={brands}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleBrandAssigned}
          onCreateBrand={() => {
            setAssignTarget(null);
            setShowCreateBrandModal(true);
          }}
        />
      )}

      {confirmAction && <ConfirmDialog {...confirmAction} onClose={() => setConfirmAction(null)} />}
      {danger && <DangerDialog {...danger} onClose={() => setDanger(null)} />}

      {showCreatePaymentModal && (
        <CreatePaymentModal riders={riders} brands={brands} onClose={() => setShowCreatePaymentModal(false)} onSubmit={handleCreatePayment} />
      )}

      {editingPayment && (
        <PaymentEditModal
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={() => {
            setEditingPayment(null);
            refreshAllData();
          }}
        />
      )}

      <Toaster />
    </div>
  );
}
