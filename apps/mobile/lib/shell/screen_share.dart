/// Screen sharing for the Android app.
///
/// Android's WebView has no `getDisplayMedia`, so the call page inside the app
/// cannot capture the screen however the permissions are set — the API isn't
/// there. Instead the page mints a screen-only LiveKit token (it holds the
/// session cookie; this isolate does not) and hands it here, and this joins
/// the same room a second time to publish the captured screen.
///
/// To everyone else in the class it looks like an ordinary screen share,
/// because to LiveKit it is one: a participant publishing a track whose
/// source is `screenShareVideo`.
///
/// Order matters and Android enforces it:
///   1. the user grants capture (`Helper.requestCapturePermission`)
///   2. a foreground service of type `mediaProjection` is running
///   3. only then can a projection be created
/// Doing 3 before 2 throws on Android 14+.
library;

import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as webrtc;
import 'package:livekit_client/livekit_client.dart';

class ScreenShareService {
  ScreenShareService._();
  static final ScreenShareService instance = ScreenShareService._();

  static const _channel = MethodChannel('novicetutor/screenshare');

  Room? _room;
  EventsListener<RoomEvent>? _events;

  /// Called when the share ends for any reason other than the page asking —
  /// the user hits Stop in the system cast chip, or the room drops us. The
  /// shell uses it to put the button back.
  void Function()? onEnded;

  bool get isSharing => _room != null;

  /// Starts sharing. Returns false — without having changed anything — if the
  /// user declines the capture prompt, which is a completely normal outcome
  /// and must not look like a failure.
  Future<bool> start({
    required String url,
    required String token,
  }) async {
    if (_room != null) return true;

    // The system dialog. Declining here is the common case for a teacher who
    // tapped the button to see what it did.
    final granted = await webrtc.Helper.requestCapturePermission();
    if (!granted) return false;

    await _channel.invokeMethod('startService');

    final room = Room(
      roomOptions: const RoomOptions(
        // This connection publishes and nothing else — the WebView beside it
        // is already receiving the class. Subscribing here would decode every
        // participant's video a second time on the same phone.
        adaptiveStream: false,
        dynacast: true,
      ),
    );

    try {
      await room.connect(url, token);
      await room.localParticipant?.setScreenShareEnabled(true);
    } catch (_) {
      // Leave nothing half-started: a foreground service with no capture
      // behind it is a permanent notification the user can't get rid of.
      try {
        await room.disconnect();
      } catch (_) {}
      try {
        await _channel.invokeMethod('stopService');
      } catch (_) {}
      return false;
    }

    _room = room;

    // The system's own "Stop sharing" ends the projection under us — LiveKit
    // then unpublishes the dead track. Without watching for it the
    // notification would stay up and the page would still show the button
    // lit, with nothing actually being shared.
    _events = room.createListener()
      ..on<LocalTrackUnpublishedEvent>((_) => _teardown())
      ..on<RoomDisconnectedEvent>((_) => _teardown());

    return true;
  }

  Future<void> stop() async {
    await _teardown();
  }

  Future<void> _teardown() async {
    final room = _room;
    _room = null;
    if (room == null) return;

    await _events?.dispose();
    _events = null;

    // Every step here is best-effort and none of them may skip the next: the
    // foreground service must come down even if the room was already gone,
    // or the user is left with a permanent "sharing your screen" notification
    // for a share that ended minutes ago.
    try {
      await room.disconnect();
    } catch (_) {}
    try {
      await room.dispose();
    } catch (_) {}
    try {
      await _channel.invokeMethod('stopService');
    } catch (_) {}

    onEnded?.call();
  }
}
