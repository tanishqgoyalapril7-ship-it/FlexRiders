import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { OutlineButton, PrimaryButton } from '../components/ui';

export const TERMS_URL = 'https://flexriders.in/terms';
export const PRIVACY_URL = 'https://flexriders.in/privacy';

/** "I agree to the FlexRiders Terms & Conditions and Privacy Policy." with links to both documents. */
export function TermsCheckbox({ checked, onChange, termsUrl = TERMS_URL, privacyUrl = PRIVACY_URL }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.box}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => onChange(!checked)}
        activeOpacity={0.8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? colors.primary : colors.textMuted} />
        <Text style={styles.label}>I agree to the FlexRiders Terms & Conditions and Privacy Policy.</Text>
      </TouchableOpacity>
      <View style={styles.links}>
        <Text style={styles.link} onPress={() => Linking.openURL(termsUrl)}>
          Read Terms & Conditions
        </Text>
        <Text style={styles.link} onPress={() => Linking.openURL(privacyUrl)}>
          Read Privacy Policy
        </Text>
      </View>
    </View>
  );
}

/** Shown after login when a newer Terms / Privacy version needs accepting (earlier acceptances are kept). */
export default function TermsConsentScreen({ consent, onAccepted, onLogout }) {
  const styles = useStyles(makeStyles);
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const accept = async () => {
    setLoading(true);
    try {
      await mobileApi.acceptConsent();
      await onAccepted();
    } catch (err) {
      Alert.alert('Could not save', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.padded}>
      <Text style={styles.title}>Terms & Privacy</Text>
      <Text style={styles.subtitle}>
        {consent && consent.accepted
          ? 'We have updated the FlexRiders Terms & Conditions and Privacy Policy. Please read and accept them to continue.'
          : 'Please read and accept the FlexRiders Terms & Conditions and Privacy Policy to continue using the app.'}
      </Text>
      <TermsCheckbox
        checked={checked}
        onChange={setChecked}
        termsUrl={(consent && consent.terms_url) || TERMS_URL}
        privacyUrl={(consent && consent.privacy_url) || PRIVACY_URL}
      />
      <PrimaryButton label="Accept and Continue" loading={loading} disabled={!checked} onPress={accept} style={{ marginTop: 8 }} />
      <OutlineButton label="Log out" onPress={onLogout} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    padded: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 32 },
    title: { fontSize: 26, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 14, color: c.textMuted, marginTop: 6, marginBottom: 18, lineHeight: 20 },
    box: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 14, backgroundColor: c.surface, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    label: { flex: 1, fontSize: 14, color: c.text, fontWeight: '600', lineHeight: 20 },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 10, marginLeft: 34 },
    link: { color: c.primary, fontWeight: '700', fontSize: 13 },
  });
