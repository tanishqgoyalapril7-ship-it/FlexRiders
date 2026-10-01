// Campaign T-Shirt: the brand gear for the rider's current (or requested) campaign, straight from the
// campaign's brand kit and the rider's own kit record: chosen size, pickup point, collection and return.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mobileApi } from '../../services/api';
import { useStyles, useTheme } from '../../theme';
import { useT } from '../../i18n';
import { Badge, Button, Card, Empty, Header, Screen, Section } from '../../components/ds';
import { formatINR } from '../../utils';

const KIT_TONE = { COLLECTED: 'success', ISSUED: 'success', READY_FOR_PICKUP: 'success', PENDING: 'warning', NOT_REQUIRED: 'neutral' };

export default function TshirtScreen({ campaigns, onBack, onOpenCampaign }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const current = campaigns ? campaigns.active || campaigns.pending_request : null;
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!current) return;
    mobileApi.getCampaign(current.id).then(setDetail).catch((err) => setError(err.message));
  }, [current && current.id]);

  if (!campaigns || (current && !detail && !error)) {
    return (
      <Screen>
        <Header onBack={onBack} title={t('Campaign T-Shirts')} />
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (!current || error) {
    return (
      <Screen>
        <Header onBack={onBack} title={t('Campaign T-Shirts')} />
        <Empty icon="shirt-outline" title={error ? 'Unable to load' : 'No campaign T-shirt yet'} text={error || 'When you join a campaign that needs brand gear, your T-shirt size and pickup point appear here.'} />
      </Screen>
    );
  }

  const kit = detail.brand_kit;
  const required = kit && kit.tshirt_required;
  const mine = detail.my_kit || (detail.my_request ? { status: detail.my_request.kit_status, status_label: detail.my_request.kit_status_label, tshirt_size: detail.my_request.tshirt_size, pickup_location: detail.my_request.pickup_location } : null);
  const size = mine && mine.tshirt_size;
  const location = (mine && mine.pickup_location) || (kit && kit.locations && kit.locations[0]);
  const ret = detail.kit_return;

  return (
    <Screen footer={<Button label="Open campaign" onPress={() => onOpenCampaign(detail.id)} />}>
      <Header onBack={onBack} title={t('Campaign T-Shirts')} />
      {!required ? (
        <Empty icon="shirt-outline" title="No T-shirt needed" text={`${detail.name} doesn't use brand gear.`} />
      ) : (
        <>
          <Card>
            <View style={s.shirt}>
              <Ionicons name="shirt" size={64} color={colors.primary} />
            </View>
            <Text style={s.title}>Official Brand Gear</Text>
            <Text style={s.body}>
              {detail.brand_name} · {detail.name}. {kit.instructions || 'Wear the brand T-shirt during the campaign; it must be visible in your photos.'}
            </Text>
          </Card>
          <Section>Your size</Section>
          <View style={s.sizes}>
            {(kit.size_options || []).map((opt) => (
              <View key={opt} style={[s.size, opt === size && s.sizeOn]}>
                <Text style={[s.sizeText, opt === size && { color: '#FFFFFF' }]}>{opt}</Text>
              </View>
            ))}
          </View>
          <Text style={s.hint}>{size ? 'Chosen when you requested to join. Ask the pickup team if you need a different size.' : 'Choose your size when you request to join.'}</Text>
          <Card style={{ marginTop: 16 }}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Pickup Information</Text>
              {mine && mine.status_label ? <Badge label={mine.status_label.toUpperCase()} tone={KIT_TONE[mine.status] || 'warning'} /> : null}
            </View>
            {location ? (
              <>
                <View style={s.loc}>
                  <Ionicons name="location" size={18} color={colors.primary} />
                  <Text style={s.body}>
                    <Text style={{ fontWeight: '700', color: colors.text }}>{location.name}</Text>
                    {location.address ? ` · ${location.address}` : ''}
                  </Text>
                </View>
                {location.start_time && location.end_time ? <Text style={s.hint}>Open {location.start_time}–{location.end_time}{location.available_days ? `, ${location.available_days}` : ''}</Text> : null}
                {location.map_url ? (
                  <TouchableOpacity onPress={() => Linking.openURL(location.map_url)} style={s.mapLink}>
                    <Ionicons name="navigate-outline" size={16} color={colors.primary} />
                    <Text style={s.mapLinkText}>Open in Maps</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <Text style={s.body}>The pickup point will be shared by the FlexRiders team.</Text>
            )}
          </Card>
          {kit.return_required ? (
            <Card style={[s.return, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="refresh-circle-outline" size={20} color={colors.primary} />
                <Text style={[s.cardTitle, { color: colors.primary }]}>Return Shirt Option</Text>
              </View>
              <Text style={s.body}>
                {kit.return_instructions || 'Return the T-shirt at the hub after the campaign.'}
                {kit.return_incentive ? ` You get ${formatINR(kit.return_incentive)} when it's marked returned.` : ''}
              </Text>
              {ret && ret.status_label ? <Badge label={ret.status_label} tone="primary" style={{ marginTop: 8 }} /> : null}
            </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    shirt: { height: 150, borderRadius: 16, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    cardTitle: { fontSize: 16, fontWeight: '800', color: c.text },
    body: { fontSize: 14, color: c.textMuted, lineHeight: 20, marginTop: 6, flex: 1 },
    hint: { fontSize: 12, color: c.textMuted, marginTop: 8 },
    sizes: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    size: { minWidth: 64, flexGrow: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
    sizeOn: { backgroundColor: c.primary, borderColor: c.primary },
    sizeText: { fontSize: 16, fontWeight: '800', color: c.text },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    loc: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 8 },
    mapLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
    mapLinkText: { color: c.primary, fontWeight: '700' },
    return: { marginTop: 16 },
  });
