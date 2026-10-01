import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { Button, Field, Header, LinkText, Screen, Title } from '../../components/ds';

function strength(pw) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  return Math.min(n, 4);
}

/** Brand sign-up (same look as the rider app): company, contact, login details. */
export default function CustomerSignupScreen({ onBack, onSignedUp, onOpenLogin }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const [f, setF] = useState({ company: '', name: '', mobile: '', email: '', password: '', gst: '', address: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const score = strength(f.password);
  const bars = [colors.danger, colors.warning, colors.success, colors.success];

  const submit = async () => {
    const mobile = f.mobile.replace(/\D/g, '');
    if (f.company.trim().length < 2) return Alert.alert('Brand name', 'Enter your company or brand name.');
    if (f.name.trim().length < 2) return Alert.alert('Contact person', 'Enter the contact person’s full name.');
    if (mobile.length !== 10) return Alert.alert('Mobile number', 'Enter a valid 10-digit mobile number.');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return Alert.alert('Email', 'Enter a valid email address.');
    if (f.password.length < 6) return Alert.alert('Password', 'Use at least 6 characters.');
    setLoading(true);
    try {
      const result = await mobileApi.customerSignup({
        full_name: f.name.trim(),
        company_name: f.company.trim(),
        mobile_number: mobile,
        email: f.email.trim().toLowerCase(),
        password: f.password,
        gst_number: f.gst.trim() ? f.gst.trim().toUpperCase() : undefined,
        company_address: f.address.trim() || undefined,
      });
      onSignedUp(result);
    } catch (err) {
      Alert.alert('Could not create account', err.message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen footer={<Button label="Create Brand Account" onPress={submit} loading={loading} />}>
        <Header onBack={onBack} circle={false} />
        <View style={{ height: 12 }} />
        <Title sub="Launch hyper-local campaigns with verified riders. Every campaign is reviewed by FlexRiders before it goes live.">Create Brand Account</Title>
        <Field label="Company / Brand Name" icon="business-outline" value={f.company} onChangeText={set('company')} placeholder="As registered" />
        <Field label="Contact Person" icon="person-outline" value={f.name} onChangeText={set('name')} placeholder="Full name" autoComplete="name" />
        <Field label="Mobile Number" prefix="+91" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" maxLength={11} placeholder="98765 43210" />
        <Field label="Work Email" icon="mail-outline" value={f.email} onChangeText={set('email')} autoCapitalize="none" keyboardType="email-address" placeholder="name@company.com" />
        <Field
          label="Create Password"
          icon="lock-closed-outline"
          value={f.password}
          onChangeText={set('password')}
          secureTextEntry={!show}
          placeholder="At least 6 characters"
          style={{ marginBottom: 8 }}
          trailing={
            <TouchableOpacity onPress={() => setShow(!show)} hitSlop={8}>
              <Text style={s.show}>{show ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          }
        />
        {f.password ? (
          <>
            <View style={s.meter}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[s.meterBar, i < score && { backgroundColor: bars[score - 1] }]} />
              ))}
            </View>
            <Text style={[s.meterText, { color: bars[Math.max(score, 1) - 1] }]}>Password Strength: {['Weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]}</Text>
          </>
        ) : null}
        <Field label="GST Number" right="OPTIONAL" value={f.gst} onChangeText={set('gst')} autoCapitalize="characters" placeholder="22AAAAA0000A1Z5" style={{ marginTop: 16 }} />
        <Field label="Company Address" right="OPTIONAL" value={f.address} onChangeText={set('address')} placeholder="Office address" multiline />
        <Text style={s.prompt}>
          Already have a brand account?  <LinkText onPress={onOpenLogin}>Login</LinkText>
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    show: { color: c.primary, fontWeight: '700', fontSize: 15 },
    meter: { flexDirection: 'row', gap: 6 },
    meterBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.border },
    meterText: { fontSize: 13, fontWeight: '700', marginTop: 6 },
    prompt: { textAlign: 'center', fontSize: 15, color: c.textMuted, marginTop: 8 },
  });
