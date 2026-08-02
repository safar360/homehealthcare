import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:homehealthcare/main.dart';
import 'package:homehealthcare/services/supabase_service.dart';

void main() {
  testWidgets('patient home renders backend-driven sections', (WidgetTester tester) async {
    await tester.pumpWidget(
      PariCareApp(
        backend: SupabaseService(url: '', anonKey: ''),
      ),
    );
    await tester.pump();

    expect(find.text('Mumbai'), findsOneWidget);
    expect(find.text('Our services'), findsOneWidget);
    expect(find.text('Home Nursing Care'), findsOneWidget);
    expect(find.text('What families say'), findsOneWidget);
    expect(find.text('Other products'), findsOneWidget);
    expect(find.text('Follow us'), findsOneWidget);
  });

  testWidgets('order form validates and collects contact details', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1200, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      PariCareApp(
        backend: SupabaseService(url: '', anonKey: ''),
      ),
    );
    await tester.pump();

    final orderButton = find.widgetWithText(FilledButton, 'Order').first;
    await tester.ensureVisible(orderButton);
    await tester.pump();
    await tester.tap(orderButton);
    await tester.pumpAndSettle();

    expect(find.text('Submit order'), findsOneWidget);

    await tester.tap(find.text('Submit order'));
    await tester.pump();
    expect(find.text('Please enter a name'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Full name *'), 'Anita');
    await tester.enterText(find.widgetWithText(TextFormField, 'Phone number *'), '9999999999');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Location / address *'),
      'Andheri East, Mumbai',
    );
    await tester.tap(find.text('Submit order'));
    await tester.pumpAndSettle();

    expect(find.text('Submit order'), findsNothing);
    expect(find.textContaining('Order captured for Home Nursing Care'), findsOneWidget);
  });
}
