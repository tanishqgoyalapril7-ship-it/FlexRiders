import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { assetUrl, mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, OutlineButton, PrimaryButton, ProgressBar, ScreenHeader, SectionHeader, StatusBadge, toneColors } from '../components/ui';
import { formatDate, formatDateRange, formatINR, formatShortDate } from '../utils';

const DAY_STYLES = {
  COMPLETED: { icon: 'checkmark-circle', tone: 'success', label: 'Completed' },
  SUBMITTED: { icon: 'time-outline', tone: 'primary', label: 'In review' },
  REJECTED: { icon: 'close-circle', tone: 'danger', label: 'Rejected' },
  MISSED: { icon: 'close-circle-outline', tone: 'danger', label: 'Missed' },
  DUE: { icon: 'ellipse-outline', tone: 'warning', label: 'Due today' },
};

async function pickPhoto(source) {
  const options = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Camera access is needed to take your proof photo.');
    return ImagePicker.launchCameraAsync(options);
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Photo library access is needed to choose your proof photo.');
  return ImagePicker.launchImageLibraryAsync(options);
}

function askPhotoSource() {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Take Photo', 'Choose from Library', 'Cancel'], cancelButtonIndex: 2 },
        (index) => resolve(index === 0 ? 'camera' : index === 1 ? 'library' : null)
      );
    } else {
      Alert.alert("Upload today's proof", 'Choose a photo source', [
        { text: 'Take Photo', onPress: () => resolve('camera') },
        { text: 'Choose from Library', onPress: () => resolve('library') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}

export default function CampaignDetailScreen({ campaignId, onBack, onChanged }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [campaign, setCampaign] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      mobileApi
        .getCampaign(campaignId)
        .then(setCampaign)
        .catch((err) => Alert.alert('Could not load campaign', err.message)),
    [campaignId]
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    await load();
    await onChanged();
  };

  const join = async () => {
    setBusy(true);
    try {
      await mobileApi.joinCampaign(campaignId);
      Alert.alert('Request sent', "You'll be notified once an admin reviews your request.");
      await refresh();
    } catch (err) {
      Alert.alert('Could not join', err.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadProof = async () => {
    const source = await askPhotoSource();
    if (!source) return;
    try {
      const result = await pickPhoto(source);
      if (result.canceled || !result.assets || !result.assets.length) return;
      setBusy(true);
      await mobileApi.uploadCampaignProof(campaignId, result.assets[0]);
      Alert.alert('Proof submitted', "Today's photo has been sent for review. The day counts towards your payout once it's approved.");
      await refresh();
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!campaign) {
    return (
      <View style={styles.screen}>
        <View style={styles.content}>
          <ScreenHeader title="Campaign" onBack={onBack} />
          <EmptyState icon="megaphone-outline" title="Loading campaign" message="Just a moment…" />
        </View>
      </View>
    );
  }

  const p = campaign.progress;
  // While uploads are open, today is always the last day of the rider's timeline.
  const today = p && p.can_submit_today ? p.days[p.days.length - 1] : null;
  const full = campaign.remaining_slots === 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Campaign" onBack={onBack} />

      {campaign.image_url ? <Image source={{ uri: assetUrl(campaign.image_url) }} style={styles.banner} /> : null}

      <Card>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{campaign.name}</Text>
            <Text style={styles.brand}>{campaign.brand_name}</Text>
          </View>
          <StatusBadge status={campaign.my_status || campaign.status} />
        </View>
        <View style={styles.infoGrid}>
          {[
            ['calendar-outline', 'Dates', formatDateRange(campaign.start_date, campaign.end_date)],
            ['cash-outline', 'Daily payout', `${formatINR(campaign.daily_rate)} / eligible day`],
            ['people-outline', 'Slots', `${campaign.filled_slots} / ${campaign.total_slots} assigned`],
            ['flag-outline', 'Campaign status', campaign.status.charAt(0) + campaign.status.slice(1).toLowerCase()],
          ].map(([icon, label, value]) => (
            <View key={label} style={styles.infoItem}>
              <Ionicons name={icon} size={16} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={styles.infoValue}>{value}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ gap: 6, marginTop: 14 }}>
          <Text style={[styles.infoLabel, { color: full ? colors.warning : colors.primary, fontWeight: '700' }]}>
            {full ? 'All slots are filled' : `${campaign.remaining_slots} of ${campaign.total_slots} slots available`}
          </Text>
          <ProgressBar value={campaign.filled_slots} max={campaign.total_slots} color={full ? colors.warning : colors.primary} />
        </View>
      </Card>

      {p ? (
        <>
          <SectionHeader title="My Progress" />
          <View style={styles.progressGrid}>
            {[
              ['Days completed', p.completed_days],
              ['Current streak', `${p.current_streak} days`],
              ['Eligible days', p.eligible_days],
              ['Total earned', formatINR(p.earned)],
              ['Remaining days', p.remaining_days],
              ['Pending payout', formatINR(p.pending)],
            ].map(([label, value]) => (
              <Card key={label} style={styles.progressCard}>
                <Text style={styles.progressValue}>{value}</Text>
                <Text style={styles.infoLabel}>{label}</Text>
              </Card>
            ))}
          </View>

          {p.can_submit_today ? (
            <Card style={[styles.todayCard, { borderColor: colors.primary }]}>
              <View style={styles.todayIcon}>
                <Ionicons name="camera-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.todayTitle}>
                  {today && today.status === 'SUBMITTED'
                    ? 'Proof submitted for today'
                    : today && today.status === 'REJECTED'
                    ? "Today's proof was rejected"
                    : "Upload today's proof"}
                </Text>
                <Text style={styles.todayText}>
                  {today && today.status === 'SUBMITTED'
                    ? "It's awaiting review. You can replace it with a better photo."
                    : today && today.status === 'REJECTED'
                    ? `Reason: ${today.rejection_reason}. Upload a new photo.`
                    : `Complete today's requirement and upload a photo to earn ${formatINR(p.daily_rate)}.`}
                </Text>
                <PrimaryButton
                  label={today && today.status !== 'DUE' ? 'Replace Photo' : 'Upload Photo'}
                  onPress={uploadProof}
                  loading={busy}
                  style={{ marginTop: 12, paddingVertical: 12 }}
                />
              </View>
            </Card>
          ) : null}

          <SectionHeader title="Daily Activity" />
          {p.days.length === 0 ? (
            <EmptyState icon="calendar-outline" title="Campaign hasn't started" message={`Your first day is ${formatDate(campaign.start_date)}.`} />
          ) : (
            <Card style={{ paddingVertical: 4 }}>
              {p.days
                .slice()
                .reverse()
                .map((day, i) => {
                  const style = DAY_STYLES[day.status] || DAY_STYLES.MISSED;
                  const tone = toneColors(colors, style.tone);
                  return (
                    <View key={day.date} style={[styles.dayRow, i === p.days.length - 1 && { borderBottomWidth: 0 }]}>
                      <Ionicons name={style.icon} size={22} color={tone.fg} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dayTitle}>
                          Day {day.day_number} · {formatShortDate(day.date)}
                        </Text>
                        <Text style={[styles.dayStatus, { color: tone.fg }]}>{style.label}</Text>
                        {day.rejection_reason ? <Text style={styles.dayReason}>{day.rejection_reason}</Text> : null}
                      </View>
                      {day.photo_url ? <Image source={{ uri: assetUrl(day.photo_url) }} style={styles.thumb} /> : null}
                      <Text style={styles.dayEarned}>{formatINR(day.earned)}</Text>
                    </View>
                  );
                })}
            </Card>
          )}
        </>
      ) : null}

      {campaign.description ? (
        <>
          <SectionHeader title="About" />
          <Card>
            <Text style={styles.body}>{campaign.description}</Text>
          </Card>
        </>
      ) : null}

      {campaign.rules.length ? (
        <>
          <SectionHeader title="Requirements" />
          <Card style={{ gap: 10 }}>
            {campaign.rules.map((rule) => (
              <View key={rule} style={styles.ruleRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.body}>{rule}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!p ? (
        <View style={{ marginTop: 20 }}>
          {campaign.can_join ? (
            <PrimaryButton label="Join Campaign" onPress={join} loading={busy} />
          ) : campaign.join_blocked_reason ? (
            <View style={styles.blocked}>
              <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
              <Text style={styles.blockedText}>{campaign.join_blocked_reason}</Text>
            </View>
          ) : null}
          {campaign.my_status === 'REQUESTED' ? (
            <OutlineButton
              label="Withdraw Request"
              style={{ marginTop: 12, borderColor: colors.danger }}
              textStyle={{ color: colors.danger }}
              onPress={async () => {
                try {
                  await mobileApi.withdrawCampaignRequest(campaignId);
                  await refresh();
                } catch (err) {
                  Alert.alert('Could not withdraw', err.message);
                }
              }}
            />
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    banner: { width: '100%', height: 150, borderRadius: 16, marginBottom: 14, backgroundColor: c.surfaceAlt },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    title: { fontSize: 20, fontWeight: '800', color: c.text },
    brand: { fontSize: 14, color: c.textMuted, marginTop: 3 },
    infoGrid: { marginTop: 16, gap: 12 },
    infoItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    infoLabel: { fontSize: 12, color: c.textMuted },
    infoValue: { fontSize: 14, fontWeight: '600', color: c.text, marginTop: 1 },
    progressGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
    progressCard: { width: '31.5%', paddingVertical: 12, paddingHorizontal: 10 },
    progressValue: { fontSize: 17, fontWeight: '800', color: c.text, marginBottom: 2 },
    todayCard: { flexDirection: 'row', gap: 12, marginTop: 14 },
    todayIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    todayTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    todayText: { fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 },
    dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    dayTitle: { fontSize: 14, fontWeight: '600', color: c.text },
    dayStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    dayReason: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: c.surfaceAlt },
    dayEarned: { fontSize: 14, fontWeight: '700', color: c.text, minWidth: 44, textAlign: 'right' },
    body: { flex: 1, fontSize: 14, color: c.text, lineHeight: 20 },
    ruleRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    blocked: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 14 },
    blockedText: { flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 18 },
  });
