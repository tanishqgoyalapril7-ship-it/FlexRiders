import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, FilterPills, IconButton, ScreenHeader, toneColors } from '../components/ui';

const FILTERS = ['All', 'Unread', 'Payments', 'System'];

export default function NotificationsScreen({ notifications, onBack, onMarkAllRead }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [filter, setFilter] = useState('All');
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
        right={hasUnread ? <IconButton icon="checkmark-done-outline" onPress={onMarkAllRead} /> : null}
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
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{n.title}</Text>
                  <Text style={styles.message}>{n.message}</Text>
                  <Text style={styles.time}>{n.timeLabel}</Text>
                </View>
                {n.unread ? <View style={styles.unreadDot} /> : null}
              </View>
            );
          })}
        </Card>
      )}
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
