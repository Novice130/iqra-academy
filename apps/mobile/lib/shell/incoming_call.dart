/// The incoming call: ringtone, full-screen Accept/Decline over the lock
/// screen, and the two API calls that answer or refuse it.
///
/// Why this is native rather than web: the browser can only ring a phone whose
/// screen is already on the site. A student with the app closed — the normal
/// case — is reached by a data-only FCM message, which Android hands to this
/// code even from a killed process.
///
/// iOS reaches the same screen (CallKit) but not by the same route: a data-only
/// push cannot wake a terminated app there, so the ring needs a PushKit VoIP
/// push, which needs a paid Apple Developer account. Until then the code below
/// is reachable on iOS only while the app is running.
///
/// Accepting and declining both have to work when no WebView is on screen, so
/// the session cookie is read straight out of the WebView's `CookieManager`
/// (which is process-wide, not per-widget) and attached to a plain HTTP
/// request. That keeps one source of truth for the session — the same cookie
/// the site itself set.
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_callkit_incoming/entities/entities.dart';
import 'package:flutter_callkit_incoming/flutter_callkit_incoming.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

class IncomingCall {
  final String callId;
  final String sessionId;
  final String callerName;

  const IncomingCall({
    required this.callId,
    required this.sessionId,
    required this.callerName,
  });

  /// Reads a call out of an FCM data payload, or null if it isn't one.
  static IncomingCall? fromData(Map<String, dynamic> data) {
    if (data['type'] != 'INCOMING_CALL') return null;
    final callId = data['callId'];
    final sessionId = data['sessionId'];
    if (callId is! String || sessionId is! String) return null;
    return IncomingCall(
      callId: callId,
      sessionId: sessionId,
      callerName: data['callerName'] is String ? data['callerName'] as String : 'Your teacher',
    );
  }
}

class CallService {
  CallService._();
  static final CallService instance = CallService._();

  Uri? appOrigin;

  /// Ring the phone. Safe to call from the FCM background isolate.
  Future<void> show(IncomingCall call) async {
    final params = CallKitParams(
      id: call.callId,
      nameCaller: call.callerName,
      appName: 'Novice Tutor',
      handle: 'Quran class',
      type: 1, // video
      textAccept: 'Join',
      textDecline: 'Decline',
      // Roughly the teacher-side ring timeout, so the two agree on when a
      // call became "no answer".
      duration: 45000,
      extra: {'sessionId': call.sessionId, 'callId': call.callId},
      android: const AndroidParams(
        isCustomNotification: true,
        isShowLogo: false,
        ringtonePath: 'system_ringtone_default',
        backgroundColor: '#0A0A0A',
        actionColor: '#10B981',
        // Draws over the lock screen — the whole point.
        isShowFullLockedScreen: true,
      ),
      // iOS draws the system call screen itself, so there is nothing to style;
      // what matters here is the audio session. `configureAudioSession: false`
      // is deliberate: WebRTC inside the WebView configures the session for
      // the call, and letting CallKit reconfigure it underneath is how a call
      // ends up connected with no sound.
      //
      // This only fires at all once VoIP pushes exist. iOS requires the ring
      // to come from a PushKit push — an ordinary FCM message cannot wake a
      // terminated app to report a call, and reporting late is a crash, not a
      // warning. See docs/mobile-app.md § iOS.
      ios: const IOSParams(
        handleType: 'generic',
        supportsVideo: true,
        maximumCallGroups: 1,
        maximumCallsPerCallGroup: 1,
        configureAudioSession: false,
        supportsDTMF: false,
        supportsHolding: false,
        supportsGrouping: false,
        supportsUngrouping: false,
      ),
    );
    await FlutterCallkitIncoming.showCallkitIncoming(params);
  }

  /// The teacher hung up, or another device answered.
  Future<void> end(String callId) async {
    await FlutterCallkitIncoming.endCall(callId);
  }

  Future<void> endAll() async {
    await FlutterCallkitIncoming.endAllCalls();
  }

  Future<void> accept(String callId) => _post('/api/calls/$callId/accept');

  Future<void> decline(String callId) => _post('/api/calls/$callId/decline');

  /// POSTs with the WebView's session cookie attached.
  ///
  /// Best-effort by design: if the student was never signed in, or the phone
  /// has no network at the moment they hit Decline, the teacher's own 45s
  /// timeout still resolves the call as "no answer". Blocking the UI on this
  /// would be worse than the occasional wrong label.
  Future<void> _post(String path) async {
    final origin = appOrigin;
    if (origin == null) return;

    try {
      final url = origin.resolve(path);
      final cookies = await CookieManager.instance().getCookies(url: WebUri.uri(origin));
      if (cookies.isEmpty) {
        debugPrint('No session cookie — cannot $path');
        return;
      }
      final header = cookies.map((c) => '${c.name}=${c.value}').join('; ');

      final client = HttpClient();
      final request = await client.postUrl(url);
      request.headers.set(HttpHeaders.cookieHeader, header);
      request.headers.contentType = ContentType.json;
      request.write(jsonEncode({}));
      final response = await request.close();
      await response.drain<void>();
      client.close();
      debugPrint('$path -> ${response.statusCode}');
    } catch (e) {
      debugPrint('$path failed: $e');
    }
  }
}
