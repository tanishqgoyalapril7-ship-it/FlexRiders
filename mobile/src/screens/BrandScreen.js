import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { BrandAvatar, Card, ScreenHeader, SectionHeader, StatusBadge } from '../components/ui';

export default function BrandScreen({ rider, onBack, onShowDocuments, onSupport }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const details = [
    ['Brand', rider.brand || 'Not assigned yet'],
    ['Application Status', rider.status ? rider.status.replace('_', ' ') : '—'],
    ['Assigned On', rider.assigned_on || '—'],
    ['Assigned By', rider.assigned_by || '—'],
    ['Rider ID', rider.rider_id || '—'],
  ];
  const actions = [
    { label: 'View Documents', icon: 'document-text-outline', onPress: onShowDocuments },
    { label: 'Get Support', icon: 'headset-outline', onPress: onSupport },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="My Brand" onBack={onBack} />

      <Card style={styles.brandCard}>
        <BrandAvatar brand={rider.brand} size={52} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.brandName} numberOfLines={1}>{rider.brand || 'Not assigned yet'}</Text>
          <Text style={styles.brandSub}>
            {rider.assigned_on ? `Since ${rider.assigned_on}` : 'Awaiting brand assignment'}
          </Text>
        </View>
        <StatusBadge status={rider.status} />
      </Card>

      <SectionHeader title="Assignment Details" />
      <Card style={{ paddingVertical: 4 }}>
        {details.map(([label, value], i) => (
          <View key={label} style={[styles.row, i === details.length - 1 && { borderBottomWidth: 0 }]}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
          </View>
        ))}
      </Card>

      <View style={styles.actions}>
        {actions.map((a) => (
          <TouchableOpacity key={a.label} style={styles.actionTile} onPress={a.onPress} activeOpacity={0.8}>
            <Ionicons name={a.icon} size={26} color={colors.primary} />
            <Text style={styles.actionLabel}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    brandCard: { flexDirection: 'row', alignItems: 'center' },
    brandName: { fontSize: 20, fontWeight: '800', color: c.text },
    brandSub: { fontSize: 13, color: c.textMuted, marginTop: 3 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowLabel: { fontSize: 14, color: c.textMuted },
    rowValue: { fontSize: 14, fontWeight: '600', color: c.text },
    actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
    actionTile: {
      flex: 1,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      paddingVertical: 20,
      alignItems: 'center',
      gap: 8,
    },
    actionLabel: { fontSize: 13, fontWeight: '600', color: c.text },
  });
