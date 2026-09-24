import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStyles } from '../theme';
import { Card, EmptyState, ScreenHeader, SectionHeader, TransactionRow, WalletCard } from '../components/ui';
import { formatINR } from '../utils';

function WeekChart({ days }) {
  const styles = useStyles(makeStyles);
  const max = Math.max(...days.map((d) => d.amount), 0);
  return (
    <Card>
      <View style={styles.chart}>
        {days.map((day, i) => (
          <View key={i} style={styles.barColumn}>
            <Text style={styles.barValue}>{day.amount ? formatINR(day.amount) : ''}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.bar, { height: max ? `${Math.max((day.amount / max) * 100, 4)}%` : '4%' }]} />
            </View>
            <Text style={styles.barLabel}>{day.label}</Text>
          </View>
        ))}
      </View>
      {max === 0 ? <Text style={styles.chartEmpty}>No earnings in the last 7 days</Text> : null}
    </Card>
  );
}

export default function EarningsScreen({ earnings, payments, onBack, onViewAll }) {
  const styles = useStyles(makeStyles);
  const periods = [
    ['Today', earnings.today],
    ['Last 7 Days', earnings.week],
    ['This Month', earnings.month],
    ['Last Month', earnings.lastMonth],
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Earnings" onBack={onBack} />
      <WalletCard label="Total Earnings" amount={earnings.total} paid={earnings.paid} pending={earnings.pending} />

      <SectionHeader title="Last 7 Days" />
      <WeekChart days={earnings.lastSevenDays} />

      <View style={styles.periodGrid}>
        {periods.map(([label, amount]) => (
          <Card key={label} style={styles.periodCard}>
            <Text style={styles.periodLabel}>{label}</Text>
            <Text style={styles.periodValue}>{formatINR(amount)}</Text>
          </Card>
        ))}
      </View>

      <SectionHeader title="Campaign Earnings" />
      {earnings.campaigns.length === 0 ? (
        <EmptyState icon="flag-outline" title="No campaign earnings yet" message="Each completed Photo-Day (Morning, Evening and Night approved) earns the campaign's daily rate." />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {earnings.campaigns.map((c, i) => (
            <View key={`${c.campaign_id}-${i}`} style={[styles.campaignRow, i === earnings.campaigns.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.campaignName}>{c.campaign_name}</Text>
                <Text style={styles.campaignMeta}>
                  {c.approved_days} approved day{c.approved_days === 1 ? '' : 's'} × {formatINR(c.daily_rate)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.campaignEarned}>{formatINR(c.earned)}</Text>
                <Text style={styles.campaignMeta}>
                  Paid {formatINR(c.paid)} · Pending {formatINR(c.pending)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <SectionHeader title="Recent Transactions" actionLabel={payments.length ? 'View All' : null} onAction={onViewAll} />
      {payments.length === 0 ? (
        <EmptyState icon="wallet-outline" title="No payouts yet" message="Payouts sent to your UPI ID will appear here." />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {payments.slice(0, 5).map((p, i) => (
            <TransactionRow key={p.id} payment={p} last={i === Math.min(payments.length, 5) - 1} />
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    chart: { flexDirection: 'row', height: 150, alignItems: 'flex-end', gap: 8 },
    barColumn: { flex: 1, alignItems: 'center', height: '100%' },
    barValue: { fontSize: 9, color: c.textMuted, height: 14 },
    barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', marginVertical: 4 },
    bar: { width: '100%', backgroundColor: c.primary, borderRadius: 6 },
    barLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600' },
    chartEmpty: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 10 },
    periodGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, marginTop: 12 },
    periodCard: { width: '48.5%', paddingVertical: 14 },
    campaignRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
    campaignName: { fontSize: 14.5, fontWeight: '700', color: c.text },
    campaignMeta: { fontSize: 12, color: c.textMuted, marginTop: 3 },
    campaignEarned: { fontSize: 16, fontWeight: '800', color: c.text },
    periodLabel: { fontSize: 12, color: c.textMuted },
    periodValue: { fontSize: 20, fontWeight: '800', color: c.primary, marginTop: 4 },
  });
