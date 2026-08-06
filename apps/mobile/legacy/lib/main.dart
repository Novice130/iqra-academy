/// Iqra Academy — Quran Learning Mobile App
///
/// Entry point. Initializes Firebase (for push notifications)
/// and runs the app with Riverpod for state management.
///
/// 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
/// Flutter uses Dart (not JavaScript). The `main()` function is the
/// entry point, just like `main()` in C or Java. `runApp()` mounts
/// the root widget to the screen.
///
/// ARCHITECTURE:
/// - Riverpod for state management (similar to React Context + hooks)
/// - GoRouter for navigation (similar to React Router)
/// - Dio for HTTP requests (similar to axios in JavaScript)
/// - flutter_secure_storage for auth tokens (similar to Keychain/Keystore)

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';

void main() async {
  // Ensure Flutter bindings are initialized before async work
  WidgetsFlutterBinding.ensureInitialized();

  // TODO: Initialize Firebase for push notifications
  // await Firebase.initializeApp();

  // ProviderScope is Riverpod's equivalent of React's <Context.Provider>
  // It holds all app-wide state and passes it down the widget tree.
  runApp(
    const ProviderScope(
      child: IqraAcademyApp(),
    ),
  );
}
