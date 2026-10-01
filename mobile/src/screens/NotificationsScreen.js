import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { EmptyState, FilterPills, IconButton, toneColors } from '../components/ui';
import { Header } from '../components/ds';

// "10 mins ago", "2 hours ago", "Yesterday", or the date.
function ago(iso) {
  if (!iso) return '';
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24 && d.toDateString() === new Date().toDateString()) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
const isToday = (iso) => iso && new Date(/Z|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`).toDateString() === new Date().toDateString();
import ConfirmSheet from '../components/ConfirmSheet';

const FILTERS = ['All', 'Unread', 'Payments', 'System'];

export default function NotificationsScreen({ notifications, onBack, onMarkAllRead, onDelete, onClearAll, onOpenCampaign, onOpenSupport }) {
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
      <Header
        title="Notifications"
        onBack={onBack}
        circle={false}
        right={
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            {hasUnread ? <IconButton icon="checkmark-done-outline" onPress={onMarkAllRead} /> : null}
            {notifications.length ? (
              <TouchableOpacity onPress={() => setConfirm({ all: true })}>
                <Text style={styles.clear}>Clear All</Text>
              </TouchableOpacity>
            ) : null}
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
        [['TODAY', visible.filter((n) => isToday(n.createdAt))], ['EARLIER', visible.filter((n) => !isToday(n.createdAt))]].map(([group, items]) =>
          items.length ? (
            <View key={group}>
              <Text style={styles.group}>{group}</Text>
              {items.map((n) => {
                const tone = toneColors(colors, n.tone);
                const opens = (n.campaignId && onOpenCampaign) || (n.supportId && onOpenSupport);
                return (
                  <TouchableOpacity
                    key={n.id}
                    style={styles.card}
                    disabled={!opens}
                    onPress={() => (n.supportId ? onOpenSupport(n.supportId) : onOpenCampaign(n.campaignId))}
                    onLongPress={() => setConfirm({ notification: n })}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.icon, { backgroundColor: tone.bg }]}>
                      <Ionicons name={n.icon} size={22} color={tone.fg} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={styles.title} numberOfLines={1}>{n.title}</Text>
                        <Text style={styles.time}>{ago(n.createdAt) || n.timeLabel}</Text>
                      </View>
                      <Text style={styles.message}>{n.message}</Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 10 }}>
                      {n.unread ? <View style={styles.unreadDot} /> : null}
                      {opens ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
                      <TouchableOpacity onPress={() => setConfirm({ notification: n })} hitSlop={10} accessibilityLabel={`Delete notification: ${n.title}`}>
                        <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null
        )
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
    group: { fontSize: 14, fontWeight: '800', color: c.textMuted, letterSpacing: 0.5, marginTop: 10, marginBottom: 10 },
    card: { flexDirection: 'row', gap: 14, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 12 },
    icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 16, fontWeight: '800', color: c.text, flex: 1 },
    message: { fontSize: 14, color: c.textMuted, marginTop: 4, lineHeight: 20 },
    time: { fontSize: 12, color: c.textMuted },
    clear: { color: c.primary, fontWeight: '700', fontSize: 15 },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 6 },
  });
