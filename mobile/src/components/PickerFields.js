import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' <-> local Date (no time-zone shift).
const parseDate = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Times: '24h' values are 'HH:MM' (photo slots); '12h' values are 'hh:MM AM' (daily campaign hours).
const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec((s || '').trim());
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0);
  const d = new Date();
  d.setHours(h, Number(m[2]), 0, 0);
  return d;
};
const formatTime = (d, format) => {
  const h = d.getHours();
  const m = pad(d.getMinutes());
  return format === '24h' ? `${pad(h)}:${m}` : `${pad(((h + 11) % 12) + 1)}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};
const displayTime = (value) => {
  const d = parseTime(value);
  return d ? formatTime(d, '12h') : '';
};

/** One tappable field that opens the phone's calendar (mode="date") or clock (mode="time").
 * Android: the system dialog. iOS: the system picker in a sheet with Done. */
function PickerField({ label, hideLabel, required, value, onChange, mode, format = '12h', minimumDate, maximumDate, placeholder, compact }) {
  const s = useStyles(makeStyles);
  const { colors, scheme } = useTheme();
  const isDark = scheme === 'dark';
  const [open, setOpen] = useState(false);
  const current = (mode === 'date' ? parseDate(value) : parseTime(value)) || minimumDate || new Date();
  const [draft, setDraft] = useState(current);
  const shown =
    mode === 'date'
      ? (() => {
          const d = parseDate(value);
          return d ? `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
        })()
      : displayTime(value);
  const commit = (d) => onChange(mode === 'date' ? toISODate(d) : formatTime(d, format));

  const openPicker = () => {
    setDraft(current);
    setOpen(true);
  };

  const picker = (
    <DateTimePicker
      value={Platform.OS === 'ios' ? draft : current}
      mode={mode}
      display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      is24Hour={format === '24h'}
      themeVariant={isDark ? 'dark' : 'light'}
      onChange={(event, picked) => {
        if (Platform.OS === 'ios') {
          if (picked) setDraft(picked);
          return;
        }
        setOpen(false); // Android dialog closes itself
        if (event.type === 'set' && picked) commit(picked);
      }}
    />
  );

  return (
    <View style={compact ? null : { marginBottom: 14 }}>
      {label && !hideLabel ? (
        <Text style={s.label}>
          {label}
          {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
        </Text>
      ) : null}
      <TouchableOpacity
        style={[s.input, compact && s.inputCompact]}
        onPress={openPicker}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label || (mode === 'date' ? 'Date' : 'Time')}: ${shown || 'not set'}`}
      >
        <Ionicons name={mode === 'date' ? 'calendar-outline' : 'time-outline'} size={compact ? 16 : 20} color={colors.primary} />
        <Text style={[s.value, compact && s.valueCompact, !shown && { color: colors.textSubtle }]} numberOfLines={1}>
          {shown || placeholder || (mode === 'date' ? 'Select date' : 'Select time')}
        </Text>
        {compact ? null : <Ionicons name="chevron-down" size={16} color={colors.textMuted} />}
      </TouchableOpacity>

      {open && Platform.OS === 'android' ? picker : null}
      {Platform.OS === 'ios' ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Text style={s.cancel}>Cancel</Text>
              </TouchableOpacity>
              <Text style={s.sheetTitle}>{label || (mode === 'date' ? 'Select date' : 'Select time')}</Text>
              <TouchableOpacity
                onPress={() => {
                  commit(draft);
                  setOpen(false);
                }}
                hitSlop={10}
              >
                <Text style={s.done}>Done</Text>
              </TouchableOpacity>
            </View>
            {picker}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export function DatePickerField(props) {
  return <PickerField {...props} mode="date" />;
}

export function TimePickerField(props) {
  return <PickerField {...props} mode="time" />;
}

export { parseDate, toISODate };

const makeStyles = (c) =>
  StyleSheet.create({
    label: { fontSize: 13, fontWeight: '700', color: c.text, marginBottom: 8 },
    input: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    inputCompact: { paddingHorizontal: 10, paddingVertical: 10, gap: 6 },
    value: { flex: 1, fontSize: 15, color: c.text, fontWeight: '600' },
    valueCompact: { fontSize: 13.5 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28, paddingHorizontal: 12 },
    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 14 },
    sheetTitle: { fontSize: 15, fontWeight: '800', color: c.text },
    cancel: { fontSize: 15, color: c.textMuted, fontWeight: '600' },
    done: { fontSize: 15, color: c.primary, fontWeight: '800' },
  });
