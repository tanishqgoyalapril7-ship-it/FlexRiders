import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { getCachedDeviceLocation } from '../services/locationService';

import { useStyles, useTheme } from '../theme';

// The phone's recent GPS fix (if any), so nearby places rank first in area search.
const nearMe = () => getCachedDeviceLocation().then((f) => (f ? { lat: f.latitude, lng: f.longitude } : null)).catch(() => null);

/** Pick one real place as a campaign target: value = {label, lat, lng} | null. */
export default function TargetAreaField({ value, onChange, placeholder = 'Search area, sector or locality' }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return undefined;
    }
    timer.current = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const found = await mobileApi.searchAreas(q.trim(), await nearMe());
        setResults(found);
        if (!found.length) setError('No places found. Try adding the city.');
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    }, 450);
    return () => clearTimeout(timer.current);
  }, [q]);

  if (value) {
    return (
      <View style={styles.chosen}>
        <Ionicons name="location" size={18} color={colors.primary} />
        <Text style={styles.chosenText} numberOfLines={2}>{value.label}</Text>
        <TouchableOpacity onPress={() => onChange(null)} hitSlop={8} accessibilityLabel="Change target area">
          <Text style={styles.change}>Change</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View>
      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder={placeholder} placeholderTextColor={colors.textSubtle} autoCorrect={false} />
        {busy ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {results.map((r) => (
        <TouchableOpacity
          key={`${r.lat},${r.lng}`}
          style={styles.result}
          onPress={() => {
            onChange({ label: r.label, lat: r.lat, lng: r.lng });
            setQ('');
            setResults([]);
          }}
        >
          <Ionicons name="location-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.resultTitle}>{r.label}</Text>
            <Text style={styles.resultSub} numberOfLines={1}>{r.description}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.surface },
    input: { flex: 1, paddingVertical: 11, fontSize: 15, color: c.text },
    error: { color: c.warning, fontSize: 12, marginTop: 6 },
    result: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    resultTitle: { fontSize: 14, fontWeight: '700', color: c.text },
    resultSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    chosen: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.primarySoft, borderRadius: 12, padding: 12 },
    chosenText: { flex: 1, fontSize: 14, fontWeight: '700', color: c.text },
    change: { color: c.primary, fontWeight: '700', fontSize: 13 },
  });
