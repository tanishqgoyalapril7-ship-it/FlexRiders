import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// The splash screen keeps the dark brand look in both light and dark themes.
const ROLES = [
  { key: 'RIDER', icon: 'bicycle', title: 'Rider', text: 'Find and participate in campaigns' },
  { key: 'BRAND', icon: 'business', title: 'Brand', text: 'Create and manage advertising campaigns' },
];

export default function SplashScreen({ onLogin, onLoginWithOtp, onRegister, onCustomerLogin, onCustomerSignup, showOtp = false }) {
  const [role, setRole] = useState('RIDER');
  const brand = role === 'BRAND';
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
        <Text style={styles.headline}>Welcome to FlexRiders</Text>

        <Text style={styles.continueAs}>Continue as</Text>
        <View style={styles.roles}>
          {ROLES.map((r) => {
            const active = role === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.role, active && styles.roleActive]}
                onPress={() => setRole(r.key)}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={r.icon} size={22} color={active ? '#FFFFFF' : '#93C5FD'} />
                <Text style={styles.roleTitle}>{r.title}</Text>
                <Text style={styles.roleText}>{r.text}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.primary} onPress={brand ? onCustomerLogin : onLogin} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Continue</Text>
        </TouchableOpacity>
        {showOtp && !brand ? (
          <TouchableOpacity style={styles.outline} onPress={onLoginWithOtp} activeOpacity={0.85}>
            <Text style={styles.outlineText}>Login with OTP</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={brand ? onCustomerSignup || onCustomerLogin : onRegister} style={{ marginTop: 16 }}>
          <Text style={styles.registerPrompt}>
            Don't have an account? <Text style={styles.registerLink}>{brand ? 'Sign up as a Brand' : 'Register as a Rider'}</Text>
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
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 1.5,
    borderColor: 'rgba(96, 165, 250, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The rider photo sits in a glowing brand-blue circle (the photo's background is transparent).
  ringInner: {
    width: 172,
    height: 172,
    borderRadius: 86,
    overflow: 'hidden',
    backgroundColor: '#1E3A8A',
    borderWidth: 3,
    borderColor: '#2563EB',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  rider: { width: 172, height: 258, marginTop: 5 },
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
  continueAs: { color: '#CBD5E1', fontSize: 13, fontWeight: '700', marginTop: 18, marginBottom: 10, textAlign: 'center', letterSpacing: 0.5 },
  roles: { flexDirection: 'row', gap: 10 },
  role: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.35)',
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
    gap: 4,
  },
  roleActive: { borderColor: '#3B82F6', backgroundColor: 'rgba(37, 99, 235, 0.55)' },
  roleTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', marginTop: 4 },
  roleText: { color: '#CBD5E1', fontSize: 12, lineHeight: 16 },
  customerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.4)',
    borderRadius: 14,
    backgroundColor: 'rgba(30, 58, 138, 0.25)',
  },
  customerBtnText: { color: '#93C5FD', fontSize: 14, fontWeight: '700' },
});
