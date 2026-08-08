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

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import 'google_sign_in_bridge.dart';
import 'push.dart';
import 'screen_share.dart';

class WebShell extends StatefulWidget {
  final String initialUrl;
  const WebShell({super.key, required this.initialUrl});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  InAppWebViewController? _controller;
  PullToRefreshController? _refresh;
  bool _offline = false;
  bool _firstLoadDone = false;
  bool _signingIn = false;
  bool _pipAllowed = false;

  /// Talks to MainActivity, which is the only thing that can enter Android's
  /// picture-in-picture mode.
  static const _pipChannel = MethodChannel('novicetutor/pip');
  StreamSubscription<String>? _deepLinks;

  late final Uri _appOrigin = Uri.parse(widget.initialUrl);

  @override
  void initState() {
    super.initState();

    _refresh = PullToRefreshController(
      settings: PullToRefreshSettings(color: const Color(0xFF10B981)),
      onRefresh: () => _controller?.reload(),
    );

    // A notification tapped while the app was closed is already waiting here.
    _deepLinks = PushService.instance.deepLinks.listen(_openPath);
  }

  @override
  void dispose() {
    _deepLinks?.cancel();
    ScreenShareService.instance.onEnded = null;
    ScreenShareService.instance.stop();
    super.dispose();
  }

  void _openPath(String path) {
    final url = _appOrigin.resolve(path);
    _controller?.loadUrl(urlRequest: URLRequest(url: WebUri.uri(url)));
  }

  /// Holds the Android camera and microphone permissions, asking once if we
  /// don't have them yet.
  ///
  /// Asked lazily rather than at launch: a Quran app demanding the camera
  /// before showing anything reads as spyware, and a student who only ever
  /// listens never needs to be asked at all. The cost is that the very first
  /// tap on the camera button raises the OS dialog — acceptable, and the same
  /// thing every browser does.
  Future<bool> _ensureMediaPermissions() async {
    final statuses = await [Permission.camera, Permission.microphone].request();
    return statuses.values.every((s) => s.isGranted);
  }

  /// The call page's Share button, which inside the app cannot use
  /// `getDisplayMedia` — Android's WebView doesn't have it. The page mints a
  /// screen-only LiveKit token (it has the session cookie) and hands it over;
  /// capture and publishing happen natively. See screen_share.dart.
  void _registerScreenShareHandlers(InAppWebViewController c) {
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
  bool _isInternal(Uri? url) {
    if (url == null) return false;
    final host = url.host;
    return host == _appOrigin.host ||
        host.endsWith('.${_appOrigin.host}') ||
        host == 'meet.novicetutor.com';
  }

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
        body: SafeArea(
          child: _offline ? _offlineView() : _webView(),
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
            allowsInlineMediaPlayback: true,
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
            // was tapped. Only bump this when the handlers below change.
            applicationNameForUserAgent: 'NoviceTutorApp/1.2 (screenshare)',
          ),
          onWebViewCreated: (c) {
            _controller = c;
            _registerScreenShareHandlers(c);
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
              _handleGoogleSignIn();
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
            _refresh?.endRefreshing();
            if (request.isForMainFrame ?? false) {
              setState(() => _offline = true);
            }
          },
        ),
        if (!_firstLoadDone)
          const ColoredBox(
            color: Color(0xFF0A0A0A),
            child: Center(child: CircularProgressIndicator()),
          ),
        if (_signingIn)
          const ColoredBox(
            color: Color(0xCC0A0A0A),
            child: Center(child: CircularProgressIndicator()),
          ),
      ],
    );
  }

  Widget _offlineView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.wifi_off, size: 48, color: Colors.white54),
            const SizedBox(height: 16),
            const Text(
              "Can't reach Novice Tutor",
              style: TextStyle(fontSize: 18, color: Colors.white),
            ),
            const SizedBox(height: 8),
            const Text(
              'Check your connection and try again.',
              style: TextStyle(color: Colors.white54),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () {
                setState(() => _offline = false);
                _controller?.loadUrl(
                  urlRequest: URLRequest(url: WebUri(widget.initialUrl)),
                );
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
