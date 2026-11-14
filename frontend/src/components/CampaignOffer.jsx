import React, { useEffect, useState } from 'react';
import { Ticket } from 'lucide-react';
import { api } from '../services/api';
import { toast } from './Feedback';

const EMPTY = {
  enabled: false,
  title: '',
  description: '',
  discount_type: 'PERCENT',
  discount_value: '',
  max_vouchers: '',
  validity_days: 30,
  start_date: '',
  end_date: '',
  outlets: '',
  max_per_customer: 1,
  cooldown_days: 0,
  settlement_notes: '',
};

const numOrNull = (v) => (v === '' || v == null ? null : Number(v));

/** Optional premium add-on: customers who photograph this campaign's riders can claim a voucher.
 *  The discount is always given (and paid for) by the brand at its own outlet. */
export function OfferPanel({ campaign }) {
  const [form, setForm] = useState(null);
  const [issued, setIssued] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getCampaignOffer(campaign.id)
      .then(({ offer }) => {
        setIssued(offer ? offer.vouchers_issued : 0);
        setForm(offer ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, offer[k] ?? ''])) : { ...EMPTY });
      })
      .catch((err) => setError(err.message));
  }, [campaign.id]);

  if (!form) return <div className="card" style={{ color: '#94A3B8' }}>{error || 'Loading…'}</div>;

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const ended = ['COMPLETED', 'CANCELLED', 'REJECTED'].includes(campaign.status);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { offer } = await api.saveCampaignOffer(campaign.id, {
        ...form,
        title: form.title.trim(),
        discount_value: Number(form.discount_value),
        max_vouchers: numOrNull(form.max_vouchers),
        validity_days: Number(form.validity_days),
        max_per_customer: Number(form.max_per_customer),
        cooldown_days: Number(form.cooldown_days || 0),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        description: form.description || null,
        outlets: form.outlets || null,
        settlement_notes: form.settlement_notes || null,
      });
      setIssued(offer.vouchers_issued);
      toast.success(offer.enabled ? 'Offer saved and switched on.' : 'Offer saved (switched off).');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (label, input, hint) => (
    <label className="form-group">
      <span className="form-label">{label}</span>
      {input}
      {hint ? <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{hint}</span> : null}
    </label>
  );

  return (
    <form className="card" onSubmit={save}>
      <div className="card-header-bar" style={{ gap: 12 }}>
        <span className="card-title-text" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
          <Ticket size={16} /> Redeem Offer
        </span>
        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{issued} voucher{issued === 1 ? '' : 's'} issued</span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
          Premium add-on. When it's on, people who photograph this campaign's riders in the FlexRiders app can claim the
          offer. Each request is checked by an admin in <strong>Offer Requests</strong>; approved ones become a one-time voucher the brand
          redeems at its outlet. <strong>The discount is given and paid for by the brand.</strong>
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
          <input type="checkbox" checked={!!form.enabled} onChange={set('enabled')} disabled={ended} /> Offer is on
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {field('Offer title', <input className="form-input" required maxLength={120} value={form.title} onChange={set('title')} placeholder="10% off your bill" />)}
          {field(
            'Discount',
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" required type="number" min="1" step="any" value={form.discount_value} onChange={set('discount_value')} style={{ flex: 1 }} />
              <select className="form-input" value={form.discount_type} onChange={set('discount_type')}>
                <option value="PERCENT">% off</option>
                <option value="FIXED">₹ off</option>
              </select>
            </div>
          )}
          {field('Maximum vouchers', <input className="form-input" type="number" min="1" value={form.max_vouchers} onChange={set('max_vouchers')} placeholder="No limit" />)}
          {field('Voucher valid for (days)', <input className="form-input" required type="number" min="1" max="365" value={form.validity_days} onChange={set('validity_days')} />)}
          {field('Offer starts', <input className="form-input" type="date" value={form.start_date || ''} onChange={set('start_date')} />, 'Empty: the campaign start date')}
          {field('Offer ends', <input className="form-input" type="date" value={form.end_date || ''} onChange={set('end_date')} />, 'Empty: the campaign end date')}
          {field('Vouchers per mobile number', <input className="form-input" required type="number" min="1" max="100" value={form.max_per_customer} onChange={set('max_per_customer')} />)}
          {field('Days between vouchers (same number)', <input className="form-input" type="number" min="0" max="365" value={form.cooldown_days} onChange={set('cooldown_days')} />, '0 = no waiting period')}
        </div>
        {field('Terms shown to the customer', <textarea className="form-input" rows={2} maxLength={2000} value={form.description || ''} onChange={set('description')} placeholder="Valid on bills above ₹500. One voucher per visit." />)}
        {field('Participating outlets', <textarea className="form-input" rows={2} maxLength={2000} value={form.outlets || ''} onChange={set('outlets')} placeholder="Sector 56 outlet, Golf Course Road" />)}
        {field('Agreement notes (internal)', <textarea className="form-input" rows={2} maxLength={2000} value={form.settlement_notes || ''} onChange={set('settlement_notes')} placeholder="What was agreed with the brand" />)}
        {error ? <div className="form-error">{error}</div> : null}
        <div>
          <button className="btn-primary" type="submit" disabled={saving || ended}>
            {saving ? 'Saving…' : 'Save offer'}
          </button>
          {ended ? <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#64748B' }}>This campaign has ended.</span> : null}
        </div>
      </div>
    </form>
  );
}
