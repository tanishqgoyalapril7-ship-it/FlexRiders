import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { useT } from '../i18n';
import { Badge, Button, Card, Empty, Header, Section } from '../components/ds';
import { formatDateRange, formatINR } from '../utils';

const PAYOUT_TONE = { PAID: ['Paid', 'success'], PARTIALLY_PAID: ['Part paid', 'primary'], APPROVED: ['Approved', 'primary'], PENDING: ['Pending', 'warning'] };

/** Earnings from the backend's single calculation: totals, per campaign, referral rewards, payout method. */
export default function EarningsScreen({ rider, earnings, onBack, onViewAll, onEditUpi, onChanged }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const [referrals, setReferrals] = useState(null);
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    mobileApi.getReferrals().then(setReferrals).catch(() => setReferrals(null));
  }, []);

  const withdraw = async () => {
    setRequesting(true);
    try {
      const res = await mobileApi.requestPayout();
      Alert.alert(res.requested ? 'Payout requested' : 'Already requested', res.message);
      onChanged && onChanged();
    } catch (err) {
      Alert.alert('Could not request payout', err.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Header title={t('Earnings')} onBack={onBack} circle={false} />
      <View style={s.hero}>
        <Text style={s.heroLabel}>{t('Total Earned')}</Text>
        <Text style={s.heroValue}>{formatINR(earnings.total)}</Text>
        <View style={s.heroDivider} />
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroLabel}>Pending Payout</Text>
            <Text style={s.heroSmall}>{formatINR(earnings.pending)}</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.heroLabel}>Completed (Paid)</Text>
            <Text style={s.heroSmall}>{formatINR(earnings.paid)}</Text>
          </View>
        </View>
      </View>

      <Section>Campaign Earnings</Section>
      {earnings.campaigns.length === 0 ? (
        <Card>
          <Empty icon="wallet-outline" title="No campaign earnings yet" text="Each approved campaign day adds to your earnings here." />
        </Card>
      ) : (
        earnings.campaigns.map((c) => {
          const [label, tone] = c.pending > 0 ? PAYOUT_TONE[c.payout_status] || PAYOUT_TONE.PENDING : PAYOUT_TONE.PAID;
          return (
            <Card key={c.campaign_id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle} numberOfLines={1}>{c.campaign_name}</Text>
                <Text style={s.rowSub}>
                  {c.approved_days} approved day{c.approved_days === 1 ? '' : 's'} × {formatINR(c.daily_rate)}
                  {c.start_date && c.end_date ? ` · ${formatDateRange(c.start_date, c.end_date)}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.amount}>{formatINR(c.earned)}</Text>
                <Badge label={label} tone={tone} />
              </View>
            </Card>
          );
        })
      )}

      {referrals ? (
        <Card style={s.row}>
          <View style={s.iconBox}>
            <Ionicons name="gift-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>Referral Rewards</Text>
            <Text style={s.rowSub}>{referrals.successful_referrals} successful referral{referrals.successful_referrals === 1 ? '' : 's'}</Text>
          </View>
          <Text style={[s.amount, { color: colors.success }]}>+{formatINR(referrals.total_earnings)}</Text>
        </Card>
      ) : null}

      <Card style={{ marginTop: 6 }}>
        <Text style={s.caption}>YOUR PAYOUT METHOD</Text>
        <TouchableOpacity style={[s.row, { marginBottom: 0, padding: 0, borderWidth: 0 }]} onPress={onEditUpi}>
          <View style={s.iconBox}>
            <Ionicons name="card-outline" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>UPI ID</Text>
            <Text style={s.rowSub}>{rider.upi_id || 'Not added yet'}</Text>
          </View>
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </Card>

      <TouchableOpacity onPress={onViewAll} style={{ alignItems: 'center', paddingVertical: 16 }}>
        <Text style={s.link}>View payment history</Text>
      </TouchableOpacity>
      <Button label={t('Withdraw Earnings')} onPress={withdraw} loading={requesting} disabled={!(earnings.pending > 0)} />
      <Text style={s.note}>Payouts are sent by the FlexRiders payments team to your UPI ID.</Text>
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    hero: { backgroundColor: c.hero, borderRadius: 24, padding: 22 },
    heroLabel: { color: '#C7D2FE', fontSize: 14 },
    heroValue: { color: '#FFFFFF', fontSize: 40, fontWeight: '800', marginTop: 6 },
    heroSmall: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 4 },
    heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 18 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    rowTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    rowSub: { fontSize: 13, color: c.textMuted, marginTop: 3 },
    amount: { fontSize: 17, fontWeight: '800', color: c.text },
    iconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    caption: { fontSize: 13, fontWeight: '800', color: c.textMuted, letterSpacing: 0.5, marginBottom: 12 },
    link: { color: c.primary, fontWeight: '700', fontSize: 15 },
    note: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 10 },
  });
