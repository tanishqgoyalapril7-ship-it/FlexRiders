import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { formatINR } from '../utils';

export const toneColors = (colors, tone) =>
  ({
    primary: { fg: colors.primary, bg: colors.primarySoft },
    success: { fg: colors.success, bg: colors.successSoft },
    warning: { fg: colors.warning, bg: colors.warningSoft },
    danger: { fg: colors.danger, bg: colors.dangerSoft },
  }[tone] || { fg: colors.textMuted, bg: colors.surfaceAlt });

const STATUS_TONES = {
  LIVE: 'success',
  ACTIVE: 'success',
  PAID: 'success',
  COMPLETED: 'success',
  OPEN: 'primary',
  REQUESTED: 'primary',
  ASSIGNED: 'primary',
  SUBMITTED: 'primary',
  FULL: 'warning',
  PAUSED: 'warning',
  REMOVED: 'danger',
  MISSED: 'danger',
  WITHDRAWN: 'danger',
  APPROVED: 'primary',
  PROCESSING: 'primary',
  PENDING: 'warning',
  UNDER_REVIEW: 'warning',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  INACTIVE: 'danger',
  FAILED: 'danger',
  CANCELLED: 'danger',
};

export function StatusBadge({ status }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  if (!status) return null;
  const { fg, bg } = toneColors(colors, STATUS_TONES[status]);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

export function Card({ style, children }) {
  const styles = useStyles(makeStyles);
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenHeader({ title, onBack, right }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <Text style={[styles.headerTitle, !onBack && { marginLeft: 0 }]}>{title}</Text>
      <View style={{ marginLeft: 'auto' }}>{right}</View>
    </View>
  );
}

export function IconButton({ icon, onPress, badge }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={styles.iconButton} onPress={onPress} hitSlop={8}>
      <Ionicons name={icon} size={20} color={colors.text} />
      {badge > 0 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function SectionHeader({ title, actionLabel, onAction }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function BrandAvatar({ brand, size = 44 }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.avatar, shape, { backgroundColor: brand ? colors.primary : colors.surfaceAlt }]}>
      {brand ? (
        <Text style={[styles.avatarLetter, { fontSize: size * 0.42 }]}>{brand.charAt(0).toUpperCase()}</Text>
      ) : (
        <Ionicons name="briefcase-outline" size={size * 0.45} color={colors.textMuted} />
      )}
    </View>
  );
}

export function EmptyState({ icon, title, message }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </Card>
  );
}

export function PrimaryButton({ label, onPress, loading, style }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[styles.primaryButton, style]} onPress={onPress} disabled={loading} activeOpacity={0.85}>
      {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryButtonText}>{label}</Text>}
    </TouchableOpacity>
  );
}

export function OutlineButton({ label, onPress, style, textStyle }) {
  const styles = useStyles(makeStyles);
  return (
    <TouchableOpacity style={[styles.outlineButton, style]} onPress={onPress} activeOpacity={0.85}>
      <Text style={[styles.outlineButtonText, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FilterPills({ options, value, onChange }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.pillsRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <TouchableOpacity
            key={option}
            style={[styles.pill, active && styles.pillActive]}
            onPress={() => onChange(option)}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// Blue summary card used on the Earnings and Payments screens.
export function WalletCard({ label, amount, paid, pending }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.wallet}>
      <View style={styles.walletTop}>
        <View>
          <Text style={styles.walletLabel}>{label}</Text>
          <Text style={styles.walletAmount}>{formatINR(amount)}</Text>
        </View>
        <View style={styles.walletIcon}>
          <Ionicons name="wallet-outline" size={22} color="#FFFFFF" />
        </View>
      </View>
      <View style={styles.walletBottom}>
        <View>
          <Text style={styles.walletLabel}>Paid</Text>
          <Text style={styles.walletSubAmount}>{formatINR(paid)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 40 }}>
          <Text style={styles.walletLabel}>Pending</Text>
          <Text style={styles.walletSubAmount}>{formatINR(pending)}</Text>
        </View>
      </View>
    </View>
  );
}

export function TransactionRow({ payment, last }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={[styles.transaction, last && { borderBottomWidth: 0 }]}>
      <BrandAvatar brand={payment.brand} size={36} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.transactionTitle}>{payment.brand}</Text>
        <Text style={styles.transactionDate}>{payment.dateLabel}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.transactionAmount}>{formatINR(payment.amount)}</Text>
        <StatusBadge status={payment.status} />
      </View>
    </View>
  );
}

export function ProgressBar({ value, max, color }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const percent = max ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color || colors.primary }]} />
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
    badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    card: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, padding: 16 },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 52 },
    headerTitle: { fontSize: 19, fontWeight: '700', color: c.text, marginLeft: 14 },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadge: {
      position: 'absolute',
      top: -3,
      right: -3,
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      paddingHorizontal: 3,
      backgroundColor: c.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, marginBottom: 10 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    sectionAction: { fontSize: 13, fontWeight: '600', color: c.primary },
    avatar: { alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: '#FFFFFF', fontWeight: '800' },
    empty: { alignItems: 'center', paddingVertical: 28 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    emptyMessage: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 4, lineHeight: 17 },
    primaryButton: { backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
    primaryButtonText: { color: c.onPrimary, fontSize: 15, fontWeight: '700' },
    outlineButton: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    outlineButtonText: { color: c.text, fontSize: 15, fontWeight: '600' },
    pillsRow: { flexDirection: 'row', gap: 8 },
    pill: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    pillActive: { backgroundColor: c.primary, borderColor: c.primary },
    pillText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    pillTextActive: { color: c.onPrimary },
    wallet: { backgroundColor: c.primary, borderRadius: 20, padding: 20 },
    walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    walletLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '500' },
    walletAmount: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 4 },
    walletIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    walletBottom: { flexDirection: 'row', marginTop: 18 },
    walletSubAmount: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', marginTop: 2 },
    transaction: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    transactionTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    transactionDate: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    transactionAmount: { fontSize: 15, fontWeight: '700', color: c.text },
    progressTrack: { height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4 },
  });
