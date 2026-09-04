import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novice_tutor/main.dart';
import 'package:novice_tutor/shell/web_shell.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('WebShell Capability & UserAgent Tests', () {
    test('shellUserAgent respects platform screen sharing capability', () {
      final ua = shellUserAgent;
      if (Platform.isAndroid) {
        expect(ua, contains('(screenshare)'));
        expect(ua, startsWith('NoviceTutorApp/'));
        expect(nativeScreenShareSupported, isTrue);
      } else {
        expect(ua, isNot(contains('(screenshare)')));
        expect(ua, equals('NoviceTutorApp/1.2'));
        expect(nativeScreenShareSupported, isFalse);
      }
    });

    test('validates internal vs foreign host origins strictly', () {
      final appOrigin = Uri.parse('https://novicetutor.com');

      bool isInternal(Uri? url) {
        if (url == null) return false;
        final host = url.host;
        return host == appOrigin.host ||
            host.endsWith('.${appOrigin.host}') ||
            host == 'meet.novicetutor.com';
      }

      // Valid same-origin and subdomain links
      expect(isInternal(Uri.parse('https://novicetutor.com/dashboard/session/cuid123')), isTrue);
      expect(isInternal(Uri.parse('https://meet.novicetutor.com/join/cuid123')), isTrue);
      expect(isInternal(Uri.parse('https://app.novicetutor.com/dashboard')), isTrue);
      expect(isInternal(Uri.parse('https://novicetutor.com/join/123456?role=guest')), isTrue);

      // Malicious or third-party links must be rejected
      expect(isInternal(Uri.parse('https://evil.com/phish')), isFalse);
      expect(isInternal(Uri.parse('https://novicetutor.com.evil.com/phish')), isFalse);
      expect(isInternal(Uri.parse('https://accounts.google.com/o/oauth2/auth')), isFalse);
      expect(isInternal(Uri.parse('https://checkout.stripe.com/pay')), isFalse);
      expect(isInternal(null), isFalse);
    });

    test('session ID validator strictly accepts cuid2 format only', () {
      bool isValidSessionId(Object? value) {
        return value is String &&
            value.isNotEmpty &&
            value.length <= 64 &&
            RegExp(r'^[a-z0-9]+$').hasMatch(value);
      }

      expect(isValidSessionId('clx123abc456'), isTrue);
      expect(isValidSessionId('1234567890'), isTrue);
      expect(isValidSessionId(''), isFalse);
      expect(isValidSessionId('../../../etc/passwd'), isFalse);
      expect(isValidSessionId('<script>alert(1)</script>'), isFalse);
      expect(isValidSessionId('session; DROP TABLE sessions;'), isFalse);
      expect(isValidSessionId('UPPERCASE_NOT_CUID'), isFalse);
    });
  });

  group('Theme & Design Tokens Tests', () {
    testWidgets('NoviceTutorApp builds MaterialApp with Phase 8 dark theme tokens', (tester) async {
      await tester.pumpWidget(Builder(
        builder: (context) {
          const app = NoviceTutorApp();
          final materialApp = app.build(context) as MaterialApp;
          expect(materialApp.theme!.scaffoldBackgroundColor, equals(const Color(0xFF090B0F)));
          expect(materialApp.theme!.brightness, equals(Brightness.dark));
          expect(materialApp.title, equals('Novice Tutor'));
          return const SizedBox.shrink();
        },
      ));
    });
  });

  group('Deep Link Platform Channel Tests', () {
    const deepLinkChannel = MethodChannel('novicetutor/deeplink');

    test('getInitialUrl returns null or launch uri', () async {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(deepLinkChannel, (call) async {
        if (call.method == 'getInitialUrl') {
          return 'https://novicetutor.com/dashboard/session/test123456';
        }
        return null;
      });

      final initialUrl = await deepLinkChannel.invokeMethod<String>('getInitialUrl');
      expect(initialUrl, equals('https://novicetutor.com/dashboard/session/test123456'));

      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(deepLinkChannel, null);
    });

    test('onDeepLink handles runtime deep link event', () async {
      String? deliveredUrl;

      deepLinkChannel.setMethodCallHandler((call) async {
        if (call.method == 'onDeepLink') {
          deliveredUrl = call.arguments as String;
        }
        return null;
      });

      await TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .handlePlatformMessage(
        'novicetutor/deeplink',
        const StandardMethodCodec().encodeMethodCall(
          const MethodCall('onDeepLink', 'https://novicetutor.com/join/class-999'),
        ),
        (data) {},
      );

      expect(deliveredUrl, equals('https://novicetutor.com/join/class-999'));

      deepLinkChannel.setMethodCallHandler(null);
    });
  });
}
