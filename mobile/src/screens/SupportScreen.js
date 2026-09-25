import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { subscribeSignals } from '../services/realtime';
import { useStyles, useTheme } from '../theme';
import { Card, EmptyState, PrimaryButton, ScreenHeader, SectionHeader } from '../components/ui';
import { formatDateTime } from '../utils';
import SupportChat from './SupportChat';

// Quick starts: tapping one prefills the subject of a new conversation.
const TOPICS = [
  { title: 'Payments & Earnings', icon: 'wallet-outline' },
  { title: 'Campaign & Photos', icon: 'camera-outline' },
  { title: 'T-shirt / Brand Kit', icon: 'shirt-outline' },
  { title: 'Account & Profile', icon: 'person-outline' },
  { title: 'App & Technical Issues', icon: 'settings-outline' },
];

const STATUS_TONE = { WAITING_FOR_ADMIN: 'warning', WAITING_FOR_RIDER: 'primary', OPEN: 'primary', RESOLVED: 'success', CLOSED: 'neutral' };
const RIDER_LABELS = {
  WAITING_FOR_ADMIN: 'Waiting for support',
  WAITING_FOR_RIDER: 'Support replied',
  OPEN: 'Open',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

/** Help & Support: the rider's conversations with FlexRiders support, a new-conversation form and the chat. */
export default function SupportScreen({ onBack, initialConversationId = null, onUnreadChanged }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [conversations, setConversations] = useState(null);
  const [openId, setOpenId] = useState(initialConversationId);
  const [composing, setComposing] = useState(null); // { subject } while the new-conversation form is open
  const [signal, setSignal] = useState(null); // Latest realtime signal, passed to the open chat

  const load = useCallback(
    () =>
      mobileApi
        .getSupportConversations()
        .then((res) => {
          setConversations(res.conversations);
          if (onUnreadChanged) onUnreadChanged(res.unread);
        })
        .catch(() => setConversations((prev) => prev || [])),
    [onUnreadChanged]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: support replies and status changes arrive without refreshing.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    mobileApi
      .getSupportRealtime()
      .then((config) => {
        if (!cancelled) {
          unsubscribe = subscribeSignals(config, (payload) => {
            loadRef.current();
            setSignal({ ...payload, at: Date.now() });
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!openId && !composing) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (composing) setComposing(null);
      else {
        setOpenId(null);
        load();
      }
      return true;
    });
    return () => sub.remove();
  }, [openId, composing, load]);

  if (openId) {
    return (
      <SupportChat
        conversationId={openId}
        signal={signal}
        onBack={() => {
          setOpenId(null);
          load();
        }}
      />
    );
  }

  if (composing) {
    return (
      <NewConversation
        initialSubject={composing.subject}
        onCancel={() => setComposing(null)}
        onCreated={(conversation) => {
          setComposing(null);
          setOpenId(conversation.id);
          load();
        }}
      />
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader title="Help & Support" onBack={onBack} />

      <TouchableOpacity style={styles.newButton} onPress={() => setComposing({ subject: '' })} activeOpacity={0.85}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#FFFFFF" />
        <Text style={styles.newButtonText}>Start a new conversation</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>You're messaging the FlexRiders support team. Replies appear here and in your notifications.</Text>

      <SectionHeader title="My Conversations" />
      {conversations === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
      ) : conversations.length === 0 ? (
        <EmptyState icon="chatbubbles-outline" title="No conversations yet" message="Start a conversation and our team will reply here." />
      ) : (
        <Card style={{ paddingVertical: 2 }}>
          {conversations.map((c, i) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.row, i === conversations.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => setOpenId(c.id)}
              accessibilityRole="button"
            >
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.rowTop}>
                  <Text style={styles.subject} numberOfLines={1}>
                    {c.subject}
                  </Text>
                  <Text style={styles.time}>{formatDateTime(c.last_message_at || c.updated_at)}</Text>
                </View>
                {c.campaign_name ? <Text style={styles.campaign}>Campaign: {c.campaign_name}</Text> : null}
                <Text style={styles.preview} numberOfLines={1}>
                  {c.last_message_preview}
                </Text>
                <View style={styles.rowBottom}>
                  <StatusChip status={c.status} />
                  {c.unread ? (
                    <View style={styles.unread}>
                      <Text style={styles.unreadText}>{c.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      )}

      <SectionHeader title="Common topics" />
      <Card style={{ paddingVertical: 4 }}>
        {TOPICS.map((topic, i) => (
          <TouchableOpacity
            key={topic.title}
            style={[styles.topic, i === TOPICS.length - 1 && { borderBottomWidth: 0 }]}
            onPress={() => setComposing({ subject: topic.title })}
          >
            <Ionicons name={topic.icon} size={20} color={colors.primary} />
            <Text style={styles.topicText}>{topic.title}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
      </Card>
    </ScrollView>
  );
}

export function StatusChip({ status }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const tone = STATUS_TONE[status] || 'neutral';
  const palette = {
    warning: [colors.warningSoft, colors.warning],
    primary: [colors.primarySoft, colors.primary],
    success: [colors.successSoft, colors.success],
    neutral: [colors.surfaceAlt, colors.textMuted],
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette[0] }]}>
      <Text style={[styles.chipText, { color: palette[1] }]}>{RIDER_LABELS[status] || status}</Text>
    </View>
  );
}

function NewConversation({ initialSubject, onCancel, onCreated }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [subject, setSubject] = useState(initialSubject || '');
  const [message, setMessage] = useState('');
  const [campaignId, setCampaignId] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mobileApi.getSupportCampaignOptions().then(setCampaigns).catch(() => {});
  }, []);

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Almost there', 'Please enter a subject and your message.');
      return;
    }
    setBusy(true);
    try {
      onCreated(await mobileApi.startSupportConversation(subject.trim(), message.trim(), campaignId));
    } catch (err) {
      Alert.alert('Message not sent', err.message);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="New conversation" onBack={onCancel} />
        <Text style={styles.label}>How can we help? *</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject} maxLength={150} placeholder="Subject" placeholderTextColor={colors.textSubtle} />
        {campaigns.length ? (
          <>
            <Text style={styles.label}>Related campaign (optional)</Text>
            <View style={styles.campaignPicks}>
              {[{ id: null, name: 'None' }, ...campaigns].map((c) => (
                <TouchableOpacity key={String(c.id)} onPress={() => setCampaignId(c.id)} style={[styles.pick, campaignId === c.id && styles.pickOn]}>
                  <Text style={[styles.pickText, campaignId === c.id && { color: '#FFFFFF' }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Message *</Text>
        <TextInput
          style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
          value={message}
          onChangeText={setMessage}
          multiline
          maxLength={2000}
          placeholder="Describe your question or problem"
          placeholderTextColor={colors.textSubtle}
        />
        <PrimaryButton label="Send to Support" loading={busy} onPress={submit} style={{ marginTop: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    newButton: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary, borderRadius: 14, paddingVertical: 15 },
    newButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    hint: { fontSize: 12.5, color: c.textMuted, marginTop: 8, lineHeight: 18 },
    row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    rowTop: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    subject: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
    time: { fontSize: 11.5, color: c.textSubtle },
    campaign: { fontSize: 12, color: c.primary, fontWeight: '600' },
    preview: { fontSize: 13, color: c.textMuted },
    rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontSize: 11.5, fontWeight: '700' },
    unread: { marginLeft: 'auto', backgroundColor: c.primary, borderRadius: 999, minWidth: 22, paddingHorizontal: 7, paddingVertical: 2, alignItems: 'center' },
    unreadText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    topic: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border },
    topicText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    label: { fontSize: 13, fontWeight: '600', color: c.text, marginTop: 14, marginBottom: 8 },
    input: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.text },
    campaignPicks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pick: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: c.surface },
    pickOn: { backgroundColor: c.primary, borderColor: c.primary },
    pickText: { fontSize: 13, color: c.text, fontWeight: '600' },
  });
