import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Deep-link target for a scanned pack QR: `parag://trace/<code>` (the scheme is
 * "parag", app.json). Only the PYAAS app is registered for this scheme, so a
 * pack QR opens the provenance passport HERE and nowhere else — the QR is
 * consumer-app-only. We normalise nothing; know-your-milk resolves the code.
 */
export default function TraceDeepLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  if (!code) return <Redirect href="/(tabs)/traceability" />;
  return <Redirect href={{ pathname: '/know-your-milk', params: { code: String(code) } }} />;
}
