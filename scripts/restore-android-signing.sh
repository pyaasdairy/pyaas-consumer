#!/bin/bash
# Re-applies the PRODUCTION release-signing setup after `expo prebuild -p android`
# regenerates the (gitignored) android/ folder. Run from the repo root.
#
# What it restores:
#   1. android/local.properties        — sdk.dir (gradle can't find the SDK without it)
#   2. android/app/pyaas-release.keystore — the upload key (same cert as Play v1-28,
#      SHA256 37:99:00:1C:6D:1F:A6:0A:BB:77:99:C3:98:B8:F9:17:A9:8A:4C:AB:31:4F:31:F2:C3:35:C2:9C:F5:4D:DA:59)
#   3. signingConfigs.release in android/app/build.gradle, reading PYAAS_UPLOAD_*
#      from ~/.gradle/gradle.properties (credentials NEVER live in this repo)
#
# Build afterwards with JDK 17 (the Android Studio JBR 25 breaks AGP's CMake step):
#   JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
#     android/gradlew -p android :app:bundleRelease
set -euo pipefail
cd "$(dirname "$0")/.."

KEYSTORE_SRC="/Users/Kush/pyaas-saathi/Parag-consumer/pyaas-release.keystore"
GRADLE_FILE="android/app/build.gradle"

printf 'sdk.dir=%s\n' "${ANDROID_HOME:-$HOME/Library/Android/sdk}" > android/local.properties
cp "$KEYSTORE_SRC" android/app/pyaas-release.keystore

if grep -q "PYAAS_UPLOAD_STORE_FILE" "$GRADLE_FILE"; then
  echo "signing config already present in $GRADLE_FILE"
  exit 0
fi

python3 - "$GRADLE_FILE" <<'PY'
import sys
p = sys.argv[1]
s = open(p).read()
s = s.replace(
    """            keyPassword 'android'
        }
    }""",
    """            keyPassword 'android'
        }
        // PRODUCTION upload key (cert of Play v1-28). Credentials come from the
        // machine-global ~/.gradle/gradle.properties, never from this repo.
        release {
            if (findProperty('PYAAS_UPLOAD_STORE_FILE')) {
                storeFile file(PYAAS_UPLOAD_STORE_FILE)
                storePassword PYAAS_UPLOAD_STORE_PASSWORD
                keyAlias PYAAS_UPLOAD_KEY_ALIAS
                keyPassword PYAAS_UPLOAD_KEY_PASSWORD
            }
        }
    }""",
    1,
)
s = s.replace(
    """            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug""",
    """            signingConfig findProperty('PYAAS_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug""",
    1,
)
open(p, "w").write(s)
print("signing config patched into", p)
PY
echo "done — release builds now sign with the upload key"
