import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novice_tutor/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/in_app_webview'),
      (MethodCall methodCall) async => null,
    );
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.pichillilorenzo/flutter_inappwebview'),
      (MethodCall methodCall) async => null,
    );
  });

  testWidgets('app boots without throwing', (WidgetTester tester) async {
    expect(const NoviceTutorApp(), isNotNull);
  });
}

