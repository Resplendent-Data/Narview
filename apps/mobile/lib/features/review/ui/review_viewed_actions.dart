import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/review_repository.dart';
import '../domain/review_models.dart';

Future<bool> syncFileViewedChange({
  required BuildContext context,
  required WidgetRef ref,
  required PullRequestIdentity identity,
  required ReviewStackFile file,
  required bool viewed,
  bool showMessage = true,
}) async {
  final previousState = file.viewerViewedState;
  final nextState = viewed ? 'VIEWED' : 'UNVIEWED';
  ref
      .read(viewedOverridesProvider.notifier)
      .setFileState(identity, file.path, nextState);

  try {
    final result = await ref
        .read(reviewRepositoryProvider)
        .setFileViewed(identity: identity, path: file.path, viewed: viewed);
    ref
        .read(viewedOverridesProvider.notifier)
        .setFileState(identity, result.path, result.viewerViewedState);
    if (showMessage && context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.message)));
    }
    return true;
  } catch (error) {
    ref
        .read(viewedOverridesProvider.notifier)
        .setFileState(identity, file.path, previousState);
    if (showMessage && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update viewed state: $error')),
      );
    }
    return false;
  }
}
