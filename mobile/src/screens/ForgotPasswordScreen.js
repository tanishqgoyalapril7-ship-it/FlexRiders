import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { OutlineButton, PrimaryButton, ScreenHeader } from '../components/ui';
import { PasswordField } from '../components/formFields';

/** Forgot password: a 6-digit code goes to the email on the rider's account, then a new password. */
export default function ForgotPasswordScreen({ initialIdentifier = '', onBack, onDone }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!identifier.trim()) {
      Alert.alert('Required', 'Enter your registered mobile number or email.');
      return;
    }
    setLoading(true);
    try {
      const res = await mobileApi.forgotPassword(identifier.trim());
      setNotice(res.message);
      setSent(true);
    } catch (err) {
      Alert.alert('Could not send the code', err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!/^\d{6}$/.test(code.trim())) return Alert.alert('Required', 'Enter the 6-digit code from the email.');
    if (password.length < 6) return Alert.alert('Required', 'Choose a password of at least 6 characters.');
    if (password !== confirm) return Alert.alert('Check password', "The two passwords don't match.");
    setLoading(true);
    try {
      const res = await mobileApi.resetPassword(identifier.trim(), code.trim(), password);
      Alert.alert('Password changed', res.message, [{ text: 'Log in', onPress: onDone }]);
    } catch (err) {
      Alert.alert('Could not reset the password', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.padded}>
        <ScreenHeader onBack={onBack} title="" />
      </View>
      <ScrollView contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>We'll email a 6-digit code to the email address on your FlexRiders account.</Text>

        <Text style={styles.label}>Mobile number or email</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          placeholder="e.g. 98765 43210 or name@example.com"
          placeholderTextColor={colors.textSubtle}
          editable={!sent}
        />

        {!sent ? (
          <PrimaryButton label="Send Code" loading={loading} onPress={sendCode} style={{ marginTop: 20 }} />
        ) : (
          <>
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.textSubtle}
            />
            <PasswordField label="New password" required value={password} onChangeText={setPassword} placeholder="At least 6 characters" />
            <PasswordField label="Confirm new password" required value={confirm} onChangeText={setConfirm} placeholder="Type it again" />
            <PrimaryButton label="Set New Password" loading={loading} onPress={reset} style={{ marginTop: 8 }} />
            <OutlineButton label="Send a new code" onPress={sendCode} style={{ marginTop: 12 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    padded: { paddingHorizontal: 20, paddingBottom: 32 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, marginTop: 8 },
    subtitle: { fontSize: 14, color: c.textMuted, marginTop: 6, lineHeight: 20 },
    label: { fontSize: 13, fontWeight: '600', color: c.text, marginTop: 18, marginBottom: 8 },
    input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: c.text },
    notice: { backgroundColor: c.primarySoft, borderRadius: 12, padding: 14, marginTop: 16 },
    noticeText: { fontSize: 13, color: c.text, lineHeight: 19 },
  });
