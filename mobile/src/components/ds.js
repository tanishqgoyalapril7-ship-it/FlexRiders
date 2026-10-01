// FlexRiders rider-app design kit (from the Figma screens): back-circle headers, 56 px pill buttons,
// rounded fields and cards, option cards, chips, badges and a segmented control. Theme-aware.
import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';

export function Screen({ children, scroll = true, footer, style, contentStyle }) {
  const s = useStyles(makeStyles);
  return (
    <View style={[s.screen, style]}>
      {scroll ? (
        <ScrollView contentContainerStyle={[s.content, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, { flex: 1 }, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </View>
  );
}

export function Header({ title, onBack, right, circle = true }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={s.header}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={circle ? s.backCircle : s.back} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      {right || null}
    </View>
  );
}

export function Title({ children, sub }) {
  const s = useStyles(makeStyles);
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={s.title}>{children}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

export function Button({ label, onPress, loading, disabled, tone = 'primary', style, icon }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const bg = { primary: colors.primary, warning: colors.warning, danger: colors.danger, muted: colors.surfaceAlt, soft: colors.dangerSoft, outline: colors.surface }[tone];
  const fg = tone === 'muted' ? colors.textMuted : tone === 'soft' ? colors.danger : tone === 'outline' ? colors.primary : '#FFFFFF';
  return (
    <TouchableOpacity
      style={[s.button, { backgroundColor: bg }, tone === 'outline' && { borderWidth: 1.5, borderColor: colors.primary }, (disabled || loading) && tone !== 'muted' && { opacity: 0.55 }, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[s.buttonText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function LinkText({ children, onPress, style }) {
  const s = useStyles(makeStyles);
  return (
    <Text style={[s.link, style]} onPress={onPress} suppressHighlighting>
      {children}
    </Text>
  );
}

export function Field({ label, right, icon, hint, hintTone, prefix, style, trailing, ...input }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      {label ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={s.label}>{label}</Text>
          {right ? <Text style={s.labelRight}>{right}</Text> : null}
        </View>
      ) : null}
      <View style={[s.field, input.editable === false && { backgroundColor: colors.surfaceAlt }]}>
        {icon ? <Ionicons name={icon} size={20} color={colors.textMuted} style={{ marginRight: 12 }} /> : null}
        {prefix ? <Text style={s.prefix}>{prefix}</Text> : null}
        <TextInput style={s.input} placeholderTextColor={colors.textSubtle} {...input} />
        {trailing || null}
      </View>
      {hint ? <Text style={[s.hint, hintTone && { color: colors[hintTone] }]}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style, onPress }) {
  const s = useStyles(makeStyles);
  const Comp = onPress ? TouchableOpacity : View;
  return (
    <Comp style={[s.card, style]} onPress={onPress} activeOpacity={0.85}>
      {children}
    </Comp>
  );
}

export function OptionCard({ selected, onPress, icon, title, text, style }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[s.option, selected && s.optionSelected, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      {icon ? (
        <View style={[s.optionIcon, selected && { backgroundColor: colors.primarySoft }]}>
          <Ionicons name={icon} size={24} color={selected ? colors.primary : colors.textMuted} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.optionTitle}>{title}</Text>
        {text ? <Text style={s.optionText}>{text}</Text> : null}
      </View>
      {icon ? null : (
        <View style={[s.radio, selected && s.radioOn]}>{selected ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}</View>
      )}
    </TouchableOpacity>
  );
}

const TONES = {
  success: ['success', 'successSoft'],
  warning: ['warning', 'warningSoft'],
  danger: ['danger', 'dangerSoft'],
  primary: ['primary', 'primarySoft'],
  neutral: ['textMuted', 'surfaceAlt'],
};

export function Badge({ label, tone = 'neutral', icon, style }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const [fg, bg] = TONES[tone].map((k) => colors[k]);
  return (
    <View style={[s.badge, { backgroundColor: bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** solid: the selected chip is filled with the primary colour (white text) instead of the soft tint. */
export function Chip({ label, active, solid, onPress, onRemove, style }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[s.chip, active && (solid ? s.chipSolid : s.chipActive), style]} onPress={onPress} disabled={!onPress && !onRemove} activeOpacity={0.85}>
      <Text style={[s.chipText, active && (solid ? s.chipTextSolid : s.chipTextActive)]}>{label}</Text>
      {onRemove ? (
        <TouchableOpacity onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
          <Ionicons name="close-circle-outline" size={18} color={active ? (solid ? colors.onPrimary : colors.primary) : colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </TouchableOpacity>
  );
}

export function Segmented({ options, value, onChange }) {
  const s = useStyles(makeStyles);
  return (
    <View style={s.segmented}>
      {options.map(([key, label]) => (
        <TouchableOpacity key={key} style={[s.segment, value === key && s.segmentOn]} onPress={() => onChange(key)} activeOpacity={0.85}>
          <Text style={[s.segmentText, value === key && s.segmentTextOn]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function Section({ children }) {
  const s = useStyles(makeStyles);
  return <Text style={s.section}>{children}</Text>;
}

export function Empty({ icon, title, text }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={30} color={colors.textSubtle} />
      <Text style={s.emptyTitle}>{title}</Text>
      {text ? <Text style={s.emptyText}>{text}</Text> : null}
    </View>
  );
}

export function Dots({ count, index }) {
  const s = useStyles(makeStyles);
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={[s.dot, i === index && s.dotOn]} />
      ))}
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 24, paddingBottom: 24 },
    footer: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8, backgroundColor: c.background },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 12, paddingBottom: 18 },
    back: { paddingVertical: 4 },
    backCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, fontSize: 22, fontWeight: '800', color: c.text },
    title: { fontSize: 30, fontWeight: '800', color: c.text, lineHeight: 36 },
    sub: { fontSize: 16, color: c.textMuted, marginTop: 8, lineHeight: 22 },
    button: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
    buttonText: { fontSize: 17, fontWeight: '800' },
    link: { color: c.primary, fontWeight: '700' },
    label: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 8 },
    labelRight: { fontSize: 12, fontWeight: '700', color: c.textMuted, letterSpacing: 0.5 },
    field: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16 },
    prefix: { fontSize: 16, fontWeight: '700', color: c.text, paddingRight: 12, marginRight: 12, borderRightWidth: 1, borderRightColor: c.border },
    input: { flex: 1, fontSize: 16, color: c.text, paddingVertical: 14 },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    card: { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.border, padding: 18 },
    option: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: c.surface, borderRadius: 20, borderWidth: 1.5, borderColor: c.border, padding: 18, marginBottom: 14 },
    optionSelected: { borderColor: c.primary },
    optionIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    optionTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    optionText: { fontSize: 14, color: c.textMuted, marginTop: 4, lineHeight: 19 },
    radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    radioOn: { backgroundColor: c.primary, borderColor: c.primary },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    chipActive: { backgroundColor: c.primarySoft, borderColor: c.primarySoft },
    chipText: { fontSize: 14, fontWeight: '600', color: c.textMuted },
    chipTextActive: { color: c.primary, fontWeight: '700' },
    chipSolid: { backgroundColor: c.primary, borderColor: c.primary },
    chipTextSolid: { color: c.onPrimary, fontWeight: '700' },
    segmented: { flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: 16, padding: 4 },
    segment: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
    segmentOn: { backgroundColor: c.surface },
    segmentText: { fontSize: 15, fontWeight: '700', color: c.textMuted },
    segmentTextOn: { color: c.primary },
    section: { fontSize: 13, fontWeight: '800', color: c.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 22, marginBottom: 10 },
    empty: { alignItems: 'center', paddingVertical: 36, gap: 8 },
    emptyTitle: { fontSize: 16, fontWeight: '800', color: c.text, textAlign: 'center' },
    emptyText: { fontSize: 13, color: c.textMuted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 12 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
    dotOn: { width: 24, backgroundColor: c.primary },
  });
