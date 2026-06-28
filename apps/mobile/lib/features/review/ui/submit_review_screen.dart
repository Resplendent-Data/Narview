import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/review_repository.dart';
import '../domain/review_models.dart';

class SubmitReviewScreen extends ConsumerWidget {
  const SubmitReviewScreen({super.key, this.owner, this.repo, this.number});

  final String? owner;
  final String? repo;
  final int? number;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final drafts = ref.watch(pendingDraftsProvider);
    final identity = owner == null || repo == null || number == null
        ? null
        : PullRequestIdentity(repository: '$owner/$repo', number: number!);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Submit Review'),
        leading: IconButton(
          tooltip: 'Back',
          onPressed: () => context.go(identity?.reviewRoutePath ?? '/'),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.rate_review_outlined),
                title: Text(
                  '${drafts.length} draft comment${drafts.length == 1 ? '' : 's'}',
                ),
                subtitle: const Text('GitHub Pending Review'),
              ),
            ),
            const SizedBox(height: 8),
            if (drafts.isEmpty)
              const Card(
                child: ListTile(
                  title: Text('No draft comments'),
                  subtitle: Text(
                    'Approve, comment, or request changes when GitHub writes are connected.',
                  ),
                ),
              ),
            for (final draft in drafts)
              Card(
                child: ListTile(
                  title: Text(
                    draft.path,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  subtitle: Text(
                    draft.body,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () =>
                    ref.read(pendingDraftsProvider.notifier).clear(),
                child: const Text('Discard'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: FilledButton(
                onPressed: () {},
                child: const Text('Submit'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
