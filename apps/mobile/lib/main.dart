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

const appUrl = String.fromEnvironment(
  'APP_URL',
  defaultValue: 'https://novicetutor.com',
);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase is optional at this stage: without android/app/google-services.json
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
          seedColor: const Color(0xFF059669), // emerald-600, same as the web app
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
      ),
      home: const WebShell(initialUrl: appUrl),
    );
  }
}
