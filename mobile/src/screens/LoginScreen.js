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
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { OutlineButton, PrimaryButton, ScreenHeader } from '../components/ui';

export default function LoginScreen({ initialOtpMode, onBack, onLoggedIn, onRegister }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otpMode, setOtpMode] = useState(Boolean(initialOtpMode));
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = () => {
    setOtpMode(!otpMode);
    setOtpSent(false);
    setOtpCode('');
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your mobile number first.');
      return;
    }
    setLoading(true);
    try {
      const res = await mobileApi.sendOtp(phone);
      setOtpSent(true);
      const hint = res && res.otp_hint ? `\n\nTest code: ${res.otp_hint}` : '';
      Alert.alert('OTP sent', `Enter the 6-digit code sent to ${phone}.${hint}`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!phone.trim()) {
      Alert.alert('Required', 'Please enter your mobile number.');
      return;
    }
    if (otpMode ? !otpCode : !password) {
      Alert.alert('Required', otpMode ? 'Please enter the OTP.' : 'Please enter your password.');
      return;
    }
    setLoading(true);
    try {
      if (otpMode) {
        await mobileApi.verifyOtp(phone, otpCode);
      } else {
        await mobileApi.login(phone, password);
      }
      await onLoggedIn(phone);
    } catch (err) {
      Alert.alert('Login failed', err.message || 'Invalid credentials');
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
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Login to continue to Super Riders</Text>

        <Text style={styles.label}>Mobile Number</Text>
        <View style={styles.inputRow}>
          <Text style={styles.prefix}>+91</Text>
          <TextInput
            style={styles.input}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter mobile number"
            placeholderTextColor={colors.textSubtle}
          />
        </View>

        {!otpMode ? (
          <>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputRow}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
              <TextInput
                style={styles.input}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor={colors.textSubtle}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={{ alignSelf: 'flex-end', marginTop: 10 }}
              onPress={() => Alert.alert('Forgot password', 'Log in with OTP instead, or contact your operations manager.')}
            >
              <Text style={styles.link}>Forgot password?</Text>
            </TouchableOpacity>
          </>
        ) : otpSent ? (
          <>
            <Text style={styles.label}>6-digit OTP</Text>
            <TextInput
              style={[styles.inputRow, styles.otpInput]}
              keyboardType="number-pad"
              maxLength={6}
              value={otpCode}
              onChangeText={setOtpCode}
              placeholder="••••••"
              placeholderTextColor={colors.textSubtle}
            />
            <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 10 }} onPress={handleSendOtp}>
              <Text style={styles.link}>Resend OTP</Text>
            </TouchableOpacity>
          </>
        ) : null}

        <PrimaryButton
          style={{ marginTop: 28 }}
          loading={loading}
          label={!otpMode ? 'Login' : otpSent ? 'Verify & Login' : 'Send OTP'}
          onPress={otpMode && !otpSent ? handleSendOtp : handleLogin}
        />

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <OutlineButton label={otpMode ? 'Login with Password' : 'Login with OTP'} onPress={switchMode} />

        <TouchableOpacity onPress={onRegister} style={{ marginTop: 28, alignItems: 'center' }}>
          <Text style={styles.prompt}>
            Don't have an account? <Text style={styles.link}>Register</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    padded: { paddingHorizontal: 24, paddingBottom: 24 },
    title: { fontSize: 28, fontWeight: '800', color: c.text, marginTop: 8 },
    subtitle: { fontSize: 14, color: c.textMuted, marginTop: 6, marginBottom: 12 },
    label: { fontSize: 13, fontWeight: '600', color: c.text, marginTop: 18, marginBottom: 8 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      minHeight: 50,
    },
    prefix: { fontSize: 15, fontWeight: '600', color: c.text, marginRight: 12, paddingRight: 12, borderRightWidth: 1, borderRightColor: c.border },
    input: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 12 },
    otpInput: { fontSize: 22, letterSpacing: 10, textAlign: 'center', color: c.text },
    link: { color: c.primary, fontWeight: '700', fontSize: 13 },
    dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 },
    dividerLine: { flex: 1, height: 1, backgroundColor: c.border },
    dividerText: { fontSize: 12, color: c.textSubtle },
    prompt: { fontSize: 14, color: c.textMuted },
  });
