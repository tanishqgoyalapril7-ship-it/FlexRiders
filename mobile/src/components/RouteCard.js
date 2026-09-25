import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, SectionHeader } from './ui';
import { flushRoute, getRouteState, hasBackgroundPermission, istDate, resumeRoute, startRoute, stopRoute } from '../services/routeTracker';

/** Start / End the day's campaign route. Shows no statistics — the route is only drawn for the team. */
export default function RouteCard({ campaignId }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [state, setState] = useState(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    resumeRoute()
      .then((s) => setState(s && s.campaignId === campaignId ? s : s ? { other: true } : null))
      .catch(() => getRouteState().then((s) => setState(s && s.campaignId === campaignId ? s : s ? { other: true } : null))); // e.g. location turned off since
  }, [campaignId]);

  // Upload queued points every 30 s while this screen is open.
  useEffect(() => {
    if (!state || state.other) return undefined;
    const id = setInterval(async () => {
      const ok = await flushRoute();
      if (!ok) setState(await getRouteState());
    }, 30000);
    return () => clearInterval(id);
  }, [state]);

  if (state === undefined) return null;
  const recording = Boolean(state && !state.other && state.day === istDate());

  const begin = async (askBackground) => {
    setBusy(true);
    try {
      setState(await startRoute(campaignId, { askBackground }));
    } catch (err) {
      Alert.alert('Could not start route', err.message);
    } finally {
      setBusy(false);
    }
  };

  // Google Play requires this disclosure in the app before the background-location permission is requested.
  const start = async () => {
    if (await hasBackgroundPermission()) {
      begin(false);
      return;
    }
    Alert.alert(
      'Location while you ride',
      'FlexRiders collects your location to record your campaign route, even when the app is closed or not in use, ' +
        'from the moment you tap Start Route until you tap End Route (or the campaign day ends). The route is shared ' +
        'only with the FlexRiders team to verify your campaign riding. It is never collected at other times.\n\n' +
        'On the next screen, choose "Allow all the time" to keep recording with the screen off. ' +
        'If you don’t, the route records only while the app is open.',
      [
        { text: 'Only while app is open', onPress: () => begin(false) },
        { text: 'Continue', onPress: () => begin(true) },
      ],
      { cancelable: true }
    );
  };

  const end = () =>
    Alert.alert('End route?', 'Location sharing stops and your route is saved.', [
      { text: 'Keep recording', style: 'cancel' },
      {
        text: 'End Route',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          await stopRoute().catch(() => {});
          setState(null);
          setBusy(false);
        },
      },
    ]);

  return (
    <>
      <SectionHeader title="Today's Route" />
      <Card style={[{ gap: 12 }, recording && { borderColor: colors.success }]}>
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: recording ? colors.successSoft : colors.primarySoft }]}>
            <Ionicons name={recording ? 'navigate' : 'navigate-outline'} size={22} color={recording ? colors.success : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{recording ? 'Recording your route' : 'Record your route'}</Text>
            <Text style={styles.text}>
              {recording
                ? state.mode === 'background'
                  ? 'Your location is shared with the FlexRiders team until you end the route, even with the screen off.'
                  : 'Your location is shared with the FlexRiders team until you end the route. Keep the app open while riding.'
                : state && state.other
                ? 'A route is already recording for another campaign.'
                : 'Start when you begin riding. Your location is shared only while the route is on.'}
            </Text>
          </View>
          {recording ? <View style={styles.liveDot} /> : null}
        </View>
        {!(state && state.other) ? (
          <TouchableOpacity
            style={[styles.button, recording ? styles.endButton : { backgroundColor: colors.primary }]}
            onPress={recording ? end : start}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={recording ? colors.danger : '#FFFFFF'} />
            ) : (
              <>
                <Ionicons name={recording ? 'stop-circle-outline' : 'play-circle-outline'} size={20} color={recording ? colors.danger : '#FFFFFF'} />
                <Text style={[styles.buttonText, { color: recording ? colors.danger : '#FFFFFF' }]}>{recording ? 'End Route' : 'Start Route'}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </Card>
    </>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 15, fontWeight: '700', color: c.text },
    text: { fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 },
    liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.success },
    button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
    endButton: { borderWidth: 1.5, borderColor: c.danger, backgroundColor: c.surface },
    buttonText: { fontSize: 15, fontWeight: '700' },
  });
