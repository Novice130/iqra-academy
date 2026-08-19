#!/usr/bin/env bash
#
# Build the iOS app and send it to TestFlight.
#
# Everything Apple needs that a machine can decide, decided here; everything
# that needs a human — enrolling, creating the app record, answering the
# privacy questions, choosing testers — is in docs/ios-release.md.
#
#   ./scripts/ios-release.sh              build, then upload if keys are set
#   ./scripts/ios-release.sh --no-upload  build the .ipa and stop
#   ./scripts/ios-release.sh --validate   build and validate, but do not ship
#
# Environment (see docs/ios-release.md):
#   APP_STORE_CONNECT_KEY_ID      e.g. 2X9ABC3DEF
#   APP_STORE_CONNECT_ISSUER_ID   the UUID on the same App Store Connect page
#   GOOGLE_IOS_CLIENT_ID          optional; without it the shell does not
#                                 intercept Google sign-in, by design
#   BUILD_NUMBER                  optional; defaults to the commit count
#
set -euo pipefail

MODE="upload"
case "${1:-}" in
  --no-upload) MODE="build" ;;
  --validate)  MODE="validate" ;;
  "")          ;;
  *) echo "Unknown argument: $1" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
MOBILE_DIR="$PWD"

# Flutter lives outside PATH on this Mac (see docs/mobile-app.md).
if [ -d "$HOME/dev-tools/flutter/bin" ]; then
  export PATH="$HOME/dev-tools/flutter/bin:$PATH"
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1 — $2" >&2; exit 1; }
}
need flutter "install it, or fix PATH (see docs/mobile-app.md)"
need xcodebuild "install Xcode from the App Store, then run xcode-select --install"
need pod "sudo gem install cocoapods"

# The version a human reads, from pubspec.yaml — "1.0.0+1" → "1.0.0".
VERSION_NAME="$(awk -F'[ +]' '/^version:/ {print $2; exit}' pubspec.yaml)"
# The build number Apple counts. It must rise on every upload and may never
# repeat within a version, so it is derived rather than remembered: the commit
# count only ever goes up, and it points at the exact source of any build.
BUILD_NUMBER="${BUILD_NUMBER:-$(git rev-list --count HEAD)}"

echo "▸ Novice Tutor $VERSION_NAME (build $BUILD_NUMBER)"

DART_DEFINES=()
if [ -n "${GOOGLE_IOS_CLIENT_ID:-}" ]; then
  DART_DEFINES+=(--dart-define="GOOGLE_IOS_CLIENT_ID=$GOOGLE_IOS_CLIENT_ID")
else
  echo "  · no GOOGLE_IOS_CLIENT_ID — Google sign-in stays disabled in this build"
fi

# GoogleService-Info.plist is gitignored and is what turns push on. Its absence
# is a warning, not an error: a build without push is still worth testing.
if [ ! -f ios/Runner/GoogleService-Info.plist ]; then
  echo "  · no ios/Runner/GoogleService-Info.plist — this build cannot receive push"
fi

echo "▸ flutter pub get"
flutter pub get >/dev/null

echo "▸ flutter build ipa"
flutter build ipa \
  --release \
  --build-name="$VERSION_NAME" \
  --build-number="$BUILD_NUMBER" \
  --export-options-plist=ios/ExportOptions.plist \
  ${DART_DEFINES[@]+"${DART_DEFINES[@]}"}

IPA="$(ls -t "$MOBILE_DIR"/build/ios/ipa/*.ipa 2>/dev/null | head -1 || true)"
if [ -z "$IPA" ]; then
  echo "Build finished but produced no .ipa. Check the log above." >&2
  exit 1
fi
echo "▸ built $IPA ($(du -h "$IPA" | cut -f1))"

if [ "$MODE" = "build" ]; then
  echo "Stopping before upload, as asked. Drag the .ipa into Transporter to ship it."
  exit 0
fi

if [ -z "${APP_STORE_CONNECT_KEY_ID:-}" ] || [ -z "${APP_STORE_CONNECT_ISSUER_ID:-}" ]; then
  cat >&2 <<'MSG'

No App Store Connect API key in the environment, so the upload is skipped.
Either set APP_STORE_CONNECT_KEY_ID and APP_STORE_CONNECT_ISSUER_ID (see
docs/ios-release.md), or open Transporter and drag the .ipa in.
MSG
  exit 0
fi

# altool only looks for the key in these four places, by name.
KEY_FILE="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
if [ ! -f "$KEY_FILE" ]; then
  echo "Expected the key at $KEY_FILE — see docs/ios-release.md." >&2
  exit 1
fi

echo "▸ validating with App Store Connect"
xcrun altool --validate-app \
  --type ios \
  --file "$IPA" \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

if [ "$MODE" = "validate" ]; then
  echo "Validated. Not uploading, as asked."
  exit 0
fi

echo "▸ uploading"
xcrun altool --upload-app \
  --type ios \
  --file "$IPA" \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

cat <<MSG

Uploaded build $BUILD_NUMBER.

Apple processes it for 5–30 minutes before it appears in TestFlight, and emails
if it is rejected outright. Export compliance is already answered in Info.plist
(ITSAppUsesNonExemptEncryption = false), so there is nothing to click for it.
MSG
