import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The splash screen keeps the dark brand look in both light and dark themes.
export default function SplashScreen({ onLogin, onLoginWithOtp, onRegister, showOtp = false }) {
  return (
    <View style={styles.screen}>
      <View style={styles.glowTop} />
      <View style={styles.brand}>
        <Image source={require('../../assets/flexriders-logo.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="FlexRiders logo" />
        <Text style={styles.logoTitle}>
          Flex<Text style={styles.logoTitleAccent}>Riders</Text>
        </Text>
        <Text style={styles.tagline}>Ride  •  Deliver  •  Earn</Text>
      </View>

      <View style={styles.art}>
        <View style={styles.ringOuter}>
          <View style={styles.ringInner}>
            <Image source={require('../../assets/rider-hero.png')} style={styles.rider} resizeMode="cover" accessibilityLabel="FlexRiders rider giving a thumbs up" />
          </View>
        </View>
        <View style={[styles.chip, styles.chipLeft]}>
          <Ionicons name="wallet" size={15} color="#34D399" />
          <Text style={styles.chipText}>Paid per approved day</Text>
        </View>
        <View style={[styles.chip, styles.chipRight]}>
          <Ionicons name="megaphone" size={15} color="#60A5FA" />
          <Text style={styles.chipText}>Brand campaigns</Text>
        </View>
      </View>

      <View>
        <Text style={styles.headline}>Deliver smiles.</Text>
        <Text style={styles.headline}>Earn better, every day.</Text>

        <TouchableOpacity style={styles.primary} onPress={onLogin} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Login</Text>
        </TouchableOpacity>
        {showOtp ? (
        <TouchableOpacity style={styles.outline} onPress={onLoginWithOtp} activeOpacity={0.85}>
          <Text style={styles.outlineText}>Login with OTP</Text>
        </TouchableOpacity>
        ) : null}

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
  logo: { width: 150, height: 100 },
  logoTitle: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3, marginTop: 2 },
  logoTitleAccent: { color: '#3B9EFF' },
  tagline: { fontSize: 14, color: '#BFDBFE', marginTop: 8, letterSpacing: 0.5 },
  art: { alignItems: 'center', justifyContent: 'center' },
  ringOuter: {
    width: 244,
    height: 244,
    borderRadius: 122,
    borderWidth: 1.5,
    borderColor: 'rgba(96, 165, 250, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The rider photo sits in a glowing brand-blue circle (the photo's background is transparent).
  ringInner: {
    width: 216,
    height: 216,
    borderRadius: 108,
    overflow: 'hidden',
    backgroundColor: '#1E3A8A',
    borderWidth: 3,
    borderColor: '#2563EB',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  rider: { width: 216, height: 324, marginTop: 6 },
  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipLeft: { left: 0, top: 26 },
  chipRight: { right: 0, bottom: 22 },
  chipText: { color: '#F8FAFC', fontSize: 12.5, fontWeight: '700' },
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
