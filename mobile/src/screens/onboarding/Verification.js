// Verification Status (documents + profile review) and Select Working Areas. Both are used right after
// sign-up and from the You tab.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../../services/api';
import { getCachedDeviceLocation } from '../../services/locationService';

import { useStyles, useTheme } from '../../theme';
import { useT } from '../../i18n';
import { Badge, Button, Card, Chip, Empty, Header, Screen } from '../../components/ds';
import { ID_TYPES, pickDocument } from './RiderSignup';

// The phone's recent GPS fix (if any), so nearby places rank first in area search.
const nearMe = () => getCachedDeviceLocation().then((f) => (f ? { lat: f.latitude, lng: f.longitude } : null)).catch(() => null);

let MapView = null;
let Marker = null;
let Circle = null;
try {
  const Maps = require('react-native-maps');
  MapView = Maps.default || Maps;
  ({ Marker, Circle } = Maps);
} catch (e) {
  MapView = null;
}

const DOC_TONE = { PENDING: ['Pending Verification', 'warning', 'time-outline'], VERIFIED: ['Verified', 'success', 'checkmark-circle'], REJECTED: ['Re-upload needed', 'danger', 'alert-circle'] };
const PROFILE_TEXT = {
  PENDING: ['Pending Verification', 'warning', "We'll verify your details and documents. Once approved, nearby campaigns unlock."],
  UNDER_REVIEW: ['Under Review', 'warning', 'The FlexRiders team is reviewing your profile.'],
  APPROVED: ['Verified', 'success', 'Your profile is approved. You can join campaigns.'],
  ACTIVE: ['Verified', 'success', 'Your profile is approved. You can join campaigns.'],
  REJECTED: ['Not approved', 'danger', 'Your profile was not approved. Contact support from Help & Support.'],
  SUSPENDED: ['Suspended', 'danger', 'Your account is suspended. Contact support from Help & Support.'],
};

export function VerificationStatus({ riderStatus, vehicleCategory, onBack, onContinue, continueLabel, title, vehicle, onChangeVehicle }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(null);
  const load = useCallback(
    () =>
      mobileApi
        .getMyDocuments()
        .then((d) => {
          setDocs(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  const upload = async (docType) => {
    const file = await pickDocument();
    if (!file) return;
    setUploading(docType);
    try {
      await mobileApi.uploadDocument(docType, file);
      await load();
    } catch (err) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setUploading(null);
    }
  };
  const chooseIdType = () =>
    Alert.alert('Document type', null, [...ID_TYPES.map(([v, l]) => ({ text: l, onPress: () => upload(v) })), { text: 'Cancel', style: 'cancel' }]);

  const [label, tone, text] = PROFILE_TEXT[riderStatus] || PROFILE_TEXT.PENDING;
  const idDoc = (docs || []).find((d) => d.group === 'IDENTITY');
  const vehicleDoc = (docs || []).find((d) => d.group === 'VEHICLE');
  const vehicleType = vehicleCategory === 'CYCLE' ? 'VEHICLE_PROOF' : 'VEHICLE_RC';
  const rows = [
    ['ID Verification Proof', idDoc, chooseIdType],
    ['Vehicle Proof', vehicleDoc, () => upload(vehicleDoc ? vehicleDoc.doc_type : vehicleType)],
  ];

  return (
    <Screen
      footer={onContinue ? <Button label={continueLabel || t('Continue')} tone={riderStatus === 'APPROVED' || riderStatus === 'ACTIVE' ? 'primary' : 'primary'} onPress={onContinue} /> : null}
    >
      <Header onBack={onBack} title={title || t('Vehicle Verification')} />
      {vehicle ? (
        <Card style={{ marginBottom: 16 }}>
          {[
            ['Vehicle type', vehicle.category],
            ['Model', vehicle.model],
            [vehicleCategory === 'CYCLE' ? 'Frame / serial number' : 'Registration number', vehicle.number],
          ].map(([k, v]) => (
            <View key={k} style={[s.rowBetween, { paddingVertical: 6 }]}>
              <Text style={s.docSub}>{k}</Text>
              <Text style={s.docTitle}>{v || 'Not provided'}</Text>
            </View>
          ))}
          {onChangeVehicle ? (
            <TouchableOpacity style={s.changeBtn} onPress={onChangeVehicle} accessibilityLabel="Change vehicle">
              <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
              <Text style={s.reuploadText}>Change Vehicle</Text>
            </TouchableOpacity>
          ) : null}
        </Card>
      ) : null}
      <Card style={{ marginBottom: 22 }}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>Status</Text>
          <Badge label={label} tone={tone} icon="time-outline" />
        </View>
        <Text style={s.body}>{text}</Text>
      </Card>
      <Text style={s.label}>Uploaded Documents</Text>
      {error ? <Text style={[s.body, { color: colors.danger }]}>{error}</Text> : null}
      {docs == null && !error ? <ActivityIndicator color={colors.primary} /> : null}
      {docs
        ? rows.map(([title, doc, onUpload]) => {
            const st = doc ? DOC_TONE[doc.status] : null;
            return (
              <Card key={title} style={s.docRow}>
                {doc ? (
                  <Image source={mobileApi.authedImage(doc.file_path)} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, s.thumbEmpty]}>
                    <Ionicons name="document-outline" size={22} color={colors.textSubtle} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.docTitle}>{doc ? doc.label : title}</Text>
                  <Text style={s.docSub} numberOfLines={1}>{doc ? doc.file_name : 'Not uploaded yet'}</Text>
                  {st ? <Badge label={st[0]} tone={st[1]} icon={st[2]} style={{ marginTop: 6 }} /> : null}
                  {doc && doc.rejection_note ? <Text style={s.reject}>{doc.rejection_note}</Text> : null}
                </View>
                <TouchableOpacity style={s.reupload} onPress={onUpload} disabled={Boolean(uploading)}>
                  {uploading && (uploading === (doc && doc.doc_type) || (!doc && uploading)) ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text style={s.reuploadText}>{doc ? 'Re-upload' : 'Upload'}</Text>
                  )}
                </TouchableOpacity>
              </Card>
            );
          })
        : null}
    </Screen>
  );
}

// --------------------------------------------------------------------------------------------- Areas

const MAX = 3;

export function WorkingAreasScreen({ onBack, onSaved, saveLabel }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const [areas, setAreas] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    mobileApi
      .getWorkingAreas()
      .then((d) => setAreas(d.areas.map(({ label, lat, lng }) => ({ label, lat, lng }))))
      .catch(() => setAreas([]));
  }, []);
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const found = await mobileApi.searchAreas(q.trim(), await nearMe());
        setResults(found);
        if (!found.length) setError('No places found. Try adding your city or a pin code.');
      } catch (err) {
        setError(err.message);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [q]);

  const add = (p) => {
    if (!areas || areas.length >= MAX || areas.some((a) => a.label === p.label)) return;
    setAreas([...areas, { label: p.label, lat: p.lat, lng: p.lng }]);
    setQ('');
    setResults([]);
  };
  const save = async () => {
    setSaving(true);
    try {
      await mobileApi.updateWorkingAreas(areas);
      onSaved && onSaved(areas);
    } catch (err) {
      Alert.alert('Could not save', err.message);
    } finally {
      setSaving(false);
    }
  };

  const region = areas && areas.length
    ? (() => {
        const lats = areas.map((a) => a.lat);
        const lngs = areas.map((a) => a.lng);
        return {
          latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
          longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
          latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.8, 0.06),
          longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.8, 0.06),
        };
      })()
    : null;

  return (
    <Screen footer={<Button label={saveLabel || t('Save & Proceed')} onPress={save} loading={saving} disabled={!areas} />}>
      <Header onBack={onBack} title={t('Select Working Areas')} />
      <Text style={s.body}>Choose up to 3 areas where you ride most. We'll prioritize showing campaigns active in these zones.</Text>
      <Text style={[s.label, { marginTop: 18 }]}>Search Area / Locality</Text>
      <View style={[s.search, areas && areas.length >= MAX && { opacity: 0.5 }]}>
        <Ionicons name="search-outline" size={20} color={colors.textMuted} />
        <TextInput
          ref={input}
          style={s.searchInput}
          value={q}
          onChangeText={setQ}
          editable={Boolean(areas) && areas.length < MAX}
          placeholder={areas && areas.length >= MAX ? '3 areas selected' : 'Enter neighborhood or pin code'}
          placeholderTextColor={colors.textSubtle}
          autoCorrect={false}
        />
        {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {error ? <Text style={[s.body, { color: colors.warning, marginTop: 6 }]}>{error}</Text> : null}
      {results.map((r) => (
        <TouchableOpacity key={`${r.lat},${r.lng}`} style={s.result} onPress={() => add(r)}>
          <Ionicons name="location-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={s.docTitle}>{r.label}</Text>
            <Text style={s.docSub} numberOfLines={1}>{r.description}</Text>
          </View>
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      ))}
      <View style={s.chips}>
        {(areas || []).map((a) => (
          <Chip key={a.label} label={a.label.split(',')[0]} active onRemove={() => setAreas(areas.filter((x) => x.label !== a.label))} />
        ))}
        {areas && areas.length < MAX ? <Chip label="+ Add Zone" onPress={() => input.current && input.current.focus()} /> : null}
      </View>
      <View style={[s.rowBetween, { marginTop: 20, marginBottom: 10 }]}>
        <Text style={s.label}>Zone Map Coverage</Text>
        <Text style={s.count}>{areas ? areas.length : 0} of {MAX} selected</Text>
      </View>
      {areas == null ? (
        <ActivityIndicator color={colors.primary} />
      ) : !areas.length ? (
        <Card style={s.mapEmpty}>
          <Ionicons name="map-outline" size={28} color={colors.textSubtle} />
          <Text style={s.docSub}>Your selected areas appear on the map.</Text>
        </Card>
      ) : MapView ? (
        <View style={s.map}>
          <MapView key={areas.map((a) => a.label).join('|')} style={StyleSheet.absoluteFill} initialRegion={region} scrollEnabled={false} zoomEnabled={false} pitchEnabled={false} rotateEnabled={false}>
            {areas.map((a) => (
              <React.Fragment key={a.label}>
                <Circle center={{ latitude: a.lat, longitude: a.lng }} radius={1500} strokeColor={colors.primary} strokeWidth={1.5} fillColor="rgba(53, 99, 233, 0.18)" />
                <Marker coordinate={{ latitude: a.lat, longitude: a.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                  <View style={s.mapLabel}>
                    <Text style={s.mapLabelText}>{a.label.split(',')[0]}</Text>
                  </View>
                </Marker>
              </React.Fragment>
            ))}
          </MapView>
        </View>
      ) : null}
    </Screen>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    body: { fontSize: 15, color: c.textMuted, lineHeight: 22, marginTop: 8 },
    label: { fontSize: 15, fontWeight: '700', color: c.text, marginBottom: 10 },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 12 },
    thumb: { width: 60, height: 60, borderRadius: 12, backgroundColor: c.surfaceAlt },
    thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
    docTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    docSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    reject: { fontSize: 12, color: c.danger, marginTop: 4 },
    reupload: { backgroundColor: c.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minWidth: 90, alignItems: 'center' },
    changeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, borderColor: c.primary },
    reuploadText: { color: c.primary, fontWeight: '700', fontSize: 14 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16 },
    searchInput: { flex: 1, fontSize: 16, color: c.text },
    result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
    count: { color: c.primary, fontWeight: '700', fontSize: 14 },
    map: { height: 230, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: c.border },
    mapEmpty: { height: 160, alignItems: 'center', justifyContent: 'center', gap: 8 },
    mapLabel: { backgroundColor: c.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    mapLabelText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  });
