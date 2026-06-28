import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/review_repository.dart';
import '../domain/review_models.dart';
import '../domain/review_stack_builder.dart';

class PullRequestOverviewScreen extends ConsumerWidget {
  const PullRequestOverviewScreen({
    super.key,
    required this.owner,
    required this.repo,
    required this.number,
  });

  final String owner;
  final String repo;
  final int number;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final identity = PullRequestIdentity(
      repository: '$owner/$repo',
      number: number,
    );
    final data = ref.watch(pullRequestReviewDataProvider(identity));
    final stackModel = ref.watch(reviewStackModelProvider(identity));

    return Scaffold(
      appBar: AppBar(
        title: Text('#$number'),
        leading: IconButton(
          tooltip: 'Back',
          onPressed: () => context.go('/'),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: SafeArea(
        child: data.when(
          data: (reviewData) => stackModel.when(
            data: (model) => ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          reviewData.pullRequest.repository,
                          style: Theme.of(context).textTheme.labelLarge,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          reviewData.pullRequest.title,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            Chip(
                              label: Text('${reviewData.files.length} files'),
                            ),
                            Chip(
                              label: Text(
                                '${reviewData.reviewThreads.length} threads',
                              ),
                            ),
                            Chip(
                              label: Text('${reviewData.checks.length} checks'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                for (final stack in model.stacks)
                  Card(
                    child: ListTile(
                      title: Text(stack.title),
                      subtitle: Text(getStackProgressLabel(stack)),
                      trailing: Text('${stack.commentCount}'),
                    ),
                  ),
              ],
            ),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) =>
                Center(child: Text('Could not build review stacks: $error')),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) =>
              Center(child: Text('Could not load pull request: $error')),
        ),
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.all(12),
        child: FilledButton.icon(
          onPressed: () => context.go(identity.reviewRoutePath),
          icon: const Icon(Icons.play_arrow),
          label: const Text('Start Review'),
        ),
      ),
    );
  }
}
