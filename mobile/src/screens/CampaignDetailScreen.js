import React, { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { assetUrl, mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, OutlineButton, PrimaryButton, ProgressBar, ScreenHeader, SectionHeader, StatusBadge, toneColors } from '../components/ui';
import { formatDate, formatDateRange, formatINR, formatShortDate } from '../utils';
import { PickupCard, RequestStatusCard, useJoinCampaign } from '../components/KitPickup';

const DAY_STYLES = {
  COMPLETED: { icon: 'checkmark-circle', tone: 'success', label: 'Completed' },
  SUBMITTED: { icon: 'time-outline', tone: 'primary', label: 'In review' },
  REJECTED: { icon: 'close-circle', tone: 'danger', label: 'Rejected' },
  INCOMPLETE: { icon: 'remove-circle-outline', tone: 'danger', label: 'Incomplete' },
  MISSED: { icon: 'close-circle-outline', tone: 'danger', label: 'Missed' },
  DUE: { icon: 'ellipse-outline', tone: 'warning', label: 'Due today' },
  EXCUSED: { icon: 'medkit-outline', tone: 'neutral', label: 'Excused' },
};

const PHOTO_STYLES = {
  APPROVED: { icon: 'checkmark-circle', tone: 'success' },
  PENDING: { icon: 'time', tone: 'primary' },
  REJECTED: { icon: 'close-circle', tone: 'danger' },
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

  // The hook needs a campaign; before it loads, joining isn't possible anyway.
  const joinFlow = useJoinCampaign(campaign || { id: campaignId, name: 'this campaign' }, refresh);

  const uploadProof = async () => {
    const source = await askPhotoSource();
    if (!source) return;
    try {
      const result = await pickPhoto(source);
      if (result.canceled || !result.assets || !result.assets.length) return;
      setBusy(true);
      const res = await mobileApi.uploadCampaignProof(campaignId, result.assets[0]);
      const sent = (res && res.photos_valid + res.photos_pending) || 1;
      const required = (res && res.photos_required) || 3;
      Alert.alert(
        'Photo submitted',
        sent >= required
          ? `All ${required} photos for today are in. Your day (and streak) counts once they're approved.`
          : `Photo ${sent} of ${required} sent for review. Upload ${required - sent} more to complete today.`
      );
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
  // Today is the last day of the rider's timeline while it falls within their campaign period.
  const todayPhotos = p ? p.today_photos : null;
  const today = p && todayPhotos && todayPhotos.in_window ? p.days.find((d) => d.date === todayPhotos.date) : null;
  const required = p ? p.photos_required : 3;
  const todayValid = todayPhotos ? Math.min(todayPhotos.valid, required) : 0;
  const todaySent = todayPhotos ? todayPhotos.valid + todayPhotos.pending : 0;
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
            ['people-outline', 'Slots', `${campaign.filled_slots} / ${campaign.slot_capacity || campaign.total_slots} assigned`],
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
            {full ? 'All slots are filled' : `${campaign.remaining_slots} of ${campaign.slot_capacity || campaign.total_slots} slots available`}
          </Text>
          <ProgressBar value={campaign.filled_slots} max={campaign.slot_capacity || campaign.total_slots} color={full ? colors.warning : colors.primary} />
        </View>
      </Card>

      {p && p.target_reached ? (
        <View style={[styles.targetBanner, { marginTop: 14 }]}>
          <Ionicons name="trophy-outline" size={20} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.todayTitle, { color: colors.success }]}>Campaign target reached</Text>
            <Text style={styles.todayText}>The brand's commitment has been delivered, so no more proof is needed. Thank you!</Text>
          </View>
        </View>
      ) : null}

      {!p && campaign.my_request && ['REQUESTED', 'REJECTED'].includes(campaign.my_request.status) ? (
        <RequestStatusCard request={campaign.my_request} campaign={campaign} />
      ) : (
        <PickupCard campaign={campaign} myKit={campaign.my_kit} joined={Boolean(p)} />
      )}

      {p ? (
        <>
          {today && today.status !== 'EXCUSED' ? (
            <>
              <SectionHeader title="Today's Photos" />
              <Card style={[{ gap: 12 }, todayPhotos.completed && { borderColor: colors.success }]}>
                <View style={styles.titleRow}>
                  <View style={[styles.todayIcon, todayPhotos.completed && { backgroundColor: colors.successSoft }]}>
                    <Ionicons name={todayPhotos.completed ? 'flame' : 'camera-outline'} size={22} color={todayPhotos.completed ? colors.success : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayTitle}>
                      {todayPhotos.completed ? 'Today complete' : `${todayValid}/${required} photos approved`}
                    </Text>
                    <Text style={styles.todayText}>
                      {todayPhotos.completed
                        ? `All ${required} photos approved. Today counts towards your streak and earns ${formatINR(p.daily_rate)}.`
                        : todayPhotos.pending
                        ? `${todayPhotos.pending} awaiting review. The day counts once ${required} different photos are approved.`
                        : `Upload ${required} different photos today to complete the day and earn ${formatINR(p.daily_rate)}.`}
                    </Text>
                  </View>
                  <Text style={[styles.photoCount, { color: todayPhotos.completed ? colors.success : colors.text }]}>
                    {todayValid}/{required}
                  </Text>
                </View>
                <View style={styles.slotRow}>
                  {Array.from({ length: required }).map((_, i) => {
                    // Show approved and in-review photos first; rejected ones only after them.
                    const shown = today.photos
                      .filter((ph) => ph.status !== 'REJECTED')
                      .concat(today.photos.filter((ph) => ph.status === 'REJECTED'));
                    const photo = shown[i];
                    const tone = photo ? toneColors(colors, PHOTO_STYLES[photo.status].tone) : null;
                    return (
                      <View key={i} style={styles.slot}>
                        {photo ? (
                          <>
                            <Image source={{ uri: assetUrl(photo.photo_url) }} style={styles.slotImage} />
                            <View style={styles.slotBadge}>
                              <Ionicons name={PHOTO_STYLES[photo.status].icon} size={16} color={tone.fg} />
                            </View>
                          </>
                        ) : (
                          <Text style={styles.slotEmpty}>Photo {i + 1}</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
                {today.photos.filter((ph) => ph.status === 'REJECTED').map((ph) => (
                  <Text key={ph.id} style={styles.dayReason}>
                    Rejected: {ph.rejection_reason}. Upload a new photo to replace it.
                  </Text>
                ))}
                {p.can_submit_today ? (
                  <PrimaryButton
                    label={`Upload Photo ${Math.min(todaySent + 1, required)} of ${required}`}
                    onPress={uploadProof}
                    loading={busy}
                    style={{ paddingVertical: 12 }}
                  />
                ) : !todayPhotos.completed && todaySent >= required ? (
                  <Text style={styles.infoLabel}>All {required} photos uploaded. Waiting for review.</Text>
                ) : null}
              </Card>
            </>
          ) : null}

          <SectionHeader title="Photo Streak" />
          <Card style={{ gap: 12 }}>
            <View style={styles.streakRow}>
              {[
                ['flame', 'Current', p.current_streak, colors.warning],
                ['trophy-outline', 'Longest', p.longest_streak, colors.primary],
                ['checkmark-done-outline', 'Photo-days', p.total_photo_streak_days, colors.success],
              ].map(([icon, label, value, color]) => (
                <View key={label} style={styles.streakItem}>
                  <Ionicons name={icon} size={20} color={color} />
                  <Text style={styles.streakValue}>{value}</Text>
                  <Text style={styles.infoLabel}>{label}</Text>
                </View>
              ))}
            </View>
            {p.streak_broken ? (
              <View style={styles.brokenRow}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
                <Text style={[styles.todayText, { flex: 1, marginTop: 0 }]}>
                  Streak broken on {formatDate(p.streak_broken_on)}. Complete {required} photos today to start a new one.
                </Text>
              </View>
            ) : null}
            <View style={{ gap: 6 }}>
              <Text style={styles.infoLabel}>
                Target: {p.completed_days} of {p.target_days} days completed · {p.remaining_target_days} to go
              </Text>
              <ProgressBar value={p.completed_days} max={Math.max(p.target_days, 1)} color={colors.success} />
            </View>
          </Card>

          <SectionHeader title="My Progress" />
          <View style={styles.progressGrid}>
            {[
              ['Completion', p.completion_pct == null ? '—' : `${p.completion_pct}%`],
              ['Missed days', p.missed_days],
              ['Excused days', p.excused_days],
              ['Total earned', formatINR(p.earned)],
              ['Campaign days left', p.remaining_days],
              ['Pending payout', formatINR(p.pending)],
            ].map(([label, value]) => (
              <Card key={label} style={styles.progressCard}>
                <Text style={styles.progressValue}>{value}</Text>
                <Text style={styles.infoLabel}>{label}</Text>
              </Card>
            ))}
          </View>

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
                        <Text style={[styles.dayStatus, { color: tone.fg }]}>
                          {day.unpaid_surplus ? 'Completed · target reached, not paid' : style.label}
                          {day.period === 'EXTENSION' ? ' · extension' : ''}
                        </Text>
                        {day.status !== 'EXCUSED' ? (
                          <Text style={styles.dayReason}>
                            {Math.min(day.photos_valid, day.photos_required)}/{day.photos_required} photos
                            {day.photos_pending ? ` · ${day.photos_pending} in review` : ''}
                          </Text>
                        ) : null}
                        {day.rejection_reason ? <Text style={styles.dayReason}>{day.rejection_reason}</Text> : null}
                        {day.excuse_reason ? <Text style={styles.dayReason}>{day.excuse_reason}</Text> : null}
                      </View>
                      {day.photos.length || day.photo_url ? (
                        <Image source={{ uri: assetUrl(day.photos.length ? day.photos[0].photo_url : day.photo_url) }} style={styles.thumb} />
                      ) : null}
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
            <PrimaryButton label="Join Campaign" onPress={joinFlow.start} loading={joinFlow.joining} />
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
      {joinFlow.sheet}
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
    targetBanner: { flexDirection: 'row', gap: 12, backgroundColor: c.successSoft, borderRadius: 14, padding: 14 },
    blockedText: { flex: 1, fontSize: 13, color: c.textMuted, lineHeight: 18 },
    photoCount: { fontSize: 22, fontWeight: '800' },
    slotRow: { flexDirection: 'row', gap: 10 },
    slot: {
      flex: 1,
      aspectRatio: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    slotImage: { width: '100%', height: '100%' },
    slotBadge: { position: 'absolute', top: 6, right: 6, borderRadius: 10, padding: 2, backgroundColor: c.surface },
    slotEmpty: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    streakRow: { flexDirection: 'row', justifyContent: 'space-between' },
    streakItem: { flex: 1, alignItems: 'center', gap: 2 },
    streakValue: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 2 },
    brokenRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.dangerSoft, borderRadius: 10, padding: 10 },
  });
