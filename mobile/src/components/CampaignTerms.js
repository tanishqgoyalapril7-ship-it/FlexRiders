import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, SectionHeader } from './ui';
import { formatDate } from '../utils';

/** Full campaign Terms & Conditions with an explicit "I agree" before accepting.
 *  onAccept(version) does the work (join or accept an updated version); errors are shown in the sheet. */
export function TermsSheet({ campaignName, terms, visible, onClose, onAccept, acceptLabel = 'Accept & Continue' }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!terms) return null;

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      await onAccept(terms.version);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Terms & Conditions</Text>
        <Text style={styles.meta}>
          {campaignName} · Version {terms.version} · {formatDate(terms.published_at)}
        </Text>
        {terms.change_note && terms.accepted_version ? <Text style={styles.change}>What changed: {terms.change_note}</Text> : null}
        <ScrollView style={styles.bodyBox} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.body}>{terms.body}</Text>
        </ScrollView>
        <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(!agreed)} activeOpacity={0.8} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
          <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={22} color={agreed ? colors.primary : colors.textMuted} />
          <Text style={styles.agreeText}>I have read and agree to these Terms & Conditions (version {terms.version}).</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.button, styles.cancel]} onPress={onClose} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.primary, !agreed && { opacity: 0.45 }]} onPress={accept} disabled={!agreed || busy}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryText}>{acceptLabel}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** On the campaign screen: the current terms, and a reminder when a newer version needs accepting.
 *  Riders already in the campaign are reminded, never blocked from their daily photos. */
export function TermsCard({ campaign, joined, onAccept }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const terms = campaign.terms;
  if (!terms) return null;
  const pendingUpdate = joined && terms.needs_acceptance;

  return (
    <>
      <SectionHeader title="Terms & Conditions" />
      <Card style={[{ gap: 10 }, pendingUpdate && { borderColor: colors.warning }]}>
        <View style={styles.cardRow}>
          <Ionicons name={pendingUpdate ? 'alert-circle' : 'document-text-outline'} size={22} color={pendingUpdate ? colors.warning : colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{pendingUpdate ? `Updated terms (version ${terms.version})` : `Version ${terms.version}`}</Text>
            <Text style={styles.cardText}>
              {pendingUpdate
                ? `The campaign terms were updated${terms.change_note ? `: ${terms.change_note}` : ''}. Please review and accept them. You can keep submitting your photos.`
                : terms.accepted_version
                ? `You accepted version ${terms.accepted_version}.`
                : 'You’ll be asked to accept these when you join.'}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={[styles.cardButton, pendingUpdate && { backgroundColor: colors.warning }]} onPress={() => setOpen(true)}>
          <Text style={styles.cardButtonText}>{pendingUpdate ? 'Review & Accept' : 'Read Terms'}</Text>
        </TouchableOpacity>
      </Card>
      {open ? (
        pendingUpdate ? (
          <TermsSheet
            campaignName={campaign.name}
            terms={terms}
            visible={open}
            acceptLabel="Accept Updated Terms"
            onClose={() => setOpen(false)}
            onAccept={async (version) => {
              await onAccept(version);
              setOpen(false);
            }}
          />
        ) : (
          <ReadOnlyTerms campaignName={campaign.name} terms={terms} onClose={() => setOpen(false)} />
        )
      ) : null}
    </>
  );
}

function ReadOnlyTerms({ campaignName, terms, onClose }) {
  const styles = useStyles(makeStyles);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Terms & Conditions</Text>
        <Text style={styles.meta}>
          {campaignName} · Version {terms.version} · {formatDate(terms.published_at)}
        </Text>
        <ScrollView style={styles.bodyBox} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.body}>{terms.body}</Text>
        </ScrollView>
        <TouchableOpacity style={[styles.button, styles.primary, { marginTop: 14 }]} onPress={onClose}>
          <Text style={styles.primaryText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, maxHeight: '88%' },
    title: { fontSize: 19, fontWeight: '800', color: c.text },
    meta: { fontSize: 12.5, color: c.textMuted, marginTop: 4 },
    change: { fontSize: 13, color: c.warning, marginTop: 8, fontWeight: '600' },
    bodyBox: { marginTop: 12, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.background, maxHeight: 360 },
    body: { fontSize: 14, lineHeight: 21, color: c.text },
    agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
    agreeText: { flex: 1, fontSize: 13.5, color: c.text, lineHeight: 19 },
    error: { color: c.danger, fontSize: 13, marginTop: 10 },
    buttons: { flexDirection: 'row', gap: 10, marginTop: 16 },
    button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
    cancel: { borderWidth: 1, borderColor: c.border },
    cancelText: { color: c.text, fontSize: 15, fontWeight: '700' },
    primary: { backgroundColor: c.primary },
    primaryText: { color: c.onPrimary, fontSize: 15, fontWeight: '800' },
    cardRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: c.text },
    cardText: { fontSize: 13, color: c.textMuted, marginTop: 3, lineHeight: 18 },
    cardButton: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    cardButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  });
