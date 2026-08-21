#!/usr/bin/env bash
#
# Archive, export and upload the native iOS app to App Store Connect.
#
# This builds `apps/ios-native`. It is NOT `apps/mobile/scripts/ios-release.sh`,
# which builds the Flutter shell that still ships on Android — both projects
# declare com.novicetutor.app and only one of them can be the app on the store.
#
#   ./scripts/release.sh --no-upload   archive and export only
#   ./scripts/release.sh --validate    ...and run Apple's validation
#   ./scripts/release.sh               ...and upload
#
# Needs, for anything past --no-upload:
#   APP_STORE_CONNECT_KEY_ID     the API key's id
#   APP_STORE_CONNECT_ISSUER_ID  the issuer id from App Store Connect
#   ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
#
set -euo pipefail

MODE="upload"
case "${1:-}" in
  --no-upload) MODE="export" ;;
  --validate)  MODE="validate" ;;
  "")          MODE="upload" ;;
  *) echo "usage: $0 [--no-upload|--validate]" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HERE"

PROJECT="NoviceTutor.xcodeproj"
SCHEME="NoviceTutor"
BUILD_DIR="$HERE/build"
ARCHIVE="$BUILD_DIR/NoviceTutor.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"

command -v xcodebuild >/dev/null || { echo "xcodebuild not found — install Xcode" >&2; exit 1; }

VERSION=$(grep -m1 "MARKETING_VERSION" "$PROJECT/project.pbxproj" | sed -E 's/.*= *([^;]+);.*/\1/')

# Never repeats, and says which commit it came from. Apple rejects a build
# number it has already seen, and a rejected upload costs a whole review cycle.
BUILD_NUMBER=$(git rev-list --count HEAD)

echo "▸ Novice Tutor $VERSION ($BUILD_NUMBER)"

if [ ! -f "NoviceTutor/GoogleService-Info.plist" ]; then
  echo "⚠️  No GoogleService-Info.plist — this build cannot receive notifications."
  echo "   Download it from Firebase (project fir-auth-d4f03, bundle com.novicetutor.app)"
  echo "   and put it at apps/ios-native/NoviceTutor/GoogleService-Info.plist."
fi

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "▸ Archiving…"
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  MARKETING_VERSION="$VERSION" \
  -allowProvisioningUpdates

echo "▸ Exporting…"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$HERE/ExportOptions.plist" \
  -allowProvisioningUpdates

IPA=$(find "$EXPORT_DIR" -name "*.ipa" | head -1)
[ -n "$IPA" ] || { echo "No .ipa was produced" >&2; exit 1; }
echo "▸ $IPA"

if [ "$MODE" = "export" ]; then
  echo "✅ Exported. Not uploaded (--no-upload)."
  exit 0
fi

: "${APP_STORE_CONNECT_KEY_ID:?set APP_STORE_CONNECT_KEY_ID}"
: "${APP_STORE_CONNECT_ISSUER_ID:?set APP_STORE_CONNECT_ISSUER_ID}"

KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_${APP_STORE_CONNECT_KEY_ID}.p8"
[ -f "$KEY_PATH" ] || { echo "No API key at $KEY_PATH" >&2; exit 1; }

echo "▸ Validating with Apple…"
xcrun altool --validate-app \
  -f "$IPA" \
  -t ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

if [ "$MODE" = "validate" ]; then
  echo "✅ Validated. Not uploaded (--validate)."
  exit 0
fi

echo "▸ Uploading…"
xcrun altool --upload-app \
  -f "$IPA" \
  -t ios \
  --apiKey "$APP_STORE_CONNECT_KEY_ID" \
  --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"

echo "✅ Uploaded build $BUILD_NUMBER. It appears in App Store Connect after processing."
echo "   Export compliance is already answered in Config/Info.plist."
