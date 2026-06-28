import 'package:go_router/go_router.dart';

import '../features/pull_requests/ui/pull_request_inbox_screen.dart';
import '../features/review/ui/pull_request_overview_screen.dart';
import '../features/review/ui/review_mode_screen.dart';
import '../features/review/ui/submit_review_screen.dart';

final narviewRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const PullRequestInboxScreen(),
    ),
    GoRoute(
      path: '/pulls/:slug/:number',
      builder: (context, state) => PullRequestOverviewScreen(
        repositorySlug:
            state.pathParameters['slug'] ?? 'resplendent-data-narview',
        number: int.tryParse(state.pathParameters['number'] ?? '') ?? 12,
      ),
    ),
    GoRoute(
      path: '/review',
      builder: (context, state) => const ReviewModeScreen(),
    ),
    GoRoute(
      path: '/submit-review',
      builder: (context, state) => const SubmitReviewScreen(),
    ),
  ],
);
