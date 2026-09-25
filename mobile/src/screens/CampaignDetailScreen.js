import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { assetUrl, mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, OutlineButton, PrimaryButton, ProgressBar, ScreenHeader, SectionHeader, StatusBadge, toneColors } from '../components/ui';
import { formatDate, formatDateRange, formatINR, formatShortDate } from '../utils';
import { PickupCard, RequestStatusCard, ReturnCard, useJoinCampaign } from '../components/KitPickup';
import { TermsCard } from '../components/CampaignTerms';
import RouteCard from '../components/RouteCard';

const DAY_STYLES = {
  COMPLETED: { icon: 'checkmark-circle', tone: 'success', label: 'Completed' },
  SUBMITTED: { icon: 'time-outline', tone: 'primary', label: 'In review' },
  REJECTED: { icon: 'close-circle', tone: 'danger', label: 'Rejected' },
  INCOMPLETE: { icon: 'remove-circle-outline', tone: 'danger', label: 'Incomplete' },
  MISSED: { icon: 'close-circle-outline', tone: 'danger', label: 'Missed' },
  DUE: { icon: 'ellipse-outline', tone: 'warning', label: 'Due today' },
  EXCUSED: { icon: 'medkit-outline', tone: 'neutral', label: 'Excused' },
};

// Campaign photos come from the camera only: no gallery, album or file picker, so riders can't reuse old photos.
// For simulator testing only, EXPO_PUBLIC_ALLOW_GALLERY_IN_DEV=true lets a development build pick from the library.
const DEV_GALLERY = __DEV__ && process.env.EXPO_PUBLIC_ALLOW_GALLERY_IN_DEV === 'true';

async function takePhoto() {
  const options = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6, allowsEditing: false };
  if (DEV_GALLERY) return ImagePicker.launchImageLibraryAsync(options);
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Camera access is needed to take your campaign photo. Allow it in Settings.');
  try {
    return await ImagePicker.launchCameraAsync(options);
  } catch (err) {
    throw new Error('The camera is not available on this device. Campaign photos must be taken with a phone camera.');
  }
}

const SLOT_ICONS = { MORNING: 'sunny-outline', EVENING: 'partly-sunny-outline', NIGHT: 'moon-outline' };
const to12h = (t) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

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

  // Opens the camera for one slot (Morning / Evening / Night) and uploads the photo to that slot.
  const takeSlotPhoto = async (slot) => {
    try {
      const result = await takePhoto();
      if (result.canceled || !result.assets || !result.assets.length) return;
      setBusy(slot.slot);
      const res = await mobileApi.uploadCampaignProof(campaignId, result.assets[0], slot.slot);
      const taken = (res.slots || []).filter((x) => x.status === 'PENDING' || x.status === 'APPROVED').length;
      Alert.alert(
        `${slot.label} photo saved`,
        taken >= 3
          ? "All 3 of today's photos are in. The day (and your streak) counts once they're approved."
          : `${taken} of 3 photos taken today. The day only counts when Morning, Evening and Night are all approved.`
      );
      await refresh();
    } catch (err) {
      Alert.alert('Photo not saved', err.message);
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
  const lifecycle = campaign.lifecycle || { key: campaign.status, label: campaign.status };
  const isLive = lifecycle.key === 'LIVE';
  const slotTimes = campaign.photo_slot_windows || {};

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
        <View style={[styles.lifecycle, { backgroundColor: toneColors(colors, isLive ? 'success' : lifecycle.key === 'OPEN' ? 'primary' : 'neutral').bg }]}>
          <View style={[styles.lifecycleDot, { backgroundColor: toneColors(colors, isLive ? 'success' : lifecycle.key === 'OPEN' ? 'primary' : 'neutral').fg }]} />
          <Text style={[styles.lifecycleText, { color: toneColors(colors, isLive ? 'success' : lifecycle.key === 'OPEN' ? 'primary' : 'neutral').fg }]}>
            {isLive ? 'Campaign is Live' : lifecycle.label}
          </Text>
        </View>
        <View style={styles.infoGrid}>
          {[
            ['calendar-outline', 'Dates', formatDateRange(campaign.start_date, campaign.end_date)],
            ['cash-outline', 'Daily payout', `${formatINR(campaign.daily_rate)} / eligible day`],
            ['people-outline', 'Slots', `${campaign.filled_slots} / ${campaign.slot_capacity || campaign.total_slots} assigned`],
            campaign.location_area ? ['location-outline', 'Area', campaign.location_area] : null,
            ['bicycle-outline', 'Vehicle type', campaign.eligible_vehicle_label || 'All vehicles'],
            ['flag-outline', 'Campaign status', lifecycle.label],
          ].filter(Boolean).map(([icon, label, value]) => (
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
              <Card style={[{ gap: 4 }, todayPhotos.completed && { borderColor: colors.success }]}>
                <View style={styles.titleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.todayTitle}>
                      {todayPhotos.completed ? 'Photo-Day completed' : `${todaySent} / ${required} photos completed`}
                    </Text>
                    <Text style={styles.todayText}>
                      {todayPhotos.completed
                        ? `All 3 approved: today counts towards your streak and earns ${formatINR(p.daily_rate)}.`
                        : `Take Morning, Evening and Night photos. The day earns ${formatINR(p.daily_rate)} only when all 3 are approved.`}
                    </Text>
                  </View>
                  <Text style={[styles.photoCount, { color: todayPhotos.completed ? colors.success : colors.text }]}>
                    {todayValid}/{required}
                  </Text>
                </View>
                <View style={{ marginTop: 8, marginBottom: 6 }}>
                  <ProgressBar value={todaySent} max={required} color={todayPhotos.completed ? colors.success : colors.primary} />
                </View>
                {todayPhotos.slots.map((slot, i) => {
                  const canTake = p.can_submit_today && (slot.status === 'NOT_STARTED' || slot.status === 'REJECTED');
                  const locked = slot.status === 'NOT_STARTED' && !p.can_submit_today;
                  const tone =
                    slot.status === 'APPROVED' ? 'success' : slot.status === 'PENDING' ? 'primary' : slot.status === 'REJECTED' ? 'danger' : 'neutral';
                  const t = toneColors(colors, tone);
                  return (
                    <View key={slot.slot} style={[styles.slotLine, i === todayPhotos.slots.length - 1 && { borderBottomWidth: 0 }]}>
                      <View style={[styles.slotIcon, { backgroundColor: t.bg }]}>
                        <Ionicons name={SLOT_ICONS[slot.slot]} size={20} color={slot.status === 'NOT_STARTED' ? colors.primary : t.fg} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.slotName}>{slot.label}</Text>
                        <Text style={styles.slotWindow}>
                          {to12h(slot.window.start)} – {to12h(slot.window.end)}
                        </Text>
                        {slot.status === 'REJECTED' && slot.rejection_reason ? <Text style={styles.dayReason}>{slot.rejection_reason}</Text> : null}
                      </View>
                      {slot.photo_url && slot.status !== 'REJECTED' ? <Image source={{ uri: assetUrl(slot.photo_url) }} style={styles.thumb} /> : null}
                      {canTake ? (
                        <TouchableOpacity
                          style={[styles.takeButton, slot.status === 'REJECTED' && { backgroundColor: colors.danger }]}
                          onPress={() => takeSlotPhoto(slot)}
                          disabled={Boolean(busy)}
                          accessibilityRole="button"
                          accessibilityLabel={`${slot.status === 'REJECTED' ? 'Retake' : 'Take'} ${slot.label} photo`}
                        >
                          {busy === slot.slot ? (
                            <ActivityIndicator color="#FFFFFF" size="small" />
                          ) : (
                            <>
                              <Ionicons name="camera" size={16} color="#FFFFFF" />
                              <Text style={styles.takeText}>{slot.status === 'REJECTED' ? 'Retake' : 'Take Photo'}</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.slotState, { backgroundColor: t.bg }]}>
                          <Ionicons
                            name={
                              slot.status === 'APPROVED' ? 'checkmark-circle' : slot.status === 'PENDING' ? 'time-outline' : slot.status === 'REJECTED' ? 'warning' : 'lock-closed'
                            }
                            size={14}
                            color={t.fg}
                          />
                          <Text style={[styles.slotStateText, { color: t.fg }]}>
                            {slot.status === 'APPROVED' ? 'Completed' : slot.status === 'PENDING' ? 'In review' : slot.status === 'REJECTED' ? 'Rejected' : locked ? 'Locked' : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </Card>
            </>
          ) : null}

          {campaign.my_status === 'ACTIVE' && todayPhotos && todayPhotos.in_window ? <RouteCard campaignId={campaign.id} /> : null}

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
                          <View style={styles.slotDots}>
                            {day.slots.map((x) => (
                              <Text
                                key={x.slot}
                                style={[
                                  styles.slotDot,
                                  { color: x.status === 'APPROVED' ? colors.success : x.status === 'PENDING' ? colors.primary : x.status === 'REJECTED' ? colors.danger : colors.textSubtle },
                                ]}
                              >
                                {x.label.charAt(0)} {x.status === 'APPROVED' ? '✓' : x.status === 'PENDING' ? '…' : x.status === 'REJECTED' ? '✕' : '–'}
                              </Text>
                            ))}
                          </View>
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

      {(!p || !today) && !['COMPLETED', 'CANCELLED'].includes(lifecycle.key) ? (
        <>
          <SectionHeader title="Daily Photo Slots" />
          <Card style={{ gap: 2 }}>
            {['MORNING', 'EVENING', 'NIGHT'].map((slot, i) =>
              slotTimes[slot] ? (
                <View key={slot} style={[styles.slotLine, i === 2 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.slotIcon, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name={SLOT_ICONS[slot]} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotName}>{slot.charAt(0) + slot.slice(1).toLowerCase()}</Text>
                    <Text style={styles.slotWindow}>
                      {to12h(slotTimes[slot][0])} – {to12h(slotTimes[slot][1])}
                    </Text>
                  </View>
                </View>
              ) : null
            )}
            <Text style={[styles.todayText, { marginTop: 6 }]}>One photo per slot. All 3 approved = 1 Photo-Day. You'll get a reminder when each slot opens.</Text>
          </Card>
        </>
      ) : null}

      <ReturnCard kitReturn={campaign.kit_return} />

      <TermsCard
        campaign={campaign}
        joined={Boolean(p) || campaign.my_status === 'REQUESTED'}
        onAccept={async (version) => {
          await mobileApi.acceptCampaignTerms(campaign.id, version);
          await refresh();
          Alert.alert('Terms accepted', `You accepted version ${version} of the ${campaign.name} terms.`);
        }}
      />

      {!p ? (
        <View style={{ marginTop: 20 }}>
          {!campaign.can_join && isLive && !campaign.my_status ? (
            <View style={[styles.targetBanner, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="radio-outline" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.todayTitle}>Campaign is Live</Text>
                <Text style={styles.todayText}>New riders cannot join this campaign.</Text>
              </View>
            </View>
          ) : campaign.can_join ? (
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
    slotLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    slotIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    slotName: { fontSize: 15, fontWeight: '700', color: c.text },
    slotWindow: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    takeButton: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, minWidth: 104, justifyContent: 'center' },
    takeText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
    slotState: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    slotStateText: { fontSize: 12, fontWeight: '700' },
    slotDots: { flexDirection: 'row', gap: 10, marginTop: 3 },
    slotDot: { fontSize: 12, fontWeight: '700' },
    streakRow: { flexDirection: 'row', justifyContent: 'space-between' },
    streakItem: { flex: 1, alignItems: 'center', gap: 2 },
    streakValue: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 2 },
    lifecycle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginTop: 10 },
    lifecycleDot: { width: 7, height: 7, borderRadius: 4 },
    lifecycleText: { fontSize: 12, fontWeight: '800' },
    brokenRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: c.dangerSoft, borderRadius: 10, padding: 10 },
  });
