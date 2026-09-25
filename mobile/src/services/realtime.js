import { RealtimeClient } from '@supabase/realtime-js';

/** Same helper as the admin dashboard. Listens for data-free support signals on the channel the API handed out ({url, key, topic, event}).
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
