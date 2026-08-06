/// Google sign-in for the WebView shell.
///
/// Google refuses to render its OAuth pages inside an embedded WebView — it
/// answers `disallowed_useragent` — because the hosting app could read
/// everything the user types. So the web page's "Continue with Google" button
/// is intercepted and this runs instead: the native account picker, which
/// hands back an ID token.
///
/// The token is then posted to Better Auth **from inside the page** rather
/// than from Dart. That matters: the `Set-Cookie` in the reply lands in the
/// WebView's own cookie jar, which is the session the rest of the app reads.
/// Signing in over Dart's HTTP stack would authenticate nobody.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// The **web** OAuth client, not the Android one. The Android client exists so
/// Google can verify the app's signature; the ID token has to be addressed to
/// the audience the server will check it against, which is the web client.
const googleServerClientId = String.fromEnvironment(
  'GOOGLE_SERVER_CLIENT_ID',
  defaultValue:
      '854951835011-mo0grfu4gbq54acc77laj6cp3e8a52b2.apps.googleusercontent.com',
);

enum GoogleSignInOutcome { success, cancelled, failed }

class GoogleSignInBridge {
  GoogleSignInBridge._();
  static final GoogleSignInBridge instance = GoogleSignInBridge._();

  final GoogleSignIn _google = GoogleSignIn(
    serverClientId: googleServerClientId,
    scopes: const ['email', 'profile'],
  );

  /// True when a URL is Google's OAuth flow — the thing a WebView must not
  /// try to render.
  static bool isGoogleAuthUrl(Uri? url) {
    if (url == null) return false;
    final host = url.host;
    if (host != 'accounts.google.com' && !host.endsWith('.accounts.google.com')) {
      return false;
    }
    return url.path.contains('/o/oauth2/') ||
        url.path.contains('/signin/oauth') ||
        url.path.contains('/AccountChooser');
  }

  Future<GoogleSignInOutcome> signIn(InAppWebViewController controller) async {
    try {
      // Sign out first so the account picker always appears. Otherwise the
      // second person to use a shared phone is silently signed in as the
      // first, which in a family with several students is the normal case.
      await _google.signOut();

      final account = await _google.signIn();
      if (account == null) return GoogleSignInOutcome.cancelled;

      final auth = await account.authentication;
      final idToken = auth.idToken;
      if (idToken == null) {
        debugPrint('Google sign-in returned no ID token');
        return GoogleSignInOutcome.failed;
      }

      final result = await controller.evaluateJavascript(source: '''
        (async () => {
          try {
            const res = await fetch('/api/auth/sign-in/social', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                provider: 'google',
                idToken: { token: ${_jsString(idToken)} },
              }),
            });
            return res.status;
          } catch (e) {
            return 0;
          }
        })()
      ''');

      final status = int.tryParse('$result'.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
      if (status >= 200 && status < 300) return GoogleSignInOutcome.success;

      debugPrint('Better Auth rejected the Google token: $status');
      return GoogleSignInOutcome.failed;
    } catch (e) {
      debugPrint('Google sign-in failed: $e');
      return GoogleSignInOutcome.failed;
    }
  }

  /// JSON-encodes a string for safe interpolation into evaluated JavaScript.
  static String _jsString(String value) {
    final escaped = value
        .replaceAll(r'\', r'\\')
        .replaceAll('"', r'\"')
        .replaceAll('\n', r'\n');
    return '"$escaped"';
  }
}
