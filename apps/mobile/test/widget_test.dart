import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:narview_mobile/app/narview_app.dart';
import 'package:narview_mobile/app/router.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:narview_mobile/features/auth/data/auth_repository.dart';
import 'package:narview_mobile/features/review/data/review_repository.dart';

void main() {
  testWidgets('shows onboarding before GitHub sign in', (tester) async {
    narviewRouter.go('/');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            const _FakeAuthRepository(AuthSession.signedOut()),
          ),
          reviewRepositoryProvider.overrideWithValue(FixtureReviewRepository()),
        ],
        child: const NarviewApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Review PRs from your phone'), findsOneWidget);
    expect(find.text('Sign in to GitHub'), findsWidgets);
    expect(find.text('Review stack rebuild'), findsNothing);
  });

  testWidgets('opens the mobile review flow', (tester) async {
    narviewRouter.go('/');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            const _FakeAuthRepository(AuthSession.signedIn(login: 'tester')),
          ),
          reviewRepositoryProvider.overrideWithValue(FixtureReviewRepository()),
        ],
        child: const NarviewApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Narview'), findsOneWidget);
    expect(find.text('Signed in as tester'), findsOneWidget);
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

  testWidgets('opens stacks, files, and toggles viewed state', (tester) async {
    narviewRouter.go('/');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            const _FakeAuthRepository(AuthSession.signedIn(login: 'tester')),
          ),
          reviewRepositoryProvider.overrideWithValue(FixtureReviewRepository()),
        ],
        child: const NarviewApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Review stack rebuild'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Contracts, schema, and setup'));
    await tester.pumpAndSettle();

    expect(find.text('Mark Stack Viewed'), findsOneWidget);
    expect(find.text('schemas/review-stack.graphql'), findsOneWidget);

    await tester.tap(find.text('schemas/review-stack.graphql'));
    await tester.pumpAndSettle();

    expect(find.text('review-stack.graphql'), findsOneWidget);
    expect(find.byTooltip('Mark viewed'), findsOneWidget);

    await tester.tap(find.byTooltip('Mark viewed'));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Mark unviewed'), findsOneWidget);
  });

  testWidgets('review action bar fits a narrow phone viewport', (tester) async {
    narviewRouter.go('/');
    tester.view.physicalSize = const Size(393, 852);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(
            const _FakeAuthRepository(AuthSession.signedIn(login: 'tester')),
          ),
          reviewRepositoryProvider.overrideWithValue(FixtureReviewRepository()),
        ],
        child: const NarviewApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Review stack rebuild'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Start Review'));
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
    expect(find.byTooltip('Threads'), findsOneWidget);
    expect(find.byTooltip('Comment'), findsOneWidget);
    expect(find.byTooltip('Mark Viewed'), findsOneWidget);
  });
}

class _FakeAuthRepository implements AuthRepository {
  const _FakeAuthRepository(this.session);

  final AuthSession session;

  @override
  Future<AuthSession> getSession() async => session;

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
