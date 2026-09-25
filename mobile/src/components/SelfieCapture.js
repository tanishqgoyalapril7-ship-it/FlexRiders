import React, { useState } from 'react';
import { ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useStyles, useTheme } from '../theme';

// Same rule as campaign photos: camera only. For simulator testing, a development build with
// EXPO_PUBLIC_ALLOW_GALLERY_IN_DEV=true may pick from the library instead.
const DEV_GALLERY = __DEV__ && process.env.EXPO_PUBLIC_ALLOW_GALLERY_IN_DEV === 'true';
const SELFIE_EDGE = 720; // Plenty for identifying the rider; keeps the upload around 100 KB

/** Captures the required driver selfie. value: { uri, base64 } or null. */
export default function SelfieCapture({ value, onChange }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null); // { text, settings?: true }

  const take = async () => {
    setProblem(null);
    setBusy(true);
    try {
      let result;
      if (DEV_GALLERY) {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setProblem({ text: 'Camera access is needed to take your selfie. Allow it in Settings, then try again.', settings: !permission.canAskAgain });
          return;
        }
        try {
          result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            cameraType: ImagePicker.CameraType.front,
            quality: 0.8,
            allowsEditing: false,
          });
        } catch {
          setProblem({ text: 'The camera is not available on this device. A selfie taken with the phone camera is required to register.' });
          return;
        }
      }
      if (result.canceled || !result.assets || !result.assets.length) {
        if (!value) setProblem({ text: 'No selfie taken yet. Tap "Take Selfie" when you are ready.' });
        return;
      }
      const asset = result.assets[0];
      const resize = (asset.width || 0) >= (asset.height || 0) ? { width: SELFIE_EDGE } : { height: SELFIE_EDGE };
      const small = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], {
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      });
      if (!small.base64) throw new Error('empty');
      onChange({ uri: small.uri, base64: small.base64 });
    } catch {
      setProblem({ text: 'The selfie could not be processed. Please take it again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <View style={styles.frame}>
        {value ? (
          <Image source={{ uri: value.uri }} style={styles.photo} accessibilityLabel="Your selfie" />
        ) : (
          <View style={[styles.photo, styles.placeholder]}>
            <Ionicons name="person-circle-outline" size={72} color={colors.textSubtle} />
          </View>
        )}
        {value ? (
          <View style={styles.okBadge}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        ) : null}
      </View>

      <TouchableOpacity style={styles.button} onPress={take} disabled={busy} accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="camera" size={18} color="#FFFFFF" />
            <Text style={styles.buttonText}>{value ? 'Retake Selfie' : 'Take Selfie'}</Text>
          </>
        )}
      </TouchableOpacity>

      {problem ? (
        <View style={styles.problem}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={styles.problemText}>{problem.text}</Text>
            {problem.settings ? (
              <TouchableOpacity onPress={() => Linking.openSettings()}>
                <Text style={styles.link}>Open Settings</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.tips}>
        {['Face the camera in good light', 'Your whole face clearly visible, no sunglasses or mask', 'Only you in the photo'].map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    frame: { alignSelf: 'center', marginBottom: 18 },
    photo: { width: 168, height: 168, borderRadius: 84, backgroundColor: c.surfaceAlt },
    placeholder: { alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: c.border },
    okBadge: {
      position: 'absolute', right: 10, bottom: 10, width: 28, height: 28, borderRadius: 14,
      backgroundColor: c.success, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.surface,
    },
    button: {
      flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 14,
    },
    buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    problem: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: c.dangerSoft || c.surfaceAlt },
    problemText: { fontSize: 13, color: c.text, lineHeight: 19 },
    link: { color: c.primary, fontWeight: '700', marginTop: 6 },
    tips: { marginTop: 18, gap: 8 },
    tipRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    tipText: { fontSize: 13, color: c.textMuted, flex: 1 },
  });
