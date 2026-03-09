/// Live Session Screen — Jitsi video call via WebView
///
/// 📚 EDUCATIONAL NOTE:
/// We embed Jitsi Meet inside a WebView instead of using the native SDK.
/// WHY? The native Jitsi SDK for Flutter is poorly maintained and crashes
/// frequently. WebView is more stable and easier to update.
///
/// FLOW:
/// 1. Call the /api/sessions/{id}/join endpoint to get a Jitsi JWT + URL
/// 2. Load the Jitsi URL in an InAppWebView
/// 3. The JWT authenticates the user and sets permissions (mute, etc.)
/// 4. When the call ends, navigate back to the dashboard

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
  String? _jitsiUrl;
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
          _jitsiUrl = response.data['jitsiUrl'];
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

    if (_jitsiUrl != null) {
      return InAppWebView(
        initialUrlRequest: URLRequest(url: WebUri(_jitsiUrl!)),
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
