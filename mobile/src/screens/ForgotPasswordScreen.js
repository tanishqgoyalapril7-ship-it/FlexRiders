import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { OutlineButton, PrimaryButton, ScreenHeader } from '../components/ui';
import { PasswordField } from '../components/formFields';

const isPhone = (v) => !v.includes('@') && v.replace(/\D/g, '').length >= 10;

/** Forgot password. With a mobile number (and SMS set up on the server) a code comes by SMS and,
 * after the new password, the rider is logged straight in; with an email, a 6-digit code comes by email. */
export default function ForgotPasswordScreen({ initialIdentifier = '', onBack, onDone, onLoggedIn, onUseOtp }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState('EMAIL'); // Where the code went: SMS | EMAIL
  const [codeLength, setCodeLength] = useState(6);
  const [sms, setSms] = useState(false); // The server can send SMS codes
  const [otpLogin, setOtpLogin] = useState(false);

  useEffect(() => {
    mobileApi
      .getAppConfig()
      .then((c) => {
        setSms(Boolean(c.phone_verification));
        setOtpLogin(Boolean(c.otp_login));
      })
      .catch(() => {});
  }, []);

  const sendCode = async () => {
    if (!identifier.trim()) {
      Alert.alert('Required', 'Enter your registered mobile number or email.');
      return;
    }
    setLoading(true);
    try {
      const res = await mobileApi.forgotPassword(identifier.trim());
      setNotice(res.test_code ? `${res.message}\n\nTest mode (no SMS sent): your code is ${res.test_code}.` : res.message);
      setChannel(res.channel || 'EMAIL');
      setCodeLength(res.code_length || 6);
      setCode('');
      setSent(true);
    } catch (err) {
      Alert.alert('Could not send the code', err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (code.trim().length !== codeLength) {
      return Alert.alert('Required', `Enter the ${codeLength}-digit code from the ${channel === 'SMS' ? 'SMS' : 'email'}.`);
    }
    if (password.length < 6) return Alert.alert('Required', 'Choose a password of at least 6 characters.');
    if (password !== confirm) return Alert.alert('Check password', "The two passwords don't match.");
    setLoading(true);
    try {
      const res = await mobileApi.resetPassword(identifier.trim(), code.trim(), password);
      if (res.access_token && onLoggedIn) {
        await onLoggedIn(res); // SMS reset: straight into the app
        return;
      }
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
        <Text style={styles.subtitle}>
          {sms
            ? "Enter your registered mobile number and we'll text you a code. You can also use the email on your account."
            : "We'll email a 6-digit code to the email address on your FlexRiders account."}
        </Text>

        <Text style={styles.label}>Mobile number or email</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType={sms && !identifier.includes('@') ? 'phone-pad' : 'email-address'}
          placeholder="e.g. 98765 43210 or name@example.com"
          placeholderTextColor={colors.textSubtle}
          editable={!sent}
        />

        {!sent ? (
          <>
            <PrimaryButton
              label={sms && isPhone(identifier) ? 'Send Code by SMS' : 'Send Code'}
              loading={loading}
              onPress={sendCode}
              style={{ marginTop: 20 }}
            />
            {onUseOtp && otpLogin ? (
              <TouchableOpacity onPress={onUseOtp} style={styles.otpLink} hitSlop={8}>
                <Text style={styles.otpLinkText}>Just want to get in? Log in with OTP instead</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
            <Text style={styles.label}>{codeLength}-digit code</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, codeLength))}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete={channel === 'SMS' ? 'sms-otp' : 'one-time-code'}
              placeholder={'•'.repeat(codeLength)}
              placeholderTextColor={colors.textSubtle}
            />
            <PasswordField label="New password" required value={password} onChangeText={setPassword} placeholder="At least 6 characters" />
            <PasswordField label="Confirm new password" required value={confirm} onChangeText={setConfirm} placeholder="Type it again" />
            <PrimaryButton label={channel === 'SMS' ? 'Set Password & Log In' : 'Set New Password'} loading={loading} onPress={reset} style={{ marginTop: 8 }} />
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
    otpLink: { alignSelf: 'center', marginTop: 18 },
    otpLinkText: { fontSize: 14, fontWeight: '700', color: c.primary },
  });
