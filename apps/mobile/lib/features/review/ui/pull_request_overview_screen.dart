import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/review_repository.dart';
import '../domain/review_models.dart';
import '../domain/review_stack_builder.dart';
import 'review_viewed_actions.dart';
import 'widgets/diff_view.dart';

class PullRequestOverviewScreen extends ConsumerStatefulWidget {
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
  ConsumerState<PullRequestOverviewScreen> createState() =>
      _PullRequestOverviewScreenState();
}

class _PullRequestOverviewScreenState
    extends ConsumerState<PullRequestOverviewScreen> {
  int _selectedStackIndex = 0;
  int _selectedFileIndex = 0;
  bool _viewedBusy = false;
  DiffLineAnchor? _selectedAnchor;

  PullRequestIdentity get _identity => PullRequestIdentity(
    repository: '${widget.owner}/${widget.repo}',
    number: widget.number,
  );

  @override
  Widget build(BuildContext context) {
    final identity = _identity;
    final data = ref.watch(pullRequestReviewDataProvider(identity));
    final stackModel = ref.watch(reviewStackModelProvider(identity));
    final drafts = ref.watch(pendingDraftsProvider);

    return Scaffold(
      backgroundColor: const Color(0xfff5f7fb),
      body: SafeArea(
        child: data.when(
          data: (reviewData) => stackModel.when(
            data: (model) =>
                _buildWorkspace(context, identity, reviewData, model, drafts),
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

  Widget _buildWorkspace(
    BuildContext context,
    PullRequestIdentity identity,
    PullRequestReviewData data,
    ReviewStackModel model,
    List<PendingReviewDraft> drafts,
  ) {
    final refs = _buildFileRefs(model);
    if (refs.isEmpty) {
      return _EmptyWorkspace(onBack: () => context.go('/'));
    }

    final current = _currentRef(refs);
    final fileThreads = data.reviewThreads
        .where((thread) => thread.filePath == current.file.path)
        .toList();
    final unresolvedThreads = data.reviewThreads
        .where(_isUnresolvedThread)
        .toList();
    final fileUnresolvedThreads = fileThreads
        .where(_isUnresolvedThread)
        .toList();
    final fileDrafts = drafts
        .where((draft) => draft.path == current.file.path)
        .toList();
    final threadAnchorKeys = _threadAnchorKeys(fileThreads, current.file.path);
    final draftAnchorKeys = _draftAnchorKeys(fileDrafts);

    return Column(
      children: [
        _WorkspaceHeader(
          identity: identity,
          pullRequest: data.pullRequest,
          current: current,
          refs: refs,
          unresolvedThreadCount: unresolvedThreads.length,
          draftCount: drafts.length,
          onBack: () => context.go('/'),
          onSubmit: () => context.go(identity.submitRoutePath),
          onMap: () => _showReviewMap(data, model, drafts, current.file.path),
          onNextOpen: () => _jumpNextOpen(data, model, drafts, refs, current),
        ),
        Expanded(
          child: DiffView(
            path: current.file.path,
            patch: current.file.patch,
            selectedAnchor: _selectedAnchor,
            threadAnchorKeys: threadAnchorKeys,
            draftAnchorKeys: draftAnchorKeys,
            onLineTap: (anchor) {
              setState(() => _selectedAnchor = anchor);
              HapticFeedback.selectionClick();
              _showCommentComposer(current, anchor);
            },
          ),
        ),
        _WorkspaceCommandBar(
          canGoBack: current.globalIndex > 0,
          canGoNext: current.globalIndex < refs.length - 1,
          viewed: _isViewed(current.file),
          viewedBusy: _viewedBusy,
          selectedAnchor: _selectedAnchor,
          unresolvedThreadCount: fileUnresolvedThreads.length,
          draftCount: fileDrafts.length,
          onMap: () => _showReviewMap(data, model, drafts, current.file.path),
          onBack: () => _selectRef(refs[current.globalIndex - 1]),
          onNext: () => _selectRef(refs[current.globalIndex + 1]),
          onAttention: () => _showAttentionSheet(data, model, drafts),
          onComment: () => _showCommentComposer(current, _selectedAnchor),
          onViewed: () => _toggleViewed(identity, current.file),
        ),
      ],
    );
  }

  _WorkspaceFileRef _currentRef(List<_WorkspaceFileRef> refs) {
    final current = refs.where(
      (ref) =>
          ref.stackIndex == _selectedStackIndex &&
          ref.fileIndex == _selectedFileIndex,
    );
    return current.isEmpty ? refs.first : current.first;
  }

  void _selectRef(_WorkspaceFileRef ref) {
    setState(() {
      _selectedStackIndex = ref.stackIndex;
      _selectedFileIndex = ref.fileIndex;
      _selectedAnchor = null;
    });
    HapticFeedback.selectionClick();
  }

  void _selectPath(ReviewStackModel model, String path) {
    final refs = _buildFileRefs(model);
    final matches = refs.where((ref) => ref.file.path == path);
    if (matches.isNotEmpty) {
      _selectRef(matches.first);
    }
  }

  void _jumpNextOpen(
    PullRequestReviewData data,
    ReviewStackModel model,
    List<PendingReviewDraft> drafts,
    List<_WorkspaceFileRef> refs,
    _WorkspaceFileRef current,
  ) {
    final draftPaths = drafts.map((draft) => draft.path).toSet();
    final threadPaths = data.reviewThreads
        .where(_isUnresolvedThread)
        .map((thread) => thread.filePath)
        .toSet();
    final ordered = [
      ...refs.skip(current.globalIndex + 1),
      ...refs.take(current.globalIndex),
    ];
    final target = ordered.where((ref) {
      return !_isViewed(ref.file) ||
          threadPaths.contains(ref.file.path) ||
          draftPaths.contains(ref.file.path);
    });
    if (target.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nothing else needs attention.')),
      );
      return;
    }
    _selectRef(target.first);
  }

  Future<void> _toggleViewed(
    PullRequestIdentity identity,
    ReviewStackFile file,
  ) async {
    if (_viewedBusy) return;
    setState(() => _viewedBusy = true);
    await syncFileViewedChange(
      context: context,
      ref: ref,
      identity: identity,
      file: file,
      viewed: !_isViewed(file),
    );
    if (mounted) {
      setState(() => _viewedBusy = false);
    }
  }

  void _showReviewMap(
    PullRequestReviewData data,
    ReviewStackModel model,
    List<PendingReviewDraft> drafts,
    String currentPath,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => DraggableScrollableSheet(
        initialChildSize: 0.88,
        minChildSize: 0.55,
        maxChildSize: 0.96,
        expand: false,
        builder: (context, scrollController) => _ReviewMapSheet(
          scrollController: scrollController,
          data: data,
          model: model,
          drafts: drafts,
          currentPath: currentPath,
          onSelect: (ref) {
            Navigator.of(sheetContext).pop();
            _selectRef(ref);
          },
        ),
      ),
    );
  }

  void _showAttentionSheet(
    PullRequestReviewData data,
    ReviewStackModel model,
    List<PendingReviewDraft> drafts,
  ) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => DraggableScrollableSheet(
        initialChildSize: 0.72,
        minChildSize: 0.42,
        maxChildSize: 0.92,
        expand: false,
        builder: (context, scrollController) => _AttentionSheet(
          scrollController: scrollController,
          data: data,
          drafts: drafts,
          onSelectPath: (path) {
            Navigator.of(sheetContext).pop();
            _selectPath(model, path);
          },
        ),
      ),
    );
  }

  void _showCommentComposer(_WorkspaceFileRef current, DiffLineAnchor? anchor) {
    final controller = TextEditingController();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          left: 12,
          right: 12,
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 12,
        ),
        child: _ComposerSheet(
          file: current.file,
          anchor: anchor,
          controller: controller,
          onSave: () {
            final body = controller.text.trim();
            if (body.isEmpty) return;
            ref
                .read(pendingDraftsProvider.notifier)
                .addDraft(
                  PendingReviewDraft(
                    id: 'draft-${DateTime.now().microsecondsSinceEpoch}',
                    path: current.file.path,
                    body: body,
                    targetLabel: anchor == null
                        ? current.file.path
                        : '${current.file.path}:${anchor.line}',
                    line: anchor?.line,
                    side: anchor?.side,
                    codePreview: anchor?.codePreview,
                  ),
                );
            Navigator.of(sheetContext).pop();
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Draft comment saved.')),
            );
          },
        ),
      ),
    );
  }
}

class _WorkspaceHeader extends StatelessWidget {
  const _WorkspaceHeader({
    required this.identity,
    required this.pullRequest,
    required this.current,
    required this.refs,
    required this.unresolvedThreadCount,
    required this.draftCount,
    required this.onBack,
    required this.onSubmit,
    required this.onMap,
    required this.onNextOpen,
  });

  final PullRequestIdentity identity;
  final PullRequestSummary pullRequest;
  final _WorkspaceFileRef current;
  final List<_WorkspaceFileRef> refs;
  final int unresolvedThreadCount;
  final int draftCount;
  final VoidCallback onBack;
  final VoidCallback onSubmit;
  final VoidCallback onMap;
  final VoidCallback onNextOpen;

  @override
  Widget build(BuildContext context) {
    final viewedCount = refs.where((ref) => _isViewed(ref.file)).length;
    final progress = refs.isEmpty ? 0.0 : viewedCount / refs.length;
    final fileName = current.file.path.split('/').last;

    return Material(
      elevation: 5,
      shadowColor: const Color(0x220f172a),
      color: Colors.white,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Back',
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${identity.repository} #${identity.number}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              color: const Color(0xff64748b),
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      Text(
                        pullRequest.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Review Map',
                  onPressed: onMap,
                  icon: const Icon(Icons.account_tree_outlined),
                ),
                const SizedBox(width: 4),
                IconButton.filled(
                  tooltip: 'Submit review',
                  onPressed: onSubmit,
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: const Color(0xfff8fafc),
                border: Border.all(color: const Color(0xffe2e8f0)),
                borderRadius: BorderRadius.circular(8),
              ),
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 4,
                        height: 38,
                        decoration: BoxDecoration(
                          color: const Color(0xff0f766e),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              fileName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xff0f172a),
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                              ),
                            ),
                            Text(
                              '${current.stack.title} · File ${current.globalIndex + 1} of ${refs.length}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xff475569),
                                fontWeight: FontWeight.w600,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      TextButton.icon(
                        onPressed: onNextOpen,
                        icon: const Icon(Icons.auto_awesome_motion, size: 18),
                        label: const Text('Next open'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(999),
                    child: LinearProgressIndicator(
                      minHeight: 6,
                      value: progress,
                      backgroundColor: const Color(0xffe2e8f0),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        Color(0xff0f766e),
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _MetricPill(
                        icon: Icons.check_circle_outline,
                        label: '$viewedCount/${refs.length} viewed',
                        color: const Color(0xff0f766e),
                      ),
                      const SizedBox(width: 6),
                      _MetricPill(
                        icon: Icons.forum_outlined,
                        label: '$unresolvedThreadCount open',
                        color: const Color(0xff7c3aed),
                      ),
                      const SizedBox(width: 6),
                      _MetricPill(
                        icon: Icons.edit_note,
                        label: '$draftCount drafts',
                        color: const Color(0xffc2410c),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WorkspaceCommandBar extends StatelessWidget {
  const _WorkspaceCommandBar({
    required this.canGoBack,
    required this.canGoNext,
    required this.viewed,
    required this.viewedBusy,
    required this.selectedAnchor,
    required this.unresolvedThreadCount,
    required this.draftCount,
    required this.onMap,
    required this.onBack,
    required this.onNext,
    required this.onAttention,
    required this.onComment,
    required this.onViewed,
  });

  final bool canGoBack;
  final bool canGoNext;
  final bool viewed;
  final bool viewedBusy;
  final DiffLineAnchor? selectedAnchor;
  final int unresolvedThreadCount;
  final int draftCount;
  final VoidCallback onMap;
  final VoidCallback onBack;
  final VoidCallback onNext;
  final VoidCallback onAttention;
  final VoidCallback onComment;
  final VoidCallback onViewed;

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 10,
      shadowColor: const Color(0x260f172a),
      color: Colors.white,
      child: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(8, 8, 8, 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (selectedAnchor != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xfffff7ed),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xfffed7aa)),
                ),
                child: Text(
                  'Line ${selectedAnchor!.line} selected · ${selectedAnchor!.codePreview}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xff9a3412),
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            Row(
              children: [
                _CommandButton(
                  tooltip: 'Review Map',
                  label: 'Map',
                  icon: Icons.account_tree_outlined,
                  onPressed: onMap,
                ),
                _CommandButton(
                  tooltip: 'Previous file',
                  label: 'Prev',
                  icon: Icons.chevron_left,
                  onPressed: canGoBack ? onBack : null,
                ),
                _CommandButton(
                  tooltip: 'Threads and drafts',
                  label: 'Focus',
                  icon: Icons.forum_outlined,
                  badge: unresolvedThreadCount + draftCount,
                  onPressed: onAttention,
                ),
                _CommandButton(
                  tooltip: selectedAnchor == null
                      ? 'Add file comment'
                      : 'Comment on selected line',
                  label: 'Comment',
                  icon: Icons.add_comment_outlined,
                  emphasized: selectedAnchor != null,
                  onPressed: onComment,
                ),
                _CommandButton(
                  tooltip: viewed ? 'Mark unviewed' : 'Mark viewed',
                  label: viewed ? 'Viewed' : 'View',
                  icon: viewed
                      ? Icons.check_circle
                      : Icons.radio_button_unchecked,
                  emphasized: viewed,
                  onPressed: viewedBusy ? null : onViewed,
                ),
                _CommandButton(
                  tooltip: 'Next file',
                  label: 'Next',
                  icon: Icons.chevron_right,
                  onPressed: canGoNext ? onNext : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ReviewMapSheet extends StatefulWidget {
  const _ReviewMapSheet({
    required this.scrollController,
    required this.data,
    required this.model,
    required this.drafts,
    required this.currentPath,
    required this.onSelect,
  });

  final ScrollController scrollController;
  final PullRequestReviewData data;
  final ReviewStackModel model;
  final List<PendingReviewDraft> drafts;
  final String currentPath;
  final ValueChanged<_WorkspaceFileRef> onSelect;

  @override
  State<_ReviewMapSheet> createState() => _ReviewMapSheetState();
}

class _ReviewMapSheetState extends State<_ReviewMapSheet> {
  _ReviewMapFilter _filter = _ReviewMapFilter.all;

  @override
  Widget build(BuildContext context) {
    final refs = _buildFileRefs(widget.model);
    final draftCounts = _draftCounts(widget.drafts);
    final threadCounts = _threadCounts(widget.data.reviewThreads);
    final unresolvedThreadCounts = _threadCounts(
      widget.data.reviewThreads.where(_isUnresolvedThread),
    );
    final viewedCount = refs.where((ref) => _isViewed(ref.file)).length;

    return _SheetFrame(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Review Map',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    Text(
                      '$viewedCount/${refs.length} viewed',
                      style: const TextStyle(
                        color: Color(0xff475569),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _ReviewMapFilter.values.map((filter) {
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          selected: _filter == filter,
                          label: Text(filter.label),
                          onSelected: (_) => setState(() => _filter = filter),
                        ),
                      );
                    }).toList(),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              controller: widget.scrollController,
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 18),
              children: [
                for (
                  var stackIndex = 0;
                  stackIndex < widget.model.stacks.length;
                  stackIndex += 1
                )
                  _MapStackSection(
                    stackIndex: stackIndex,
                    stack: widget.model.stacks[stackIndex],
                    model: widget.model,
                    filter: _filter,
                    currentPath: widget.currentPath,
                    draftCounts: draftCounts,
                    threadCounts: threadCounts,
                    unresolvedThreadCounts: unresolvedThreadCounts,
                    onSelect: widget.onSelect,
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MapStackSection extends StatelessWidget {
  const _MapStackSection({
    required this.stackIndex,
    required this.stack,
    required this.model,
    required this.filter,
    required this.currentPath,
    required this.draftCounts,
    required this.threadCounts,
    required this.unresolvedThreadCounts,
    required this.onSelect,
  });

  final int stackIndex;
  final ReviewStack stack;
  final ReviewStackModel model;
  final _ReviewMapFilter filter;
  final String currentPath;
  final Map<String, int> draftCounts;
  final Map<String, int> threadCounts;
  final Map<String, int> unresolvedThreadCounts;
  final ValueChanged<_WorkspaceFileRef> onSelect;

  @override
  Widget build(BuildContext context) {
    final files = stack.filePaths
        .map(model.fileByPath)
        .whereType<ReviewStackFile>()
        .toList();
    final filtered = <_MapFileRow>[];
    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      final file = files[fileIndex];
      if (!_matchesFilter(file, filter, draftCounts, threadCounts)) continue;
      filtered.add(_MapFileRow(file: file, fileIndex: fileIndex));
    }
    if (filtered.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xffe2e8f0)),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                _ViewedDot(
                  viewed: stack.viewedFileCount == stack.totalFileCount,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        stack.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          color: Color(0xff0f172a),
                        ),
                      ),
                      Text(
                        getStackProgressLabel(stack),
                        style: const TextStyle(
                          color: Color(0xff64748b),
                          fontWeight: FontWeight.w600,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                if (stack.commentCount > 0)
                  _TinyCount(
                    count: stack.commentCount,
                    color: const Color(0xff7c3aed),
                  ),
              ],
            ),
          ),
          const Divider(height: 1),
          for (final row in filtered)
            _MapFileTile(
              selected: row.file.path == currentPath,
              file: row.file,
              draftCount: draftCounts[row.file.path] ?? 0,
              threadCount: threadCounts[row.file.path] ?? 0,
              unresolvedThreadCount: unresolvedThreadCounts[row.file.path] ?? 0,
              onTap: () => onSelect(
                _WorkspaceFileRef(
                  stackIndex: stackIndex,
                  fileIndex: row.fileIndex,
                  globalIndex: 0,
                  stack: stack,
                  file: row.file,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AttentionSheet extends StatelessWidget {
  const _AttentionSheet({
    required this.scrollController,
    required this.data,
    required this.drafts,
    required this.onSelectPath,
  });

  final ScrollController scrollController;
  final PullRequestReviewData data;
  final List<PendingReviewDraft> drafts;
  final ValueChanged<String> onSelectPath;

  @override
  Widget build(BuildContext context) {
    final unresolved = data.reviewThreads.where(_isUnresolvedThread).toList();

    return _SheetFrame(
      child: ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 20),
        children: [
          const Text(
            'Needs Attention',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
          ),
          const SizedBox(height: 12),
          _SectionLabel(label: 'Drafts', count: drafts.length),
          if (drafts.isEmpty)
            const _EmptySheetRow(label: 'No draft comments yet.'),
          for (final draft in drafts)
            _AttentionTile(
              icon: Icons.edit_note,
              color: const Color(0xffc2410c),
              title: draft.line == null
                  ? draft.path
                  : '${draft.path}:${draft.line}',
              subtitle: draft.body,
              onTap: () => onSelectPath(draft.path),
            ),
          const SizedBox(height: 12),
          _SectionLabel(label: 'Unresolved Threads', count: unresolved.length),
          if (unresolved.isEmpty)
            const _EmptySheetRow(label: 'No unresolved threads.'),
          for (final thread in unresolved)
            _AttentionTile(
              icon: Icons.forum_outlined,
              color: const Color(0xff7c3aed),
              title: thread.line == null
                  ? thread.filePath
                  : '${thread.filePath}:${thread.line}',
              subtitle: thread.body,
              onTap: () => onSelectPath(thread.filePath),
            ),
        ],
      ),
    );
  }
}

class _ComposerSheet extends StatelessWidget {
  const _ComposerSheet({
    required this.file,
    required this.anchor,
    required this.controller,
    required this.onSave,
  });

  final ReviewStackFile file;
  final DiffLineAnchor? anchor;
  final TextEditingController controller;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    return _SheetFrame(
      expand: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Draft Comment',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900),
                  ),
                ),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            Text(
              anchor == null ? file.path : '${file.path}:${anchor!.line}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Color(0xff475569),
                fontWeight: FontWeight.w700,
              ),
            ),
            if (anchor != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xff111827),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  anchor!.codePreview.isEmpty
                      ? 'Line ${anchor!.line}'
                      : anchor!.codePreview,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xffe5e7eb),
                    fontFamily: 'monospace',
                    fontSize: 13,
                  ),
                ),
              ),
            ],
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              minLines: 4,
              maxLines: 8,
              decoration: InputDecoration(
                filled: true,
                fillColor: const Color(0xfff8fafc),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                hintText: anchor == null
                    ? 'Leave a file-level note'
                    : 'Comment on this line',
              ),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onSave,
              icon: const Icon(Icons.add_comment_outlined),
              label: const Text('Save Draft'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({required this.child, this.expand = true});

  final Widget child;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Color(0xfff8fafc),
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          Container(
            width: 42,
            height: 5,
            decoration: BoxDecoration(
              color: const Color(0xffcbd5e1),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          if (expand) Expanded(child: child) else child,
        ],
      ),
    );
  }
}

class _MetricPill extends StatelessWidget {
  const _MetricPill({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xffe2e8f0)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 15, color: color),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Color(0xff334155),
                  fontWeight: FontWeight.w800,
                  fontSize: 11,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CommandButton extends StatelessWidget {
  const _CommandButton({
    required this.tooltip,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.badge = 0,
    this.emphasized = false,
  });

  final String tooltip;
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final int badge;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final foreground = emphasized ? Colors.white : const Color(0xff1f2937);
    final background = emphasized ? const Color(0xff0f766e) : Colors.white;
    return Expanded(
      child: Tooltip(
        message: tooltip,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: onPressed,
            child: Opacity(
              opacity: enabled ? 1 : 0.36,
              child: Container(
                height: 52,
                decoration: BoxDecoration(
                  color: background,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: emphasized
                        ? const Color(0xff0f766e)
                        : const Color(0xffe2e8f0),
                  ),
                ),
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(icon, color: foreground, size: 20),
                          const SizedBox(height: 2),
                          Text(
                            label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: foreground,
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (badge > 0)
                      Positioned(
                        right: 4,
                        top: 4,
                        child: _TinyCount(
                          count: badge,
                          color: const Color(0xffc2410c),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MapFileTile extends StatelessWidget {
  const _MapFileTile({
    required this.selected,
    required this.file,
    required this.draftCount,
    required this.threadCount,
    required this.unresolvedThreadCount,
    required this.onTap,
  });

  final bool selected;
  final ReviewStackFile file;
  final int draftCount;
  final int threadCount;
  final int unresolvedThreadCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        color: selected ? const Color(0xffecfeff) : Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            _ViewedDot(viewed: _isViewed(file)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                file.path,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: selected
                      ? const Color(0xff0f766e)
                      : const Color(0xff0f172a),
                  fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
                  fontSize: 13,
                ),
              ),
            ),
            if (unresolvedThreadCount > 0)
              _TinyCount(
                count: unresolvedThreadCount,
                color: const Color(0xff7c3aed),
              )
            else if (threadCount > 0)
              _TinyCount(count: threadCount, color: const Color(0xff64748b)),
            if (draftCount > 0) ...[
              const SizedBox(width: 4),
              _TinyCount(count: draftCount, color: const Color(0xffc2410c)),
            ],
          ],
        ),
      ),
    );
  }
}

class _AttentionTile extends StatelessWidget {
  const _AttentionTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xffe2e8f0)),
      ),
      child: ListTile(
        leading: Icon(icon, color: color),
        title: Text(title, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(subtitle, maxLines: 3, overflow: TextOverflow.ellipsis),
        onTap: onTap,
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label, required this.count});

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14),
          ),
          const SizedBox(width: 8),
          _TinyCount(count: count, color: const Color(0xff475569)),
        ],
      ),
    );
  }
}

class _EmptySheetRow extends StatelessWidget {
  const _EmptySheetRow({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xffe2e8f0)),
      ),
      child: Text(label, style: const TextStyle(color: Color(0xff64748b))),
    );
  }
}

class _ViewedDot extends StatelessWidget {
  const _ViewedDot({required this.viewed});

  final bool viewed;

  @override
  Widget build(BuildContext context) {
    return Icon(
      viewed ? Icons.check_circle : Icons.radio_button_unchecked,
      color: viewed ? const Color(0xff0f766e) : const Color(0xff94a3b8),
      size: 20,
    );
  }
}

class _TinyCount extends StatelessWidget {
  const _TinyCount({required this.count, required this.color});

  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minWidth: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        '$count',
        textAlign: TextAlign.center,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w900,
          fontSize: 10,
        ),
      ),
    );
  }
}

class _EmptyWorkspace extends StatelessWidget {
  const _EmptyWorkspace({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: IconButton(
            tooltip: 'Back',
            onPressed: onBack,
            icon: const Icon(Icons.arrow_back),
          ),
        ),
        const Expanded(child: Center(child: Text('No changed files.'))),
      ],
    );
  }
}

class _WorkspaceFileRef {
  const _WorkspaceFileRef({
    required this.stackIndex,
    required this.fileIndex,
    required this.globalIndex,
    required this.stack,
    required this.file,
  });

  final int stackIndex;
  final int fileIndex;
  final int globalIndex;
  final ReviewStack stack;
  final ReviewStackFile file;
}

class _MapFileRow {
  const _MapFileRow({required this.file, required this.fileIndex});

  final ReviewStackFile file;
  final int fileIndex;
}

enum _ReviewMapFilter {
  all('All'),
  unviewed('Unviewed'),
  threads('Threads'),
  drafts('Drafts');

  const _ReviewMapFilter(this.label);

  final String label;
}

List<_WorkspaceFileRef> _buildFileRefs(ReviewStackModel model) {
  final refs = <_WorkspaceFileRef>[];
  for (var stackIndex = 0; stackIndex < model.stacks.length; stackIndex += 1) {
    final stack = model.stacks[stackIndex];
    final files = stack.filePaths
        .map(model.fileByPath)
        .whereType<ReviewStackFile>()
        .toList();
    for (var fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      refs.add(
        _WorkspaceFileRef(
          stackIndex: stackIndex,
          fileIndex: fileIndex,
          globalIndex: refs.length,
          stack: stack,
          file: files[fileIndex],
        ),
      );
    }
  }
  return refs;
}

bool _matchesFilter(
  ReviewStackFile file,
  _ReviewMapFilter filter,
  Map<String, int> draftCounts,
  Map<String, int> threadCounts,
) {
  switch (filter) {
    case _ReviewMapFilter.all:
      return true;
    case _ReviewMapFilter.unviewed:
      return !_isViewed(file);
    case _ReviewMapFilter.threads:
      return (threadCounts[file.path] ?? 0) > 0;
    case _ReviewMapFilter.drafts:
      return (draftCounts[file.path] ?? 0) > 0;
  }
}

Map<String, int> _draftCounts(List<PendingReviewDraft> drafts) {
  final counts = <String, int>{};
  for (final draft in drafts) {
    counts[draft.path] = (counts[draft.path] ?? 0) + 1;
  }
  return counts;
}

Map<String, int> _threadCounts(Iterable<ReviewThread> threads) {
  final counts = <String, int>{};
  for (final thread in threads) {
    counts[thread.filePath] = (counts[thread.filePath] ?? 0) + 1;
  }
  return counts;
}

Set<String> _threadAnchorKeys(List<ReviewThread> threads, String path) {
  return threads
      .where((thread) => thread.line != null)
      .map((thread) => DiffLineAnchor.keyFor(path, thread.line!, 'RIGHT'))
      .toSet();
}

Set<String> _draftAnchorKeys(List<PendingReviewDraft> drafts) {
  return drafts
      .where((draft) => draft.line != null)
      .map(
        (draft) => DiffLineAnchor.keyFor(
          draft.path,
          draft.line!,
          draft.side ?? 'RIGHT',
        ),
      )
      .toSet();
}

bool _isUnresolvedThread(ReviewThread thread) => thread.state == 'unresolved';

bool _isViewed(ReviewStackFile file) => file.viewerViewedState == 'VIEWED';
