import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/review_repository.dart';
import '../domain/review_models.dart';
import '../domain/review_stack_builder.dart';
import 'review_viewed_actions.dart';
import 'widgets/diff_view.dart';

class ReviewStackScreen extends ConsumerStatefulWidget {
  const ReviewStackScreen({
    super.key,
    required this.owner,
    required this.repo,
    required this.number,
    required this.stackIndex,
  });

  final String owner;
  final String repo;
  final int number;
  final int stackIndex;

  @override
  ConsumerState<ReviewStackScreen> createState() => _ReviewStackScreenState();
}

class _ReviewStackScreenState extends ConsumerState<ReviewStackScreen> {
  bool _busy = false;

  PullRequestIdentity get _identity => PullRequestIdentity(
    repository: '${widget.owner}/${widget.repo}',
    number: widget.number,
  );

  @override
  Widget build(BuildContext context) {
    final identity = _identity;
    final model = ref.watch(reviewStackModelProvider(identity));

    return Scaffold(
      appBar: AppBar(
        title: Text('#${identity.number}'),
        leading: IconButton(
          tooltip: 'Pull Request',
          onPressed: () => context.go(identity.routePath),
          icon: const Icon(Icons.arrow_back),
        ),
      ),
      body: SafeArea(
        child: model.when(
          data: (stackModel) {
            if (stackModel.stacks.isEmpty) {
              return const Center(child: Text('No changed files.'));
            }
            final stackIndex = _boundedIndex(
              widget.stackIndex,
              stackModel.stacks.length,
            );
            final stack = stackModel.stacks[stackIndex];
            final files = stack.filePaths
                .map(stackModel.fileByPath)
                .whereType<ReviewStackFile>()
                .toList();
            return ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stack.title,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(getStackProgressLabel(stack)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            Chip(label: Text('${files.length} files')),
                            if (stack.commentCount > 0)
                              Chip(
                                label: Text('${stack.commentCount} comments'),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: _busy || files.every(_isViewed)
                                ? null
                                : () => _markStackViewed(
                                    identity,
                                    stack.title,
                                    files,
                                  ),
                            icon: _busy
                                ? const SizedBox.square(
                                    dimension: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.done_all),
                            label: const Text('Mark Stack Viewed'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                for (var index = 0; index < files.length; index += 1)
                  _FileListCard(
                    file: files[index],
                    onTap: () =>
                        context.go(identity.fileRoutePath(stackIndex, index)),
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) =>
              Center(child: Text('Could not load stack: $error')),
        ),
      ),
    );
  }

  Future<void> _markStackViewed(
    PullRequestIdentity identity,
    String title,
    List<ReviewStackFile> files,
  ) async {
    setState(() => _busy = true);
    var changed = 0;
    var failed = 0;
    for (final file in files.where((file) => !_isViewed(file))) {
      if (!mounted) return;
      final ok = await syncFileViewedChange(
        context: context,
        ref: ref,
        identity: identity,
        file: file,
        viewed: true,
        showMessage: false,
      );
      if (ok) {
        changed += 1;
      } else {
        failed += 1;
      }
    }
    if (!mounted) return;
    setState(() => _busy = false);
    final message = failed == 0
        ? 'Marked $changed file${changed == 1 ? '' : 's'} viewed in $title.'
        : 'Marked $changed file${changed == 1 ? '' : 's'} viewed. $failed failed.';
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }
}

class ReviewFileScreen extends ConsumerStatefulWidget {
  const ReviewFileScreen({
    super.key,
    required this.owner,
    required this.repo,
    required this.number,
    required this.stackIndex,
    required this.fileIndex,
  });

  final String owner;
  final String repo;
  final int number;
  final int stackIndex;
  final int fileIndex;

  @override
  ConsumerState<ReviewFileScreen> createState() => _ReviewFileScreenState();
}

class _ReviewFileScreenState extends ConsumerState<ReviewFileScreen> {
  bool _busy = false;

  PullRequestIdentity get _identity => PullRequestIdentity(
    repository: '${widget.owner}/${widget.repo}',
    number: widget.number,
  );

  @override
  Widget build(BuildContext context) {
    final identity = _identity;
    final data = ref.watch(pullRequestReviewDataProvider(identity));
    final model = ref.watch(reviewStackModelProvider(identity));

    return Scaffold(
      appBar: AppBar(
        title: const Text('File'),
        leading: IconButton(
          tooltip: 'Stack',
          onPressed: () =>
              context.go(identity.stackRoutePath(widget.stackIndex)),
          icon: const Icon(Icons.arrow_back),
        ),
        actions: [
          IconButton(
            tooltip: 'Submit review',
            onPressed: () => context.go(identity.submitRoutePath),
            icon: const Icon(Icons.send),
          ),
        ],
      ),
      body: SafeArea(
        child: data.when(
          data: (reviewData) => model.when(
            data: (stackModel) =>
                _buildLoaded(context, identity, reviewData, stackModel),
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (error, stackTrace) =>
                Center(child: Text('Could not load file: $error')),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) =>
              Center(child: Text('Could not load pull request: $error')),
        ),
      ),
    );
  }

  Widget _buildLoaded(
    BuildContext context,
    PullRequestIdentity identity,
    PullRequestReviewData data,
    ReviewStackModel model,
  ) {
    if (model.stacks.isEmpty) {
      return const Center(child: Text('No changed files.'));
    }
    final stackIndex = _boundedIndex(widget.stackIndex, model.stacks.length);
    final stack = model.stacks[stackIndex];
    final files = stack.filePaths
        .map(model.fileByPath)
        .whereType<ReviewStackFile>()
        .toList();
    if (files.isEmpty) {
      return const Center(child: Text('No files in this stack.'));
    }

    final fileIndex = _boundedIndex(widget.fileIndex, files.length);
    final file = files[fileIndex];
    final threads = data.reviewThreads
        .where((thread) => thread.filePath == file.path)
        .toList();

    return Column(
      children: [
        Material(
          color: Colors.white,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.path.split('/').last,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 2),
                Text(
                  file.path,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Chip(label: Text(stack.title)),
                    Chip(label: Text('+${file.additions} -${file.deletions}')),
                    if (threads.isNotEmpty)
                      Chip(label: Text('${threads.length} threads')),
                  ],
                ),
              ],
            ),
          ),
        ),
        Expanded(
          child: DiffView(path: file.path, patch: file.patch),
        ),
        _FileActionBar(
          canGoBack: fileIndex > 0,
          canGoNext: fileIndex < files.length - 1,
          viewed: _isViewed(file),
          busy: _busy,
          onBack: () =>
              context.go(identity.fileRoutePath(stackIndex, fileIndex - 1)),
          onNext: () =>
              context.go(identity.fileRoutePath(stackIndex, fileIndex + 1)),
          onThreads: () => _showThreads(context, threads),
          onComment: () => _showComposer(context, ref, file.path),
          onToggleViewed: () => _toggleViewed(identity, file),
        ),
      ],
    );
  }

  Future<void> _toggleViewed(
    PullRequestIdentity identity,
    ReviewStackFile file,
  ) async {
    setState(() => _busy = true);
    await syncFileViewedChange(
      context: context,
      ref: ref,
      identity: identity,
      file: file,
      viewed: !_isViewed(file),
    );
    if (mounted) {
      setState(() => _busy = false);
    }
  }
}

class _FileListCard extends StatelessWidget {
  const _FileListCard({required this.file, required this.onTap});

  final ReviewStackFile file;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: _ViewedIcon(viewed: _isViewed(file)),
        title: Text(file.path, maxLines: 2, overflow: TextOverflow.ellipsis),
        subtitle: Text(
          '+${file.additions} -${file.deletions}'
          '${file.commentCount > 0 ? ' · ${file.commentCount} comments' : ''}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}

class _FileActionBar extends StatelessWidget {
  const _FileActionBar({
    required this.canGoBack,
    required this.canGoNext,
    required this.viewed,
    required this.busy,
    required this.onBack,
    required this.onNext,
    required this.onThreads,
    required this.onComment,
    required this.onToggleViewed,
  });

  final bool canGoBack;
  final bool canGoNext;
  final bool viewed;
  final bool busy;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final VoidCallback onThreads;
  final VoidCallback onComment;
  final VoidCallback onToggleViewed;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      color: Colors.white,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        child: Row(
          children: [
            _BarButton(
              tooltip: 'Previous file',
              onPressed: canGoBack ? onBack : null,
              icon: Icons.chevron_left,
            ),
            _BarButton(
              tooltip: 'Next file',
              onPressed: canGoNext ? onNext : null,
              icon: Icons.chevron_right,
            ),
            _BarButton(
              tooltip: 'Threads',
              onPressed: onThreads,
              icon: Icons.forum_outlined,
            ),
            _BarButton(
              tooltip: 'Comment',
              onPressed: onComment,
              icon: Icons.add_comment_outlined,
            ),
            _BarButton(
              tooltip: viewed ? 'Mark unviewed' : 'Mark viewed',
              onPressed: busy ? null : onToggleViewed,
              icon: viewed ? Icons.check_circle : Icons.radio_button_unchecked,
              filled: viewed,
            ),
          ],
        ),
      ),
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({
    required this.tooltip,
    required this.onPressed,
    required this.icon,
    this.filled = false,
  });

  final String tooltip;
  final VoidCallback? onPressed;
  final IconData icon;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final button = filled
        ? IconButton.filled(
            tooltip: tooltip,
            onPressed: onPressed,
            icon: Icon(icon),
          )
        : IconButton(tooltip: tooltip, onPressed: onPressed, icon: Icon(icon));
    return Expanded(child: Center(child: button));
  }
}

class _ViewedIcon extends StatelessWidget {
  const _ViewedIcon({required this.viewed});

  final bool viewed;

  @override
  Widget build(BuildContext context) {
    return Icon(
      viewed ? Icons.check_circle : Icons.radio_button_unchecked,
      color: viewed ? Colors.green.shade700 : Colors.grey.shade600,
    );
  }
}

bool _isViewed(ReviewStackFile file) => file.viewerViewedState == 'VIEWED';

int _boundedIndex(int index, int length) {
  if (length <= 0 || index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

void _showThreads(BuildContext context, List<ReviewThread> threads) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) => ListView(
      padding: const EdgeInsets.all(12),
      children: [
        Text('Threads', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (threads.isEmpty)
          const Card(
            child: ListTile(
              leading: Icon(Icons.forum_outlined),
              title: Text('No threads on this file'),
            ),
          ),
        for (final thread in threads)
          Card(
            child: ListTile(
              title: Text(thread.authorLogin ?? 'Unknown'),
              subtitle: Text(thread.body),
              trailing: Chip(label: Text(thread.state)),
            ),
          ),
      ],
    ),
  );
}

void _showComposer(BuildContext context, WidgetRef ref, String path) {
  final controller = TextEditingController();
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (context) => Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Pending Review',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(path, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 8),
          TextField(
            controller: controller,
            minLines: 4,
            maxLines: 8,
            decoration: const InputDecoration(
              border: OutlineInputBorder(),
              hintText: 'Review comment',
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () {
              final body = controller.text.trim();
              if (body.isEmpty) {
                return;
              }
              ref
                  .read(pendingDraftsProvider.notifier)
                  .addDraft(
                    PendingReviewDraft(
                      id: 'draft-${DateTime.now().microsecondsSinceEpoch}',
                      path: path,
                      body: body,
                      targetLabel: path,
                    ),
                  );
              Navigator.of(context).pop();
            },
            icon: const Icon(Icons.add_comment_outlined),
            label: const Text('Add Draft'),
          ),
        ],
      ),
    ),
  );
}
