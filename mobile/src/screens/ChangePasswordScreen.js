import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { mobileApi } from '../services/api';
import { useStyles } from '../theme';
import { OutlineButton, PrimaryButton } from '../components/ui';
import { PasswordField } from '../components/formFields';

/** Required after an admin password reset: the rider replaces the temporary password before anything else. */
export default function ChangePasswordScreen({ onChanged, onLogout }) {
  const styles = useStyles(makeStyles);
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!current) return Alert.alert('Required', 'Enter the temporary password you were given.');
    if (password.length < 6) return Alert.alert('Required', 'Choose a password of at least 6 characters.');
    if (password !== confirm) return Alert.alert('Check password', "The two passwords don't match.");
    setLoading(true);
    try {
      await mobileApi.changePassword(current, password);
      Alert.alert('Password changed', 'Your new password is set.');
      await onChanged();
    } catch (err) {
      Alert.alert('Could not change the password', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>Your password was reset by the FlexRiders team. Choose a new password to continue.</Text>
        <View style={{ marginTop: 16 }}>
          <PasswordField label="Temporary password" required value={current} onChangeText={setCurrent} placeholder="From the FlexRiders team" />
          <PasswordField label="New password" required value={password} onChangeText={setPassword} placeholder="At least 6 characters" />
          <PasswordField label="Confirm new password" required value={confirm} onChangeText={setConfirm} placeholder="Type it again" />
        </View>
        <PrimaryButton label="Save New Password" loading={loading} onPress={save} style={{ marginTop: 8 }} />
        <OutlineButton label="Log out" onPress={onLogout} style={{ marginTop: 12 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    padded: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 32 },
    title: { fontSize: 26, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 14, color: c.textMuted, marginTop: 6, lineHeight: 20 },
  });
