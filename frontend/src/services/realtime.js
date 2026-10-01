import { RealtimeClient } from '@supabase/realtime-js';

/** Listens for data-free support signals on the channel the API handed out ({url, key, topic, event}).
 *  onSignal(payload) runs for each change; the caller then refetches through the authenticated API.
 *  Returns an unsubscribe function. Does nothing when realtime isn't configured (local development). */
export function subscribeSignals(config, onSignal, onStatus) {
  if (!config || !config.enabled || !config.url || !config.key || !config.topic) {
    if (onStatus) onStatus('OFF');
    return () => {};
  }
  const client = new RealtimeClient(`${config.url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: config.key } });
  const channel = client.channel(config.topic);
  channel.on('broadcast', { event: config.event || 'support' }, (message) => onSignal(message.payload || {}));
  channel.subscribe((status) => onStatus && onStatus(status));
  return () => {
    client.removeChannel(channel);
    client.disconnect();
  };
}

// One shared connection for campaign signals across the dashboard; views register handlers.
const campaignHandlers = new Set();
let campaignConnection = null;

async function connectCampaignSignals() {
  const { api } = await import('./api');
  const config = await api.getCampaignRealtime().catch(() => null);
  if (!campaignHandlers.size) return null;
  return subscribeSignals(config, (payload) => campaignHandlers.forEach((h) => h(payload)));
}

/** handler(payload) runs for every campaign signal ({campaign_id, event_type}). Returns an unsubscribe. */
export function subscribeCampaignSignals(handler) {
  campaignHandlers.add(handler);
  if (!campaignConnection) campaignConnection = connectCampaignSignals();
  return () => {
    campaignHandlers.delete(handler);
    if (!campaignHandlers.size && campaignConnection) {
      const pending = campaignConnection;
      campaignConnection = null;
      pending.then((stop) => stop && stop());
    }
  };
}
