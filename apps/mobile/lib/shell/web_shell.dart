/// The WebView that is the app.
///
/// Responsibilities that genuinely belong on the native side:
/// - camera/mic permission for the LiveKit call page
/// - hardware back button = browser back
/// - pull to refresh, and a usable screen when the phone is offline
/// - keeping off-site links (Google OAuth, Stripe) out of the WebView where
///   they would be refused or would strand the user
/// - handing a push-delivered deep link to the already-loaded page
library;

import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import 'google_sign_in_bridge.dart';
import 'incoming_call.dart';
import 'push.dart';
import 'screen_share.dart';

/// What the shell tells the server, and — for the `screenshare` marker — what
/// the call page keys its Present button off
/// (`apps/web/src/components/video/nativeScreenShare.ts`).
///
/// The marker is claimed per platform, not per build, because iOS genuinely
/// cannot do it: WKWebView has no `getDisplayMedia` and iOS has no
/// MediaProjection, so presenting needs a Broadcast Upload Extension talking
/// over an App Group — a paid capability that does not exist yet. Claiming it
/// on iOS would put a button on screen that does nothing, which is exactly
/// what the marker was introduced to prevent.
///
/// What the shell tells the server, enabling native screen share bridge.
String get shellUserAgent => Platform.isAndroid
    ? 'NoviceTutorApp/1.2 (screenshare)'
    : 'NoviceTutorApp/1.2';

/// Screen sharing bridge supported on Android only until iOS ReplayKit extension is built.
bool get nativeScreenShareSupported => Platform.isAndroid;

class WebShell extends StatefulWidget {
  final String initialUrl;
  const WebShell({super.key, required this.initialUrl});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> with WidgetsBindingObserver {
  InAppWebViewController? _controller;
  PullToRefreshController? _refresh;
  bool _offline = false;
  bool _firstLoadDone = false;
  bool _signingIn = false;
  bool _pipAllowed = false;

  /// True when Android would ring but not wake the screen. See
  /// CallService.canUseFullScreen.
  bool _needsFullScreen = false;
  bool _fullScreenDismissed = false;

  /// Talks to MainActivity, which is the only thing that can enter Android's
  /// picture-in-picture mode. There is no iOS counterpart: iOS only gives
  /// picture-in-picture to AVPlayer and to WebRTC through a native video view,
  /// neither of which a WKWebView-hosted call page is.
  static const _pipChannel = MethodChannel('novicetutor/pip');
  static const _deepLinkChannel = MethodChannel('novicetutor/deeplink');
  StreamSubscription<String>? _deepLinks;
  String? _pendingDeepLink;

  /// Watches for a load that starts and then goes nowhere.
  ///
  /// A failed load calls onReceivedError and lands on the offline screen. A
  /// *stalled* one calls nothing at all — the connection is opened and never
  /// answers — and the shell would sit on its spinner indefinitely with no
  /// Retry and no explanation. Seen on the iOS simulator against a live site
  /// that Safari loaded fine seconds later, so it is not hypothetical.
  Timer? _stall;
  static const _stallTimeout = Duration(seconds: 20);

  late final Uri _appOrigin = Uri.parse(widget.initialUrl);

  @override
  void initState() {
    super.initState();

    try {
      _refresh = PullToRefreshController(
        settings: PullToRefreshSettings(color: const Color(0xFF0A84FF)),
        onRefresh: () => _controller?.reload(),
      );
    } catch (_) {
      // In headless unit tests where InAppWebViewPlatform is not registered
      _refresh = null;
    }

    // A notification tapped while the app was closed is already waiting here.
    _deepLinks = PushService.instance.deepLinks.listen(_openPath);

    // Consume launch and runtime verified app links / universal links
    _initDeepLinks();

    WidgetsBinding.instance.addObserver(this);
    _checkFullScreenPermission();
  }

  Future<void> _initDeepLinks() async {
    _deepLinkChannel.setMethodCallHandler((call) async {
      if (call.method == 'onDeepLink' && call.arguments is String) {
        _openPath(call.arguments as String);
      }
    });

    try {
      final initial = await _deepLinkChannel.invokeMethod<String>('getInitialUrl');
      if (initial != null && initial.isNotEmpty) {
        _openPath(initial);
      }
    } catch (_) {
      // Ignore in tests or if channel is unavailable
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Granting happens in Settings, in another app. Re-checking on the way
    // back is what makes the prompt disappear once it has been dealt with,
    // instead of sitting there accusing the user of not having done it.
    if (state == AppLifecycleState.resumed) _checkFullScreenPermission();
  }

  Future<void> _checkFullScreenPermission() async {
    final allowed = await CallService.instance.canUseFullScreen();
    if (!mounted || allowed == !_needsFullScreen) return;
    setState(() => _needsFullScreen = !allowed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stall?.cancel();
    _deepLinks?.cancel();
    ScreenShareService.instance.onEnded = null;
    ScreenShareService.instance.stop();
    super.dispose();
  }

  void _startStallTimer() {
    _stall?.cancel();
    _stall = Timer(_stallTimeout, () {
      // Only while the page has never appeared. A stall after the app is up
      // is the page's own problem to show, not a reason to replace a working
      // screen — mid-class especially.
      if (!mounted || _firstLoadDone) return;
      setState(() => _offline = true);
    });
  }

  void _openPath(String pathOrUrl) {
    if (pathOrUrl.isEmpty) return;
    try {
      final parsed = Uri.parse(pathOrUrl);
      final Uri targetUri;
      if (parsed.hasScheme) {
        if (!_isInternal(parsed)) {
          // Disallow navigation to foreign origins inside the web shell
          return;
        }
        targetUri = parsed;
      } else {
        targetUri = _appOrigin.resolve(pathOrUrl);
      }
      if (_controller == null) {
        _pendingDeepLink = targetUri.toString();
        return;
      }
      _controller?.loadUrl(urlRequest: URLRequest(url: WebUri.uri(targetUri)));
    } catch (_) {
      // Malformed URI format, ignore
    }
  }

  /// Holds the OS camera and microphone permissions, asking once if we don't
  /// have them yet. Both platforms need this — on iOS the strings shown in the
  /// prompt come from `NSCameraUsageDescription` /
  /// `NSMicrophoneUsageDescription` in Info.plist, and an app that reaches
  /// AVCaptureDevice without them is killed rather than denied.
  ///
  /// Asked lazily rather than at launch: a Quran app demanding the camera
  /// before showing anything reads as spyware, and a student who only ever
  /// listens never needs to be asked at all. The cost is that the very first
  /// tap on the camera button raises the OS dialog — acceptable, and the same
  /// thing every browser does.
  /// Guards against stacking dialogs: the call page asks for camera and mic as
  /// two separate WebView permission requests, so a single denial otherwise
  /// puts two identical sheets on screen.
  bool _permissionDialogOpen = false;

  Future<bool> _ensureMediaPermissions() async {
    final statuses = await [Permission.camera, Permission.microphone].request();
    if (statuses.values.every((s) => s.isGranted)) return true;

    // Denied — and on Android a second denial makes it *permanently* denied,
    // after which `request()` returns immediately without ever showing the OS
    // prompt again. There is nothing more this app can ask for; the only way
    // back is the system settings page. Without this the camera button simply
    // stopped working with no explanation, which is what it looked like from
    // the outside: "the app is broken".
    final permanent = statuses.values.any((s) => s.isPermanentlyDenied);
    if (permanent) await _showPermissionHelp();
    return false;
  }

  Future<void> _showPermissionHelp() async {
    if (!mounted || _permissionDialogOpen) return;
    _permissionDialogOpen = true;
    try {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Camera and microphone are blocked'),
          content: const Text(
            'Novice Tutor needs camera and microphone access so you can be seen '
            'and heard in a class. Turn them on in Settings, then come back and '
            'try again.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('Not now'),
            ),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                // Sends them to this app's own permission page. The webview is
                // left as it is — coming back re-runs getUserMedia on the next
                // tap, by which point the grant is live.
                openAppSettings();
              },
              child: const Text('Open Settings'),
            ),
          ],
        ),
      );
    } finally {
      _permissionDialogOpen = false;
    }
  }

  /// The call page's Share button, which inside the app cannot use
  /// `getDisplayMedia` — Android's WebView doesn't have it. The page mints a
  /// screen-only LiveKit token (it has the session cookie) and hands it over;
  /// capture and publishing happen natively. See screen_share.dart.
  void _registerScreenShareHandlers(InAppWebViewController c) {
    // Not registered on iOS. The user agent there omits the `screenshare`
    // marker, so the page never offers the button and never calls these.
    if (!nativeScreenShareSupported) return;

    ScreenShareService.instance.onEnded = () {
      // Stopping from the system cast chip has to put the page's button back.
      _controller?.evaluateJavascript(
        source: 'window.__ntScreenShareEnded && window.__ntScreenShareEnded();',
      );
    };

    c.addJavaScriptHandler(
      handlerName: 'startScreenShare',
      callback: (args) async {
        final arg = args.isNotEmpty ? args.first : null;
        if (arg is! Map) return const {'ok': false};
        final url = arg['url'];
        final token = arg['token'];
        if (url is! String || token is! String) return const {'ok': false};
        final result = await ScreenShareService.instance.start(url: url, token: token);
        return result.toJson();
      },
    );

    c.addJavaScriptHandler(
      handlerName: 'stopScreenShare',
      callback: (_) async {
        await ScreenShareService.instance.stop();
        return true;
      },
    );
  }

  void _showGoogleUnavailable() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          "Google sign-in isn't available in the app yet. Please sign in with your email and password.",
        ),
        duration: Duration(seconds: 5),
      ),
    );
  }

  Future<void> _handleGoogleSignIn() async {
    final controller = _controller;
    if (controller == null || _signingIn) return;

    setState(() => _signingIn = true);
    final outcome = await GoogleSignInBridge.instance.signIn(controller);
    if (!mounted) return;
    setState(() => _signingIn = false);

    switch (outcome) {
      case GoogleSignInOutcome.success:
        // The session cookie now exists in the WebView, because the sign-in
        // request was made by the page itself.
        _openPath('/dashboard');
        break;
      case GoogleSignInOutcome.cancelled:
        break;
      case GoogleSignInOutcome.failed:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Google sign-in didn't work. Try your email and password."),
          ),
        );
        break;
    }
  }

  /// Picture-in-picture is only wanted during a class. Leaving the app while
  /// reading the dashboard should just leave the app.
  void _updatePipEligibility(WebUri? url) {
    if (!Platform.isAndroid) return;
    final inCall = url != null && url.path.contains('/dashboard/session/');
    if (inCall == _pipAllowed) return;
    _pipAllowed = inCall;
    // Navigating out of the call ends the share with it. The native
    // connection is a separate participant from the WebView's — nothing else
    // would ever close it, and a teacher who left the class would keep
    // broadcasting their phone to a room they think they've left.
    if (!inCall) ScreenShareService.instance.stop();
    _pipChannel.invokeMethod('setPipAllowed', {'allowed': inCall}).catchError((_) {
      // Older Android, or the channel isn't up yet — PiP is a nicety.
      return null;
    });
  }

  /// True for URLs the WebView should keep. Everything else goes to the
  /// system browser — notably accounts.google.com, which refuses to render
  /// OAuth inside a WebView at all ("disallowed_useragent").
  bool _isInternal(Uri? url) => isInternalUrl(url, _appOrigin);

  Future<void> _openExternally(Uri url) async {
    await launchUrl(url, mode: LaunchMode.externalApplication);
  }

  static bool _isAuthPath(String path) =>
      path == '/login' || path == '/register' || path.startsWith('/reset-password');

  /// Drops the login page out of the WebView's history once the user is past
  /// it.
  ///
  /// Signing in navigates with `window.location.href`, so `/login` stays on
  /// the stack. Pressing Back then put the login form back on screen, which
  /// is indistinguishable from having been signed out — and with Back being
  /// a hardware button, it looked like the app logging people out by itself.
  ///
  /// Clearing history means Back from the dashboard leaves the app, which is
  /// what every other Android app does from its home screen.
  Future<void> _dropAuthHistory(InAppWebViewController c, WebUri? url) async {
    if (url == null || _isAuthPath(url.path)) return;

    final history = await c.getCopyBackForwardList();
    final entries = history?.list ?? [];
    final hasAuthBehind = entries.any((e) {
      final p = e.url?.path;
      return p != null && _isAuthPath(p);
    });
    if (hasAuthBehind) await c.clearHistory();
  }

  Future<bool> _handleBack() async {
    final c = _controller;
    if (c != null && await c.canGoBack()) {
      await c.goBack();
      return false; // handled — do not pop the route / close the app
    }
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        if (await _handleBack()) SystemNavigator.pop();
      },
      child: Scaffold(
        backgroundColor: const Color(0xFF090B0F),
        body: SafeArea(
          child: Column(
            children: [
              if (_needsFullScreen && !_fullScreenDismissed) _fullScreenPrompt(),
              Expanded(child: _offline ? _offlineView() : _webView()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _webView() {
    return Stack(
      children: [
        InAppWebView(
          initialUrlRequest: URLRequest(url: WebUri(widget.initialUrl)),
          pullToRefreshController: _refresh,
          initialSettings: InAppWebViewSettings(
            javaScriptEnabled: true,
            domStorageEnabled: true,
            thirdPartyCookiesEnabled: true,
            // The call page publishes camera and mic without a tap first.
            mediaPlaybackRequiresUserGesture: false,
            // iOS-only, and not cosmetic: without it WKWebView hands every
            // video to the native fullscreen player, so the call page's own
            // grid of participants is replaced by one tile at a time.
            allowsInlineMediaPlayback: true,
            // iOS-only. WKWebView keeps cookies in its own per-webview store
            // unless told to use the shared one, and the shared one is what
            // answering a call reads when no WebView exists at all
            // (incoming_call.dart goes through CookieManager). Without this
            // the session is invisible to Accept/Decline on iOS.
            sharedCookiesEnabled: true,
            useShouldOverrideUrlLoading: true,
            supportZoom: false,
            transparentBackground: true,
            // Identifies the shell in server logs without breaking the UA
            // sniffing the web app already does for mobile layouts.
            //
            // The `screenshare` marker is a capability flag, not decoration:
            // the call page uses it to decide whether to offer the Share
            // button. Every build of the app has a JS bridge, so the bridge
            // existing proves nothing — an app installed before screen
            // sharing shipped would show the button and do nothing when it
            // was tapped. iOS never claims it — see shellUserAgent.
            applicationNameForUserAgent: shellUserAgent,
          ),
          onWebViewCreated: (c) {
            _controller = c;
            _registerScreenShareHandlers(c);
            final pending = _pendingDeepLink;
            if (pending != null) {
              _pendingDeepLink = null;
              c.loadUrl(urlRequest: URLRequest(url: WebUri(pending)));
            }
          },
          onLoadStart: (controller, url) => _startStallTimer(),
          // Any progress at all means the connection is alive, so the stall
          // timer starts again from here rather than counting the whole load.
          onProgressChanged: (controller, progress) {
            if (progress < 100) _startStallTimer();
          },
          onPermissionRequest: (controller, request) async {
            // Two separate gates, and this is only the second one. The WebView
            // asks here; Android asks the user. Granting here without holding
            // the OS permission makes getUserMedia fail silently — which is
            // exactly what "students can't turn their camera on" looked like.
            final granted = await _ensureMediaPermissions();
            return PermissionResponse(
              resources: request.resources,
              action: granted
                  ? PermissionResponseAction.GRANT
                  : PermissionResponseAction.DENY,
            );
          },
          shouldOverrideUrlLoading: (controller, action) async {
            final url = action.request.url;

            // Google's OAuth pages refuse to load in a WebView at all. Catch
            // the navigation and run the native account picker instead, so
            // "Continue with Google" works rather than dead-ending.
            if (GoogleSignInBridge.isGoogleAuthUrl(url)) {
              if (GoogleSignInBridge.isAvailable) {
                _handleGoogleSignIn();
              } else {
                // iOS with no OAuth client configured yet. Signing in through
                // the system browser is not an option either: the cookie would
                // land in Safari, not in this WebView, so the user would still
                // be signed out here. Say so instead of loading Google's
                // `disallowed_useragent` page.
                _showGoogleUnavailable();
              }
              return NavigationActionPolicy.CANCEL;
            }

            if (_isInternal(url)) return NavigationActionPolicy.ALLOW;
            if (url != null) await _openExternally(url);
            return NavigationActionPolicy.CANCEL;
          },
          onCreateWindow: (controller, req) async {
            // target=_blank — send it out rather than opening a blank WebView.
            final url = req.request.url;
            if (url != null) await _openExternally(url);
            return false;
          },
          onUpdateVisitedHistory: (controller, url, _) {
            _updatePipEligibility(url);
          },
          onLoadStop: (controller, url) async {
            _stall?.cancel();
            _refresh?.endRefreshing();
            _updatePipEligibility(url);
            await _dropAuthHistory(controller, url);
            if (!_firstLoadDone) {
              setState(() => _firstLoadDone = true);
              // A notification tapped while the app was terminated.
              final pending = PushService.instance.takePendingPath();
              if (pending != null) _openPath(pending);
            }
            // Once a session cookie exists, the FCM token has somewhere to go.
            await PushService.instance.syncToken(controller);
          },
          onReceivedError: (controller, request, error) {
            _stall?.cancel();
            _refresh?.endRefreshing();
            if (request.isForMainFrame ?? false) {
              setState(() => _offline = true);
            }
          },
        ),
        if (!_firstLoadDone)
          const ColoredBox(
            color: Color(0xFF090B0F),
            child: Center(
              child: CircularProgressIndicator(color: Color(0xFF0A84FF)),
            ),
          ),
        if (_signingIn)
          const ColoredBox(
            color: Color(0xCC090B0F),
            child: Center(
              child: CircularProgressIndicator(color: Color(0xFF0A84FF)),
            ),
          ),
      ],
    );
  }

  /// Shown only while Android would ring without waking the screen.
  ///
  /// A bar rather than a dialog, and dismissible: this is a real problem — a
  /// student whose phone stays dark misses the class — but it is not worth
  /// blocking the app over, and a modal on launch is how people learn to tap
  /// past things without reading them. It disappears by itself once the
  /// permission is granted, because the check re-runs on resume.
  Widget _fullScreenPrompt() {
    return Container(
      width: double.infinity,
      color: const Color(0xFF1C2028),
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 12),
      child: Row(
        children: [
          const Icon(Icons.phone_in_talk, color: Color(0xFF30D158), size: 20),
          const SizedBox(width: 12),
          const Expanded(
            child: Text(
              'Calls ring, but your screen stays dark. Allow full-screen '
              'notifications to see who is calling.',
              style: TextStyle(color: Colors.white, fontSize: 13, height: 1.35),
            ),
          ),
          TextButton(
            onPressed: () => CallService.instance.requestFullScreen(),
            child: const Text(
              'Allow',
              style: TextStyle(
                color: Color(0xFF30D158),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          IconButton(
            onPressed: () => setState(() => _fullScreenDismissed = true),
            icon: const Icon(Icons.close, color: Colors.white54, size: 18),
            tooltip: 'Dismiss',
          ),
        ],
      ),
    );
  }

  Widget _offlineView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.wifi_off, size: 48, color: Color(0xFF9CA3AF)),
            const SizedBox(height: 16),
            const Text(
              "Can't reach Novice Tutor",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Check your connection and try again.',
              style: TextStyle(color: Color(0xFF9CA3AF), fontSize: 14),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF0A84FF),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: () {
                setState(() => _offline = false);
                _controller?.loadUrl(
                  urlRequest: URLRequest(url: WebUri(widget.initialUrl)),
                );
              },
              child: const Text(
                'Retry',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// True for URLs the WebView should keep. Everything else goes to the
/// system browser — notably accounts.google.com, which refuses to render
/// OAuth inside a WebView at all ("disallowed_useragent").
bool isInternalUrl(Uri? url, Uri appOrigin) {
  if (url == null) return false;
  final host = url.host;
  if (host.isEmpty) return false;
  return host == appOrigin.host ||
      host.endsWith('.${appOrigin.host}') ||
      host == 'meet.novicetutor.com';
}

/// Strictly validates session identifiers (cuid2 / alphanumeric token format).
bool isValidSessionId(Object? value) {
  return value is String &&
      value.isNotEmpty &&
      value.length <= 64 &&
      RegExp(r'^[a-z0-9]+$').hasMatch(value);
}
