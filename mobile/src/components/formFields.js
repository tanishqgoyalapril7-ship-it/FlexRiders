import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { matchSuggestions } from '../data/suggestions';

export function FieldLabel({ label, required }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <Text style={styles.label}>
      {label}
      {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
    </Text>
  );
}

/** Password input with a show/hide eye toggle. */
export function PasswordField({ label, required, style, ...inputProps }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.inputFlex}
          placeholderTextColor={colors.textSubtle}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          {...inputProps}
        />
        <TouchableOpacity
          onPress={() => setVisible((v) => !v)}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={8}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Text input that suggests matching values from `options` while typing. Any value can still be typed. */
export function AutocompleteField({ label, required, value, onChangeText, options, hint, icon = 'location-outline', ...inputProps }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef(null);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const suggestions = focused ? matchSuggestions(options, value || '') : [];

  return (
    <View style={{ marginBottom: 16 }}>
      <FieldLabel label={label} required={required} />
      <View style={[styles.inputRow, focused && { borderColor: colors.primary }]}>
        <Ionicons name="search-outline" size={18} color={colors.textSubtle} style={{ marginLeft: 12 }} />
        <TextInput
          style={styles.inputFlex}
          placeholderTextColor={colors.textSubtle}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          // Delay so a tap on a suggestion registers before the list hides.
          onBlur={() => {
            blurTimer.current = setTimeout(() => setFocused(false), 150);
          }}
          autoCorrect={false}
          {...inputProps}
        />
        {value ? (
          <TouchableOpacity onPress={() => onChangeText('')} style={styles.iconButton} accessibilityLabel={`Clear ${label}`} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        ) : null}
      </View>
      {suggestions.length ? (
        <View style={styles.suggestions}>
          {suggestions.map((item, i) => (
            <TouchableOpacity
              key={item}
              style={[styles.suggestion, i === suggestions.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => {
                onChangeText(item);
                setFocused(false);
              }}
            >
              <Ionicons name={icon} size={16} color={colors.primary} />
              <Text style={styles.suggestionText}>{item}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const daysIn = (month, year) => new Date(year, month, 0).getDate(); // month is 1-12

/** Parses "DD-MM-YYYY" into { day, month, year } or null. */
export function parseDob(value) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value || '');
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
}

export function ageOn(dob, today = new Date()) {
  const d = parseDob(dob);
  if (!d) return null;
  let age = today.getFullYear() - d.year;
  if (today.getMonth() + 1 < d.month || (today.getMonth() + 1 === d.month && today.getDate() < d.day)) age -= 1;
  return age;
}

function PickerColumn({ items, selected, onSelect, width }) {
  const styles = useStyles(makeStyles);
  const ref = useRef(null);
  const ROW = 44;
  useEffect(() => {
    const index = items.findIndex((i) => i.value === selected);
    if (index >= 0) setTimeout(() => ref.current && ref.current.scrollTo({ y: Math.max(index - 2, 0) * ROW, animated: false }), 0);
  }, []); // Scroll to the initial value once
  return (
    <ScrollView ref={ref} style={[styles.column, { width }]} showsVerticalScrollIndicator={false}>
      {items.map((item) => {
        const active = item.value === selected;
        return (
          <TouchableOpacity key={item.value} style={[styles.columnItem, { height: ROW }, active && styles.columnItemActive]} onPress={() => onSelect(item.value)}>
            <Text style={[styles.columnText, active && styles.columnTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** Date of birth selector with Day / Month / Year lists. Value is "DD-MM-YYYY". */
export function DateOfBirthField({ label, required, value, onChange, minAge = 18, maxAge = 70 }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const now = new Date();
  const maxYear = now.getFullYear() - minAge;
  const minYear = now.getFullYear() - maxAge;
  const initial = parseDob(value) || { day: 1, month: 1, year: maxYear - 7 };
  const [draft, setDraft] = useState(initial);

  const openPicker = () => {
    setDraft(parseDob(value) || { day: 1, month: 1, year: maxYear - 7 });
    setOpen(true);
  };
  const update = (patch) =>
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      return { ...next, day: Math.min(next.day, daysIn(next.month, next.year)) };
    });

  const days = Array.from({ length: daysIn(draft.month, draft.year) }, (_, i) => ({ value: i + 1, label: pad(i + 1) }));
  const months = MONTHS.map((m, i) => ({ value: i + 1, label: m }));
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => ({ value: maxYear - i, label: String(maxYear - i) }));
  const parsed = parseDob(value);
  const display = parsed ? `${pad(parsed.day)} ${MONTHS[parsed.month - 1]} ${parsed.year}` : '';

  return (
    <View style={{ marginBottom: 16 }}>
      <FieldLabel label={label} required={required} />
      <TouchableOpacity style={styles.inputRow} onPress={openPicker} accessibilityRole="button" accessibilityLabel={`${label}: ${display || 'not set'}`}>
        <Text style={[styles.inputFlex, { paddingVertical: 13 }, !display && { color: colors.textSubtle }]}>{display || 'Select date of birth'}</Text>
        <View style={styles.iconButton}>
          <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.sheetCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>Date of Birth</Text>
            <TouchableOpacity
              onPress={() => {
                onChange(`${pad(draft.day)}-${pad(draft.month)}-${draft.year}`);
                setOpen(false);
              }}
              hitSlop={8}
            >
              <Text style={styles.sheetDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.columnHeaders}>
            {['Day', 'Month', 'Year'].map((h) => (
              <Text key={h} style={styles.columnHeader}>{h}</Text>
            ))}
          </View>
          <View style={styles.columns}>
            <PickerColumn items={days} selected={draft.day} onSelect={(day) => update({ day })} width="30%" />
            <PickerColumn items={months} selected={draft.month} onSelect={(month) => update({ month })} width="34%" />
            <PickerColumn items={years} selected={draft.year} onSelect={(year) => update({ year })} width="30%" />
          </View>
          <Text style={styles.sheetNote}>
            Selected: {pad(draft.day)} {MONTHS[draft.month - 1]} {draft.year} · Riders must be at least {minAge}.
          </Text>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 8 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
    },
    inputFlex: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text },
    iconButton: { paddingHorizontal: 12, paddingVertical: 10 },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    suggestions: {
      marginTop: 6,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      overflow: 'hidden',
    },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    suggestionText: { flex: 1, fontSize: 14, color: c.text },
    backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
    sheetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: c.text },
    sheetCancel: { fontSize: 15, color: c.textMuted },
    sheetDone: { fontSize: 15, fontWeight: '700', color: c.primary },
    columnHeaders: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 12 },
    columnHeader: { fontSize: 12, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
    columns: { flexDirection: 'row', justifyContent: 'space-around', height: 240, paddingTop: 6 },
    column: { flexGrow: 0 },
    columnItem: { alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    columnItemActive: { backgroundColor: c.primarySoft },
    columnText: { fontSize: 16, color: c.text },
    columnTextActive: { color: c.primary, fontWeight: '700' },
    sheetNote: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 12, paddingHorizontal: 20 },
  });


// Same list as the backend (value, label, icon, description).
export const VEHICLE_CATEGORIES = [
  ['CYCLE', 'Cycle', 'bicycle-outline', 'Bicycle or pedal cycle'],
  ['TWO_WHEELER', 'Bike / Two Wheeler', 'speedometer-outline', 'Motorbike or scooter'],
  ['AUTO', 'Auto', 'car-outline', 'Passenger auto-rickshaw'],
  ['THREE_WHEELER', 'Three Wheeler', 'cube-outline', 'Cargo / loader, non-passenger'],
];
export const vehicleNumberOptional = (category) => category === 'CYCLE';
export const vehicleCategoryLabel = (value) => (VEHICLE_CATEGORIES.find(([v]) => v === value) || [])[1] || '';

/** "What type of vehicle do you use?" — decides which campaigns the rider can join. */
export function VehicleCategoryField({ label = 'Select your vehicle type', required, value, onChange, disabled, hint }) {
  const styles = useStyles(makeChoiceStyles);
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      <FieldLabel label={label} required={required} />
      <View style={styles.row}>
        {VEHICLE_CATEGORIES.map(([v, text, icon, description]) => {
          const selected = value === v;
          return (
            <TouchableOpacity
              key={v}
              style={[styles.option, selected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }, disabled && !selected && { opacity: 0.5 }]}
              onPress={() => !disabled && onChange(v)}
              activeOpacity={0.85}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
            >
              {selected ? <Ionicons name="checkmark-circle" size={18} color={colors.primary} style={styles.tick} /> : null}
              <Ionicons name={icon} size={22} color={selected ? colors.primary : colors.textMuted} />
              <Text style={[styles.optionText, selected && { color: colors.primary }]}>{text}</Text>
              <Text style={styles.optionDesc}>{description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const makeChoiceStyles = (c) =>
  StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    option: { width: '48%', flexGrow: 1, alignItems: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    optionText: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'center' },
    optionDesc: { fontSize: 11, color: c.textMuted, textAlign: 'center', lineHeight: 14 },
    tick: { position: 'absolute', top: 6, right: 6 },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
  });
