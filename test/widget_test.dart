// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:homehealthcare/main.dart';

void main() {
  testWidgets('patient home screen renders key content', (WidgetTester tester) async {
    await tester.pumpWidget(const HomeHealthcareApp());

    expect(find.text('Welcome back, Sarah'), findsOneWidget);
    expect(find.text('Popular services'), findsOneWidget);
    expect(find.text('Recent orders'), findsOneWidget);
  });
}
