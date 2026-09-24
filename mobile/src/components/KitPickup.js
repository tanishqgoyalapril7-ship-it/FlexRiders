import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, SectionHeader, toneColors } from './ui';
import { mobileApi } from '../services/api';
import { formatDate } from '../utils';

export const KIT_STATUS = {
  NOT_REQUIRED: { label: 'Not Required', tone: 'neutral', icon: 'remove-circle-outline' },
  PENDING: { label: 'Pending Collection', tone: 'warning', icon: 'time-outline' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', tone: 'primary', icon: 'cube-outline' },
  COLLECTED: { label: 'Collected', tone: 'success', icon: 'checkmark-circle' },
};

const to12h = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};

export function pickupWindow(l) {
  const dates =
    l.available_from && l.available_to
      ? `${formatDate(l.available_from)} – ${formatDate(l.available_to)}`
      : l.available_from
      ? `From ${formatDate(l.available_from)}`
      : l.available_to
      ? `Until ${formatDate(l.available_to)}`
      : '';
  const hours = l.start_time && l.end_time ? `${to12h(l.start_time)} – ${to12h(l.end_time)}` : '';
  return { dates, days: l.available_days || '', hours };
}

const activeLocations = (kit) => ((kit && kit.locations) || []).filter((l) => l.is_active !== false);

// ---------------------------------------------------------------------------
// Joining: size + pickup location
// ---------------------------------------------------------------------------

function JoinKitSheet({ campaign, visible, onClose, onDone }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const kit = campaign.brand_kit;
  const locations = activeLocations(kit);
  const [size, setSize] = useState(null);
  const [locationId, setLocationId] = useState(locations.length === 1 ? locations[0].id : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const needsLocation = locations.length > 1;
  const chosen = locations.find((l) => l.id === locationId);

  const next = () => {
    if (!size) return setError('Choose your T-shirt size.');
    if (needsLocation && !locationId) return setError('Choose where you’ll collect your T-shirt.');
    setError('');
    setConfirming(true);
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await mobileApi.joinCampaign(campaign.id, size, locationId);
      onClose();
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      {confirming ? (
        <View style={styles.sheet}>
          <View style={styles.confirmIcon}>
            <Ionicons name="shirt-outline" size={26} color={colors.primary} />
          </View>
          <Text style={styles.sheetTitle}>Collect your T-shirt first</Text>
          <Text style={styles.sheetText}>
            Before starting this campaign, you need to collect your campaign T-shirt/brand kit. Please collect it from the assigned pickup
            location before the campaign starts. Once collected, our team will verify and approve your campaign participation.
          </Text>
          <View style={styles.confirmBox}>
            <Text style={styles.optionText}>
              Size: <Text style={styles.optionTitle}>{size}</Text>
            </Text>
            {chosen ? (
              <Text style={styles.optionText}>
                Pickup: <Text style={styles.optionTitle}>{chosen.name}</Text> · {chosen.address}
              </Text>
            ) : (
              <Text style={styles.optionText}>Pickup location: to be shared by the operations team</Text>
            )}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.button, styles.cancel]} onPress={() => setConfirming(false)} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.primary]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryText}>Continue</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          <Text style={styles.sheetTitle}>Join {campaign.name}</Text>
          <Text style={styles.sheetText}>This campaign includes a brand T-shirt. Choose your size{needsLocation ? ' and pickup location' : ''}.</Text>

          <Text style={styles.label}>T-shirt size</Text>
          <View style={styles.chips}>
            {kit.size_options.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.chip, size === s && styles.chipActive]}
                onPress={() => setSize(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: size === s }}
              >
                <Text style={[styles.chipText, size === s && { color: colors.onPrimary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {locations.length ? (
            <>
              <Text style={styles.label}>{needsLocation ? 'Pickup location' : 'Pickup location (official)'}</Text>
              {locations.map((l) => {
                const selected = locationId === l.id;
                const w = pickupWindow(l);
                return (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.option, selected && styles.optionActive]}
                    onPress={() => needsLocation && setLocationId(l.id)}
                    activeOpacity={needsLocation ? 0.7 : 1}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.primary : colors.textSubtle} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{l.name}</Text>
                      <Text style={styles.optionText}>{l.address}</Text>
                      {[w.days, w.hours].filter(Boolean).length ? <Text style={styles.optionText}>{[w.days, w.hours].filter(Boolean).join(' · ')}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {needsLocation ? <Text style={styles.note}>You can't change this later. Contact your operations manager if you need to.</Text> : null}
            </>
          ) : (
            <Text style={styles.note}>Pickup details will be shared here once the operations team sets them up.</Text>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.button, styles.cancel]} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.primary]} onPress={next}>
            <Text style={styles.primaryText}>Next</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}
    </Modal>
  );
}

/** Join button logic: asks for size / pickup location only when the campaign needs a T-shirt. */
export function useJoinCampaign(campaign, onChanged) {
  const [open, setOpen] = useState(false);
  const [joining, setJoining] = useState(false);

  const done = async () => {
    const needsShirt = campaign.brand_kit && campaign.brand_kit.tshirt_required;
    Alert.alert(
      'Application submitted',
      needsShirt
        ? `Collect your T-shirt before ${campaign.name} starts. Our team will approve you once it's collected.`
        : `Your request to join ${campaign.name} has been sent. You'll be notified once an admin reviews it.`
    );
    await onChanged();
  };

  const start = async () => {
    if (campaign.brand_kit && campaign.brand_kit.tshirt_required) {
      setOpen(true);
      return;
    }
    setJoining(true);
    try {
      await mobileApi.joinCampaign(campaign.id);
      await done();
    } catch (err) {
      Alert.alert('Could not join', err.message);
    } finally {
      setJoining(false);
    }
  };

  const sheet = open ? <JoinKitSheet campaign={campaign} visible={open} onClose={() => setOpen(false)} onDone={done} /> : null;
  return { start, joining, sheet };
}

// ---------------------------------------------------------------------------
// Pickup card on the campaign screen
// ---------------------------------------------------------------------------

function InfoRow({ icon, children }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
      <Text style={styles.infoText}>{children}</Text>
    </View>
  );
}

export function PickupCard({ campaign, myKit, joined }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const kit = campaign.brand_kit;
  const required = Boolean(kit && kit.tshirt_required);
  if (!required && !joined) return null;

  const status = myKit ? KIT_STATUS[myKit.status] || KIT_STATUS.PENDING : required ? KIT_STATUS.PENDING : KIT_STATUS.NOT_REQUIRED;
  const tone = toneColors(colors, status.tone);
  // After joining: the rider's own location. Before: the official options.
  const location = myKit && myKit.pickup_location ? myKit.pickup_location : null;
  const options = !joined ? activeLocations(kit) : location ? [location] : activeLocations(kit).length === 1 ? activeLocations(kit) : [];

  const open = (url) => Linking.openURL(url).catch(() => Alert.alert('Could not open', url));

  return (
    <>
      <SectionHeader title="T-Shirt / Brand Kit Pickup" />
      <Card style={{ gap: 12 }}>
        <View style={styles.titleRow}>
          <View style={[styles.kitIcon, { backgroundColor: tone.bg }]}>
            <Ionicons name="shirt-outline" size={22} color={tone.fg} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{required ? 'Brand T-shirt required' : 'No T-shirt needed'}</Text>
            {myKit && myKit.tshirt_size ? <Text style={styles.optionText}>Your size: {myKit.tshirt_size}</Text> : null}
          </View>
          {joined ? (
            <View style={[styles.badge, { backgroundColor: tone.bg }]}>
              <Ionicons name={status.icon} size={13} color={tone.fg} />
              <Text style={[styles.badgeText, { color: tone.fg }]}>{status.label}</Text>
            </View>
          ) : null}
        </View>

        {required && myKit && myKit.status === 'COLLECTED' && myKit.collected_date ? (
          <Text style={[styles.optionText, { color: colors.success }]}>Collected on {formatDate(myKit.collected_date)}. Wear it on every campaign day.</Text>
        ) : null}
        {required && myKit && myKit.status === 'READY_FOR_PICKUP' ? (
          <Text style={[styles.optionText, { color: colors.primary, fontWeight: '600' }]}>
            Your T-shirt is ready. Collect it{myKit.pickup_date ? ` on ${formatDate(myKit.pickup_date)}` : ''} from the location below.
          </Text>
        ) : null}
        {required && myKit && myKit.status === 'PENDING' && myKit.pickup_date ? (
          <Text style={styles.optionText}>Scheduled pickup: {formatDate(myKit.pickup_date)}</Text>
        ) : null}

        {required && !joined && options.length > 1 ? (
          <Text style={styles.optionText}>You'll choose one of these pickup locations when you join.</Text>
        ) : null}

        {required && options.length === 0 ? (
          <InfoRow icon="information-circle-outline">Pickup details will appear here once the operations team shares them.</InfoRow>
        ) : null}

        {required
          ? options.map((l) => {
              const w = pickupWindow(l);
              return (
                <View key={l.id} style={styles.locationBox}>
                  <Text style={styles.optionTitle}>{l.name}</Text>
                  <InfoRow icon="location-outline">{l.address}</InfoRow>
                  {w.dates ? <InfoRow icon="calendar-outline">{w.dates}</InfoRow> : null}
                  {w.days || w.hours ? <InfoRow icon="time-outline">{[w.days, w.hours].filter(Boolean).join(' · ')}</InfoRow> : null}
                  {l.contact_name || l.contact_phone ? (
                    <InfoRow icon="person-outline">{[l.contact_name, l.contact_phone].filter(Boolean).join(' · ')}</InfoRow>
                  ) : null}
                  {l.instructions ? <InfoRow icon="document-text-outline">{l.instructions}</InfoRow> : null}
                  {l.map_url || l.contact_phone ? (
                    <View style={styles.actions}>
                      {l.map_url ? (
                        <TouchableOpacity style={styles.action} onPress={() => open(l.map_url)} accessibilityRole="link">
                          <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                          <Text style={styles.actionText}>Open Map</Text>
                        </TouchableOpacity>
                      ) : null}
                      {l.contact_phone ? (
                        <TouchableOpacity style={styles.action} onPress={() => open(`tel:${l.contact_phone.replace(/[^\d+]/g, '')}`)}>
                          <Ionicons name="call-outline" size={16} color={colors.primary} />
                          <Text style={styles.actionText}>Call {l.contact_name || 'Contact'}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          : null}
        {required && kit.instructions ? <InfoRow icon="alert-circle-outline">{kit.instructions}</InfoRow> : null}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Join request status (before the rider is an official campaign rider)
// ---------------------------------------------------------------------------

const REQUEST_KIT = {
  NOT_REQUIRED: { tone: 'neutral', icon: 'remove-circle-outline' },
  PENDING: { tone: 'warning', icon: 'time-outline' },
  COLLECTED: { tone: 'success', icon: 'checkmark-circle' },
};

function StatusLine({ label, value, tone, icon }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={styles.statusLine}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={[styles.badge, { backgroundColor: t.bg }]}>
        <Ionicons name={icon} size={13} color={t.fg} />
        <Text style={[styles.badgeText, { color: t.fg }]}>{value}</Text>
      </View>
    </View>
  );
}

export function RequestStatusCard({ request, campaign }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  if (!request || !['REQUESTED', 'REJECTED'].includes(request.status)) return null;
  const rejected = request.status === 'REJECTED';
  const kit = REQUEST_KIT[request.kit_status] || REQUEST_KIT.PENDING;
  const needsShirt = request.kit_status !== 'NOT_REQUIRED';
  const location = request.pickup_location;
  const open = (url) => Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
  return (
    <>
      <SectionHeader title={rejected ? 'Application Rejected' : 'Application Submitted'} />
      <Card style={{ gap: 12 }}>
        <StatusLine
          label="Campaign"
          value={rejected ? 'Rejected' : 'Waiting for Admin Approval'}
          tone={rejected ? 'danger' : 'primary'}
          icon={rejected ? 'close-circle' : 'hourglass-outline'}
        />
        {needsShirt ? <StatusLine label={`T-shirt${request.tshirt_size ? ` (${request.tshirt_size})` : ''}`} value={request.kit_status_label} tone={kit.tone} icon={kit.icon} /> : null}
        {rejected && request.rejection_reason ? <InfoRow icon="information-circle-outline">{request.rejection_reason}</InfoRow> : null}
        {!rejected && needsShirt && request.kit_status === 'PENDING' ? (
          <Text style={styles.optionText}>
            Collect your T-shirt before {formatDate(campaign.start_date)}. Once collected, our team will verify and approve you.
          </Text>
        ) : null}
        {!rejected && request.kit_status === 'COLLECTED' ? (
          <Text style={[styles.optionText, { color: colors.success }]}>T-shirt collected. Waiting for the team to approve you.</Text>
        ) : null}
        {!rejected && needsShirt && request.kit_status === 'PENDING' ? (
          location ? (
            <View style={styles.locationBox}>
              <Text style={styles.optionTitle}>{location.name}</Text>
              <InfoRow icon="location-outline">{location.address}</InfoRow>
              {(() => {
                const w = pickupWindow(location);
                return (
                  <>
                    {w.dates ? <InfoRow icon="calendar-outline">{w.dates}</InfoRow> : null}
                    {w.days || w.hours ? <InfoRow icon="time-outline">{[w.days, w.hours].filter(Boolean).join(' · ')}</InfoRow> : null}
                  </>
                );
              })()}
              {location.contact_name || location.contact_phone ? (
                <InfoRow icon="person-outline">{[location.contact_name, location.contact_phone].filter(Boolean).join(' · ')}</InfoRow>
              ) : null}
              {location.instructions ? <InfoRow icon="document-text-outline">{location.instructions}</InfoRow> : null}
              <View style={styles.actions}>
                {location.map_url ? (
                  <TouchableOpacity style={styles.action} onPress={() => open(location.map_url)}>
                    <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionText}>Open Map</Text>
                  </TouchableOpacity>
                ) : null}
                {location.contact_phone ? (
                  <TouchableOpacity style={styles.action} onPress={() => open(`tel:${location.contact_phone.replace(/[^\d+]/g, '')}`)}>
                    <Ionicons name="call-outline" size={16} color={colors.primary} />
                    <Text style={styles.actionText}>Call {location.contact_name || 'Contact'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <InfoRow icon="information-circle-outline">Pickup details will be shared by the operations team.</InfoRow>
          )
        ) : null}
      </Card>
    </>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, maxHeight: '85%' },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    sheetText: { fontSize: 13.5, color: c.textMuted, marginTop: 6, lineHeight: 19 },
    label: { fontSize: 13, fontWeight: '700', color: c.text, marginTop: 18, marginBottom: 10 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { minWidth: 52, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignItems: 'center' },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 14, fontWeight: '700', color: c.text },
    option: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border, marginBottom: 8 },
    optionActive: { borderColor: c.primary, backgroundColor: c.primarySoft },
    optionTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    optionText: { fontSize: 12.5, color: c.textMuted, marginTop: 2, lineHeight: 18 },
    note: { fontSize: 12, color: c.textMuted, marginTop: 4, lineHeight: 17 },
    error: { color: c.danger, fontSize: 13, marginTop: 12 },
    buttons: { flexDirection: 'row', gap: 12, marginTop: 8 },
    button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    cancel: { borderWidth: 1, borderColor: c.border },
    cancelText: { fontSize: 15, fontWeight: '600', color: c.text },
    primary: { backgroundColor: c.primary },
    primaryText: { fontSize: 15, fontWeight: '700', color: c.onPrimary },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    kitIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 11.5, fontWeight: '700' },
    locationBox: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, gap: 6 },
    infoRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    infoText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 19 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: c.primarySoft },
    actionText: { fontSize: 13, fontWeight: '700', color: c.primary },
    confirmIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    confirmBox: { backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, gap: 4, marginTop: 14, marginBottom: 6 },
    statusLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    statusLabel: { fontSize: 14, fontWeight: '600', color: c.text },
  });
