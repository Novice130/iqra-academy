// The app is a single WebView, so there is little to unit test on this side.
// This asserts the shell boots without throwing — enough to catch a broken
// widget tree in CI. The WebView itself renders nothing under flutter_test.

import 'package:flutter_test/flutter_test.dart';
import 'package:novice_tutor/main.dart';

void main() {
  testWidgets('app boots', (WidgetTester tester) async {
    await tester.pumpWidget(const NoviceTutorApp());
    expect(find.byType(NoviceTutorApp), findsOneWidget);
  });
}
