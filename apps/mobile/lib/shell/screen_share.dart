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

/// Why a share didn't start. The page turns this into something a teacher can
/// act on — a button that silently refuses to light up is the worst outcome,
/// and "you declined the prompt" and "your phone wouldn't allow capture" call
/// for completely different responses.
enum ScreenShareFailure {
  /// The teacher said no to Android's capture prompt. Not an error.
  declined,

  /// Android refused the foreground service the projection depends on.
  serviceBlocked,

  /// Token, network, or LiveKit refused the connection.
  connectFailed,
}

class ScreenShareStartResult {
  const ScreenShareStartResult.ok()
      : started = true,
        failure = null;
  const ScreenShareStartResult.failed(this.failure) : started = false;

  final bool started;
  final ScreenShareFailure? failure;

  /// The shape the page reads. Older builds of the shell answered a bare bool,
  /// so the web side accepts both.
  Map<String, dynamic> toJson() => {
        'ok': started,
        if (failure != null) 'reason': failure!.name,
      };
}

class ScreenShareService {
  ScreenShareService._() {
    // "Stop sharing" on the ongoing notification. Native can end the service
    // but not the room, so the request comes back here to be done properly.
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'stopRequested') await stop();
      return null;
    });
  }
  static final ScreenShareService instance = ScreenShareService._();

  static const _channel = MethodChannel('novicetutor/screenshare');

  Room? _room;
  EventsListener<RoomEvent>? _events;

  /// Called when the share ends for any reason other than the page asking —
  /// the user hits Stop in the system cast chip, or the room drops us. The
  /// shell uses it to put the button back.
  void Function()? onEnded;

  bool get isSharing => _room != null;

  /// Starts sharing.
  ///
  /// Declining the capture prompt is a completely normal outcome and comes
  /// back as [ScreenShareFailure.declined], not as an error.
  Future<ScreenShareStartResult> start({
    required String url,
    required String token,
  }) async {
    // Not "already sharing, nothing to do". A projection can die under us
    // without anything telling us — the teacher stops it from the system's own
    // cast chip, and flutter_webrtc's capturer has no callback for that, so the
    // track stays published and the class watches a frozen screen. Tapping
    // Present again is then the only way out, and it has to actually restart.
    if (_room != null) await _teardown(notify: false);

    // The system dialog. Declining here is the common case for a teacher who
    // tapped the button to see what it did.
    //
    // `fullScreenOnly` removes Android 14's "Share one app" option from that
    // dialog. It is the default choice there, and a teacher who takes it
    // shares only the Novice Tutor window — so the class watches the call
    // screen they are already in, and nothing the teacher opens afterwards.
    // Presenting means the whole screen; the point is showing the students
    // something that isn't this app.
    final granted = await webrtc.Helper.requestCapturePermission(fullScreenOnly: true);
    if (!granted) return const ScreenShareStartResult.failed(ScreenShareFailure.declined);

    // Waits for the service to actually be in the foreground, not merely for
    // the request to be queued: the projection below is illegal until it is.
    final serviceUp = await _channel.invokeMethod<bool>('startService') ?? false;
    if (!serviceUp) {
      return const ScreenShareStartResult.failed(ScreenShareFailure.serviceBlocked);
    }

    final room = Room(
      roomOptions: const RoomOptions(
        // This connection publishes and nothing else — the WebView beside it
        // is already receiving the class. Subscribing here would decode every
        // participant's video a second time on the same phone.
        adaptiveStream: false,
        dynacast: true,
        // Spelled out rather than left to the default, because this is the
        // knob that decides whether a student can read what is on the screen:
        // a shared screen is mostly still text, so resolution is worth far
        // more than frame rate. 15fps is what Meet and Zoom present at too.
        defaultScreenShareCaptureOptions: ScreenShareCaptureOptions(
          params: VideoParametersPresets.screenShareH1080FPS15,
        ),
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
      return const ScreenShareStartResult.failed(ScreenShareFailure.connectFailed);
    }

    _room = room;

    // The system's own "Stop sharing" ends the projection under us — LiveKit
    // then unpublishes the dead track. Without watching for it the
    // notification would stay up and the page would still show the button
    // lit, with nothing actually being shared.
    _events = room.createListener()
      ..on<LocalTrackUnpublishedEvent>((_) => _teardown())
      ..on<RoomDisconnectedEvent>((_) => _teardown());

    return const ScreenShareStartResult.ok();
  }

  Future<void> stop() async {
    await _teardown();
  }

  /// [notify] is false only when a restart is about to put a new share in
  /// place: telling the page the share ended, milliseconds before it starts
  /// again, leaves the button dark over a share that is genuinely running.
  Future<void> _teardown({bool notify = true}) async {
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

    if (notify) onEnded?.call();
  }
}
