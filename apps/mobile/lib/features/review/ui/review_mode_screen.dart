import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/review_repository.dart';
import '../domain/review_models.dart';
import 'widgets/diff_view.dart';

class ReviewModeScreen extends ConsumerStatefulWidget {
  const ReviewModeScreen({
    super.key,
    required this.owner,
    required this.repo,
    required this.number,
  });

  final String owner;
  final String repo;
  final int number;

  @override
  ConsumerState<ReviewModeScreen> createState() => _ReviewModeScreenState();
}

class _ReviewModeScreenState extends ConsumerState<ReviewModeScreen> {
  int _layerIndex = 0;

  @override
  Widget build(BuildContext context) {
    final identity = PullRequestIdentity(
      repository: '${widget.owner}/${widget.repo}',
      number: widget.number,
    );
    final data = ref.watch(pullRequestReviewDataProvider(identity));
    final stackModel = ref.watch(reviewStackModelProvider(identity));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Review'),
        leading: IconButton(
          tooltip: 'Overview',
          onPressed: () => context.go(identity.routePath),
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
          data: (reviewData) => stackModel.when(
            data: (model) => _ReviewContent(
              data: reviewData,
              model: model,
              layerIndex: _layerIndex,
              onSelectLayer: (index) => setState(() => _layerIndex = index),
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
    );
  }
}

class _ReviewContent extends ConsumerWidget {
  const _ReviewContent({
    required this.data,
    required this.model,
    required this.layerIndex,
    required this.onSelectLayer,
  });

  final PullRequestReviewData data;
  final ReviewStackModel model;
  final int layerIndex;
  final ValueChanged<int> onSelectLayer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layers = _allLayers(model);
    if (layers.isEmpty) {
      return const Center(child: Text('No changed files.'));
    }

    final selectedLayer = layers[layerIndex.clamp(0, layers.length - 1)];
    final selectedPath = selectedLayer.filePaths.first;
    final selectedFile = model.fileByPath(selectedPath);
    final threads = data.reviewThreads
        .where((thread) => thread.filePath == selectedPath)
        .toList();

    return Column(
      children: [
        Material(
          color: Colors.white,
          child: ListTile(
            dense: true,
            title: Text(
              selectedLayer.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            subtitle: Text(
              selectedPath,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: IconButton(
              tooltip: 'Review stacks',
              onPressed: () =>
                  _showLayerPicker(context, layers, layerIndex, onSelectLayer),
              icon: const Icon(Icons.layers_outlined),
            ),
          ),
        ),
        Expanded(
          child: DiffView(path: selectedPath, patch: selectedFile?.patch),
        ),
        _ReviewActionBar(
          canGoBack: layerIndex > 0,
          canGoNext: layerIndex < layers.length - 1,
          onBack: () => onSelectLayer(layerIndex - 1),
          onNext: () => onSelectLayer(layerIndex + 1),
          onThreads: () => _showThreads(context, threads),
          onComment: () => _showComposer(context, ref, selectedPath),
          viewedLabel: selectedLayer.viewedState == 'viewed'
              ? 'Viewed'
              : 'Mark Viewed',
        ),
      ],
    );
  }
}

class _ReviewActionBar extends StatelessWidget {
  const _ReviewActionBar({
    required this.canGoBack,
    required this.canGoNext,
    required this.onBack,
    required this.onNext,
    required this.onThreads,
    required this.onComment,
    required this.viewedLabel,
  });

  final bool canGoBack;
  final bool canGoNext;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final VoidCallback onThreads;
  final VoidCallback onComment;
  final String viewedLabel;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 8,
      color: Colors.white,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 480) {
              return Row(
                children: [
                  _CompactActionButton(
                    tooltip: 'Previous',
                    onPressed: canGoBack ? onBack : null,
                    icon: Icons.chevron_left,
                  ),
                  _CompactActionButton(
                    tooltip: 'Next',
                    onPressed: canGoNext ? onNext : null,
                    icon: Icons.chevron_right,
                  ),
                  _CompactActionButton(
                    tooltip: 'Threads',
                    onPressed: onThreads,
                    icon: Icons.forum_outlined,
                  ),
                  _CompactActionButton(
                    tooltip: 'Comment',
                    onPressed: onComment,
                    icon: Icons.add_comment_outlined,
                  ),
                  _CompactActionButton(
                    tooltip: viewedLabel,
                    onPressed: () {},
                    icon: Icons.check,
                    filled: true,
                  ),
                ],
              );
            }

            return Row(
              children: [
                IconButton(
                  tooltip: 'Previous',
                  onPressed: canGoBack ? onBack : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                IconButton(
                  tooltip: 'Next',
                  onPressed: canGoNext ? onNext : null,
                  icon: const Icon(Icons.chevron_right),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: onThreads,
                  icon: const Icon(Icons.forum_outlined),
                  label: const Text('Threads'),
                ),
                TextButton.icon(
                  onPressed: onComment,
                  icon: const Icon(Icons.add_comment_outlined),
                  label: const Text('Comment'),
                ),
                FilledButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.check),
                  label: Text(viewedLabel),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CompactActionButton extends StatelessWidget {
  const _CompactActionButton({
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

List<ReviewLayer> _allLayers(ReviewStackModel model) {
  return model.stacks.expand((stack) => stack.layers).toList();
}

void _showLayerPicker(
  BuildContext context,
  List<ReviewLayer> layers,
  int selectedIndex,
  ValueChanged<int> onSelectLayer,
) {
  showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (context) => ListView.builder(
      itemCount: layers.length,
      itemBuilder: (context, index) {
        final layer = layers[index];
        return ListTile(
          selected: index == selectedIndex,
          leading: Icon(
            layer.viewedState == 'viewed'
                ? Icons.check_circle
                : Icons.radio_button_unchecked,
          ),
          title: Text(layer.title),
          subtitle: Text(layer.filePaths.first),
          onTap: () {
            Navigator.of(context).pop();
            onSelectLayer(index);
          },
        );
      },
    ),
  );
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
