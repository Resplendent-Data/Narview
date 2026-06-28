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

  testWidgets('opens the mobile review workspace', (tester) async {
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

    expect(find.text('review-stack.graphql'), findsOneWidget);
    expect(find.text('Next open'), findsOneWidget);
    expect(find.text('Map'), findsOneWidget);
    expect(find.text('Focus'), findsOneWidget);
    expect(find.text('Comment'), findsOneWidget);
  });

  testWidgets('opens the review map and creates a line draft', (tester) async {
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

    await tester.tap(find.byTooltip('Review Map').last);
    await tester.pumpAndSettle();

    expect(find.text('Review Map'), findsOneWidget);
    expect(find.text('Contracts, schema, and setup'), findsOneWidget);

    await tester.tap(find.text('schemas/review-stack.graphql').last);
    await tester.pumpAndSettle();

    await tester.tap(
      find.byKey(
        const ValueKey('diff-line-schemas/review-stack.graphql-RIGHT-2'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Draft Comment'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Needs a nullable check.');
    await tester.tap(find.text('Save Draft'));
    await tester.pumpAndSettle();

    expect(find.text('1 drafts'), findsOneWidget);
    expect(find.textContaining('Line 2 selected'), findsOneWidget);
  });

  testWidgets('workspace command bar fits a narrow phone viewport', (
    tester,
  ) async {
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

    expect(tester.takeException(), isNull);
    expect(find.byTooltip('Threads and drafts'), findsOneWidget);
    expect(find.byTooltip('Add file comment'), findsOneWidget);
    expect(find.byTooltip('Mark viewed'), findsOneWidget);
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
