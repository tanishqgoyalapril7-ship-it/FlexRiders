import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../theme';
import { Card, ScreenHeader, SectionHeader } from '../components/ui';

const TOPICS = [
  { title: 'Payments & Earnings', icon: 'wallet-outline' },
  { title: 'Brand Assignment', icon: 'briefcase-outline' },
  { title: 'Documents & KYC', icon: 'document-text-outline' },
  { title: 'Account & Profile', icon: 'person-outline' },
  { title: 'App & Technical Issues', icon: 'settings-outline' },
];

const COMING_SOON = 'This is coming soon. For now, please contact your operations manager.';

export default function SupportScreen({ onBack }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const topics = TOPICS.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Support" onBack={onBack} />

      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search help topics"
          placeholderTextColor={colors.textSubtle}
        />
      </View>

      <SectionHeader title="Popular Topics" />
      <Card style={{ paddingVertical: 4 }}>
        {topics.length === 0 ? (
          <Text style={styles.noResults}>No topics match "{query}"</Text>
        ) : (
          topics.map((topic, i) => (
            <TouchableOpacity
              key={topic.title}
              style={[styles.topic, i === topics.length - 1 && { borderBottomWidth: 0 }]}
              onPress={() => Alert.alert(topic.title, COMING_SOON)}
            >
              <Ionicons name={topic.icon} size={20} color={colors.primary} />
              <Text style={styles.topicText}>{topic.title}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </TouchableOpacity>
          ))
        )}
      </Card>

      <SectionHeader title="Need more help?" />
      {[
        { title: 'Chat with Support', icon: 'chatbubble-ellipses-outline' },
        { title: 'Call Support', icon: 'call-outline' },
      ].map((item) => (
        <TouchableOpacity key={item.title} style={styles.helpCard} onPress={() => Alert.alert(item.title, COMING_SOON)}>
          <View style={styles.helpIcon}>
            <Ionicons name={item.icon} size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>{item.title}</Text>
            <Text style={styles.helpSub}>Coming soon</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
    },
    searchInput: { flex: 1, fontSize: 15, color: c.text, paddingVertical: 13 },
    noResults: { fontSize: 13, color: c.textMuted, paddingVertical: 16 },
    topic: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border },
    topicText: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text },
    helpCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.primarySoft,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
    },
    helpIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    helpTitle: { fontSize: 15, fontWeight: '700', color: c.primary },
    helpSub: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  });
