import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, OutlineButton, PrimaryButton, ScreenHeader, SectionHeader, StatusBadge } from '../components/ui';
import { AutocompleteField, DateOfBirthField, FieldLabel, VehicleCategoryField, ageOn, vehicleCategoryLabel } from '../components/formFields';
import ConfirmSheet from '../components/ConfirmSheet';
import { Badge, Button, Header, Section } from '../components/ds';
import { useT } from '../i18n';
import { VEHICLE_MODELS } from '../data/suggestions';
import { mobileApi } from '../services/api';
import { getInitials } from '../utils';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

// Editable by the rider; verified fields (name, mobile, vehicle number, city) are changed by operations.
const EDITABLE = [
  ['dob', 'dob'],
  ['vehicle_type', 'vehicle'],
  ['upi_id', 'upi_id'],
  ['gpay_number', 'gpay_number'],
];

function ClearableField({ label, value, onChangeText, ...props }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <FieldLabel label={label} />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={value} onChangeText={onChangeText} placeholderTextColor={colors.textSubtle} {...props} />
        {value ? (
          <TouchableOpacity onPress={() => onChangeText('')} style={{ paddingHorizontal: 12 }} accessibilityLabel={`Remove ${label}`} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function EditProfileModal({ rider, visible, onClose, onSaved }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  // The vehicle type decides campaign eligibility: riders set it once, then operations change it.
  const initial = { ...Object.fromEntries(EDITABLE.map(([field, key]) => [field, rider[key] || ''])), vehicle_category: rider.vehicle_category || '' };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (form.dob && ageOn(form.dob) < 18) return setError('Riders must be at least 18 years old.');
    if (form.upi_id && !/^[\w.-]+@[\w.-]+$/.test(form.upi_id.trim())) return setError('Enter a valid UPI ID, e.g. name@upi.');
    if (form.gpay_number && form.gpay_number.replace(/\D/g, '').length !== 10) return setError('Enter a 10-digit Google Pay / PhonePe number.');
    const changes = Object.fromEntries(Object.entries(form).filter(([field, value]) => value.trim() !== (initial[field] || '')).map(([f, v]) => [f, v.trim()]));
    if (!Object.keys(changes).length) return onClose();
    setSaving(true);
    setError('');
    try {
      await mobileApi.updateProfile(changes);
      await onSaved();
      onClose();
      Alert.alert('Profile updated', 'Your details have been saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { paddingTop: 12 }]}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Edit Profile" onBack={onClose} />
          <DateOfBirthField label="Date of Birth" value={form.dob} onChange={set('dob')} />
          {form.dob ? (
            <TouchableOpacity onPress={() => set('dob')('')} style={{ marginTop: -8, marginBottom: 16 }}>
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '600' }}>Remove date of birth</Text>
            </TouchableOpacity>
          ) : null}
          <VehicleCategoryField
            label="Vehicle Type"
            value={form.vehicle_category}
            onChange={set('vehicle_category')}
            disabled={Boolean(rider.vehicle_category)}
            hint={rider.vehicle_category ? 'Set. Contact your operations manager to change it.' : 'Needed to join campaigns for two or three wheelers. You can set this once.'}
          />
          <AutocompleteField label="Vehicle Model" icon="bicycle-outline" value={form.vehicle_type} onChangeText={set('vehicle_type')} options={VEHICLE_MODELS} placeholder="e.g. Honda Activa" />
          <ClearableField label="UPI ID" value={form.upi_id} onChangeText={set('upi_id')} autoCapitalize="none" autoCorrect={false} placeholder="yourname@upi" />
          <ClearableField label="Google Pay / PhonePe Number" value={form.gpay_number} onChangeText={set('gpay_number')} keyboardType="phone-pad" placeholder="10-digit number" />

          <View style={styles.lockedNote}>
            <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text style={styles.lockedText}>
              Name, mobile number, vehicle number and city are verified by our operations team. Contact your operations manager to change them.
            </Text>
          </View>
          {!form.upi_id && rider.upi_id ? (
            <Text style={[styles.lockedText, { color: colors.warning, marginTop: 10 }]}>
              Without a UPI ID, payouts can't be sent until you add one again.
            </Text>
          ) : null}
          {error ? <Text style={{ color: colors.danger, marginTop: 12 }}>{error}</Text> : null}
          <PrimaryButton label="Save Changes" onPress={save} loading={saving} style={{ marginTop: 20 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const STATUS_BADGE = {
  APPROVED: ['VERIFIED', 'success'],
  ACTIVE: ['VERIFIED', 'success'],
  PENDING: ['PENDING', 'warning'],
  UNDER_REVIEW: ['IN REVIEW', 'warning'],
  REJECTED: ['NOT APPROVED', 'danger'],
  SUSPENDED: ['SUSPENDED', 'danger'],
};

/** "You": profile header and the settings menu from the design. Every row opens a real screen. */
export default function ProfileScreen({ rider, onBack, onLogout, onProfileChanged, onAccountDeleted, onNavigate, onOpenSupport, supportUnread = 0, unreadCount = 0 }) {
  const styles = useStyles(makeStyles);
  const { colors, preference, setPreference } = useTheme();
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const badge = STATUS_BADGE[rider.status] || ['PENDING', 'warning'];
  const sub = [rider.vehicle_number, rider.city].filter(Boolean).join(' • ') || rider.rider_id;

  const Row = ({ icon, label, onPress, right, last }) => (
    <TouchableOpacity style={[styles.menuRow, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.7} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.primary} style={{ width: 32 }} />
      <Text style={styles.menuLabel}>{label}</Text>
      {right || null}
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
  const Group = ({ title, children }) => (
    <>
      <Section>{title}</Section>
      <View style={styles.menu}>{children}</View>
    </>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Header title={t('You')} onBack={onBack} />
      <View style={styles.profileCard}>
        <View style={styles.avatarRing}>
          {rider.has_photo && !photoFailed ? (
            <Image source={mobileApi.authedImage('/riders/me/selfie')} style={styles.avatar} onError={() => setPhotoFailed(true)} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.initials}>{getInitials(rider.name)}</Text>
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.name} numberOfLines={1}>{rider.name || 'Rider'}</Text>
          <Text style={styles.riderId} numberOfLines={2}>{sub}</Text>
        </View>
        <Badge label={badge[0]} tone={badge[1]} />
      </View>

      <Group title={t('Personal')}>
        <Row icon="person-outline" label={t('Personal Information')} onPress={() => setEditing(true)} />
        <Row icon="shield-outline" label={t('Verification Status')} onPress={() => onNavigate('verification')} right={<Badge label={badge[0]} tone={badge[1]} style={{ marginRight: 8 }} />} />
        <Row icon="car-outline" label={t('My Vehicle')} onPress={() => onNavigate('vehicle')} />
        <Row
          icon="swap-horizontal-outline"
          label={t('Change Vehicle')}
          onPress={() => onNavigate('change-vehicle')}
          right={rider.vehicle_category ? <Text style={styles.value}>{vehicleCategoryLabel(rider.vehicle_category)}</Text> : null}
        />
        <Row icon="location-outline" label={t('Working Areas')} onPress={() => onNavigate('areas')} last />
      </Group>
      <Group title={t('Payments')}>
        <Row icon="wallet-outline" label={t('Payment / UPI Details')} onPress={() => setEditing(true)} right={rider.upi_id ? <Text style={styles.value}>{rider.upi_id}</Text> : <Badge label="ADD" tone="warning" style={{ marginRight: 8 }} />} last />
      </Group>
      <Group title={t('Campaign')}>
        <Row icon="shirt-outline" label={t('Campaign T-Shirts')} onPress={() => onNavigate('tshirt')} />
        <Row icon="gift-outline" label={t('Refer & Earn')} onPress={() => onNavigate('refer')} last />
      </Group>
      <Group title={t('App Settings')}>
        <Row icon="notifications-outline" label={t('Notifications')} onPress={() => onNavigate('notifications')} right={unreadCount ? <Badge label={String(unreadCount)} tone="danger" style={{ marginRight: 8 }} /> : null} />
        <Row icon="globe-outline" label={t('Language')} onPress={() => onNavigate('language')} right={<Text style={styles.value}>{lang === 'hi' ? 'हिंदी' : 'English'}</Text>} />
        <Row icon="help-circle-outline" label={t('Help & Support')} onPress={onOpenSupport} right={supportUnread ? <Badge label={`${supportUnread} new`} tone="primary" style={{ marginRight: 8 }} /> : null} last />
      </Group>

      <Section>Appearance</Section>
      <View style={styles.segmented}>
        {THEME_OPTIONS.map((option) => {
          const active = preference === option.value;
          return (
            <TouchableOpacity key={option.value} style={[styles.segment, active && styles.segmentActive]} onPress={() => setPreference(option.value)} activeOpacity={0.8}>
              <Ionicons name={option.icon} size={16} color={active ? colors.onPrimary : colors.textMuted} />
              <Text style={[styles.segmentText, active && { color: colors.onPrimary }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button label={t('Logout')} tone="soft" onPress={onLogout} style={{ marginTop: 28 }} />
      <TouchableOpacity onPress={() => setDeleting(true)} style={styles.deleteRow} accessibilityRole="button">
        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        <Text style={styles.deleteText}>Delete account</Text>
      </TouchableOpacity>

      {editing ? <EditProfileModal rider={rider} visible={editing} onClose={() => setEditing(false)} onSaved={onProfileChanged} /> : null}
      <ConfirmSheet
        visible={deleting}
        title="Delete your account?"
        message="This can't be undone."
        points={[
          'You will be logged out and won’t be able to log in again with this number.',
          'Your profile, documents and notifications are removed.',
          'Payments, payouts and campaign photos are kept by FlexRiders as payout records.',
          'If you are in an active campaign, finish it or ask your operations manager to remove you first.',
        ]}
        requirePassword
        typeToConfirm="DELETE"
        confirmLabel="Delete Account"
        onConfirm={async (password) => {
          const res = await mobileApi.deleteAccount(password, 'Deleted from the rider app');
          setDeleting(false);
          onAccountDeleted(res.message);
        }}
        onClose={() => setDeleting(false)}
      />
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 18 },
    avatarRing: { padding: 3, borderRadius: 40, borderWidth: 2, borderColor: c.primary },
    menu: { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: c.border },
    menuLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: c.text },
    value: { fontSize: 14, color: c.textMuted, marginRight: 8, maxWidth: 140 },
    header: { flexDirection: 'row', alignItems: 'center' },
    areasHint: { fontSize: 12, color: c.textMuted, marginTop: 8, paddingHorizontal: 4 },
    areasEdit: { fontSize: 13, fontWeight: '700', color: c.primary },
    areasAdd: { fontSize: 14, fontWeight: '700', color: c.primary },
    avatar: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: c.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    initials: { fontSize: 24, fontWeight: '800', color: c.primary },
    name: { fontSize: 19, fontWeight: '800', color: c.text },
    riderId: { fontSize: 13, color: c.textMuted },
    segmented: {
      flexDirection: 'row',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 14,
      padding: 4,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { fontSize: 13, fontWeight: '600', color: c.textMuted },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    rowLabel: { fontSize: 14, color: c.textMuted, flex: 1 },
    rowValue: { fontSize: 14, fontWeight: '600', color: c.text, maxWidth: '55%', textAlign: 'right' },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12 },
    input: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text },
    lockedNote: { flexDirection: 'row', gap: 8, backgroundColor: c.surfaceAlt, borderRadius: 12, padding: 12, marginTop: 4 },
    lockedText: { flex: 1, fontSize: 12.5, color: c.textMuted, lineHeight: 18 },
    deleteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
    deleteText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    referRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 16, padding: 14 },
    referIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    referTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary },
  });
