import 'package:flutter_test/flutter_test.dart';
import 'package:narview_mobile/app/narview_app.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:narview_mobile/features/auth/data/auth_repository.dart';

void main() {
  testWidgets('opens the mobile review flow', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_FakeAuthRepository()),
        ],
        child: const NarviewApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Narview'), findsOneWidget);
    expect(find.text('Sign in to GitHub'), findsWidgets);
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

class _FakeAuthRepository implements AuthRepository {
  @override
  Future<AuthSession> getSession() async => const AuthSession.signedOut();

  @override
  Future<OAuthPollResponse> pollSignIn(OAuthStartResponse flow) async {
    return const OAuthPollResponse.pending(intervalSeconds: 5);
  }

  @override
  Future<void> signOut() async {}

  @override
  Future<OAuthStartResponse> startSignIn() async {
    return OAuthStartResponse(
      deviceCode: 'device',
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://github.com/login/device',
      verificationUriComplete: null,
      expiresAt: DateTime.now().add(const Duration(minutes: 15)),
      intervalSeconds: 5,
    );
  }
}
