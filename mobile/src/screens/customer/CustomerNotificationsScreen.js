import React from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../../theme';
import { Card } from '../../components/ui';
import { Header as ScreenHeader } from '../../components/ds';
import { formatDateTime } from '../../utils';

export default function CustomerNotificationsScreen({
  notifications = [],
  loading,
  onRefresh,
  onBack,
  onMarkRead,
  onOpenCampaign,
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();

  const renderItem = ({ item }) => {
    const isUnread = !item.is_read;
    const isChanges = item.title?.includes('Changes') || item.category === 'CHANGES_REQUIRED';
    const isApproved = item.title?.includes('Approved');

    let iconName = 'notifications-outline';
    let iconColor = colors.primary;
    let iconBg = colors.primarySoft;

    if (isChanges) {
      iconName = 'warning-outline';
      iconColor = colors.danger;
      iconBg = colors.dangerSoft;
    } else if (isApproved) {
      iconName = 'checkmark-circle-outline';
      iconColor = colors.success;
      iconBg = colors.successSoft;
    }

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          if (isUnread && onMarkRead) onMarkRead(item.id);
          if (item.reference_id && onOpenCampaign) {
            const campaignId = Number(item.reference_id);
            if (!isNaN(campaignId)) onOpenCampaign(campaignId);
          }
        }}
        style={{ marginBottom: 10 }}
      >
        <Card style={[styles.notifCard, isUnread && styles.notifCardUnread]}>
          <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
            <Ionicons name={iconName} size={20} color={iconColor} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.notifTitle, isUnread && styles.notifTitleBold]}>
                {item.title}
              </Text>
              {isUnread && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.notifMsg}>{item.message}</Text>
            <Text style={styles.notifTime}>{formatDateTime(item.created_at)}</Text>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerWrap}>
        <ScreenHeader title="Notifications" onBack={onBack} />
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={Boolean(loading)} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <Card style={styles.emptyCard}>
            <Ionicons name="notifications-off-outline" size={40} color={colors.textMuted} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyTitle}>No Notifications</Text>
            <Text style={styles.emptyDesc}>You're all caught up! Campaign updates and approvals will appear here.</Text>
          </Card>
        }
      />
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    headerWrap: { paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.border, paddingBottom: 10 },
    listContent: { padding: 16, paddingBottom: 40 },
    notifCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderRadius: 12, gap: 12 },
    notifCardUnread: { borderColor: colors.primary, borderWidth: 1 },
    iconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    notifTitle: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1 },
    notifTitleBold: { fontWeight: '800' },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginLeft: 6 },
    notifMsg: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 6 },
    notifTime: { fontSize: 11, color: colors.textSubtle },
    emptyCard: { padding: 32, alignItems: 'center', textAlign: 'center', marginTop: 30 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
    emptyDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  });
