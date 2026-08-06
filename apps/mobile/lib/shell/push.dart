/// Firebase Cloud Messaging — the one thing the web app cannot do on Android.
///
/// Everything here degrades quietly. Without `android/app/google-services.json`
/// Firebase fails to initialize, `enabled` stays false, and the shell runs as a
/// plain WebView. That keeps the app buildable before the Firebase project
/// exists.
///
/// The token is registered by running `fetch()` *inside* the WebView rather
/// than from Dart: the page already holds the Better Auth session cookie, so
/// the request is authenticated without copying cookies across two HTTP stacks.
library;

import 'dart:async';
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// Background isolate handler — must be a top-level function.
@pragma('vm:entry-point')
Future<void> _onBackgroundMessage(RemoteMessage message) async {
  // Nothing to do: the notification itself is shown by the system. This exists
  // so data-only messages still wake the app.
}

class PushService {
  PushService._();
  static final PushService instance = PushService._();

  bool enabled = false;
  String? _token;
  String? _registeredToken;

  final _deepLinkController = StreamController<String>.broadcast();
  String? _pendingPath;

  /// Paths to open in the WebView, from a tapped notification.
  Stream<String> get deepLinks => _deepLinkController.stream;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
    } catch (e) {
      debugPrint('Push disabled (no Firebase config): $e');
      return;
    }

    enabled = true;
    final messaging = FirebaseMessaging.instance;

    FirebaseMessaging.onBackgroundMessage(_onBackgroundMessage);

    await messaging.requestPermission(alert: true, badge: true, sound: true);

    try {
      _token = await messaging.getToken();
    } catch (e) {
      debugPrint('FCM token unavailable: $e');
    }
    messaging.onTokenRefresh.listen((t) {
      _token = t;
      _registeredToken = null; // force re-registration on next page load
    });

    // Tapped while the app was terminated.
    final initial = await messaging.getInitialMessage();
    if (initial != null) _pendingPath = _pathOf(initial);

    // Tapped while the app was in the background.
    FirebaseMessaging.onMessageOpenedApp.listen((m) {
      final path = _pathOf(m);
      if (path != null) _deepLinkController.add(path);
    });
  }

  String? _pathOf(RemoteMessage m) {
    final path = m.data['path'];
    if (path is String && path.startsWith('/')) return path;
    final sessionId = m.data['sessionId'];
    if (sessionId is String && sessionId.isNotEmpty) {
      return '/dashboard/session/$sessionId';
    }
    return null;
  }

  /// Called after each page load. Registers the device against the logged-in
  /// user; a 401 simply means nobody is signed in yet, and the next load will
  /// try again.
  Future<void> syncToken(InAppWebViewController controller) async {
    final token = _token;
    if (!enabled || token == null || token == _registeredToken) return;

    final body = jsonEncode({'token': token, 'platform': 'android'});
    try {
      final result = await controller.evaluateJavascript(source: '''
        (async () => {
          try {
            const res = await fetch('/api/devices', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify($body),
            });
            return res.status;
          } catch (e) {
            return 0;
          }
        })()
      ''');
      final status = int.tryParse('$result') ?? 0;
      if (status >= 200 && status < 300) {
        _registeredToken = token;
      }
    } catch (e) {
      debugPrint('Device registration failed: $e');
    }
  }

  /// Drains a notification that arrived before the WebView was listening.
  String? takePendingPath() {
    final p = _pendingPath;
    _pendingPath = null;
    return p;
  }
}
