import React from 'react';
import { FileSpreadsheet, Download, Users, CreditCard, BarChart2 } from 'lucide-react';
import { api } from '../services/api';

export default function ReportsView({ dashboardData }) {
  const handleDownloadRiders = () => {
    window.open(api.getRidersExportUrl(), '_blank');
  };

  const handleDownloadPayments = () => {
    window.open(api.getPaymentsExportUrl(), '_blank');
  };

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Reports & Data Export</h1>
          <p className="page-subtitle">Download analytical reports and raw operational data in CSV / Excel format</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {/* Rider Master Report */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Riders Master Report</h3>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Complete fleet roster with KYC & brand status</div>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4', marginBottom: '16px' }}>
              Includes Rider ID, full name, mobile number, company, vehicle type, primary city/area, assigned brand, and current approval status.
            </p>
          </div>
          <button className="btn-primary" onClick={handleDownloadRiders} style={{ width: '100%', justifyContent: 'center' }}>
            <Download size={16} />
            <span>Download Riders CSV</span>
          </button>
        </div>

        {/* Payments Ledger Report */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CreditCard size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Payment Transactions Ledger</h3>
                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Historical payout records and UPI settlement logs</div>
              </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: '1.4', marginBottom: '16px' }}>
              Includes transaction IDs, rider details, brand partners, payment amounts, dates, settlement statuses, and failure remarks.
            </p>
          </div>
          <button className="btn-primary" onClick={handleDownloadPayments} style={{ width: '100%', justifyContent: 'center', background: '#10B981' }}>
            <Download size={16} />
            <span>Download Payments CSV</span>
          </button>
        </div>
      </div>
    </div>
  );
}
