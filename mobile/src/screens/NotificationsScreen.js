import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, FilterPills, IconButton, ScreenHeader, toneColors } from '../components/ui';
import ConfirmSheet from '../components/ConfirmSheet';

const FILTERS = ['All', 'Unread', 'Payments', 'System'];

export default function NotificationsScreen({ notifications, onBack, onMarkAllRead, onDelete, onClearAll, onOpenCampaign }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [filter, setFilter] = useState('All');
  const [confirm, setConfirm] = useState(null); // { notification } or { all: true }
  const visible = notifications.filter((n) => {
    if (filter === 'Unread') return n.unread;
    if (filter === 'Payments') return n.category === 'PAYMENT';
    if (filter === 'System') return n.category !== 'PAYMENT';
    return true;
  });
  const hasUnread = notifications.some((n) => n.unread);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Notifications"
        onBack={onBack}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {hasUnread ? <IconButton icon="checkmark-done-outline" onPress={onMarkAllRead} /> : null}
            {notifications.length ? <IconButton icon="trash-outline" onPress={() => setConfirm({ all: true })} /> : null}
          </View>
        }
      />
      <View style={{ marginBottom: 16 }}>
        <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title={filter === 'All' ? 'No notifications yet' : 'Nothing here'}
          message="Updates about your application, brand assignment and payouts will appear here."
        />
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {visible.map((n, i) => {
            const tone = toneColors(colors, n.tone);
            return (
              <View key={n.id} style={[styles.row, i === visible.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                  <Ionicons name={n.icon} size={18} color={tone.fg} />
                </View>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  disabled={!n.campaignId || !onOpenCampaign}
                  onPress={() => onOpenCampaign(n.campaignId)}
                  activeOpacity={0.7}
                  accessibilityRole={n.campaignId ? 'button' : undefined}
                >
                  <Text style={styles.title}>{n.title}</Text>
                  <Text style={styles.message}>{n.message}</Text>
                  <Text style={styles.time}>
                    {n.timeLabel}
                    {n.campaignId ? '  ·  Open campaign ›' : ''}
                  </Text>
                </TouchableOpacity>
                <View style={{ alignItems: 'center', gap: 10 }}>
                  {n.unread ? <View style={styles.unreadDot} /> : null}
                  <TouchableOpacity
                    onPress={() => setConfirm({ notification: n })}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete notification: ${n.title}`}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textSubtle} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <ConfirmSheet
        visible={Boolean(confirm)}
        title={confirm && confirm.all ? 'Delete all notifications?' : 'Delete notification?'}
        message={
          confirm && confirm.all
            ? `All ${notifications.length} notifications will be removed from your inbox. Your payments and campaign records are not affected.`
            : confirm
            ? `"${confirm.notification.title}" will be removed from your inbox.`
            : ''
        }
        confirmLabel={confirm && confirm.all ? 'Delete All' : 'Delete'}
        onConfirm={async () => {
          if (confirm.all) await onClearAll();
          else await onDelete(confirm.notification.id);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 14, fontWeight: '700', color: c.text },
    message: { fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 },
    time: { fontSize: 11, color: c.textSubtle, marginTop: 6 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 },
  });
