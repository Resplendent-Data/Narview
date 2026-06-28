import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../../core/storage/secure_token_store.dart';
import '../domain/review_models.dart';
import '../domain/review_stack_builder.dart';

abstract class ReviewRepository {
  Future<List<PullRequestSummary>> listPullRequests();

  Future<PullRequestReviewData> fetchPullRequest(String repository, int number);

  Future<FileViewedActionResult> setFileViewed({
    required PullRequestIdentity identity,
    required String path,
    required bool viewed,
  });
}

final reviewRepositoryProvider = Provider<ReviewRepository>(
  (ref) => GithubReviewRepository(SecureTokenStore()),
);

final pullRequestsProvider = FutureProvider<List<PullRequestSummary>>((ref) {
  return ref.watch(reviewRepositoryProvider).listPullRequests();
});

final pullRequestReviewDataProvider =
    FutureProvider.family<PullRequestReviewData, PullRequestIdentity>((
      ref,
      identity,
    ) {
      return ref
          .watch(reviewRepositoryProvider)
          .fetchPullRequest(identity.repository, identity.number);
    });

final reviewStackModelProvider =
    FutureProvider.family<ReviewStackModel, PullRequestIdentity>((
      ref,
      identity,
    ) async {
      final data = await ref.watch(
        pullRequestReviewDataProvider(identity).future,
      );
      final viewedOverrides =
          ref.watch(viewedOverridesProvider)[identity] ?? const {};
      return ReviewStackBuilder().build(
        files: data.files,
        reviewThreads: data.reviewThreads,
        viewedOverrides: viewedOverrides,
      );
    });

final viewedOverridesProvider =
    NotifierProvider<ViewedOverridesNotifier, ViewedOverridesByPullRequest>(
      ViewedOverridesNotifier.new,
    );

typedef ViewedOverridesByPullRequest =
    Map<PullRequestIdentity, Map<String, String>>;

class ViewedOverridesNotifier extends Notifier<ViewedOverridesByPullRequest> {
  @override
  ViewedOverridesByPullRequest build() => const {};

  void setFileState(
    PullRequestIdentity identity,
    String path,
    String viewedState,
  ) {
    final current = state[identity] ?? const <String, String>{};
    state = {
      ...state,
      identity: {...current, path: viewedState},
    };
  }
}

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

class GithubReviewRepository implements ReviewRepository {
  GithubReviewRepository(this._tokenStore, {http.Client? httpClient})
    : _httpClient = httpClient ?? http.Client();

  final SecureTokenStore _tokenStore;
  final http.Client _httpClient;

  @override
  Future<List<PullRequestSummary>> listPullRequests() async {
    final token = await _requireToken();
    final viewer = await _fetchViewer(token);
    final queries = [
      'is:pr is:open review-requested:${viewer.login}',
      'is:pr is:open assignee:${viewer.login}',
      'is:pr is:open author:${viewer.login}',
      'is:pr is:open involves:${viewer.login}',
    ];
    final results = <PullRequestSummary>[];
    final errors = <Object>[];

    for (final query in queries) {
      try {
        results.addAll(await _searchPullRequests(token, query));
      } catch (error) {
        errors.add(error);
      }
    }

    final byKey = <String, PullRequestSummary>{};
    for (final pullRequest in results) {
      byKey['${pullRequest.repository.toLowerCase()}#${pullRequest.number}'] =
          pullRequest;
    }

    final merged = byKey.values.toList()
      ..sort((left, right) => right.updatedAt.compareTo(left.updatedAt));
    if (merged.isEmpty && errors.isNotEmpty) {
      throw ReviewRepositoryException(
        'Could not load Pull Requests from GitHub. ${errors.first}',
      );
    }
    return merged;
  }

  @override
  Future<PullRequestReviewData> fetchPullRequest(
    String repository,
    int number,
  ) async {
    final token = await _requireToken();
    final detail = await _getObject(
      token,
      Uri.https('api.github.com', '/repos/$repository/pulls/$number'),
    );
    final pullRequest = _pullRequestFromDetail(repository, detail);
    final rawFiles = await _getPaginatedArray(
      token,
      Uri.https('api.github.com', '/repos/$repository/pulls/$number/files', {
        'per_page': '100',
      }),
    );
    final viewedStates = await _fetchViewedStates(
      token,
      PullRequestIdentity(repository: repository, number: number),
    ).catchError((_) => const <String, String>{});
    final files = rawFiles
        .map((file) => _fileFromJson(file, viewedStates))
        .toList();
    final reviewThreads =
        await _fetchReviewThreads(
          token,
          PullRequestIdentity(repository: repository, number: number),
        ).catchError(
          (_) =>
              _fetchReviewCommentsAsUnknownThreads(token, repository, number),
        );
    final checks = await _fetchChecks(
      token,
      repository,
      detail['head'] is Map<String, dynamic>
          ? (detail['head'] as Map<String, dynamic>)['sha'] as String?
          : null,
    );

    return PullRequestReviewData(
      pullRequest: pullRequest,
      files: files,
      reviewThreads: reviewThreads,
      checks: checks,
      fetchedAtEpochMs: DateTime.now().millisecondsSinceEpoch,
    );
  }

  @override
  Future<FileViewedActionResult> setFileViewed({
    required PullRequestIdentity identity,
    required String path,
    required bool viewed,
  }) async {
    final trimmedPath = path.trim();
    if (trimmedPath.isEmpty) {
      throw const ReviewRepositoryException('File path is required.');
    }

    final token = await _requireToken();
    final pullRequestId = await _fetchPullRequestNodeId(token, identity);
    final mutation = viewed
        ? 'mutation MarkFileViewed(\$input: MarkFileAsViewedInput!) { markFileAsViewed(input: \$input) { pullRequest { id } } }'
        : 'mutation UnmarkFileViewed(\$input: UnmarkFileAsViewedInput!) { unmarkFileAsViewed(input: \$input) { pullRequest { id } } }';

    await _postGraphql(token, mutation, {
      'input': {'pullRequestId': pullRequestId, 'path': trimmedPath},
    });

    return FileViewedActionResult(
      ok: true,
      path: trimmedPath,
      viewerViewedState: viewed ? 'VIEWED' : 'UNVIEWED',
      message: viewed
          ? 'File marked viewed on GitHub.'
          : 'File marked unviewed on GitHub.',
    );
  }

  Future<String> _requireToken() async {
    final token = await _tokenStore.readToken();
    if (token == null || token.trim().isEmpty) {
      throw const ReviewRepositoryException('Sign in to GitHub first.');
    }
    return token;
  }

  Future<_Viewer> _fetchViewer(String token) async {
    final json = await _getObject(token, Uri.https('api.github.com', '/user'));
    return _Viewer(login: json['login'] as String? ?? 'GitHub');
  }

  Future<List<PullRequestSummary>> _searchPullRequests(
    String token,
    String query,
  ) async {
    final json = await _getObject(
      token,
      Uri.https('api.github.com', '/search/issues', {
        'q': query,
        'sort': 'updated',
        'order': 'desc',
        'per_page': '30',
      }),
    );
    final items = (json['items'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>();
    return items.map(_pullRequestFromSearchItem).toList();
  }

  Future<Map<String, String>> _fetchViewedStates(
    String token,
    PullRequestIdentity identity,
  ) async {
    final states = <String, String>{};
    String? cursor;
    var page = 1;

    while (page <= 5) {
      final data = await _postGraphql(
        token,
        'query NarviewViewedFiles(\$owner: String!, \$name: String!, \$number: Int!, \$cursor: String) { repository(owner: \$owner, name: \$name) { pullRequest(number: \$number) { files(first: 100, after: \$cursor) { pageInfo { hasNextPage endCursor } nodes { path viewerViewedState } } } } }',
        {
          'owner': identity.owner,
          'name': identity.name,
          'number': identity.number,
          'cursor': cursor,
        },
      );
      final repository = data['repository'];
      final pullRequest = repository is Map<String, dynamic>
          ? repository['pullRequest']
          : null;
      final files = pullRequest is Map<String, dynamic>
          ? pullRequest['files']
          : null;
      if (files is! Map<String, dynamic>) {
        return states;
      }

      final nodes = files['nodes'];
      if (nodes is List<dynamic>) {
        for (final node in nodes.whereType<Map<String, dynamic>>()) {
          final path = node['path'] as String?;
          final viewedState = node['viewerViewedState'] as String?;
          if (path != null && viewedState != null) {
            states[path] = viewedState;
          }
        }
      }

      final pageInfo = files['pageInfo'];
      final hasNextPage = pageInfo is Map<String, dynamic>
          ? pageInfo['hasNextPage'] as bool? ?? false
          : false;
      if (!hasNextPage) {
        break;
      }
      cursor = pageInfo['endCursor'] as String?;
      page += 1;
    }

    return states;
  }

  Future<String> _fetchPullRequestNodeId(
    String token,
    PullRequestIdentity identity,
  ) async {
    final data = await _postGraphql(
      token,
      'query NarviewPullRequestId(\$owner: String!, \$name: String!, \$number: Int!) { repository(owner: \$owner, name: \$name) { pullRequest(number: \$number) { id } } }',
      {
        'owner': identity.owner,
        'name': identity.name,
        'number': identity.number,
      },
    );
    final repository = data['repository'];
    final pullRequest = repository is Map<String, dynamic>
        ? repository['pullRequest']
        : null;
    final id = pullRequest is Map<String, dynamic>
        ? pullRequest['id'] as String?
        : null;
    if (id == null || id.isEmpty) {
      throw const ReviewRepositoryException(
        'Could not find Pull Request on GitHub.',
      );
    }
    return id;
  }

  Future<List<ReviewThread>> _fetchReviewThreads(
    String token,
    PullRequestIdentity identity,
  ) async {
    final threads = <ReviewThread>[];
    String? cursor;

    while (true) {
      final data = await _postGraphql(
        token,
        'query NarviewReviewThreads(\$owner: String!, \$name: String!, \$number: Int!, \$cursor: String) { repository(owner: \$owner, name: \$name) { pullRequest(number: \$number) { reviewThreads(first: 100, after: \$cursor) { pageInfo { hasNextPage endCursor } nodes { id isResolved isOutdated path line originalLine comments(first: 50) { nodes { id author { login } body updatedAt } } } } } } }',
        {
          'owner': identity.owner,
          'name': identity.name,
          'number': identity.number,
          'cursor': cursor,
        },
      );
      final repository = data['repository'];
      final pullRequest = repository is Map<String, dynamic>
          ? repository['pullRequest']
          : null;
      final reviewThreads = pullRequest is Map<String, dynamic>
          ? pullRequest['reviewThreads']
          : null;
      if (reviewThreads is! Map<String, dynamic>) {
        return threads;
      }

      final nodes = reviewThreads['nodes'];
      if (nodes is List<dynamic>) {
        threads.addAll(
          nodes.whereType<Map<String, dynamic>>().map(_threadFromGraphql),
        );
      }

      final pageInfo = reviewThreads['pageInfo'];
      final hasNextPage = pageInfo is Map<String, dynamic>
          ? pageInfo['hasNextPage'] as bool? ?? false
          : false;
      if (!hasNextPage) {
        break;
      }
      cursor = pageInfo['endCursor'] as String?;
      if (cursor == null || cursor.isEmpty) {
        break;
      }
    }

    return threads;
  }

  Future<List<ReviewThread>> _fetchReviewCommentsAsUnknownThreads(
    String token,
    String repository,
    int number,
  ) async {
    final comments = await _getPaginatedArray(
      token,
      Uri.https('api.github.com', '/repos/$repository/pulls/$number/comments', {
        'per_page': '100',
      }),
    );
    return comments.map(_threadFromReviewComment).toList();
  }

  Future<List<CheckRun>> _fetchChecks(
    String token,
    String repository,
    String? headSha,
  ) async {
    if (headSha == null || headSha.isEmpty) {
      return const [];
    }
    try {
      final json = await _getObject(
        token,
        Uri.https(
          'api.github.com',
          '/repos/$repository/commits/$headSha/check-runs',
          {'per_page': '100'},
        ),
      );
      final runs = (json['check_runs'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>();
      return runs
          .map(
            (run) => CheckRun(
              name: run['name'] as String? ?? 'Check',
              status: run['status'] as String? ?? 'unknown',
              conclusion: run['conclusion'] as String?,
            ),
          )
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<Map<String, dynamic>> _getObject(String token, Uri uri) async {
    final response = await _httpClient.get(uri, headers: _headers(token));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ReviewRepositoryException(
        'GitHub returned HTTP ${response.statusCode}.',
      );
    }
    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    throw const ReviewRepositoryException(
      'GitHub returned an unexpected response.',
    );
  }

  Future<Map<String, dynamic>> _postGraphql(
    String token,
    String query,
    Map<String, Object?> variables,
  ) async {
    final response = await _httpClient.post(
      Uri.https('api.github.com', '/graphql'),
      headers: {..._headers(token), 'content-type': 'application/json'},
      body: jsonEncode({'query': query, 'variables': variables}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ReviewRepositoryException(
        'GitHub returned HTTP ${response.statusCode}.',
      );
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const ReviewRepositoryException(
        'GitHub returned an unexpected response.',
      );
    }
    final errors = decoded['errors'];
    if (errors is List<dynamic> && errors.isNotEmpty) {
      final first = errors.first;
      final message = first is Map<String, dynamic>
          ? first['message'] as String?
          : null;
      throw ReviewRepositoryException(
        message ?? 'GitHub returned a GraphQL error.',
      );
    }
    final data = decoded['data'];
    if (data is Map<String, dynamic>) {
      return data;
    }
    throw const ReviewRepositoryException(
      'GitHub returned an unexpected response.',
    );
  }

  Future<List<dynamic>> _getPaginatedArray(String token, Uri uri) async {
    final results = <dynamic>[];
    var page = 1;
    while (page <= 3) {
      final pageUri = uri.replace(
        queryParameters: {...uri.queryParameters, 'page': '$page'},
      );
      final response = await _httpClient.get(pageUri, headers: _headers(token));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw ReviewRepositoryException(
          'GitHub returned HTTP ${response.statusCode}.',
        );
      }
      final decoded = jsonDecode(response.body);
      if (decoded is! List<dynamic>) {
        throw const ReviewRepositoryException(
          'GitHub returned an unexpected response.',
        );
      }
      results.addAll(decoded);
      if (decoded.length < 100) {
        break;
      }
      page += 1;
    }
    return results;
  }

  Map<String, String> _headers(String token) {
    return {
      'accept': 'application/vnd.github+json',
      'authorization': 'Bearer $token',
      'x-github-api-version': '2022-11-28',
    };
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

  @override
  Future<FileViewedActionResult> setFileViewed({
    required PullRequestIdentity identity,
    required String path,
    required bool viewed,
  }) async {
    return FileViewedActionResult(
      ok: true,
      path: path,
      viewerViewedState: viewed ? 'VIEWED' : 'UNVIEWED',
      message: viewed ? 'File marked viewed.' : 'File marked unviewed.',
    );
  }
}

PullRequestSummary parsePullRequestUrl(String value) {
  final uri = Uri.tryParse(value.trim());
  if (uri == null || uri.host.toLowerCase() != 'github.com') {
    throw const ReviewRepositoryException('Enter a GitHub Pull Request URL.');
  }
  final parts = uri.pathSegments;
  if (parts.length < 4 || parts[2] != 'pull') {
    throw const ReviewRepositoryException('Enter a GitHub Pull Request URL.');
  }
  final number = int.tryParse(parts[3]);
  if (number == null) {
    throw const ReviewRepositoryException('Enter a GitHub Pull Request URL.');
  }
  final repository = '${parts[0]}/${parts[1]}';
  return PullRequestSummary(
    repository: repository,
    number: number,
    title: 'Pull Request #$number',
    authorLogin: null,
    isDraft: false,
    updatedAt: '',
    url: 'https://github.com/$repository/pull/$number',
  );
}

PullRequestSummary _pullRequestFromSearchItem(Map<String, dynamic> item) {
  final repositoryUrl = item['repository_url'] as String? ?? '';
  final repository = repositoryUrl.split('/repos/').last;
  return PullRequestSummary(
    repository: repository,
    number: item['number'] as int? ?? 0,
    title: item['title'] as String? ?? 'Pull Request',
    authorLogin: item['user'] is Map<String, dynamic>
        ? (item['user'] as Map<String, dynamic>)['login'] as String?
        : null,
    isDraft: item['draft'] as bool? ?? false,
    updatedAt: item['updated_at'] as String? ?? '',
    url: item['html_url'] as String? ?? '',
  );
}

PullRequestSummary _pullRequestFromDetail(
  String repository,
  Map<String, dynamic> detail,
) {
  return PullRequestSummary(
    repository: repository,
    number: detail['number'] as int? ?? 0,
    title: detail['title'] as String? ?? 'Pull Request',
    authorLogin: detail['user'] is Map<String, dynamic>
        ? (detail['user'] as Map<String, dynamic>)['login'] as String?
        : null,
    isDraft: detail['draft'] as bool? ?? false,
    updatedAt: detail['updated_at'] as String? ?? '',
    url: detail['html_url'] as String? ?? '',
    baseBranch: detail['base'] is Map<String, dynamic>
        ? (detail['base'] as Map<String, dynamic>)['ref'] as String?
        : null,
    headBranch: detail['head'] is Map<String, dynamic>
        ? (detail['head'] as Map<String, dynamic>)['ref'] as String?
        : null,
  );
}

FileSummary _fileFromJson(dynamic value, Map<String, String> viewedStates) {
  final json = value as Map<String, dynamic>;
  final path = json['filename'] as String? ?? 'unknown';
  return FileSummary(
    path: path,
    previousPath: json['previous_filename'] as String?,
    additions: json['additions'] as int? ?? 0,
    deletions: json['deletions'] as int? ?? 0,
    status: json['status'] as String? ?? 'modified',
    patch: json['patch'] as String?,
    viewerViewedState: viewedStates[path] ?? 'UNKNOWN',
  );
}

ReviewThread _threadFromReviewComment(dynamic value) {
  final json = value as Map<String, dynamic>;
  return ReviewThread(
    id: '${json['id'] ?? json['node_id'] ?? json['url']}',
    authorLogin: json['user'] is Map<String, dynamic>
        ? (json['user'] as Map<String, dynamic>)['login'] as String?
        : null,
    filePath: json['path'] as String? ?? 'unknown',
    line: json['line'] as int?,
    state: 'unknown',
    body: json['body'] as String? ?? '',
    updatedAt: json['updated_at'] as String? ?? '',
  );
}

ReviewThread _threadFromGraphql(Map<String, dynamic> json) {
  final comments = json['comments'];
  final nodes = comments is Map<String, dynamic> ? comments['nodes'] : null;
  final commentNodes = nodes is List<dynamic>
      ? nodes.whereType<Map<String, dynamic>>().toList()
      : const <Map<String, dynamic>>[];
  final firstComment = commentNodes.isEmpty
      ? const <String, dynamic>{}
      : commentNodes.first;
  final author = firstComment['author'];
  final isResolved = json['isResolved'] as bool? ?? false;
  final isOutdated = json['isOutdated'] as bool? ?? false;

  return ReviewThread(
    id: json['id'] as String? ?? firstComment['id'] as String? ?? 'thread',
    authorLogin: author is Map<String, dynamic>
        ? author['login'] as String?
        : null,
    filePath:
        json['path'] as String? ?? firstComment['path'] as String? ?? 'unknown',
    line:
        json['line'] as int? ??
        json['originalLine'] as int? ??
        firstComment['line'] as int?,
    state: isResolved ? 'resolved' : (isOutdated ? 'outdated' : 'unresolved'),
    body: firstComment['body'] as String? ?? '',
    updatedAt: firstComment['updatedAt'] as String? ?? '',
  );
}

class ReviewRepositoryException implements Exception {
  const ReviewRepositoryException(this.message);

  final String message;

  @override
  String toString() => message;
}

class _Viewer {
  const _Viewer({required this.login});

  final String login;
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
