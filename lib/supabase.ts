import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both env vars are present, so screens can show a helpful
 *  "backend not configured" state instead of crashing during first setup. */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  // Surfaced in the Metro logs; the UI also guards against this.
  console.warn(
    '[PYAAS] Supabase env vars missing. Create a .env file with ' +
      'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart Expo.'
  );
}

/**
 * Single Supabase client for the whole app. Sessions are persisted in
 * AsyncStorage (recommended for React Native; SecureStore has a 2KB limit that
 * Supabase JWT sessions can exceed).
 */
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'public-anon-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
