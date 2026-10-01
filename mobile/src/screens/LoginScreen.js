import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { mobileApi } from '../services/api';
import { useStyles } from '../theme';
import { useT } from '../i18n';
import { Button, Field, Header, LinkText, Screen, Title } from '../components/ds';

/** "Welcome Back": email or mobile + password (one login for riders and brands; the account's role decides
 * which app opens). Riders can also log in with a one-time code by SMS when the server has an SMS gateway. */
export default function LoginScreen({ initialOtpMode, onBack, onLoggedIn, onRegister, onForgot, brand }) {
  const s = useStyles(makeStyles);
  const { t } = useT();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [otpMode, setOtpMode] = useState(Boolean(initialOtpMode));
  const [otpAvailable, setOtpAvailable] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (brand) return;
    mobileApi.getAppConfig().then((c) => setOtpAvailable(Boolean(c.otp_login))).catch(() => {});
  }, [brand]);

  const switchMode = () => {
    setOtpMode(!otpMode);
    setOtpSent(false);
    setOtpCode('');
  };

  const sendOtp = async () => {
    if (identifier.replace(/\D/g, '').length < 10) return Alert.alert('Mobile number', 'Enter your 10-digit mobile number.');
    setLoading(true);
    try {
      const res = await mobileApi.sendOtp(identifier);
      setOtpSent(true);
      Alert.alert('OTP sent', `If ${identifier.trim()} is a registered rider number, you'll get an SMS with a login code.${res && res.otp_hint ? `\n\nTest code: ${res.otp_hint}` : ''}`);
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    if (!identifier.trim()) return Alert.alert('Required', 'Enter your email or mobile number.');
    if (otpMode ? !otpCode : !password) return Alert.alert('Required', otpMode ? 'Enter the OTP.' : 'Enter your password.');
    setLoading(true);
    try {
      const result = otpMode ? await mobileApi.verifyOtp(identifier, otpCode) : await mobileApi.login(identifier.trim(), password);
      await onLoggedIn(result);
    } catch (err) {
      Alert.alert('Login failed', err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen>
        <Header onBack={onBack} circle={false} />
        <View style={{ height: 40 }} />
        <Title sub={brand ? 'Sign in to manage your brand campaigns.' : t('Sign in to manage your active campaigns & payouts.')}>{t('Welcome Back')}</Title>
        <Field
          label={otpMode ? t('Mobile Number') : t('Email or Mobile Number')}
          icon={otpMode ? 'call-outline' : 'mail-outline'}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType={otpMode ? 'phone-pad' : 'email-address'}
          autoComplete={otpMode ? 'tel' : 'username'}
          placeholder={otpMode ? '98765 43210' : 'name@example.com or 98765 43210'}
        />
        {!otpMode ? (
          <Field
            label={t('Password')}
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoComplete="password"
            placeholder="Enter password"
            trailing={
              <TouchableOpacity onPress={() => setShow(!show)} hitSlop={8}>
                <Text style={s.show}>{show ? t('Hide') : t('Show')}</Text>
              </TouchableOpacity>
            }
          />
        ) : otpSent ? (
          <Field label="OTP" icon="keypad-outline" value={otpCode} onChangeText={setOtpCode} keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} placeholder="••••" />
        ) : null}
        {!otpMode ? (
          <TouchableOpacity onPress={() => onForgot(identifier)} style={{ alignSelf: 'flex-end', marginBottom: 24 }}>
            <Text style={s.show}>{t('Forgot Password?')}</Text>
          </TouchableOpacity>
        ) : null}
        <Button label={otpMode && !otpSent ? 'Send OTP' : t('Login')} loading={loading} onPress={otpMode && !otpSent ? sendOtp : login} />
        {otpMode && otpSent ? (
          <TouchableOpacity onPress={sendOtp} style={{ alignSelf: 'center', marginTop: 14 }}>
            <Text style={s.show}>Resend OTP</Text>
          </TouchableOpacity>
        ) : null}
        {otpAvailable || otpMode ? (
          <TouchableOpacity onPress={switchMode} style={{ alignSelf: 'center', marginTop: 16 }}>
            <Text style={s.show}>{otpMode ? 'Login with password' : 'Login with OTP'}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={s.orRow}>
          <View style={s.line} />
          <Text style={s.or}>{t('or')}</Text>
          <View style={s.line} />
        </View>
        <Text style={s.prompt}>
          {t('New here?')}  <LinkText onPress={onRegister}>{t('Sign Up')}</LinkText>
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    show: { color: c.primary, fontWeight: '700', fontSize: 15 },
    orRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginVertical: 24 },
    line: { flex: 1, height: 1, backgroundColor: c.border },
    or: { color: c.textMuted, fontSize: 15 },
    prompt: { textAlign: 'center', fontSize: 16, color: c.textMuted },
  });
