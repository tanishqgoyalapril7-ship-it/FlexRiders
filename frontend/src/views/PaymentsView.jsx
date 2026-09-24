import React, { useState } from 'react';
import { CreditCard, Plus, Download, CheckCircle, XCircle, Search, Filter } from 'lucide-react';

export default function PaymentsView({
  payments = [],
  filterStatus = 'ALL',
  setFilterStatus,
  onCreatePayment,
  onProcessPayment,
  onDownloadCsv,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPayments = payments.filter((p) => {
    const matchesStatus = filterStatus === 'ALL' || p.status === filterStatus;
    const matchesSearch =
      !searchTerm ||
      p.rider_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.rider_sr_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.upi_id?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Payment Tracking & Settlements</h1>
          <p className="page-subtitle">Track rider payouts, generate records, and process UPI transactions</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={onDownloadCsv}>
            <Download size={15} />
            <span>Export CSV</span>
          </button>
          <button className="btn-primary" onClick={onCreatePayment}>
            <Plus size={16} />
            <span>Record New Payment</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          <div className="tabs-header-bar">
            {['ALL', 'PENDING', 'PAID', 'FAILED'].map((st) => (
              <button
                key={st}
                className={`tab-btn ${filterStatus === st ? 'active' : ''}`}
                onClick={() => setFilterStatus(st)}
              >
                {st === 'ALL' ? 'All Payments' : st.charAt(0) + st.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
              Filtered Sum: <strong style={{ color: '#0F172A' }}>₹{totalAmount.toLocaleString('en-IN')}</strong>
            </div>
            <div className="search-container" style={{ width: '260px' }}>
              <Search size={15} color="#94A3B8" />
              <input
                type="text"
                className="search-input"
                placeholder="Search rider, txn ID, UPI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Rider Details</th>
                <th>Brand</th>
                <th>Amount (INR)</th>
                <th>Payment Date</th>
                <th>UPI ID / Txn ID</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>PAY-{p.id}</span>
                  </td>
                  <td>
                    <div>
                      <strong>{p.rider_name}</strong>
                      <div style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>{p.rider_sr_id}</div>
                    </div>
                  </td>
                  <td>{p.brand_name || '—'}</td>
                  <td>
                    <strong style={{ fontSize: '0.95rem' }}>₹{p.amount?.toLocaleString('en-IN')}</strong>
                  </td>
                  <td style={{ fontSize: '0.76rem', color: '#64748B' }}>
                    {new Date(p.payment_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td>
                    <div>
                      <div style={{ fontSize: '0.78rem' }}>{p.upi_id || 'upi@bank'}</div>
                      <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                        {p.transaction_id || 'Pending Txn'}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill pill-${p.status?.toLowerCase()}`}>{p.status}</span>
                  </td>
                  <td>
                    {p.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn-sm-approve"
                          onClick={() => onProcessPayment(p.id, 'PAID')}
                          title="Simulate successful UPI settlement"
                        >
                          Mark Paid
                        </button>
                        <button
                          className="btn-sm-reject"
                          onClick={() => onProcessPayment(p.id, 'FAILED')}
                          title="Mark payment as failed"
                        >
                          Fail
                        </button>
                      </div>
                    )}
                    {p.status === 'PAID' && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#10B981', fontWeight: 600 }}>
                        <CheckCircle size={13} />
                        Settled
                      </span>
                    )}
                    {p.status === 'FAILED' && (
                      <button
                        className="btn-sm-view"
                        style={{ fontSize: '0.72rem' }}
                        onClick={() => onProcessPayment(p.id, 'PAID')}
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#94A3B8' }}>
                    No payment records found.
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
