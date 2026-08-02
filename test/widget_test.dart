import 'package:flutter_test/flutter_test.dart';

import 'package:homehealthcare/main.dart';

void main() {
  testWidgets('patient landing page renders core content', (WidgetTester tester) async {
    await tester.pumpWidget(const PariCareApp());

    expect(find.text('Pari Home Healthcare'), findsOneWidget);
    expect(find.text('Popular services'), findsOneWidget);
    expect(find.text('Need instant help?'), findsOneWidget);
  });
}
