class PullRequestIdentity {
  const PullRequestIdentity({required this.repository, required this.number});

  final String repository;
  final int number;

  String get owner => repository.split('/').first;

  String get name => repository.split('/').last;

  String get routePath => '/pulls/$owner/$name/$number';

  String get reviewRoutePath => '/pulls/$owner/$name/$number/review';

  String get submitRoutePath => '/pulls/$owner/$name/$number/submit-review';

  @override
  bool operator ==(Object other) {
    return other is PullRequestIdentity &&
        other.repository.toLowerCase() == repository.toLowerCase() &&
        other.number == number;
  }

  @override
  int get hashCode => Object.hash(repository.toLowerCase(), number);
}

class PullRequestSummary {
  const PullRequestSummary({
    required this.repository,
    required this.number,
    required this.title,
    required this.authorLogin,
    required this.isDraft,
    required this.updatedAt,
    required this.url,
    this.baseBranch,
    this.headBranch,
  });

  final String repository;
  final int number;
  final String title;
  final String? authorLogin;
  final bool isDraft;
  final String updatedAt;
  final String url;
  final String? baseBranch;
  final String? headBranch;

  PullRequestIdentity get identity =>
      PullRequestIdentity(repository: repository, number: number);
}

class FileSummary {
  const FileSummary({
    required this.path,
    required this.additions,
    required this.deletions,
    required this.status,
    this.previousPath,
    this.patch,
    this.viewerViewedState,
  });

  factory FileSummary.fromJson(Map<String, dynamic> json) {
    return FileSummary(
      path: json['path'] as String,
      previousPath: json['previousPath'] as String?,
      additions: json['additions'] as int,
      deletions: json['deletions'] as int,
      status: json['status'] as String,
      patch: json['patch'] as String?,
      viewerViewedState: json['viewerViewedState'] as String?,
    );
  }

  final String path;
  final String? previousPath;
  final int additions;
  final int deletions;
  final String status;
  final String? patch;
  final String? viewerViewedState;
}

class ReviewThread {
  const ReviewThread({
    required this.id,
    required this.authorLogin,
    required this.filePath,
    required this.line,
    required this.state,
    required this.body,
    required this.updatedAt,
  });

  factory ReviewThread.fromJson(Map<String, dynamic> json) {
    return ReviewThread(
      id: json['id'] as String,
      authorLogin: json['authorLogin'] as String?,
      filePath: json['filePath'] as String,
      line: json['line'] as int?,
      state: json['state'] as String,
      body: json['body'] as String,
      updatedAt: json['updatedAt'] as String,
    );
  }

  final String id;
  final String? authorLogin;
  final String filePath;
  final int? line;
  final String state;
  final String body;
  final String updatedAt;
}

class CheckRun {
  const CheckRun({
    required this.name,
    required this.status,
    required this.conclusion,
  });

  final String name;
  final String status;
  final String? conclusion;
}

class PullRequestReviewData {
  const PullRequestReviewData({
    required this.pullRequest,
    required this.files,
    required this.reviewThreads,
    required this.checks,
    required this.fetchedAtEpochMs,
  });

  final PullRequestSummary pullRequest;
  final List<FileSummary> files;
  final List<ReviewThread> reviewThreads;
  final List<CheckRun> checks;
  final int fetchedAtEpochMs;
}

class ReviewStackFile {
  const ReviewStackFile({
    required this.path,
    required this.previousPath,
    required this.additions,
    required this.deletions,
    required this.status,
    required this.patch,
    required this.viewerViewedState,
    required this.kind,
    required this.generated,
    required this.commentCount,
    required this.unresolvedCommentCount,
  });

  final String path;
  final String? previousPath;
  final int additions;
  final int deletions;
  final String status;
  final String? patch;
  final String viewerViewedState;
  final String kind;
  final bool generated;
  final int commentCount;
  final int unresolvedCommentCount;
}

class ReviewStackRange {
  const ReviewStackRange({
    required this.id,
    required this.filePath,
    required this.hunkId,
    required this.startLine,
    required this.endLine,
    required this.changedLineCount,
  });

  final String id;
  final String filePath;
  final String? hunkId;
  final int? startLine;
  final int? endLine;
  final int changedLineCount;
}

class ReviewLayer {
  const ReviewLayer({
    required this.id,
    required this.stackId,
    required this.title,
    required this.order,
    required this.filePaths,
    required this.ranges,
    required this.commentCount,
    required this.viewedState,
  });

  final String id;
  final String stackId;
  final String title;
  final int order;
  final List<String> filePaths;
  final List<ReviewStackRange> ranges;
  final int commentCount;
  final String viewedState;
}

class ReviewStack {
  const ReviewStack({
    required this.id,
    required this.title,
    required this.kind,
    required this.order,
    required this.layers,
    required this.filePaths,
    required this.commentCount,
    required this.viewedFileCount,
    required this.totalFileCount,
  });

  final String id;
  final String title;
  final String kind;
  final int order;
  final List<ReviewLayer> layers;
  final List<String> filePaths;
  final int commentCount;
  final int viewedFileCount;
  final int totalFileCount;
}

class ReviewStackModel {
  const ReviewStackModel({required this.stacks, required this.files});

  final List<ReviewStack> stacks;
  final List<ReviewStackFile> files;

  ReviewStackFile? fileByPath(String path) {
    for (final file in files) {
      if (file.path == path) {
        return file;
      }
    }
    return null;
  }
}

class PendingReviewDraft {
  const PendingReviewDraft({
    required this.id,
    required this.path,
    required this.body,
    required this.targetLabel,
  });

  final String id;
  final String path;
  final String body;
  final String targetLabel;
}
