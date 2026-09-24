import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const palettes = {
  light: {
    background: '#F5F7FB',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F5F9',
    border: '#E2E8F0',
    text: '#0F172A',
    textMuted: '#64748B',
    textSubtle: '#94A3B8',
    primary: '#2563EB',
    primarySoft: '#EFF6FF',
    onPrimary: '#FFFFFF',
    hero: '#0B1B4D',
    heroMuted: '#A5B4FC',
    success: '#16A34A',
    successSoft: '#DCFCE7',
    warning: '#D97706',
    warningSoft: '#FEF3C7',
    danger: '#DC2626',
    dangerSoft: '#FEE2E2',
    statusBar: 'dark-content',
  },
  dark: {
    background: '#0B1120',
    surface: '#131C2E',
    surfaceAlt: '#1B2538',
    border: '#243049',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    textSubtle: '#64748B',
    primary: '#3B82F6',
    primarySoft: 'rgba(59, 130, 246, 0.16)',
    onPrimary: '#FFFFFF',
    hero: '#1E3A8A',
    heroMuted: '#BFDBFE',
    success: '#22C55E',
    successSoft: 'rgba(34, 197, 94, 0.16)',
    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.16)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.16)',
    statusBar: 'light-content',
  },
};

const STORAGE_KEY = 'sr_theme_preference';
const PREFERENCES = ['system', 'light', 'dark'];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (PREFERENCES.includes(saved)) setPreferenceState(saved);
      })
      .catch(() => {});
  }, []);

  const setPreference = (value) => {
    setPreferenceState(value);
    AsyncStorage.setItem(STORAGE_KEY, value).catch(() => {});
  };

  const scheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  const value = useMemo(
    () => ({ colors: palettes[scheme], scheme, preference, setPreference }),
    [scheme, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

// Builds a StyleSheet from the active palette. `factory` must be defined at module level
// so the memoised styles are only rebuilt when the theme changes.
export function useStyles(factory) {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
