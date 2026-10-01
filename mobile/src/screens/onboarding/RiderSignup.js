// Rider sign-up, as designed: Create Account → (email code) → Complete Profile → Verify Identity →
// Add Vehicle → [account created, documents uploaded] → Verification Status → Working Areas → Location.
// Everything is sent to the real backend; nothing is prefilled or invented.
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { useT } from '../../i18n';
import { Badge, Button, Card, Field, Header, LinkText, Screen, Title } from '../../components/ds';
import SelfieCapture from '../../components/SelfieCapture';
import { DateOfBirthField, ageOn, vehicleNumberOptional } from '../../components/formFields';
import { TermsCheckbox, TERMS_URL, PRIVACY_URL } from '../TermsConsentScreen';
import { VEHICLE_MODELS_BY_CATEGORY, isValidVehicleNumber, normalizeVehicleNumber } from '../../data/suggestions';

// Popular models for the chosen type; typing filters them (names starting with the text first).
export function matchModels(category, text) {
  const all = VEHICLE_MODELS_BY_CATEGORY[category] || [];
  const q = (text || '').trim().toLowerCase();
  if (!q) return all.slice(0, 8);
  const starts = all.filter((m) => m.toLowerCase().startsWith(q));
  const has = all.filter((m) => !m.toLowerCase().startsWith(q) && m.toLowerCase().includes(q));
  return [...starts, ...has].slice(0, 8);
}

export const ID_TYPES = [
  ['AADHAAR', 'Aadhaar Card (National ID)'],
  ['PAN', 'PAN Card'],
  ['DRIVING_LICENSE', 'Driving Licence'],
  ['VOTER_ID', 'Voter ID'],
  ['PASSPORT', 'Passport'],
];
export const VEHICLES = [
  ['CYCLE', 'Cycle', 'bicycle-outline'],
  ['TWO_WHEELER', 'Bike', 'speedometer-outline'],
  ['AUTO', 'Auto', 'car-outline'],
  ['THREE_WHEELER', '3 Wheeler', 'cube-outline'],
];
const GENDERS = [
  ['MALE', 'Male'],
  ['FEMALE', 'Female'],
  ['OTHER', 'Other'],
];

function strength(pw) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  return Math.min(n, 4);
}

/** Pick a document photo (camera or gallery). Returns the asset or null. */
export async function pickDocument() {
  return new Promise((resolve) => {
    const open = async (camera) => {
      try {
        const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : { granted: true };
        if (!perm.granted) {
          Alert.alert('Camera access needed', 'Allow camera access in Settings to photograph your document.');
          return resolve(null);
        }
        const opts = { mediaTypes: ['images'], quality: 0.7, allowsEditing: false };
        const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
        resolve(res.canceled || !res.assets || !res.assets.length ? null : res.assets[0]);
      } catch (err) {
        Alert.alert('Could not open', err.message);
        resolve(null);
      }
    };
    Alert.alert('Upload document', 'Take a clear photo of the whole document.', [
      { text: 'Take photo', onPress: () => open(true) },
      { text: 'Choose from gallery', onPress: () => open(false) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

function UploadBox({ file, onPick, hint }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={s.upload} onPress={onPick} activeOpacity={0.85}>
      {file ? (
        <>
          <Image source={{ uri: file.uri }} style={s.uploadThumb} />
          <Text style={s.uploadLink}>Replace {file.fileName || 'photo'}</Text>
        </>
      ) : (
        <>
          <Ionicons name="cloud-upload-outline" size={30} color={colors.primary} />
          <Text style={s.uploadLink}>Click to upload document</Text>
          {hint ? <Text style={s.uploadHint}>{hint}</Text> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

/** Vehicle type grid, model suggestions, number and proof upload: used at sign-up and when a rider changes
 * vehicle in settings. value: { vehicle_category, vehicle_type, vehicle_number }; onChange(patch). */
export function VehicleFields({ value, onChange, file, onPickFile, proofRequired = true }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const needsPlate = value.vehicle_category && !vehicleNumberOptional(value.vehicle_category);
  return (
    <>
      <Text style={s.label}>{t('Select Vehicle Type')}</Text>
      <View style={s.vehicleGrid}>
        {VEHICLES.map(([key, label, icon]) => {
          const on = value.vehicle_category === key;
          return (
            <TouchableOpacity key={key} style={[s.vehicle, on && s.vehicleOn]} onPress={() => onChange({ vehicle_category: key, vehicle_type: on ? value.vehicle_type : '' })} activeOpacity={0.85}>
              <View style={[s.vehicleIcon, on && { backgroundColor: colors.primary }]}>
                <Ionicons name={icon} size={24} color={on ? '#FFFFFF' : colors.text} />
              </View>
              <Text style={[s.vehicleText, on && { color: colors.primary }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Field label={t('Vehicle Model')} value={value.vehicle_type} onChangeText={(v) => onChange({ vehicle_type: v })} placeholder={value.vehicle_category ? 'Type or pick a model' : 'Select a vehicle type first'} style={{ marginBottom: 8 }} />
      {value.vehicle_category ? (
        <View style={s.modelChips}>
          {matchModels(value.vehicle_category, value.vehicle_type).map((m) => (
            <TouchableOpacity key={m} style={[s.modelChip, m === value.vehicle_type && s.modelChipOn]} onPress={() => onChange({ vehicle_type: m })}>
              <Text style={[s.modelChipText, m === value.vehicle_type && { color: '#FFFFFF' }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <Field
        label={needsPlate ? 'Registration Number' : 'Vehicle Frame/Serial Number (Optional)'}
        value={value.vehicle_number}
        onChangeText={(v) => onChange({ vehicle_number: v })}
        autoCapitalize="characters"
        placeholder={needsPlate ? 'e.g. HR26DK8337' : 'Enter serial number if available'}
      />
      {proofRequired ? (
        <>
          <Text style={s.label}>{value.vehicle_category === 'CYCLE' ? 'Proof of Ownership / Purchase Bill' : 'Vehicle RC'}</Text>
          <UploadBox file={file} onPick={onPickFile} hint="Upload clear photo of bill, RC or frame serial tag (Max 8 MB)" />
        </>
      ) : null}
    </>
  );
}

function Picker({ label, value, options, onChange, placeholder = 'Select' }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const current = options.find(([v]) => v === value);
  const open = () =>
    Alert.alert(label, null, [...options.map(([v, l]) => ({ text: l, onPress: () => onChange(v) })), { text: 'Cancel', style: 'cancel' }]);
  return (
    <View style={{ marginBottom: 16, flex: 1 }}>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity style={s.select} onPress={open} activeOpacity={0.85}>
        <Text style={[s.selectText, !current && { color: colors.textSubtle }]}>{current ? current[1] : placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

export function CodeBoxes({ value, onChange, length = 6 }) {
  const s = useStyles(makeStyles);
  const input = useRef(null);
  return (
    <TouchableOpacity activeOpacity={1} onPress={() => input.current && input.current.focus()} style={s.codeRow}>
      {Array.from({ length }).map((_, i) => (
        <View key={i} style={[s.codeBox, i === value.length && s.codeBoxOn]}>
          <Text style={s.codeText}>{value[i] || '•'}</Text>
        </View>
      ))}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={length}
        style={s.hiddenInput}
      />
    </TouchableOpacity>
  );
}

export default function RiderSignup({ onBack, onLogin, onRegistered, initialReferralCode = '' }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const [step, setStep] = useState('account');
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState({ selfie_required: true, email_required: false, terms_url: TERMS_URL, privacy_url: PRIVACY_URL });
  const [f, setF] = useState({ mobile: '', email: '', password: '', full_name: '', dob: '', gender: '', vehicle_category: '', vehicle_type: '', vehicle_number: '', referral_code: initialReferralCode });
  const [accepted, setAccepted] = useState(false);
  const [code, setCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const smsLen = config.sms_code_length || 4; // Digits in the SMS code (6 with Twilio Verify)
  const [phoneProof, setPhoneProof] = useState({ number: '', proof: '' });
  const [codeSentAt, setCodeSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [selfie, setSelfie] = useState(null);
  const [idType, setIdType] = useState('AADHAAR');
  const [idFile, setIdFile] = useState(null);
  const [vehicleFile, setVehicleFile] = useState(null);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    mobileApi.getAppConfig().then((c) => setConfig((p) => ({ ...p, ...c }))).catch(() => {});
  }, []);
  useEffect(() => {
    if (step !== 'email' && step !== 'phone') return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const digits = f.mobile.replace(/\D/g, '');
  const score = strength(f.password);
  const needsEmailCode = Boolean(config.email_required && f.email.trim());
  const back = {
    phone: 'account',
    email: config.phone_verification ? 'phone' : 'account',
    profile: needsEmailCode ? 'email' : config.phone_verification ? 'phone' : 'account',
    identity: 'profile',
    vehicle: 'identity',
  }[step];

  const sendCode = async () => {
    setBusy(true);
    try {
      await mobileApi.sendEmailCode(f.email.trim());
      setCodeSentAt(Date.now());
      setStep('email');
    } catch (err) {
      // No email delivery configured and email optional: continue without the code.
      if (!config.email_required && /isn't available/i.test(err.message || '')) setStep('profile');
      else Alert.alert('Could not send code', err.message);
    } finally {
      setBusy(false);
    }
  };

  // Real SMS to the number (through the SMS gateway phone), when the server has one set up.
  const sendPhoneCode = async () => {
    setBusy(true);
    try {
      const res = await mobileApi.sendPhoneCode(digits);
      // Local SMS test mode: the server shows the code instead of texting it.
      if (res && res.test_code) Alert.alert('Test mode', `No SMS is sent in test mode. Your code is ${res.test_code}.`);
      setPhoneCode('');
      setCodeSentAt(Date.now());
      setStep('phone');
    } catch (err) {
      Alert.alert('Could not send code', err.message);
    } finally {
      setBusy(false);
    }
  };

  const afterPhone = () => (needsEmailCode ? sendCode() : setStep('profile'));

  const verifyPhone = async () => {
    setBusy(true);
    try {
      const { phone_proof } = await mobileApi.verifyPhoneCode(digits, phoneCode);
      setPhoneProof({ number: digits, proof: phone_proof });
      afterPhone();
    } catch (err) {
      Alert.alert('Incorrect code', err.message);
    } finally {
      setBusy(false);
    }
  };

  const accountNext = () => {
    if (digits.length !== 10) return Alert.alert('Mobile number', 'Enter your 10-digit mobile number.');
    if (config.email_required && !f.email.trim()) return Alert.alert('Email', 'Enter your email address.');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return Alert.alert('Email', 'Enter a valid email address.');
    if (f.password.length < 6) return Alert.alert('Password', 'Use at least 6 characters.');
    if (!accepted) return Alert.alert('Terms & Privacy', 'Please agree to the Terms & Conditions and Privacy Policy.');
    if (config.phone_verification && phoneProof.number !== digits) return sendPhoneCode();
    afterPhone();
  };

  const profileNext = () => {
    if (config.selfie_required !== false && !selfie) return Alert.alert('Profile photo', 'Take a clear selfie. Only the FlexRiders team can see it.');
    if (f.full_name.trim().length < 2) return Alert.alert('Full name', 'Enter your full name.');
    if (f.dob && ageOn(f.dob) < 18) return Alert.alert('Date of birth', 'Riders must be at least 18 years old.');
    setStep('identity');
  };

  const submit = async () => {
    if (!f.vehicle_category) return Alert.alert('Vehicle', 'Select your vehicle type.');
    if (!vehicleNumberOptional(f.vehicle_category) && !isValidVehicleNumber(f.vehicle_number))
      return Alert.alert('Registration number', 'Enter your vehicle registration number, e.g. HR26DK8337.');
    setBusy(true);
    try {
      const result = await mobileApi.register({
        full_name: f.full_name.trim(),
        mobile_number: digits,
        email: f.email.trim() || undefined,
        email_code: config.email_required ? code : undefined,
        phone_proof: phoneProof.number === digits ? phoneProof.proof : undefined,
        password: f.password,
        dob: f.dob || undefined,
        gender: f.gender || undefined,
        vehicle_category: f.vehicle_category,
        vehicle_type: f.vehicle_type.trim() || undefined,
        vehicle_number: f.vehicle_number.trim() ? normalizeVehicleNumber(f.vehicle_number) : undefined,
        referral_code: f.referral_code.trim() || undefined,
        selfie: selfie ? selfie.base64 : undefined,
        accept_terms: true,
      });
      // Account exists now: upload documents (a failed upload can be retried on the next screen).
      const failed = [];
      if (idFile) await mobileApi.uploadDocument(idType, idFile).catch(() => failed.push('ID'));
      if (vehicleFile)
        await mobileApi.uploadDocument(f.vehicle_category === 'CYCLE' ? 'VEHICLE_PROOF' : 'VEHICLE_RC', vehicleFile).catch(() => failed.push('vehicle proof'));
      if (failed.length) Alert.alert('Upload again', `Your account was created, but the ${failed.join(' and ')} didn't upload. Re-upload it on the next screen.`);
      onRegistered(result);
    } catch (err) {
      Alert.alert('Could not create account', err.message);
    } finally {
      setBusy(false);
    }
  };

  const wrap = (children, footer) => (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen footer={footer}>{children}</Screen>
    </KeyboardAvoidingView>
  );

  if (step === 'account') {
    const bars = [colors.danger, colors.warning, colors.success, colors.success];
    return wrap(
      <>
        <Header onBack={onBack} circle={false} />
        <View style={{ height: 24 }} />
        <Title sub={t('Register as a rider to unlock active campaigns.')}>{t('Create Account')}</Title>
        <Field label={t('Mobile Number')} prefix="+91" value={f.mobile} onChangeText={set('mobile')} keyboardType="phone-pad" maxLength={11} placeholder="98765 43210" autoComplete="tel" />
        <Field
          label={t('Email Address')}
          right={config.email_required ? null : t('OPTIONAL')}
          value={f.email}
          onChangeText={set('email')}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Enter email address"
          hint="Used to reset your password if you forget it."
        />
        <Field label={t('Create Password')} value={f.password} onChangeText={set('password')} secureTextEntry placeholder="At least 6 characters" style={{ marginBottom: 8 }} />
        {f.password ? (
          <>
            <View style={s.meter}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[s.meterBar, i < score && { backgroundColor: bars[score - 1] }]} />
              ))}
            </View>
            <Text style={[s.meterText, { color: bars[Math.max(score, 1) - 1] }]}>
              Password Strength: {['Weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score]}
            </Text>
          </>
        ) : null}
        <Field label="Referral code" right={t('OPTIONAL')} value={f.referral_code} onChangeText={(v) => set('referral_code')(v.toUpperCase())} autoCapitalize="characters" placeholder="Friend's code" style={{ marginTop: 16 }} />
        <TermsCheckbox checked={accepted} onChange={setAccepted} termsUrl={config.terms_url} privacyUrl={config.privacy_url} />
        <Text style={[s.prompt, { marginTop: 18 }]}>
          {t('Already have an account?')}  <LinkText onPress={onLogin}>{t('Login')}</LinkText>
        </Text>
      </>,
      <Button label={t('Continue')} onPress={accountNext} loading={busy} />
    );
  }

  if (step === 'phone') {
    const wait = Math.max(0, 45 - Math.floor((now - codeSentAt) / 1000));
    return wrap(
      <>
        <Header onBack={() => setStep('account')} circle={false} />
        <View style={{ height: 40 }} />
        <Title sub={`We have sent a ${smsLen}-digit code by SMS to +91 ${digits.slice(0, 5)} ${digits.slice(5)}`}>{t('Verify Your Number')}</Title>
        <CodeBoxes value={phoneCode} onChange={setPhoneCode} length={smsLen} />
        <Text style={[s.prompt, { marginTop: 22 }]}>
          Didn't receive code?{' '}
          {wait > 0 ? <Text style={{ fontWeight: '700' }}>Resend in 0:{String(wait).padStart(2, '0')}s</Text> : <LinkText onPress={sendPhoneCode}>Resend</LinkText>}
        </Text>
        <Text style={[s.prompt, { marginTop: 10 }]}>
          Wrong number? <LinkText onPress={() => setStep('account')}>Change it</LinkText>
        </Text>
      </>,
      <Button label={t('Verify')} disabled={phoneCode.length !== smsLen} loading={busy} onPress={verifyPhone} />
    );
  }

  if (step === 'email') {
    const wait = Math.max(0, 45 - Math.floor((now - codeSentAt) / 1000));
    return wrap(
      <>
        <Header onBack={() => setStep('account')} circle={false} />
        <View style={{ height: 40 }} />
        <Title sub={`We have sent a 6-digit code to ${f.email.trim()}`}>{t('Verify Your Email')}</Title>
        <CodeBoxes value={code} onChange={setCode} />
        <Text style={[s.prompt, { marginTop: 22 }]}>
          Didn't receive code?{' '}
          {wait > 0 ? <Text style={{ fontWeight: '700' }}>Resend in 0:{String(wait).padStart(2, '0')}s</Text> : <LinkText onPress={sendCode}>Resend</LinkText>}
        </Text>
      </>,
      <Button label={t('Verify')} disabled={code.length !== 6} onPress={() => setStep('profile')} />
    );
  }

  if (step === 'profile') {
    return wrap(
      <>
        <Header onBack={() => setStep(back)} title={t('Complete Your Profile')} circle={false} />
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <SelfieCapture value={selfie} onChange={setSelfie} />
        </View>
        <Field label={t('Full Name')} value={f.full_name} onChangeText={set('full_name')} placeholder="As on your ID" autoComplete="name" />
        <Field
          label={t('Phone Number')}
          value={`+91 ${digits.slice(0, 5)} ${digits.slice(5)}`}
          editable={false}
          trailing={config.email_required && code.length === 6 ? <Badge label="EMAIL VERIFIED" tone="success" icon="checkmark-circle" /> : null}
        />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <DateOfBirthField label={t('Date of Birth')} value={f.dob} onChange={set('dob')} />
          </View>
          <Picker label={t('Gender')} value={f.gender} options={GENDERS} onChange={set('gender')} />
        </View>
      </>,
      <Button label={t('Save & Continue')} onPress={profileNext} />
    );
  }

  if (step === 'identity') {
    return wrap(
      <>
        <Header onBack={() => setStep('profile')} title={t('Verify Your Identity')} circle={false} />
        <Card style={[s.infoCard, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={[s.infoText, { color: colors.primary }]}>Your document is reviewed by the FlexRiders team after you finish sign-up.</Text>
        </Card>
        <Picker label={t('Document Type')} value={idType} options={ID_TYPES} onChange={setIdType} />
        <Text style={s.label}>{t('Upload Document Scan')}</Text>
        <UploadBox file={idFile} onPick={async () => { const a = await pickDocument(); if (a) setIdFile(a); }} hint="Clear photo of the front side (Max 8 MB)" />
        <View style={s.secure}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
          <Text style={s.secureText}>Your documents are stored privately and only the FlexRiders verification team can see them.</Text>
        </View>
      </>,
      <Button label="Continue" onPress={() => (idFile ? setStep('vehicle') : Alert.alert('Document', 'Upload a photo of your ID to continue.'))} />
    );
  }

  // Vehicle
  return wrap(
    <>
      <Header onBack={() => setStep('identity')} title={t('Add Your Vehicle')} />
      <VehicleFields
        value={f}
        onChange={(patch) => setF((p) => ({ ...p, ...patch }))}
        file={vehicleFile}
        onPickFile={async () => {
          const a = await pickDocument();
          if (a) setVehicleFile(a);
        }}
      />
    </>,
    <Button label="Create account" onPress={submit} loading={busy} />
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    label: { fontSize: 14, fontWeight: '700', color: c.text, marginBottom: 8 },
    prompt: { textAlign: 'center', fontSize: 15, color: c.textMuted },
    meter: { flexDirection: 'row', gap: 6 },
    meterBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: c.border },
    meterText: { fontSize: 13, fontWeight: '700', marginTop: 6 },
    codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    codeBox: { width: 48, height: 58, borderRadius: 14, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    codeBoxOn: { borderColor: c.primary },
    codeText: { fontSize: 24, fontWeight: '800', color: c.text },
    hiddenInput: { position: 'absolute', opacity: 0, width: 1, height: 1 },
    select: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectText: { fontSize: 16, color: c.text, flex: 1 },
    upload: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.primary, borderRadius: 18, padding: 22, alignItems: 'center', gap: 8, marginBottom: 16, backgroundColor: c.surface },
    uploadThumb: { width: 180, height: 110, borderRadius: 12, backgroundColor: c.surfaceAlt },
    uploadLink: { color: c.primary, fontWeight: '700', fontSize: 15 },
    uploadHint: { color: c.textMuted, fontSize: 12, textAlign: 'center' },
    infoCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 18 },
    infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
    secure: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.primarySoft, borderRadius: 14, padding: 14 },
    secureText: { flex: 1, fontSize: 13, color: c.primary, lineHeight: 18 },
    vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
    vehicle: { width: '47%', flexGrow: 1, alignItems: 'center', gap: 10, paddingVertical: 18, borderRadius: 18, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface },
    vehicleOn: { borderColor: c.primary, backgroundColor: c.primarySoft },
    vehicleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
    vehicleText: { fontSize: 16, fontWeight: '700', color: c.text },
    modelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
    modelChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    modelChipOn: { backgroundColor: c.primary, borderColor: c.primary },
    modelChipText: { fontSize: 13, fontWeight: '600', color: c.text },
  });
