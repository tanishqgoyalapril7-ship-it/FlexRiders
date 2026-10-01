import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { getCachedDeviceLocation } from '../services/locationService';

import { useStyles, useTheme } from '../theme';
import { PrimaryButton } from './ui';

// The phone's recent GPS fix (if any), so nearby places rank first in area search.
const nearMe = () => getCachedDeviceLocation().then((f) => (f ? { lat: f.latitude, lng: f.longitude } : null)).catch(() => null);

export const MAX_WORKING_AREAS = 3;

/** Search real places (backend geocoder) and pick up to three working areas.
 * onSave(areas) receives [{label, lat, lng}] and may return a promise (e.g. saving to the profile). */
export default function WorkingAreasEditor({ visible, initialAreas = [], onClose, onSave, saveLabel = 'Save areas' }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [areas, setAreas] = useState(initialAreas);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (visible) {
      setAreas(initialAreas.map((a) => ({ label: a.label, lat: a.lat, lng: a.lng })));
      setQ('');
      setResults([]);
      setError('');
    }
  }, [visible]);

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
        if (!found.length) setError('No places found. Try adding your city, e.g. "Sector 54 Gurugram".');
      } catch (err) {
        setError(err.message);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [q]);

  const add = (place) => {
    if (areas.length >= MAX_WORKING_AREAS) return;
    if (areas.some((a) => a.label === place.label)) return;
    setAreas([...areas, { label: place.label, lat: place.lat, lng: place.lng }]);
    setQ('');
    setResults([]);
  };
  const remove = (label) => setAreas(areas.filter((a) => a.label !== label));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(areas);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save your areas.');
    } finally {
      setSaving(false);
    }
  };

  const full = areas.length >= MAX_WORKING_AREAS;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Select Your Working Areas</Text>
              <Text style={styles.subtitle}>Select up to {MAX_WORKING_AREAS} major areas where you normally work.</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={[styles.search, full && { opacity: 0.5 }]}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              value={q}
              onChangeText={setQ}
              editable={!full}
              placeholder={full ? `You've selected ${MAX_WORKING_AREAS} areas` : 'Search area, sector or locality'}
              placeholderTextColor={colors.textSubtle}
              autoCorrect={false}
            />
            {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
            {results.map((r) => (
              <TouchableOpacity key={`${r.lat},${r.lng}`} style={styles.result} onPress={() => add(r)}>
                <Ionicons name="location-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultTitle}>{r.label}</Text>
                  <Text style={styles.resultSub} numberOfLines={1}>{r.description}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            ))}

            <Text style={styles.selectedTitle}>
              Selected Areas ({areas.length}/{MAX_WORKING_AREAS})
            </Text>
            {areas.length === 0 ? <Text style={styles.hint}>No areas selected yet.</Text> : null}
            {areas.map((a) => (
              <View key={a.label} style={styles.selected}>
                <Ionicons name="location" size={16} color={colors.primary} />
                <Text style={styles.selectedText} numberOfLines={1}>{a.label}</Text>
                <TouchableOpacity onPress={() => remove(a.label)} hitSlop={8} accessibilityLabel={`Remove ${a.label}`}>
                  <Ionicons name="close-circle" size={20} color={colors.textSubtle} />
                </TouchableOpacity>
              </View>
            ))}
            <Text style={styles.hint}>Campaigns in these areas will be prioritized for you.</Text>
          </ScrollView>

          <PrimaryButton label={saveLabel} onPress={save} loading={saving} style={{ marginTop: 12 }} />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 34 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 13, color: c.textMuted, marginTop: 4 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 14, paddingHorizontal: 12, backgroundColor: c.surfaceAlt },
    input: { flex: 1, paddingVertical: 12, fontSize: 15, color: c.text },
    error: { color: c.warning, fontSize: 12, marginTop: 8 },
    result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    resultTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    resultSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    selectedTitle: { fontSize: 13, fontWeight: '800', color: c.text, marginTop: 18, marginBottom: 8 },
    selected: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.primarySoft, borderRadius: 12, padding: 12, marginBottom: 8 },
    selectedText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 4 },
  });
