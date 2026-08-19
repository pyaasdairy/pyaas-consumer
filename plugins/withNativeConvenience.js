/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');
const {
  withAppBuildGradle,
  withMainApplication,
  withDangerousMod,
} = require('@expo/config-plugins');

/**
 * Config plugin for the native "hyper-convenience" login seam (phone-number
 * hint + SMS-retriever OTP). Makes the native module survive `expo prebuild`:
 * on every prebuild it re-injects, into the regenerated android/ project,
 *
 *   1. the Kotlin sources (plugins/native-convenience-src/*.kt) →
 *      app/src/main/java/<package>/nativeconvenience/,
 *   2. the Play Services deps (Identity phone-hint + SMS-retriever) in
 *      app/build.gradle,
 *   3. the PyaasConveniencePackage registration in MainApplication.kt.
 *
 * NOTE: the phone-number hint uses Play Services `getPhoneNumberHintIntent`, which
 * needs NO runtime permission — so we DON'T request READ_PHONE_NUMBERS (that shows
 * the scary "make and manage phone calls" prompt). SMS Retriever is permission-free too.
 *
 * Without this, the hand-added android/ files are dropped by a clean prebuild.
 * The JS side (lib/nativeConvenience.ts) looks the module up on
 * NativeModules.RNPhoneNumberHint.
 */

const SRC_DIR = path.join(__dirname, 'native-convenience-src');
const KOTLIN_FILES = ['PhoneNumberHintModule.kt', 'AppSignatureHelper.kt', 'PyaasConveniencePackage.kt'];

const GRADLE_DEPS = [
  // 20.7.0 (NOT 21.x): the legacy Smart Lock hint picker (Credentials/
  // HintRequest — the light "Continue with" dialog listing both SIM numbers)
  // was REMOVED in play-services-auth 21.0. 20.7.0 carries BOTH that picker
  // and the newer Identity Phone Number Hint we fall back to.
  'implementation("com.google.android.gms:play-services-auth:20.7.0")',
  'implementation("com.google.android.gms:play-services-auth-api-phone:18.2.0")',
];

const REGISTER_LINE =
  '          add(`in`.pyaasdairy.app.nativeconvenience.PyaasConveniencePackage())';

// No phone/SMS permission is requested: the number hint (getPhoneNumberHintIntent)
// and SMS Retriever are both permission-free — so this plugin only injects native code.

// Play Services deps in app/build.gradle (idempotent).
function withGradleDeps(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('play-services-auth-api-phone')) {
      const inject =
        '\n    // Native phone-hint + SMS-retriever (withNativeConvenience plugin)\n    ' +
        GRADLE_DEPS.join('\n    ') +
        '\n';
      src = src.replace(/dependencies\s*\{/, (m) => m + inject);
      cfg.modResults.contents = src;
    }
    return cfg;
  });
}

// 3) Register the ReactPackage in MainApplication.kt (idempotent).
function withPackageRegistration(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes('PyaasConveniencePackage')) {
      src = src.replace(
        /PackageList\(this\)\.packages\.apply\s*\{/,
        (m) => m + '\n' + REGISTER_LINE,
      );
      cfg.modResults.contents = src;
    }
    return cfg;
  });
}

// 4) Copy the Kotlin sources into the regenerated android project.
function withKotlinSources(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const pkg = (cfg.android && cfg.android.package) || 'in.pyaasdairy.app';
      const pkgPath = pkg.replace(/\./g, '/');
      const destDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/java',
        pkgPath,
        'nativeconvenience',
      );
      fs.mkdirSync(destDir, { recursive: true });
      for (const f of KOTLIN_FILES) {
        fs.copyFileSync(path.join(SRC_DIR, f), path.join(destDir, f));
      }
      return cfg;
    },
  ]);
}

module.exports = function withNativeConvenience(config) {
  config = withGradleDeps(config);
  config = withPackageRegistration(config);
  config = withKotlinSources(config);
  return config;
};
