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
