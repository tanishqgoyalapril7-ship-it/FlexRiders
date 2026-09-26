import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
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
import SelfieCapture from '../components/SelfieCapture';
import { AutocompleteField, DateOfBirthField, PasswordField, ageOn, VehicleCategoryField, vehicleCategoryLabel, vehicleNumberOptional } from '../components/formFields';
import {
  CITIES,
  VEHICLE_MODELS,
  areaSuggestionsFor,
  isValidVehicleNumber,
  normalizeVehicleNumber,
} from '../data/suggestions';

const STEPS = ['Personal', 'Work', 'Vehicle', 'Payment', 'Selfie', 'Review'];
const SELFIE_STEP = 4;

function Field({ label, required, hint, hintTone, ...inputProps }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      <TextInput style={styles.input} placeholderTextColor={colors.textSubtle} {...inputProps} />
      {hint ? (
        <Text style={[styles.hint, hintTone === 'danger' && { color: colors.danger }, hintTone === 'success' && { color: colors.success }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export default function RegisterScreen({ onBack, onRegistered, initialReferralCode = '' }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    mobile_number: '',
    email: '',
    dob: '',
    password: '',
    current_company: '',
    current_role: 'Rider',
    vehicle_type: '',
    vehicle_category: '',
    vehicle_number: '',
    primary_city: '',
    primary_area: '',
    upi_id: '',
    gpay_number: '',
    referral_code: initialReferralCode,
  });
  // Driver selfie: { uri, base64 } from the camera. Required unless the server's switch says otherwise
  // (it is optional while testing); if the setting can't be loaded, the selfie stays required.
  const [selfie, setSelfie] = useState(null);
  const [selfieRequired, setSelfieRequired] = useState(true);
  // Email is required and confirmed with a 6-digit code once the server can send email.
  const [emailRequired, setEmailRequired] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  useEffect(() => {
    mobileApi
      .getAppConfig()
      .then((config) => {
        setSelfieRequired(config.selfie_required !== false);
        setEmailRequired(config.email_required === true);
      })
      .catch(() => {});
  }, []);
  const set = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.full_name.trim() || !form.mobile_number.trim()) return 'Please enter your full name and mobile number.';
      if (form.password.length < 6) return 'Please choose a password of at least 6 characters.';
      if (emailRequired) {
        if (!form.email.trim()) return 'Please enter your email address. It lets you reset your password if you forget it.';
        if (codeSentTo !== form.email.trim().toLowerCase()) return 'Tap "Send code" to confirm your email address.';
        if (!/^\d{6}$/.test(emailCode)) return 'Enter the 6-digit code we emailed you.';
      }
      if (form.dob && ageOn(form.dob) < 18) return 'Riders must be at least 18 years old.';
    }
    if (step === 2) {
      if (!form.vehicle_category) return 'Please tell us what type of vehicle you use.';
      // Cycles usually have no registration number; every other vehicle type needs one.
      if (!vehicleNumberOptional(form.vehicle_category) && !form.vehicle_number.trim()) return 'Please enter your vehicle registration number.';
      if (form.vehicle_number.trim() && !isValidVehicleNumber(form.vehicle_number)) return 'Please enter a valid vehicle number, e.g. HR26DK8337.';
      if (!form.primary_city.trim()) return 'Please enter your primary working city.';
    }
    if (step === SELFIE_STEP && !selfie && selfieRequired) return 'Please take your driver selfie to continue.';
    return null;
  };

  const next = () => {
    const error = validateStep();
    if (error) {
      Alert.alert('Required', error);
      return;
    }
    setStep(step + 1);
  };

  const submit = async () => {
    if (!selfie && selfieRequired) {
      Alert.alert('Selfie required', 'Please take your driver selfie before submitting.');
      setStep(SELFIE_STEP);
      return;
    }
    setLoading(true);
    try {
      const trimmed = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      trimmed.vehicle_number = trimmed.vehicle_number ? normalizeVehicleNumber(trimmed.vehicle_number) : null;
      if (selfie) trimmed.selfie = selfie.base64;
      if (emailRequired) trimmed.email_code = emailCode;
      const result = await mobileApi.register(trimmed);
      await onRegistered(result);
    } catch (err) {
      Alert.alert('Registration failed', err.message || 'Could not submit registration.');
    } finally {
      setLoading(false);
    }
  };

  const reviewRows = [
    ['Full Name', form.full_name],
    ['Mobile', form.mobile_number],
    ['Email', form.email],
    ['Company', form.current_company],
    ['Date of Birth', form.dob],
    ['Vehicle Type', vehicleCategoryLabel(form.vehicle_category)],
    ['Vehicle', form.vehicle_type],
    ['Vehicle Number', normalizeVehicleNumber(form.vehicle_number)],
    ['Location', [form.primary_city, form.primary_area].filter(Boolean).join(', ')],
    ['UPI ID', form.upi_id],
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <View style={styles.padded}>
        <ScreenHeader title="Rider Registration" onBack={() => (step > 0 ? setStep(step - 1) : onBack())} />

        <View style={styles.stepper}>
          {STEPS.map((name, i) => (
            <View key={name} style={styles.stepItem}>
              <View style={[styles.stepDot, i <= step && styles.stepDotActive]}>
                {i < step ? (
                  <Ionicons name="checkmark" size={14} color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.stepNumber, i <= step && { color: colors.onPrimary }]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepName, i === step && { color: colors.primary }]}>{name}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Text style={styles.stepTitle}>Personal details</Text>
            <Field label="Full Name" required value={form.full_name} onChangeText={set('full_name')} placeholder="Your full name" />
            <Field label="Mobile Number" required keyboardType="phone-pad" value={form.mobile_number} onChangeText={set('mobile_number')} placeholder="10-digit mobile number" />
            <Field
              label={emailRequired ? 'Email Address' : 'Email Address (optional)'}
              required={emailRequired}
              keyboardType="email-address"
              autoCapitalize="none"
              value={form.email}
              onChangeText={set('email')}
              placeholder="name@example.com"
              hint="Used to reset your password if you forget it."
            />
            {emailRequired ? (
              <View style={{ marginTop: -6, marginBottom: 16, gap: 10 }}>
                <OutlineButton
                  label={sendingCode ? 'Sending…' : codeSentTo === form.email.trim().toLowerCase() && codeSentTo ? 'Send a new code' : 'Send code'}
                  onPress={async () => {
                    if (!form.email.trim()) return Alert.alert('Required', 'Enter your email address first.');
                    setSendingCode(true);
                    try {
                      const res = await mobileApi.sendEmailCode(form.email.trim());
                      setCodeSentTo(form.email.trim().toLowerCase());
                      Alert.alert('Check your email', res.message);
                    } catch (err) {
                      Alert.alert('Could not send the code', err.message);
                    } finally {
                      setSendingCode(false);
                    }
                  }}
                />
                {codeSentTo ? (
                  <Field
                    label="6-digit code from the email"
                    required
                    keyboardType="number-pad"
                    value={emailCode}
                    onChangeText={(v) => setEmailCode(v.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                  />
                ) : null}
              </View>
            ) : null}
            <DateOfBirthField label="Date of Birth" value={form.dob} onChange={set('dob')} />
            <PasswordField label="Create Password" required value={form.password} onChangeText={set('password')} placeholder="At least 6 characters" />
            <Field
              label="Referral Code (optional)"
              value={form.referral_code}
              onChangeText={(v) => set('referral_code')(v.toUpperCase().replace(/\s/g, ''))}
              placeholder="e.g. SRK7M2QX"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              hint="Got a code from a friend? Enter it here."
            />
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.stepTitle}>Work experience</Text>
            <Field label="Current / Previous Company" value={form.current_company} onChangeText={set('current_company')} placeholder="e.g. Zepto, Swiggy" />
            <Field label="Primary Role" value={form.current_role} onChangeText={set('current_role')} placeholder="e.g. Delivery Rider" />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.stepTitle}>Vehicle & location</Text>
            <VehicleCategoryField
              required
              value={form.vehicle_category}
              onChange={set('vehicle_category')}
              hint="Campaigns can be for specific vehicle types. Only an admin can change this later."
            />
            <AutocompleteField
              label="Vehicle Model"
              icon="bicycle-outline"
              value={form.vehicle_type}
              onChangeText={set('vehicle_type')}
              options={VEHICLE_MODELS}
              placeholder="Start typing, e.g. Activa"
            />
            <Field
              label={vehicleNumberOptional(form.vehicle_category) ? 'Vehicle Number (optional for cycles)' : 'Vehicle Number'}
              required={!vehicleNumberOptional(form.vehicle_category)}
              value={form.vehicle_number}
              onChangeText={(v) => set('vehicle_number')(v.toUpperCase())}
              placeholder="e.g. HR 26 DK 8337"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
              hint={
                !form.vehicle_number
                  ? 'As printed on your RC. Bharat series (e.g. 22 BH 1234 AA) is also accepted.'
                  : isValidVehicleNumber(form.vehicle_number)
                  ? `Valid: ${normalizeVehicleNumber(form.vehicle_number)}`
                  : normalizeVehicleNumber(form.vehicle_number).length >= 8
                  ? 'This does not look like a valid vehicle number.'
                  : 'Keep typing: state, RTO, series and 4 digits.'
              }
              hintTone={
                !form.vehicle_number
                  ? undefined
                  : isValidVehicleNumber(form.vehicle_number)
                  ? 'success'
                  : normalizeVehicleNumber(form.vehicle_number).length >= 8
                  ? 'danger'
                  : undefined
              }
            />
            <AutocompleteField
              label="Primary Working City"
              required
              value={form.primary_city}
              onChangeText={set('primary_city')}
              options={CITIES}
              placeholder="Start typing, e.g. Gur"
            />
            <AutocompleteField
              label="Area / Zone"
              value={form.primary_area}
              onChangeText={set('primary_area')}
              options={areaSuggestionsFor(form.primary_city)}
              placeholder="Start typing, e.g. Sector"
            />
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.stepTitle}>Payment details</Text>
            <Field label="UPI ID" autoCapitalize="none" value={form.upi_id} onChangeText={set('upi_id')} placeholder="yourname@upi" />
            <Field label="Google Pay / PhonePe Number" keyboardType="phone-pad" value={form.gpay_number} onChangeText={set('gpay_number')} placeholder="10-digit number" />
            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.noteText}>Your payouts are sent to this UPI ID. You can update it later from your profile.</Text>
            </View>
          </>
        )}

        {step === SELFIE_STEP && (
          <>
            <Text style={styles.stepTitle}>Driver Selfie</Text>
            <Text style={[styles.hint, { marginTop: -10, marginBottom: 18 }]}>
              {selfieRequired
                ? 'Required. Take a clear photo of your face with the front camera. Only the FlexRiders team can see it.'
                : 'Optional for now: tap Continue to skip. If you take one, only the FlexRiders team can see it.'}
            </Text>
            <SelfieCapture value={selfie} onChange={setSelfie} />
            {!selfieRequired && !selfie ? (
              <TouchableOpacity
                onPress={() => setStep(SELFIE_STEP + 1)}
                style={{ alignItems: 'center', paddingVertical: 14 }}
              >
                <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Skip for now</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {step === SELFIE_STEP + 1 && (
          <>
            <Text style={styles.stepTitle}>Review your application</Text>
            {!selfie && !selfieRequired ? (
              <View style={styles.selfieRow}>
                <Text style={styles.reviewValue}>No driver selfie (optional for now)</Text>
                <TouchableOpacity onPress={() => setStep(SELFIE_STEP)}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Add selfie</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {selfie ? (
              <View style={styles.selfieRow}>
                <Image source={{ uri: selfie.uri }} style={styles.selfieThumb} />
                <Text style={styles.reviewValue}>Driver selfie added</Text>
                <TouchableOpacity onPress={() => setStep(SELFIE_STEP)}>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Retake</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.reviewCard}>
              {reviewRows.map(([label, value], i) => (
                <View key={label} style={[styles.reviewRow, i === reviewRows.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.reviewLabel}>{label}</Text>
                  <Text style={styles.reviewValue}>{value || '—'}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.note, { marginTop: 16 }]}>
              <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
              <Text style={styles.noteText}>
                After you submit, our operations team will review your application and contact you to verify your
                Driving Licence, Aadhaar and vehicle RC.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? <OutlineButton label="Back" onPress={() => setStep(step - 1)} style={{ paddingHorizontal: 24 }} /> : null}
        <PrimaryButton
          style={{ flex: 1 }}
          loading={loading}
          label={step < STEPS.length - 1 ? 'Continue' : 'Submit Application'}
          onPress={step < STEPS.length - 1 ? next : submit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    padded: { paddingHorizontal: 20 },
    stepper: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 18 },
    stepItem: { alignItems: 'center', flex: 1 },
    stepDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.surfaceAlt,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepDotActive: { backgroundColor: c.primary, borderColor: c.primary },
    stepNumber: { fontSize: 12, fontWeight: '700', color: c.textMuted },
    stepName: { fontSize: 11, color: c.textMuted, marginTop: 6, fontWeight: '600' },
    stepTitle: { fontSize: 20, fontWeight: '700', color: c.text, marginBottom: 18 },
    label: { fontSize: 13, fontWeight: '600', color: c.text, marginBottom: 8 },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: c.text,
    },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 6 },
    note: { flexDirection: 'row', gap: 10, backgroundColor: c.primarySoft, padding: 14, borderRadius: 12 },
    noteText: { flex: 1, fontSize: 13, color: c.text, lineHeight: 19 },
    reviewCard: { backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.border, paddingHorizontal: 16 },
    reviewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 16,
    },
    reviewLabel: { fontSize: 13, color: c.textMuted },
    selfieRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    selfieThumb: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.surfaceAlt },
    reviewValue: { fontSize: 13, fontWeight: '600', color: c.text, flexShrink: 1, textAlign: 'right' },
    footer: {
      flexDirection: 'row',
      gap: 12,
      padding: 16,
      backgroundColor: c.surface,
      borderTopWidth: 1,
      borderTopColor: c.border,
    },
  });
