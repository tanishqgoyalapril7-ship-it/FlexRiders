import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { PasswordField } from './formFields';

/**
 * Bottom-sheet confirmation for destructive actions.
 * props: visible, title, message, points (string[]), confirmLabel, requirePassword, typeToConfirm,
 *        onConfirm(password) => Promise (throw to show the error), onClose
 */
export default function ConfirmSheet({
  visible,
  title,
  message,
  points = [],
  confirmLabel = 'Delete',
  requirePassword,
  typeToConfirm,
  onConfirm,
  onClose,
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setPassword('');
      setTyped('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  const blocked = busy || (requirePassword && !password) || (typeToConfirm && typed.trim().toUpperCase() !== typeToConfirm);

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm(password);
    } catch (err) {
      setError(err.message || 'Something went wrong');
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.icon}>
              <Ionicons name="warning-outline" size={22} color={colors.danger} />
            </View>
            <Text style={styles.title}>{title}</Text>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {points.length ? (
            <View style={styles.points}>
              {points.map((p) => (
                <View key={p} style={styles.point}>
                  <Ionicons name="ellipse" size={6} color={colors.textMuted} style={{ marginTop: 7 }} />
                  <Text style={styles.pointText}>{p}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {requirePassword ? <PasswordField label="Enter your password to confirm" value={password} onChangeText={setPassword} /> : null}
          {typeToConfirm ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={styles.label}>
                Type <Text style={{ fontWeight: '800', color: colors.text }}>{typeToConfirm}</Text> to confirm
              </Text>
              <TextInput
                style={styles.input}
                value={typed}
                onChangeText={setTyped}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholderTextColor={colors.textSubtle}
              />
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <TouchableOpacity style={[styles.button, styles.cancel]} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.danger, blocked && { opacity: 0.45 }]}
              onPress={confirm}
              disabled={blocked}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerText}>{confirmLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 18, fontWeight: '800', color: c.text },
    message: { fontSize: 14, color: c.textMuted, lineHeight: 20, marginBottom: 12 },
    points: { gap: 6, marginBottom: 16 },
    point: { flexDirection: 'row', gap: 8 },
    pointText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 19 },
    label: { fontSize: 13, fontWeight: '600', color: c.textMuted, marginBottom: 8 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
    },
    error: { color: c.danger, fontSize: 13, marginBottom: 12 },
    buttons: { flexDirection: 'row', gap: 12 },
    button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    cancel: { borderWidth: 1, borderColor: c.border },
    cancelText: { fontSize: 15, fontWeight: '600', color: c.text },
    danger: { backgroundColor: c.danger },
    dangerText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  });
