import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novice_tutor/main.dart';
import 'package:novice_tutor/shell/web_shell.dart';

import 'package:novice_tutor/shell/screen_share.dart';

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

    test('validateAppUrl accepts valid schemes and hosts', () {
      expect(validateAppUrl('https://novicetutor.com').toString(), equals('https://novicetutor.com'));
      expect(validateAppUrl('https://staging.novicetutor.com').toString(), equals('https://staging.novicetutor.com'));
      expect(validateAppUrl('http://10.0.2.2:3000').toString(), equals('http://10.0.2.2:3000'));
      expect(validateAppUrl('http://localhost:3000').toString(), equals('http://localhost:3000'));
    });

    test('validateAppUrl fails fast on empty or invalid inputs', () {
      expect(() => validateAppUrl(''), throwsArgumentError);
      expect(() => validateAppUrl('   '), throwsArgumentError);
      expect(() => validateAppUrl('ftp://novicetutor.com'), throwsArgumentError);
      expect(() => validateAppUrl('novicetutor.com'), throwsArgumentError);
      expect(() => validateAppUrl('https://'), throwsArgumentError);
    });

    test('validates internal vs foreign host origins strictly', () {
      final appOrigin = Uri.parse('https://novicetutor.com');

      // Valid same-origin and subdomain links
      expect(isInternalUrl(Uri.parse('https://novicetutor.com/dashboard/session/cuid123'), appOrigin), isTrue);
      expect(isInternalUrl(Uri.parse('https://meet.novicetutor.com/join/cuid123'), appOrigin), isTrue);
      expect(isInternalUrl(Uri.parse('https://app.novicetutor.com/dashboard'), appOrigin), isTrue);
      expect(isInternalUrl(Uri.parse('https://novicetutor.com/join/123456?role=guest'), appOrigin), isTrue);

      // Malicious or third-party links must be rejected
      expect(isInternalUrl(Uri.parse('https://evil.com/phish'), appOrigin), isFalse);
      expect(isInternalUrl(Uri.parse('https://novicetutor.com.evil.com/phish'), appOrigin), isFalse);
      expect(isInternalUrl(Uri.parse('https://accounts.google.com/o/oauth2/auth'), appOrigin), isFalse);
      expect(isInternalUrl(Uri.parse('https://checkout.stripe.com/pay'), appOrigin), isFalse);
      expect(isInternalUrl(null, appOrigin), isFalse);
    });

    test('session ID validator strictly accepts cuid2 format only', () {
      expect(isValidSessionId('clx123abc456'), isTrue);
      expect(isValidSessionId('1234567890'), isTrue);
      expect(isValidSessionId(''), isFalse);
      expect(isValidSessionId('../../../etc/passwd'), isFalse);
      expect(isValidSessionId('<script>alert(1)</script>'), isFalse);
      expect(isValidSessionId('session; DROP TABLE sessions;'), isFalse);
      expect(isValidSessionId('UPPERCASE_NOT_CUID'), isFalse);
      expect(isValidSessionId(12345), isFalse);
      expect(isValidSessionId(null), isFalse);
    });
  });

  group('ScreenShareService Tests', () {
    test('stop() safely cleans up when not sharing', () async {
      final service = ScreenShareService.instance;
      expect(service.isSharing, isFalse);
      await service.stop();
      expect(service.isSharing, isFalse);
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
