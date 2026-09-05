/// Novice Tutor — Android/iOS shell around the web app.
///
/// The app is deliberately thin: one WebView holding novicetutor.com, plus
/// the two things a browser tab cannot do — push notifications while the app
/// is closed, and camera/mic permission handled natively for the call screen.
///
/// Login happens inside the WebView, so the session cookie lives where the
/// call page expects it and there is no second auth path to keep in sync.
library;

import 'package:flutter/material.dart';

import 'shell/web_shell.dart';
import 'shell/push.dart';
import 'shell/incoming_call.dart';

/// Target web application URL.
///
/// Supported build configurations:
///   - Production: `https://novicetutor.com` (default)
///   - Staging:    `https://staging.novicetutor.com`
///   - Android Sim:`http://10.0.2.2:3000`
///   - iOS Sim:    `http://localhost:3000`
///
/// Pass at build/run time via:
///   `flutter build apk --dart-define=APP_URL=https://novicetutor.com`
const appUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://novicetutor.com',
);

/// Validates that [url] is a non-empty, well-formed http or https URI.
/// Fails fast with [ArgumentError] if the environment string is missing or malformed.
Uri validateAppUrl(String url) {
  final trimmed = url.trim();
  if (trimmed.isEmpty) {
    throw ArgumentError.value(
      url,
      'APP_URL',
      'APP_URL cannot be empty. Pass --dart-define=APP_URL=https://novicetutor.com',
    );
  }
  final uri = Uri.tryParse(trimmed);
  if (uri == null ||
      !uri.hasScheme ||
      (!uri.isScheme('https') && !uri.isScheme('http')) ||
      uri.host.isEmpty) {
    throw ArgumentError.value(
      url,
      'APP_URL',
      'APP_URL must be a valid http or https URL (e.g. https://novicetutor.com or http://10.0.2.2:3000)',
    );
  }
  return uri;
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Validate APP_URL fail-fast before initializing services
  final targetOrigin = validateAppUrl(appUrl);

  // Answering a call has to work with no WebView on screen, so the call
  // service needs to know which origin the session cookie belongs to.
  CallService.instance.appOrigin = targetOrigin;

  // Firebase is optional at this stage: without
  // android/app/google-services.json — or ios/Runner/GoogleService-Info.plist —
  // initialization throws, and an app that cannot push is still an app that
  // works. See docs/mobile-app.md § Push.
  await PushService.instance.init();

  runApp(const NoviceTutorApp());
}

class NoviceTutorApp extends StatelessWidget {
  const NoviceTutorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Novice Tutor',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0A84FF), // Phase 8 accent blue
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF090B0F),
      ),
      // Straight to the dashboard, never the marketing site. Someone who
      // installed the app has already been sold to, and "Trusted by 200+
      // families" with a Free Trial button is the single loudest signal that
      // they are looking at a web page. Signed out, /dashboard redirects to
      // /login, so this is also the shortest path to signing in.
      home: const WebShell(initialUrl: '$appUrl/dashboard'),
    );
  }
}
