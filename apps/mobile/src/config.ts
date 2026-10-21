/**
 * Point this at your local Flask API or production host.
 * Expo Go on a physical device needs your machine LAN IP, not 127.0.0.1.
 */
export const BACKEND_URL = (
  process.env.EXPO_PUBLIC_BACKEND_URL || 'http://127.0.0.1:5000'
).replace(/\/$/, '');
