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
import 'package:url_launcher/url_launcher.dart';

import 'push.dart';

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
    super.dispose();
  }

  void _openPath(String path) {
    final url = _appOrigin.resolve(path);
    _controller?.loadUrl(urlRequest: URLRequest(url: WebUri.uri(url)));
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
            applicationNameForUserAgent: 'NoviceTutorApp/1.0',
          ),
          onWebViewCreated: (c) => _controller = c,
          onPermissionRequest: (controller, request) async {
            // Camera/mic for the LiveKit call. The OS prompt has already been
            // answered by this point; this is the WebView's own gate.
            return PermissionResponse(
              resources: request.resources,
              action: PermissionResponseAction.GRANT,
            );
          },
          shouldOverrideUrlLoading: (controller, action) async {
            final url = action.request.url;
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
          onLoadStop: (controller, url) async {
            _refresh?.endRefreshing();
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
