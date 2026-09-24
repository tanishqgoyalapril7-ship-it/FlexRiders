import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, ScreenHeader, SectionHeader, toneColors } from '../components/ui';
import { mobileApi } from '../services/api';
import { formatDate, formatINR } from '../utils';

const STEPS = [
  ['share-social-outline', 'Share your code or link with a friend'],
  ['person-add-outline', 'They register with your referral code'],
  ['flame-outline', 'They complete their first Photo Streak (Morning, Evening and Night approved)'],
  ['wallet-outline', 'You get the reward in your earnings'],
];

/** Settings → Refer & Earn. All figures come from the backend. */
export default function ReferScreen({ onBack }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      mobileApi
        .getReferrals()
        .then((d) => {
          setData(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const share = async () => {
    try {
      await Share.share({ message: data.share_message });
    } catch (err) {
      Alert.alert('Could not share', err.message);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <ScreenHeader title="Refer & Earn" onBack={onBack} />
      {!data ? (
        <EmptyState icon="gift-outline" title={error ? 'Could not load' : 'Loading'} message={error || 'Just a moment…'} />
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="gift" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.heroTitle}>Refer a friend and earn {formatINR(data.reward_amount)} 🎉</Text>
            <Text style={styles.heroText}>Get {formatINR(data.reward_amount)} when your friend completes their first Photo Streak.</Text>

            <Text style={styles.codeLabel}>Your referral code</Text>
            <View style={styles.codeBox}>
              <Text style={styles.code} selectable>
                {data.code}
              </Text>
            </View>
            <TouchableOpacity style={styles.shareButton} onPress={share} activeOpacity={0.85} accessibilityRole="button">
              <Ionicons name="share-social" size={18} color={colors.primary} />
              <Text style={styles.shareText}>Share Referral Link</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{data.successful_referrals}</Text>
              <Text style={styles.statLabel}>Successful referrals</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{formatINR(data.total_earnings)}</Text>
              <Text style={styles.statLabel}>Referral earnings</Text>
            </Card>
          </View>

          <SectionHeader title="How it works" />
          <Card style={{ gap: 12 }}>
            {STEPS.map(([icon, text], i) => (
              <View key={text} style={styles.step}>
                <View style={styles.stepIcon}>
                  <Ionicons name={icon} size={17} color={colors.primary} />
                </View>
                <Text style={styles.stepText}>
                  {i + 1}. {text}
                </Text>
              </View>
            ))}
            <Text style={styles.note}>The reward is paid once per friend, to you (not to your friend), and is paid out with your other earnings.</Text>
          </Card>

          <SectionHeader title="Referral History" />
          {data.history.length === 0 ? (
            <EmptyState icon="people-outline" title="No referrals yet" message="Friends who register with your code will appear here." />
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {data.history.map((r, i) => {
                const rewarded = r.status === 'REWARDED';
                const tone = toneColors(colors, rewarded ? 'success' : 'warning');
                return (
                  <View key={r.id} style={[styles.historyRow, i === data.history.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={[styles.avatar, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.avatarText, { color: tone.fg }]}>{r.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyName}>{r.name}</Text>
                      <Text style={styles.historyMeta}>
                        Joined {formatDate(r.joined_at)}
                        {rewarded ? ` · Rewarded ${formatDate(r.rewarded_at)}` : ' · Waiting for first Photo Streak'}
                      </Text>
                    </View>
                    {rewarded ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.reward, { color: colors.success }]}>+{formatINR(r.reward)}</Text>
                        <Text style={styles.historyMeta}>{r.reward_paid ? 'Paid' : 'Pending payout'}</Text>
                      </View>
                    ) : (
                      <Ionicons name="time-outline" size={18} color={colors.warning} />
                    )}
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 36 },
    hero: { backgroundColor: c.hero, borderRadius: 20, padding: 20, alignItems: 'center' },
    heroIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
    heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 12 },
    heroText: { color: c.heroMuted, fontSize: 13.5, textAlign: 'center', marginTop: 6, lineHeight: 19 },
    codeLabel: { color: c.heroMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 18 },
    codeBox: { marginTop: 8, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.45)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
    code: { color: '#FFFFFF', fontSize: 24, fontWeight: '800', letterSpacing: 3 },
    shareButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 22, marginTop: 16, alignSelf: 'stretch', justifyContent: 'center' },
    shareText: { color: c.primary, fontSize: 15, fontWeight: '800' },
    statsRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
    statCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    statValue: { fontSize: 22, fontWeight: '800', color: c.text },
    statLabel: { fontSize: 12, color: c.textMuted, marginTop: 3 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    stepIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    stepText: { flex: 1, fontSize: 13.5, color: c.text, lineHeight: 19 },
    note: { fontSize: 12, color: c.textMuted, lineHeight: 17 },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
    avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 16, fontWeight: '800' },
    historyName: { fontSize: 14.5, fontWeight: '700', color: c.text },
    historyMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    reward: { fontSize: 15, fontWeight: '800' },
  });
