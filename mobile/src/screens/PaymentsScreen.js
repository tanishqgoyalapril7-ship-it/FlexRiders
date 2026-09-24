import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useStyles } from '../theme';
import { Card, EmptyState, FilterPills, ScreenHeader, TransactionRow, WalletCard } from '../components/ui';

const FILTERS = ['All', 'Paid', 'Pending', 'Failed'];

export default function PaymentsScreen({ rider, payments, onBack }) {
  const styles = useStyles(makeStyles);
  const [filter, setFilter] = useState('All');
  const visible = filter === 'All' ? payments : payments.filter((p) => p.status === filter.toUpperCase());

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Payments" onBack={onBack} />
      <WalletCard label="Total Paid" amount={rider.paid} paid={rider.paid} pending={rider.pending} />

      <View style={{ marginVertical: 18 }}>
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title={filter === 'All' ? 'No payments yet' : `No ${filter.toLowerCase()} payments`}
          message="Payouts sent to your UPI ID will be listed here."
        />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {visible.map((p, i) => (
            <TransactionRow key={p.id} payment={p} last={i === visible.length - 1} />
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
  });
