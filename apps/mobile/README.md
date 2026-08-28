# Novice Tutor — Unified Mobile App (Flutter)

Cross-platform mobile application for Novice Tutor on **iOS** and **Android**, built with Flutter.

## Architecture

The mobile app provides a unified, consistent theme (Emerald `#059669` + Obsidian `#0A0A0A`) across both iOS and Android platforms with complete feature parity with the web platform:

- **Unified Theme & UI**: Shared Material 3 dark styling, custom app chrome with native title bar, bottom tab bar, profile drawer, and fullscreen video classrooms.
- **Native Video Classroom Integration**: Full LiveKit WebRTC video meetings, media permission handling, and WebGL virtual background shaders.
- **Push Notifications & Ringing**: Background incoming call handling via CallKit / full-screen ringing overlay and Firebase Cloud Messaging (FCM).
- **Native Screen Sharing Bridge**: Screen capture and publishing via `flutter_webrtc` / `livekit_client`.
- **Google Sign-In Bridge**: Native account selection and cookie synchronization.
- **Picture-in-Picture (PiP)**: Android and iOS background meeting support.

## Running the App

### Android
```bash
flutter run -d android
```

### iOS
```bash
flutter run -d ios
```

## Building Releases

### Android APK / App Bundle
```bash
flutter build apk --release
flutter build appbundle --release
```

### iOS IPA
```bash
./scripts/ios-release.sh --no-upload   # Build .ipa
./scripts/ios-release.sh               # Build and upload to TestFlight / App Store Connect
```
