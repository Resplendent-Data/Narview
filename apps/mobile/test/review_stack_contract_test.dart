import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:narview_mobile/features/review/domain/review_models.dart';
import 'package:narview_mobile/features/review/domain/review_stack_builder.dart';

void main() {
  test('matches the shared review stack contract fixture', () {
    final fixture = _readFixture();
    final input = fixture['input'] as Map<String, dynamic>;
    final expected = fixture['expected'] as Map<String, dynamic>;
    final files = (input['files'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(FileSummary.fromJson)
        .toList();
    final threads = (input['reviewThreads'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map(ReviewThread.fromJson)
        .toList();

    final model = ReviewStackBuilder().build(
      files: files,
      reviewThreads: threads,
    );

    expect(_summarizeStacks(model.stacks), expected['stacks']);
  });

  test(
    'unknown and outdated review thread states do not count as unresolved',
    () {
      final model = ReviewStackBuilder().build(
        files: const [
          FileSummary(
            path: 'apps/mobile/lib/app.dart',
            additions: 3,
            deletions: 1,
            status: 'modified',
          ),
        ],
        reviewThreads: const [
          ReviewThread(
            id: 'fallback-comment',
            authorLogin: 'reviewer',
            filePath: 'apps/mobile/lib/app.dart',
            line: 12,
            state: 'unknown',
            body: 'Fallback REST comment without thread resolution state.',
            updatedAt: '2026-06-28T00:00:00Z',
          ),
          ReviewThread(
            id: 'outdated-thread',
            authorLogin: 'reviewer',
            filePath: 'apps/mobile/lib/app.dart',
            line: 14,
            state: 'outdated',
            body: 'Thread on an outdated diff.',
            updatedAt: '2026-06-28T00:01:00Z',
          ),
        ],
      );

      expect(model.files.single.commentCount, 2);
      expect(model.files.single.unresolvedCommentCount, 0);
    },
  );
}

Map<String, dynamic> _readFixture() {
  final candidates = [
    File('packages/contracts/fixtures/review-stack-basic.json'),
    File('../../packages/contracts/fixtures/review-stack-basic.json'),
  ];
  final file = candidates.firstWhere((candidate) => candidate.existsSync());
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

List<Map<String, dynamic>> _summarizeStacks(List<ReviewStack> stacks) {
  return stacks
      .map(
        (stack) => {
          'title': stack.title,
          'kind': stack.kind,
          'filePaths': stack.filePaths,
          'viewedFileCount': stack.viewedFileCount,
          'totalFileCount': stack.totalFileCount,
          'commentCount': stack.commentCount,
          'layers': stack.layers
              .map(
                (layer) => {
                  'title': layer.title,
                  'filePaths': layer.filePaths,
                  'viewedState': layer.viewedState,
                  'commentCount': layer.commentCount,
                },
              )
              .toList(),
        },
      )
      .toList();
}
