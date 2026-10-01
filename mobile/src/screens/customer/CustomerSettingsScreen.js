import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { Badge, Button, Field, Header, Section } from '../../components/ds';
import { getInitials } from '../../utils';

const THEME_OPTIONS = [
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
];

function EditCompany({ profile, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: profile.full_name || '',
    email: profile.email || '',
    contact_number: profile.contact_number || '',
    gst_number: profile.gst_number || '',
    company_address: profile.company_address || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return Alert.alert('Email', 'Enter a valid email address.');
    setSaving(true);
    try {
      await mobileApi.updateCustomerProfile(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])));
      await onSaved();
      onClose();
    } catch (err) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
          <Header title="Company Details" onBack={onClose} />
          <Field label="Contact person" value={form.full_name} onChangeText={set('full_name')} />
          <Field label="Email" value={form.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" />
          <Field label="Contact number" value={form.contact_number} onChangeText={set('contact_number')} keyboardType="phone-pad" />
          <Field label="GST number" right="OPTIONAL" value={form.gst_number} onChangeText={set('gst_number')} autoCapitalize="characters" />
          <Field label="Company address" right="OPTIONAL" value={form.company_address} onChangeText={set('company_address')} multiline />
          <Button label="Save" onPress={save} loading={saving} style={{ marginTop: 8 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Brand profile: company card and settings menu (same style as the rider app's You tab). */
export default function CustomerSettingsScreen({ profile, onBack, unreadCount = 0, onOpenNotifications, onLogout, onProfileChanged }) {
  const s = useStyles(makeStyles);
  const { colors, preference, setPreference } = useTheme();
  const [editing, setEditing] = useState(false);
  const p = profile || {};
  const brandName = p.company_name || p.brand_name || '';
  const rows = [
    ['person-outline', 'Contact person', p.full_name || p.contact_person],
    ['call-outline', 'Mobile', p.mobile_number || p.contact_number],
    ['mail-outline', 'Email', p.email],
    ['document-text-outline', 'GST number', p.gst_number],
    ['location-outline', 'Address', p.company_address],
  ];

  const Row = ({ icon, label, value, onPress, right, last }) => (
    <TouchableOpacity style={[s.row, last && { borderBottomWidth: 0 }]} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={21} color={colors.primary} style={{ width: 32 }} />
      <Text style={s.rowLabel}>{label}</Text>
      {value !== undefined ? <Text style={s.rowValue} numberOfLines={1}>{value || 'Not provided'}</Text> : null}
      {right || null}
      {onPress ? <Ionicons name="chevron-forward" size={20} color={colors.textMuted} /> : null}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Header title="Profile" onBack={onBack} />
      <View style={s.card}>
        <View style={s.avatar}>
          <Text style={s.initials}>{getInitials(brandName || 'B')}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={s.name} numberOfLines={1}>{brandName || 'Your brand'}</Text>
          <Text style={s.sub} numberOfLines={1}>{p.full_name || p.contact_person || ''}</Text>
        </View>
        <Badge label="BRAND" tone="primary" />
      </View>

      <View style={[s.rowBetween, { marginTop: 22, marginBottom: 10 }]}>
        <Text style={s.sectionTitle}>COMPANY</Text>
        {profile ? (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Text style={s.link}>Edit</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={s.menu}>
        {rows.map(([icon, label, value], i) => (
          <Row key={label} icon={icon} label={label} value={value} last={i === rows.length - 1} />
        ))}
      </View>

      <Section>App Settings</Section>
      <View style={s.menu}>
        <Row
          icon="notifications-outline"
          label="Notifications"
          onPress={onOpenNotifications}
          right={unreadCount ? <Badge label={String(unreadCount)} tone="danger" style={{ marginRight: 8 }} /> : null}
        />
        <Row icon="mail-outline" label="Help & Support" onPress={() => Linking.openURL('mailto:support@flexriders.in?subject=Brand%20support')} last />
      </View>

      <Section>Appearance</Section>
      <View style={s.segmented}>
        {THEME_OPTIONS.map((o) => {
          const active = preference === o.value;
          return (
            <TouchableOpacity key={o.value} style={[s.segment, active && s.segmentOn]} onPress={() => setPreference(o.value)}>
              <Ionicons name={o.icon} size={16} color={active ? colors.onPrimary : colors.textMuted} />
              <Text style={[s.segmentText, active && { color: colors.onPrimary }]}>{o.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Button label="Logout" tone="soft" onPress={onLogout} style={{ marginTop: 28 }} />
      {editing && profile ? <EditCompany profile={profile} onClose={() => setEditing(false)} onSaved={onProfileChanged || (async () => {})} /> : null}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 18 },
    avatar: { width: 62, height: 62, borderRadius: 31, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    initials: { fontSize: 22, fontWeight: '800', color: c.primary },
    name: { fontSize: 19, fontWeight: '800', color: c.text },
    sub: { fontSize: 13, color: c.textMuted, marginTop: 3 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: c.textMuted, letterSpacing: 0.6 },
    link: { color: c.primary, fontWeight: '700', fontSize: 15 },
    menu: { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border },
    rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: c.text },
    rowValue: { fontSize: 14, color: c.textMuted, maxWidth: '55%', textAlign: 'right', marginRight: 4 },
    segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 14, padding: 4 },
    segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10 },
    segmentOn: { backgroundColor: c.primary },
    segmentText: { fontSize: 13, fontWeight: '700', color: c.textMuted },
  });
