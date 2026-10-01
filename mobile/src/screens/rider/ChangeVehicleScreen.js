import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { Button, Header, Screen } from '../../components/ds';
import { vehicleNumberOptional } from '../../components/formFields';
import { isValidVehicleNumber, normalizeVehicleNumber } from '../../data/suggestions';
import { VehicleFields, pickDocument } from '../onboarding/RiderSignup';

/** Settings → My Vehicle → Change. A different type or number is a new vehicle: its proof is uploaded here
 * and verified by the operations team. Not allowed mid-campaign (the server explains why). */
export default function ChangeVehicleScreen({ rider, onBack, onSaved }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const [f, setF] = useState({ vehicle_category: rider.vehicle_category || '', vehicle_type: rider.vehicle || '', vehicle_number: rider.vehicle_number || '' });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const number = f.vehicle_number.trim() ? normalizeVehicleNumber(f.vehicle_number) : '';
  const newVehicle = f.vehicle_category !== (rider.vehicle_category || '') || number !== (rider.vehicle_number || '');

  const save = async () => {
    if (!f.vehicle_category) return Alert.alert('Vehicle', 'Select your vehicle type.');
    if (!vehicleNumberOptional(f.vehicle_category) && !isValidVehicleNumber(f.vehicle_number))
      return Alert.alert('Registration number', 'Enter your vehicle registration number, e.g. HR26DK8337.');
    if (newVehicle && !file) return Alert.alert('Vehicle proof', 'Upload a photo of the RC or purchase bill for your new vehicle.');
    setBusy(true);
    try {
      await mobileApi.changeVehicle({ vehicle_category: f.vehicle_category, vehicle_type: f.vehicle_type.trim() || null, vehicle_number: number || null });
      if (newVehicle) {
        try {
          await mobileApi.uploadDocument(f.vehicle_category === 'CYCLE' ? 'VEHICLE_PROOF' : 'VEHICLE_RC', file);
        } catch (err) {
          Alert.alert('Upload again', `Your vehicle was updated, but the proof didn't upload (${err.message}). Upload it from My Vehicle.`);
          return onSaved();
        }
      }
      Alert.alert('Vehicle updated', newVehicle ? 'Your new vehicle proof has been sent to the operations team for verification.' : 'Your vehicle details were saved.');
      onSaved();
    } catch (err) {
      Alert.alert('Could not change vehicle', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen footer={<Button label={newVehicle ? 'Save New Vehicle' : 'Save'} onPress={save} loading={busy} />}>
        <Header onBack={onBack} title="Change Vehicle" />
        <View style={s.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={s.noteText}>
            Your vehicle type decides which campaigns you can join. A new vehicle needs its RC or purchase bill, which the operations team verifies.
            You can't switch vehicle during a campaign or while a join request is waiting.
          </Text>
        </View>
        <VehicleFields value={f} onChange={(patch) => setF((p) => ({ ...p, ...patch }))} file={file} proofRequired={newVehicle} onPickFile={async () => {
          const a = await pickDocument();
          if (a) setFile(a);
        }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    note: { flexDirection: 'row', gap: 10, backgroundColor: c.primarySoft, borderRadius: 14, padding: 12, marginBottom: 18 },
    noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: c.text },
  });
