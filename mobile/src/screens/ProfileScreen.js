import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, OutlineButton, ScreenHeader, SectionHeader, StatusBadge } from '../components/ui';
import { getInitials } from '../utils';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

export default function ProfileScreen({ rider, onLogout }) {
  const styles = useStyles(makeStyles);
  const { colors, preference, setPreference } = useTheme();
  const rows = [
    { icon: 'call-outline', label: 'Mobile Number', value: rider.phone },
    { icon: 'mail-outline', label: 'Email', value: rider.email },
    { icon: 'bicycle-outline', label: 'Vehicle', value: rider.vehicle },
    { icon: 'location-outline', label: 'Location', value: rider.location },
    { icon: 'wallet-outline', label: 'UPI ID', value: rider.upi_id },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Profile" />

      <Card style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{getInitials(rider.name)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 14, gap: 4 }}>
          <Text style={styles.name} numberOfLines={1}>{rider.name || 'Rider'}</Text>
          <Text style={styles.riderId}>Rider ID: {rider.rider_id || '—'}</Text>
          <StatusBadge status={rider.status} />
        </View>
      </Card>

      <SectionHeader title="Appearance" />
      <View style={styles.segmented}>
        {THEME_OPTIONS.map((option) => {
          const active = preference === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setPreference(option.value)}
              activeOpacity={0.8}
            >
              <Ionicons name={option.icon} size={16} color={active ? colors.onPrimary : colors.textMuted} />
              <Text style={[styles.segmentText, active && { color: colors.onPrimary }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SectionHeader title="Personal Details" />
      <Card style={{ paddingVertical: 4 }}>
        {rows.map((row, i) => (
          <View key={row.label} style={[styles.row, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
            <Ionicons name={row.icon} size={18} color={colors.textMuted} style={{ width: 28 }} />
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Text style={styles.rowValue} numberOfLines={1}>{row.value || 'Not provided'}</Text>
          </View>
        ))}
      </Card>

      <OutlineButton
        label="Log Out"
        onPress={onLogout}
        style={{ marginTop: 24, borderColor: colors.danger }}
        textStyle={{ color: colors.danger }}
      />
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    header: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: { fontSize: 24, fontWeight: '800', color: c.primary },
    name: { fontSize: 19, fontWeight: '800', color: c.text },
    riderId: { fontSize: 13, color: c.textMuted },
    segmented: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 4,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    rowLabel: { fontSize: 14, color: c.textMuted, flex: 1 },
    rowValue: { fontSize: 14, fontWeight: '600', color: c.text, maxWidth: '55%', textAlign: 'right' },
  });
