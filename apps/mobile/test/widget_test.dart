import 'package:flutter_test/flutter_test.dart';
import 'package:narview_mobile/app/narview_app.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void main() {
  testWidgets('opens the mobile review flow', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: NarviewApp()));
    await tester.pumpAndSettle();

    expect(find.text('Narview'), findsOneWidget);
    expect(find.text('Review stack rebuild'), findsOneWidget);

    await tester.tap(find.text('Review stack rebuild'));
    await tester.pumpAndSettle();

    expect(find.text('Start Review'), findsOneWidget);
    expect(find.text('Contracts, schema, and setup'), findsOneWidget);

    await tester.tap(find.text('Start Review'));
    await tester.pumpAndSettle();

    expect(find.text('Review'), findsOneWidget);
    expect(find.text('review-stack.graphql'), findsOneWidget);
    expect(find.text('Comment'), findsOneWidget);
  });
}
