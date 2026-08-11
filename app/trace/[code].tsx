import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Deep-link target for a scanned pack QR: `parag://trace/<code>` (the scheme is
 * "parag", app.json).
 *
 * A custom URL scheme is NOT exclusive. Any app may declare "parag" in its own
 * Info.plist, and when more than one installed app claims a scheme iOS picks the
 * handler non-deterministically — it is not first-installed, not last-installed,
 * and Apple documents no ordering (this is precisely why Universal Links exist).
 * So `parag://` is a convenience for devices that happen to route here, never a
 * guarantee that a pack QR opens PYAAS. What actually makes a pack traceable is
 * the printed batch code plus the https web-fallback URL
 * (EXPO_PUBLIC_PUBLIC_TRACE_URL), both of which lib/milk.normalizeBatchCode
 * already accepts. Treat a scheme hit as best-effort.
 *
 * We normalise nothing here; know-your-milk resolves the code.
 */
export default function TraceDeepLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  if (!code) return <Redirect href="/(tabs)/traceability" />;
  return <Redirect href={{ pathname: '/know-your-milk', params: { code: String(code) } }} />;
}
