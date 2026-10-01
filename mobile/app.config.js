// Extends app.json with build-time secrets from the environment (never committed).
// GOOGLE_MAPS_ANDROID_API_KEY: Google Maps SDK for Android key, needed for the campaign maps on Android
// (iOS uses Apple Maps and needs no key). Set it in EAS secrets or your shell before building.
module.exports = ({ config }) => {
  const key = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  if (!key) return config;
  return {
    ...config,
    android: {
      ...config.android,
      config: { ...(config.android && config.android.config), googleMaps: { apiKey: key } },
    },
  };
};
