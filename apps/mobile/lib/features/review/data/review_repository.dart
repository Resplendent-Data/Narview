import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/review_models.dart';
import '../domain/review_stack_builder.dart';

abstract class ReviewRepository {
  Future<List<PullRequestSummary>> listPullRequests();

  Future<PullRequestReviewData> fetchPullRequest(String repository, int number);
}

final reviewRepositoryProvider = Provider<ReviewRepository>(
  (ref) => FixtureReviewRepository(),
);

final pullRequestsProvider = FutureProvider<List<PullRequestSummary>>((ref) {
  return ref.watch(reviewRepositoryProvider).listPullRequests();
});

final activeReviewDataProvider = FutureProvider<PullRequestReviewData>((ref) {
  return ref
      .watch(reviewRepositoryProvider)
      .fetchPullRequest('Resplendent-Data/Narview', 12);
});

final activeReviewStackModelProvider = FutureProvider<ReviewStackModel>((
  ref,
) async {
  final data = await ref.watch(activeReviewDataProvider.future);
  return ReviewStackBuilder().build(
    files: data.files,
    reviewThreads: data.reviewThreads,
  );
});

final pendingDraftsProvider =
    NotifierProvider<PendingDraftsNotifier, List<PendingReviewDraft>>(
      PendingDraftsNotifier.new,
    );

class PendingDraftsNotifier extends Notifier<List<PendingReviewDraft>> {
  @override
  List<PendingReviewDraft> build() => const [];

  void addDraft(PendingReviewDraft draft) {
    state = [...state, draft];
  }

  void clear() {
    state = const [];
  }
}

class FixtureReviewRepository implements ReviewRepository {
  @override
  Future<List<PullRequestSummary>> listPullRequests() async {
    return [_pullRequest];
  }

  @override
  Future<PullRequestReviewData> fetchPullRequest(
    String repository,
    int number,
  ) async {
    return PullRequestReviewData(
      pullRequest: _pullRequest,
      files: _files,
      reviewThreads: _threads,
      checks: _checks,
      fetchedAtEpochMs: DateTime.now().millisecondsSinceEpoch,
    );
  }
}

const _pullRequest = PullRequestSummary(
  repository: 'Resplendent-Data/Narview',
  number: 12,
  title: 'Review stack rebuild',
  authorLogin: 'octocat',
  isDraft: false,
  updatedAt: '2026-06-18T12:00:00Z',
  url: 'https://github.com/Resplendent-Data/Narview/pull/12',
  baseBranch: 'main',
  headBranch: 'review-stack-rebuild',
);

const _files = [
  FileSummary(
    path: 'schemas/review-stack.graphql',
    additions: 10,
    deletions: 1,
    status: 'modified',
    patch:
        '@@ -1,3 +1,7 @@\n type PullRequest {\n+  reviewStacks: [ReviewStack!]!\n+  viewerViewedState: FileViewedState!\n }',
    viewerViewedState: 'UNVIEWED',
  ),
  FileSummary(
    path: 'src/review/stacks.ts',
    additions: 88,
    deletions: 12,
    status: 'modified',
    patch:
        '@@ -8,6 +8,9 @@\n export function buildReviewStackModel(files) {\n+  return groupFiles(files);\n }',
    viewerViewedState: 'UNVIEWED',
  ),
  FileSummary(
    path: 'src/components/review-stack-workspace.tsx',
    additions: 45,
    deletions: 5,
    status: 'modified',
    patch:
        '@@ -12,6 +12,9 @@\n export function ReviewWorkspace() {\n+  return <ReviewStackRail />;\n }',
    viewerViewedState: 'VIEWED',
  ),
  FileSummary(
    path: 'src/review/stacks.test.ts',
    additions: 12,
    deletions: 0,
    status: 'modified',
    patch:
        '@@ -0,0 +1,5 @@\n+import { buildReviewStackModel } from \'./stacks\';\n+\n+it(\'groups files\', () => {});',
    viewerViewedState: 'UNVIEWED',
  ),
  FileSummary(
    path: 'docs/review.md',
    additions: 5,
    deletions: 0,
    status: 'added',
    patch: '@@ -0,0 +1,3 @@\n+# Review workflow\n+\n+Use stacks.',
    viewerViewedState: 'UNKNOWN',
  ),
  FileSummary(
    path: 'package-lock.json',
    additions: 1,
    deletions: 1,
    status: 'modified',
    patch: null,
    viewerViewedState: 'UNVIEWED',
  ),
];

const _threads = [
  ReviewThread(
    id: 'thread-core',
    authorLogin: 'octocat',
    filePath: 'src/review/stacks.ts',
    line: 9,
    state: 'unresolved',
    body: 'Please double-check stack grouping.',
    updatedAt: '2026-06-01T12:00:00Z',
  ),
  ReviewThread(
    id: 'thread-ui',
    authorLogin: 'hubot',
    filePath: 'src/components/review-stack-workspace.tsx',
    line: 13,
    state: 'resolved',
    body: 'Resolved UI note.',
    updatedAt: '2026-06-01T12:30:00Z',
  ),
];

const _checks = [
  CheckRun(name: 'desktop tests', status: 'completed', conclusion: 'success'),
  CheckRun(name: 'mobile tests', status: 'completed', conclusion: 'success'),
];
