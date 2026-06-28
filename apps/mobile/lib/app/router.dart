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
      path: '/pulls/:owner/:repo/:number',
      builder: (context, state) => PullRequestOverviewScreen(
        owner: state.pathParameters['owner'] ?? 'Resplendent-Data',
        repo: state.pathParameters['repo'] ?? 'Narview',
        number: int.tryParse(state.pathParameters['number'] ?? '') ?? 12,
      ),
    ),
    GoRoute(
      path: '/pulls/:owner/:repo/:number/review',
      builder: (context, state) => ReviewModeScreen(
        owner: state.pathParameters['owner'] ?? 'Resplendent-Data',
        repo: state.pathParameters['repo'] ?? 'Narview',
        number: int.tryParse(state.pathParameters['number'] ?? '') ?? 12,
      ),
    ),
    GoRoute(
      path: '/pulls/:owner/:repo/:number/submit-review',
      builder: (context, state) => SubmitReviewScreen(
        owner: state.pathParameters['owner'] ?? 'Resplendent-Data',
        repo: state.pathParameters['repo'] ?? 'Narview',
        number: int.tryParse(state.pathParameters['number'] ?? '') ?? 12,
      ),
    ),
    GoRoute(
      path: '/submit-review',
      builder: (context, state) => const SubmitReviewScreen(),
    ),
  ],
);
