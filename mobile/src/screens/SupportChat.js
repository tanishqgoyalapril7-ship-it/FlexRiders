import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../services/api';
import { useStyles, useTheme } from '../theme';
import { ScreenHeader } from '../components/ui';
import { formatDateTime } from '../utils';
import { StatusChip } from './SupportScreen';

/** One support conversation. New replies and status changes arrive through `signal` (realtime), so the
 *  rider never has to refresh. Older messages load when scrolling up. */
export default function SupportChat({ conversationId, signal, onBack }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  // Newest page, merged with anything older already shown.
  const refresh = useCallback(async () => {
    const res = await mobileApi.getSupportMessages(conversationId);
    setConversation(res.conversation);
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      res.messages.forEach((m) => byId.set(m.id, m));
      return [...byId.values()].sort((a, b) => a.id - b.id);
    });
    if (res.conversation.unread) mobileApi.markSupportRead(conversationId).catch(() => {});
    return res;
  }, [conversationId]);

  useEffect(() => {
    refresh()
      .then((res) => setHasMore(res.has_more))
      .catch((err) => Alert.alert('Could not load the conversation', err.message));
  }, [refresh]);

  useEffect(() => {
    if (signal && signal.conversation_id === conversationId) refresh().catch(() => {});
  }, [signal, conversationId, refresh]);

  const loadOlder = async () => {
    if (!hasMore || loadingOlder || !messages.length) return;
    setLoadingOlder(true);
    try {
      const res = await mobileApi.getSupportMessages(conversationId, messages[0].id);
      setMessages((prev) => [...res.messages, ...prev]);
      setHasMore(res.has_more);
    } catch {
      // Try again on the next scroll
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await mobileApi.sendSupportMessage(conversationId, text);
      setDraft('');
      setConversation(res.conversation);
      setMessages((prev) => [...prev.filter((m) => m.id !== res.message.id), res.message]);
    } catch (err) {
      Alert.alert('Message not sent', err.message);
    } finally {
      setSending(false);
    }
  };

  if (!conversation) {
    return (
      <View style={styles.screen}>
        <View style={styles.pad}>
          <ScreenHeader title="Support" onBack={onBack} />
        </View>
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  const closed = conversation.status === 'CLOSED';
  // Newest at the bottom: the list is inverted, so it's fed newest-first.
  const data = [...messages].reverse();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.pad}>
        <ScreenHeader title="FlexRiders Support" onBack={onBack} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.subject} numberOfLines={2}>
              {conversation.subject}
            </Text>
            {conversation.campaign_name ? <Text style={styles.campaign}>Campaign: {conversation.campaign_name}</Text> : null}
          </View>
          <StatusChip status={conversation.status} />
        </View>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        data={data}
        inverted
        keyExtractor={(m) => String(m.id)}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.2}
        ListFooterComponent={loadingOlder ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} /> : null}
        renderItem={({ item: m }) =>
          m.sender_type === 'SYSTEM' ? (
            <Text style={styles.system}>{m.body}</Text>
          ) : (
            <View style={[styles.bubble, m.sender_type === 'RIDER' ? styles.mine : styles.theirs]}>
              {m.sender_type === 'ADMIN' ? <Text style={styles.sender}>{m.sender_name || 'FlexRiders Support'}</Text> : null}
              <Text style={[styles.body, m.sender_type === 'RIDER' && { color: '#FFFFFF' }]}>{m.body}</Text>
              <Text style={[styles.time, m.sender_type === 'RIDER' && { color: 'rgba(255,255,255,0.8)' }]}>
                {formatDateTime(m.created_at)}
                {m.sender_type === 'RIDER' ? (m.id <= conversation.other_side_read_id ? ' · Seen' : ' · Sent') : ''}
              </Text>
            </View>
          )
        }
      />

      {closed ? (
        <View style={styles.closedBar}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textMuted} />
          <Text style={styles.closedText}>This conversation is closed. Start a new one from Help & Support if you need more help.</Text>
        </View>
      ) : (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={conversation.status === 'RESOLVED' ? 'Reply to reopen this conversation' : 'Type a message'}
            placeholderTextColor={colors.textSubtle}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            style={[styles.send, (!draft.trim() || sending) && { opacity: 0.5 }]}
            onPress={send}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send message"
          >
            {sending ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    pad: { paddingHorizontal: 20 },
    header: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border },
    subject: { fontSize: 16, fontWeight: '700', color: c.text },
    campaign: { fontSize: 12.5, color: c.primary, fontWeight: '600', marginTop: 2 },
    list: { padding: 16, gap: 10 },
    system: { alignSelf: 'center', textAlign: 'center', fontSize: 12, color: c.textMuted, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '90%' },
    bubble: { maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
    mine: { alignSelf: 'flex-end', backgroundColor: c.primary, borderBottomRightRadius: 4 },
    theirs: { alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderBottomLeftRadius: 4 },
    sender: { fontSize: 11.5, fontWeight: '700', color: c.primary, marginBottom: 2 },
    body: { fontSize: 15, color: c.text, lineHeight: 21 },
    time: { fontSize: 10.5, color: c.textSubtle, marginTop: 3, alignSelf: 'flex-end' },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    input: { flex: 1, maxHeight: 120, backgroundColor: c.background, borderRadius: 20, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: c.text },
    send: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    closedBar: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
    closedText: { flex: 1, fontSize: 13, color: c.textMuted },
  });
