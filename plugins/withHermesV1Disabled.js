/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const {
  withPodfileProperties,
  withGradleProperties,
  withAppBuildGradle,
  withDangerousMod,
} = require('@expo/config-plugins');

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
 * THE OPT-OUT HAS THREE HALVES — ALL REQUIRED (found the hard way, 24 Aug 2026;
 * iOS builds 5/6 shipped with only the first and ABORT AT LAUNCH with
 * "Wrong bytecode version. Expected 96 but got 98"):
 *
 * 1. THE VM (this plugin, below). iOS: `expo.useHermesV1=false` in
 *    Podfile.properties.json → ios/Podfile line 20 sets RCT_HERMES_V1_ENABLED=0
 *    → pods link hermes-engine 0.16.0 (HBC bytecode 96). Android: public gradle
 *    property `hermesV1Enabled=false` → @react-native/gradle-plugin substitutes
 *    hermes-android 0.16.0.
 *
 * 2. THE COMPILER (the withDangerousMod below). Pods-PYAAS.*.xcconfig pins
 *    HERMES_CLI_PATH to node_modules/hermes-compiler/hermesc — the V1 compiler,
 *    emitting HBC 98 — REGARDLESS of RCT_HERMES_V1_ENABLED. The build phase
 *    sources ios/.xcode.env(.local) AFTER that env lands, so an export there
 *    wins; we write it into ios/.xcode.env at prebuild. 0.16.0's own compiler
 *    lives at ios/Pods/hermes-engine/destroot/bin/hermesc.
 *
 * 3. THE TRANSPILE (babel.config.js, versioned — not managed here). RN 0.85's
 *    default 'hermes-stable' transform profile targets Hermes V1: it preserves
 *    class syntax and private members (#x), which hermesc 0.16.0 cannot parse
 *    ("invalid statement encountered" / "private properties are not supported").
 *    And when hermesc errors, the Xcode phase does NOT fail the build: it
 *    silently leaves the previous main.jsbundle in place, which is how a stale
 *    HBC-98 bundle shipped inside builds whose VM expected 96. babel.config.js
 *    passes `unstable_transformProfile: 'hermes-v0'` to babel-preset-expo,
 *    selecting its old-Hermes pipeline on BOTH platforms.
 *    After ANY release build, verify: `head -c 12 <app>/main.jsbundle | xxd`
 *    must show byte 8 == 0x60 (96), not 0x62 (98).
 *
 * This must be a config plugin rather than a hand edit: ios/ and android/ are
 * generated and gitignored, so plain edits to Podfile.properties.json or
 * gradle.properties are silently lost on the next `expo prebuild`.
 * expo-build-properties exposes no Hermes toggle on either platform.
 *
 * REMOVE ALL THREE HALVES when upgrading to Expo SDK 57 / React Native 0.86.2+,
 * which ship Hermes V1 250829098.0.16 with the fix.
 */

const XCODE_ENV_SNIPPET = `
# Hermes V1 opt-out, compiler half — written by plugins/withHermesV1Disabled.js.
# Pods-PYAAS.*.xcconfig pins HERMES_CLI_PATH to the V1 compiler (HBC 98) even with
# RCT_HERMES_V1_ENABLED=0, while the linked VM is hermes-engine 0.16.0 (HBC 96);
# the app then aborts at launch: "Wrong bytecode version. Expected 96 but got 98".
# This file is sourced last in the bundle phase, so this export wins.
export HERMES_CLI_PATH="$PODS_ROOT/hermes-engine/destroot/bin/hermesc"
`;

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
  config = withAppBuildGradle(config, (cfg) => {
    // ANDROID COMPILER HALF (the Aug-21 test APK proved the gap): with
    // hermesV1Enabled=false the gradle plugin swaps the ENGINE to
    // hermes-android 0.16.0 (HBC 96) but still resolves hermesc from the
    // hermes-compiler npm package (V1, HBC 98) because
    // node_modules/react-native/sdks/hermesc does not exist in RN 0.85 —
    // the release bundle then aborts at launch with "Wrong bytecode version".
    // Point the react extension at the HBC-96 hermesc that CocoaPods already
    // downloads for iOS (macOS host binary — local/laptop builds; revisit for
    // any Linux CI). The Expo template SETS hermesCommand explicitly (resolving
    // the hermes-compiler npm package), so this must REPLACE that assignment —
    // an inserted extra line would be overwritten by the later one. Idempotent:
    // the replacement line no longer matches the hermes-compiler pattern.
    const line =
      '    hermesCommand = "$rootDir/../ios/Pods/hermes-engine/destroot/bin/hermesc" // Hermes V1 opt-out, compiler half — plugins/withHermesV1Disabled.js';
    const c = cfg.modResults.contents;
    if (/^\s*hermesCommand\s*=.*hermes-compiler.*$/m.test(c)) {
      cfg.modResults.contents = c.replace(/^\s*hermesCommand\s*=.*hermes-compiler.*$/m, line);
    } else if (!/^\s*hermesCommand\s*=/m.test(c)) {
      cfg.modResults.contents = c.replace(/(^react \{)/m, `$1\n${line}`);
    }
    return cfg;
  });
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const envPath = path.join(cfg.modRequest.platformProjectRoot, '.xcode.env');
      let current = '';
      try {
        current = fs.readFileSync(envPath, 'utf8');
      } catch (_e) {
        /* no .xcode.env yet — we create it */
      }
      if (!current.includes('HERMES_CLI_PATH')) {
        fs.writeFileSync(envPath, current + XCODE_ENV_SNIPPET);
      }
      return cfg;
    },
  ]);
  return config;
};
