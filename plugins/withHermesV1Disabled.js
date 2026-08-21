/* eslint-disable @typescript-eslint/no-var-requires */
const { withPodfileProperties, withGradleProperties } = require('@expo/config-plugins');

/**
 * Config plugin: opt BOTH platforms OUT of Hermes V1.
 *
 * WHY THIS EXISTS
 * Expo SDK 56 ships React Native 0.85.3, which links Hermes V1
 * 250829098.0.10. Every Hermes V1 up to and including 250829098.0.15 carries a
 * memory regression that only bites RELEASE builds: the engine attaches roughly
 * half a megabyte of debug metadata to each function it eval()s at runtime.
 * `npx expo-doctor` fails this project on exactly that check.
 *
 * That hits THIS app unusually hard. Reanimated/Worklets in its default
 * (non-bundle) mode ships every worklet as a source STRING and eval()s it on
 * the UI runtime, and the app initialises well over a hundred worklets during
 * cold start — the splash write-on, the tab bar, every screen transition. The
 * result is a large, launch-time memory spike that presents to the user as the
 * app hanging on the splash and recovering on relaunch.
 *
 * Bundle Mode in react-native-worklets would sidestep the eval() path, but it
 * only became the stable default in worklets 0.10.0 and this project is pinned
 * to 0.8.3 by SDK 56. So the surgical fix is to run the previous, unaffected
 * engine (Hermes 0.16.0) until an SDK upgrade is scheduled on its own merits.
 *
 * ANDROID has the same default: @react-native/gradle-plugin resolves
 * `hermes-android:${HERMES_V1_VERSION_NAME}` (= 250829098.0.10) unless the
 * public gradle property `hermesV1Enabled` is false — see
 * ProjectUtils.isHermesV1Enabled and PropertyUtils.HERMES_V1_ENABLED in
 * node_modules/@react-native/gradle-plugin. Setting it false substitutes the
 * previous engine (HERMES_VERSION_NAME = 0.16.0), the same swap as iOS.
 *
 * iOS: `ios/Podfile` honours this at line 20:
 *   ENV['RCT_HERMES_V1_ENABLED'] ||= '0' if podfile_properties['expo.useHermesV1'] == 'false'
 *
 * This must be a config plugin rather than a hand edit: ios/ and android/ are
 * generated and gitignored, so plain edits to Podfile.properties.json or
 * gradle.properties are silently lost on the next `expo prebuild`.
 * expo-build-properties exposes no Hermes toggle on either platform.
 *
 * REMOVE THIS when upgrading to Expo SDK 57 / React Native 0.86.2+, which ship
 * Hermes V1 250829098.0.16 with the fix.
 */
module.exports = function withHermesV1Disabled(config) {
  config = withPodfileProperties(config, (cfg) => {
    cfg.modResults['expo.useHermesV1'] = 'false';
    return cfg;
  });
  config = withGradleProperties(config, (cfg) => {
    // Replace any existing entry so re-running prebuild stays idempotent.
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'hermesV1Enabled'),
    );
    cfg.modResults.push({
      type: 'comment',
      value: 'Hermes V1 <= 250829098.0.15 memory regression — see plugins/withHermesV1Disabled.js',
    });
    cfg.modResults.push({ type: 'property', key: 'hermesV1Enabled', value: 'false' });
    return cfg;
  });
  return config;
};
