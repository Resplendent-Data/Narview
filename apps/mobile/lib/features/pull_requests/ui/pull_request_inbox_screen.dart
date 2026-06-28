import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../review/data/review_repository.dart';

class PullRequestInboxScreen extends ConsumerWidget {
  const PullRequestInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pullRequests = ref.watch(pullRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Narview'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () => ref.invalidate(pullRequestsProvider),
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: pullRequests.when(
          data: (items) => ListView(
            padding: const EdgeInsets.all(12),
            children: [
              _WorkspaceHeader(count: items.length),
              const SizedBox(height: 12),
              for (final pullRequest in items)
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.call_merge),
                    title: Text(
                      pullRequest.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(
                      '${pullRequest.repository} #${pullRequest.number}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.go(
                      '/pulls/resplendent-data-narview/${pullRequest.number}',
                    ),
                  ),
                ),
            ],
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) =>
              Center(child: Text('Could not load pull requests: $error')),
        ),
      ),
    );
  }
}

class _WorkspaceHeader extends StatelessWidget {
  const _WorkspaceHeader({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const Icon(Icons.account_tree_outlined),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Workspace',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text('$count pull request${count == 1 ? '' : 's'} ready'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
