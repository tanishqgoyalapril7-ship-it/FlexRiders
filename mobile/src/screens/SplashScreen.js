import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// The splash screen keeps the dark brand look in both light and dark themes.
export default function SplashScreen({ onLogin, onLoginWithOtp, onRegister }) {
  return (
    <View style={styles.screen}>
      <View style={styles.glowTop} />
      <View style={styles.brand}>
        <Text style={styles.logoMark}>SR</Text>
        <Text style={styles.logoTitle}>SUPER RIDERS</Text>
        <Text style={styles.tagline}>Ride  •  Deliver  •  Earn</Text>
      </View>

      <View style={styles.art}>
        <View style={styles.ringOuter}>
          <View style={styles.ringInner}>
            <MaterialCommunityIcons name="moped" size={92} color="#93C5FD" />
          </View>
        </View>
      </View>

      <View>
        <Text style={styles.headline}>Deliver smiles.</Text>
        <Text style={styles.headline}>Earn better, every day.</Text>

        <TouchableOpacity style={styles.primary} onPress={onLogin} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.outline} onPress={onLoginWithOtp} activeOpacity={0.85}>
          <Text style={styles.outlineText}>Login with OTP</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onRegister} style={{ marginTop: 20 }}>
          <Text style={styles.registerPrompt}>
            Don't have an account? <Text style={styles.registerLink}>Register</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#071233', paddingHorizontal: 24, paddingTop: 48, paddingBottom: 28, justifyContent: 'space-between' },
  glowTop: {
    position: 'absolute',
    top: -320,
    alignSelf: 'center',
    width: 620,
    height: 620,
    borderRadius: 310,
    backgroundColor: '#1D4ED8',
    opacity: 0.28,
  },
  brand: { alignItems: 'center' },
  logoMark: { fontSize: 58, fontWeight: '900', fontStyle: 'italic', color: '#FFFFFF', letterSpacing: -3 },
  logoTitle: { fontSize: 24, fontWeight: '900', fontStyle: 'italic', color: '#FFFFFF', letterSpacing: 1, marginTop: -4 },
  tagline: { fontSize: 14, color: '#BFDBFE', marginTop: 8, letterSpacing: 0.5 },
  art: { alignItems: 'center' },
  ringOuter: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'rgba(37, 99, 235, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { color: '#FFFFFF', fontSize: 22, fontWeight: '700', textAlign: 'center', lineHeight: 30 },
  primary: { backgroundColor: '#2563EB', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  outline: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  outlineText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  registerPrompt: { color: '#CBD5E1', fontSize: 14, textAlign: 'center' },
  registerLink: { color: '#60A5FA', fontWeight: '700' },
});
