/// Live Session Screen — the web app's call screen in a WebView.
///
/// Jitsi is long gone; calls run on LiveKit. We load the Next.js call page
/// rather than the LiveKit Flutter SDK because that page is a hand-built UI
/// (tile controls, spotlight, backgrounds, guest admission) that took a lot of
/// work to get right — a native rebuild would mean maintaining two of them.
///
/// FLOW:
/// 1. Call /api/sessions/{id}/join
/// 2. Load the returned page in an InAppWebView
/// 3. Leaving the call navigates back to the dashboard
///
/// TWO KNOWN GAPS, both described in docs/mobile-app.md:
/// - That endpoint no longer always returns `joinUrl`. It can answer
///   `{waiting: true}` (class not open yet) or `{redirectSessionId}` (the
///   class is running on another session row). Both currently fall into the
///   error branch below; they need handling the way the web page does.
/// - The page authenticates by cookie, and a Dio login does not populate the
///   WebView's cookie jar.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../../config/theme.dart';
import '../../config/api_config.dart';
import '../../services/auth_service.dart';

class LiveSessionScreen extends ConsumerStatefulWidget {
  final String sessionId;
  const LiveSessionScreen({super.key, required this.sessionId});

  @override
  ConsumerState<LiveSessionScreen> createState() => _LiveSessionScreenState();
}

class _LiveSessionScreenState extends ConsumerState<LiveSessionScreen> {
  String? _sessionUrl;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSession();
  }

  Future<void> _loadSession() async {
    try {
      final api = ref.read(apiClientProvider);
      final response = await api.post(
        ApiConfig.sessionJoin(widget.sessionId),
      );

      if (response.statusCode == 200) {
        setState(() {
          _sessionUrl = response.data['joinUrl'];
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = response.data['error'] ?? 'Failed to join session';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = 'Could not connect to session. Please try again.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        leading: IconButton(
          icon: const Icon(Icons.close, color: Colors.white),
          onPressed: () {
            showDialog(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Leave Class?'),
                content: const Text('Are you sure you want to leave this session?'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    child: const Text('Stay'),
                  ),
                  TextButton(
                    onPressed: () {
                      Navigator.pop(ctx);
                      context.goNamed('dashboard');
                    },
                    child: const Text('Leave', style: TextStyle(color: Colors.red)),
                  ),
                ],
              ),
            );
          },
        ),
        title: Text(
          'Live Session',
          style: const TextStyle(color: Colors.white, fontSize: 16),
        ),
        actions: [
          // Session timer
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: IqraTheme.emerald.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Row(
              children: [
                Icon(Icons.circle, color: Colors.red, size: 8),
                SizedBox(width: 6),
                Text('LIVE', style: TextStyle(color: IqraTheme.emerald, fontSize: 12, fontWeight: FontWeight.w700)),
              ],
            ),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircularProgressIndicator(color: IqraTheme.emerald),
            SizedBox(height: 16),
            Text(
              'Connecting to your class...',
              style: TextStyle(color: Colors.white70),
            ),
          ],
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Colors.red, size: 48),
            const SizedBox(height: 16),
            Text(_error!, style: const TextStyle(color: Colors.white70)),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _isLoading = true;
                  _error = null;
                });
                _loadSession();
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (_sessionUrl != null) {
      return InAppWebView(
        initialUrlRequest: URLRequest(url: WebUri(_sessionUrl!)),
        initialSettings: InAppWebViewSettings(
          mediaPlaybackRequiresUserGesture: false,
          allowsInlineMediaPlayback: true,
          javaScriptEnabled: true,
        ),
        onPermissionRequest: (controller, request) async {
          // Auto-grant camera and microphone permissions for video calls
          return PermissionResponse(
            resources: request.resources,
            action: PermissionResponseAction.GRANT,
          );
        },
      );
    }

    return const Center(
      child: Text('Session not found', style: TextStyle(color: Colors.white70)),
    );
  }
}
