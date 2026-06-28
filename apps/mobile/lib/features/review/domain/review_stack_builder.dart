import 'review_models.dart';

class ReviewStackBuilder {
  ReviewStackModel build({
    required List<FileSummary> files,
    List<ReviewThread> reviewThreads = const [],
    Map<String, String> viewedOverrides = const {},
  }) {
    final commentCounts = _buildCommentCounts(reviewThreads);
    final stackFiles = files
        .map(
          (file) => _toReviewStackFile(
            file,
            commentCounts[file.path] ?? const _CommentCounts(0, 0),
            viewedOverrides,
          ),
        )
        .toList();
    final drafts = <String, _StackDraft>{};

    for (final file in stackFiles) {
      final classification = _classifyFile(file);
      final draft = drafts[classification.key];
      if (draft == null) {
        drafts[classification.key] = _StackDraft(
          id: 'stack:${classification.key}',
          title: classification.title,
          kind: classification.kind,
          order: classification.order,
          files: [file],
        );
      } else {
        draft.files.add(file);
      }
    }

    final stacks = drafts.values.map(_finalizeStack).toList()
      ..sort((left, right) {
        final order = left.order.compareTo(right.order);
        if (order != 0) return order;
        final title = left.title.compareTo(right.title);
        if (title != 0) return title;
        return left.id.compareTo(right.id);
      });

    return ReviewStackModel(
      stacks: stacks,
      files: stackFiles..sort(_compareFiles),
    );
  }

  ReviewStackFile _toReviewStackFile(
    FileSummary file,
    _CommentCounts counts,
    Map<String, String> viewedOverrides,
  ) {
    return ReviewStackFile(
      path: file.path,
      previousPath: file.previousPath,
      additions: file.additions,
      deletions: file.deletions,
      status: file.status,
      patch: file.patch,
      viewerViewedState:
          viewedOverrides[file.path] ??
          _normalizeViewedState(file.viewerViewedState),
      kind: _getFileKind(file),
      generated: _isGeneratedOrLowSignalPath(file.path),
      commentCount: counts.total,
      unresolvedCommentCount: counts.unresolved,
    );
  }

  Map<String, _CommentCounts> _buildCommentCounts(List<ReviewThread> threads) {
    final counts = <String, _MutableCommentCounts>{};
    for (final thread in threads) {
      final current = counts.putIfAbsent(
        thread.filePath,
        () => _MutableCommentCounts(),
      );
      current.total += 1;
      if (thread.state != 'resolved') {
        current.unresolved += 1;
      }
    }
    return counts.map(
      (path, count) =>
          MapEntry(path, _CommentCounts(count.total, count.unresolved)),
    );
  }

  ReviewStack _finalizeStack(_StackDraft draft) {
    final files = draft.files.toList()..sort(_compareFiles);
    final layers = <ReviewLayer>[];
    for (var index = 0; index < files.length; index += 1) {
      final file = files[index];
      layers.add(
        ReviewLayer(
          id: 'layer:${draft.id}:${_stableHash(file.path)}',
          stackId: draft.id,
          title: _getLayerTitle(file),
          order: index,
          filePaths: [file.path],
          ranges: _buildRanges(file),
          commentCount: file.commentCount,
          viewedState: file.viewerViewedState == 'VIEWED'
              ? 'viewed'
              : 'unviewed',
        ),
      );
    }

    final viewedFileCount = files
        .where((file) => file.viewerViewedState == 'VIEWED')
        .length;
    return ReviewStack(
      id: draft.id,
      title: draft.title,
      kind: draft.kind,
      order: draft.order,
      layers: layers,
      filePaths: files.map((file) => file.path).toList(),
      commentCount: files.fold(0, (sum, file) => sum + file.commentCount),
      viewedFileCount: viewedFileCount,
      totalFileCount: files.length,
    );
  }

  _FileClassification _classifyFile(ReviewStackFile file) {
    final path = file.path.toLowerCase();
    final moduleName = _getModuleName(file.path);

    if (file.generated) {
      return const _FileClassification(
        'generated',
        'Generated and low-signal files',
        'generated',
        900,
      );
    }
    if (_isDocsPath(path)) {
      return const _FileClassification(
        'docs',
        'Docs and release notes',
        'docs',
        800,
      );
    }
    if (_isTestPath(path)) {
      return _FileClassification(
        'tests:${_slugify(moduleName)}',
        'Tests for $moduleName',
        'tests',
        600 + _stableNumber(moduleName, 99),
      );
    }
    if (_isContractPath(path)) {
      return const _FileClassification(
        'contracts',
        'Contracts, schema, and setup',
        'contracts',
        100,
      );
    }
    if (_isInterfacePath(path)) {
      return _FileClassification(
        'interface:${_slugify(moduleName)}',
        'Interface: $moduleName',
        'interface',
        400 + _stableNumber(moduleName, 99),
      );
    }
    return _FileClassification(
      'core:${_slugify(moduleName)}',
      'Core: $moduleName',
      'core',
      200 + _stableNumber(moduleName, 99),
    );
  }

  List<ReviewStackRange> _buildRanges(ReviewStackFile file) {
    final patch = file.patch;
    if (patch == null || patch.isEmpty) {
      return [
        ReviewStackRange(
          id: '${file.path}:file',
          filePath: file.path,
          hunkId: null,
          startLine: null,
          endLine: null,
          changedLineCount: file.additions + file.deletions,
        ),
      ];
    }

    final ranges = <ReviewStackRange>[];
    var hunkIndex = 0;
    var newLine = 0;
    _MutableRange? current;
    final headerPattern = RegExp(r'^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@');

    for (final line in patch.split(RegExp(r'\r?\n'))) {
      final header = headerPattern.firstMatch(line);
      if (header != null) {
        if (current != null) {
          ranges.add(current.toRange());
        }
        hunkIndex += 1;
        newLine = int.parse(header.group(1)!);
        current = _MutableRange(
          id: '${file.path}:hunk-$hunkIndex',
          filePath: file.path,
          hunkId: 'hunk-$hunkIndex',
          startLine: newLine,
          endLine: newLine,
        );
        continue;
      }

      if (current == null || line.startsWith(r'\ No newline')) {
        continue;
      }

      if (line.startsWith('+') && !line.startsWith('+++')) {
        current.changedLineCount += 1;
        current.endLine = newLine;
        newLine += 1;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        current.changedLineCount += 1;
      } else {
        current.endLine = newLine;
        newLine += 1;
      }
    }

    if (current != null) {
      ranges.add(current.toRange());
    }

    if (ranges.isNotEmpty) {
      return ranges;
    }
    return _buildRanges(
      ReviewStackFile(
        path: file.path,
        previousPath: file.previousPath,
        additions: file.additions,
        deletions: file.deletions,
        status: file.status,
        patch: null,
        viewerViewedState: file.viewerViewedState,
        kind: file.kind,
        generated: file.generated,
        commentCount: file.commentCount,
        unresolvedCommentCount: file.unresolvedCommentCount,
      ),
    );
  }
}

String getStackProgressLabel(ReviewStack stack) =>
    '${stack.viewedFileCount}/${stack.totalFileCount} viewed';

String _normalizeViewedState(String? value) {
  return value == 'VIEWED' || value == 'UNVIEWED' ? value! : 'UNKNOWN';
}

String _getLayerTitle(ReviewStackFile file) {
  final name = file.path.split('/').last;
  if (file.previousPath != null && file.previousPath != file.path) {
    return '$name renamed';
  }
  return name;
}

String _getModuleName(String path) {
  final parts = path.split('/').where((part) => part.isNotEmpty).toList();
  if (parts.isEmpty) return 'root';
  if (parts.first == 'src' && parts.length > 1) {
    return parts
        .sublist(0, parts.length - 1 < 2 ? parts.length - 1 : 2)
        .join('/');
  }
  if (parts.first == 'src-tauri' && parts.length > 2) {
    return parts.sublist(0, 3).join('/');
  }
  return parts.length > 1 ? parts.first : 'root';
}

int _compareFiles(ReviewStackFile left, ReviewStackFile right) {
  final comments = right.unresolvedCommentCount.compareTo(
    left.unresolvedCommentCount,
  );
  if (comments != 0) return comments;
  return left.path.compareTo(right.path);
}

String _getFileKind(FileSummary file) {
  final extension = _extension(file.path.toLowerCase());
  if (_imageExtensions.contains(extension)) return 'image';
  if (file.status == 'binary') return 'binary';
  if (_nonTextExtensions.contains(extension)) return 'non-text';
  return 'text';
}

String _extension(String path) {
  final fileName = path.split('/').last;
  final lastDot = fileName.lastIndexOf('.');
  return lastDot >= 0 ? fileName.substring(lastDot) : '';
}

bool _isContractPath(String path) {
  return RegExp(
        r'(^|/)(schema|schemas|migrations?|proto|protos|graphql|openapi|api-specs?)(/|$)',
      ).hasMatch(path) ||
      RegExp(
        r'(^|/)(package\.json|package-lock\.json|cargo\.toml|cargo\.lock|tsconfig[^/]*\.json|vite\.config\.[jt]s|tailwind\.config\.[jt]s|postcss\.config\.js)$',
      ).hasMatch(path) ||
      RegExp(r'\.(sql|graphql|gql|proto|ya?ml|toml)$').hasMatch(path);
}

bool _isInterfacePath(String path) {
  return RegExp(
        r'(^|/)(app|pages|routes|screens|views|components|ui)(/|$)',
      ).hasMatch(path) ||
      RegExp(r'\.(css|scss|sass)$').hasMatch(path) ||
      RegExp(
        r'\b(app|page|route|view|screen|component)\.[jt]sx?$',
      ).hasMatch(path);
}

bool _isTestPath(String path) {
  return RegExp(
        r'(^|/)(__tests__|tests?|specs?|fixtures?)(/|$)',
      ).hasMatch(path) ||
      RegExp(r'\.(test|spec)\.[jt]sx?$').hasMatch(path);
}

bool _isDocsPath(String path) {
  return path.startsWith('docs/') ||
      path.startsWith('prds/') ||
      RegExp(r'(^|/)(readme|changelog|license)(\.[a-z0-9]+)?$').hasMatch(path);
}

bool _isGeneratedOrLowSignalPath(String path) {
  final normalized = path.replaceAll('\\', '/').toLowerCase();
  final fileName = normalized.split('/').last;
  final segments = normalized.split('/');
  return _generatedExactFiles.contains(fileName) ||
      _generatedPathSegments.any(segments.contains) ||
      _generatedFileEndings.any(normalized.endsWith);
}

String _slugify(String value) {
  final slug = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'(^-|-$)'), '');
  return slug.isEmpty ? 'root' : slug;
}

int _stableNumber(String value, int modulo) {
  return _stableHash(value).codeUnits.fold(0, (sum, unit) => sum + unit) %
      modulo;
}

String _stableHash(String value) {
  var hash = 5381;
  for (final unit in value.codeUnits) {
    hash = (hash * 33) ^ unit;
  }
  return (hash & 0xffffffff).toRadixString(36);
}

const _imageExtensions = {
  '.avif',
  '.gif',
  '.heic',
  '.jpeg',
  '.jpg',
  '.png',
  '.svg',
  '.webp',
};
const _nonTextExtensions = {
  '.docx',
  '.ipynb',
  '.key',
  '.numbers',
  '.pages',
  '.pdf',
  '.pptx',
  '.sqlite',
  '.xlsx',
};
const _generatedPathSegments = {
  '__generated__',
  'generated',
  'vendor',
  'vendors',
  'third_party',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'out',
};
const _generatedFileEndings = {
  '.lock',
  '.min.js',
  '.min.css',
  '.bundle.js',
  '.generated.ts',
  '.generated.tsx',
  '.generated.js',
  '.generated.jsx',
  '.pb.go',
  '.pb.ts',
  '.pb.js',
  '.snap',
};
const _generatedExactFiles = {
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'poetry.lock',
  'cargo.lock',
  'gemfile.lock',
};

class _FileClassification {
  const _FileClassification(this.key, this.title, this.kind, this.order);

  final String key;
  final String title;
  final String kind;
  final int order;
}

class _StackDraft {
  _StackDraft({
    required this.id,
    required this.title,
    required this.kind,
    required this.order,
    required this.files,
  });

  final String id;
  final String title;
  final String kind;
  final int order;
  final List<ReviewStackFile> files;
}

class _CommentCounts {
  const _CommentCounts(this.total, this.unresolved);

  final int total;
  final int unresolved;
}

class _MutableCommentCounts {
  int total = 0;
  int unresolved = 0;
}

class _MutableRange {
  _MutableRange({
    required this.id,
    required this.filePath,
    required this.hunkId,
    required this.startLine,
    required this.endLine,
  });

  final String id;
  final String filePath;
  final String hunkId;
  final int startLine;
  int endLine;
  int changedLineCount = 0;

  ReviewStackRange toRange() {
    return ReviewStackRange(
      id: id,
      filePath: filePath,
      hunkId: hunkId,
      startLine: startLine,
      endLine: endLine,
      changedLineCount: changedLineCount,
    );
  }
}
