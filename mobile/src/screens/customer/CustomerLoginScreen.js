import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { OutlineButton, PrimaryButton, ScreenHeader } from '../../components/ui';

export default function CustomerLoginScreen({ onBack, onLoggedIn, onOpenSignup, onSwitchToRider, onForgot }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!identifier.trim()) {
      Alert.alert('Required', 'Please enter your registered mobile number or email.');
      return;
    }
    if (!password) {
      Alert.alert('Required', 'Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      const result = await mobileApi.customerLogin(identifier, password);
      await onLoggedIn(result);
    } catch (err) {
      Alert.alert('Login Failed', err.message || 'Invalid mobile/email or password');
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
        <View style={styles.badgeRow}>
          <View style={styles.brandBadge}>
            <Ionicons name="business-outline" size={14} color={colors.primary} />
            <Text style={styles.brandBadgeText}>Brand & Customer Portal</Text>
          </View>
        </View>

        <Text style={styles.title}>Welcome, Partner</Text>
        <Text style={styles.subtitle}>Sign in to manage ad campaigns, track rider performance, and review budget</Text>

        <Text style={styles.label}>Mobile Number or Email</Text>
        <View style={styles.inputRow}>
          <Ionicons name="person-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="e.g. 9876543210 or brand@company.com"
            placeholderTextColor={colors.textSubtle}
          />
        </View>

        <Text style={styles.label}>Password</Text>
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.input}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.textSubtle}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.forgotRow}
          onPress={() => onForgot && onForgot(identifier)}
          activeOpacity={0.7}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>

        <PrimaryButton label="Sign In as Brand" onPress={handleLogin} loading={loading} style={{ marginTop: 24 }} />

        <OutlineButton
          label="Create New Brand Account"
          onPress={onOpenSignup}
          style={{ marginTop: 14 }}
        />

        <TouchableOpacity onPress={onSwitchToRider} style={styles.switchRow} activeOpacity={0.7}>
          <Ionicons name="bicycle-outline" size={16} color={colors.primary} />
          <Text style={styles.switchText}>Are you a Rider? Switch to Rider Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    padded: { paddingHorizontal: 20, paddingBottom: 32 },
    badgeRow: { flexDirection: 'row', marginBottom: 12 },
    brandBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 16,
    },
    brandBadgeText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    title: { fontSize: 26, fontWeight: '800', color: colors.text, marginBottom: 8 },
    subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 28, lineHeight: 20 },
    label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 8, marginTop: 12 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 50,
    },
    input: { flex: 1, color: colors.text, fontSize: 15 },
    forgotRow: {
      alignSelf: 'flex-end',
      marginTop: 8,
      paddingVertical: 4,
    },
    forgotText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 28,
      paddingVertical: 10,
    },
    switchText: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  });
