import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../auth/data/auth_repository.dart';
import '../../review/data/review_repository.dart';

class PullRequestInboxScreen extends ConsumerWidget {
  const PullRequestInboxScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pullRequests = ref.watch(pullRequestsProvider);
    final authSession = ref.watch(authSessionProvider);

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
              _GitHubSignInCard(authSession: authSession),
              const SizedBox(height: 12),
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

class _GitHubSignInCard extends ConsumerStatefulWidget {
  const _GitHubSignInCard({required this.authSession});

  final AsyncValue<AuthSession> authSession;

  @override
  ConsumerState<_GitHubSignInCard> createState() => _GitHubSignInCardState();
}

class _GitHubSignInCardState extends ConsumerState<_GitHubSignInCard> {
  OAuthStartResponse? _flow;
  bool _busy = false;
  String? _message;

  @override
  Widget build(BuildContext context) {
    return widget.authSession.when(
      data: (session) {
        if (session.isSignedIn) {
          return Card(
            child: ListTile(
              leading: const Icon(Icons.verified_user_outlined),
              title: Text('Signed in as ${session.login}'),
              subtitle: const Text(
                'GitHub review actions can use this account.',
              ),
              trailing: TextButton(
                onPressed: _busy ? null : _signOut,
                child: const Text('Sign out'),
              ),
            ),
          );
        }

        return Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Icon(Icons.login),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Sign in to GitHub',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const Text(
                            'Connect your account to review real Pull Requests.',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                if (_flow != null) ...[
                  const SizedBox(height: 12),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: Theme.of(context).colorScheme.outlineVariant,
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'GitHub code',
                            style: Theme.of(context).textTheme.labelMedium,
                          ),
                          const SizedBox(height: 4),
                          SelectableText(
                            _flow!.userCode,
                            style: Theme.of(context).textTheme.headlineSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 1,
                                ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (_message != null) ...[
                  const SizedBox(height: 8),
                  Text(_message!, style: Theme.of(context).textTheme.bodySmall),
                ],
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _busy ? null : _startSignIn,
                  icon: _busy
                      ? const SizedBox.square(
                          dimension: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.open_in_browser),
                  label: Text(
                    _busy ? 'Waiting for GitHub' : 'Sign in to GitHub',
                  ),
                ),
              ],
            ),
          ),
        );
      },
      loading: () => const Card(
        child: ListTile(
          leading: CircularProgressIndicator(),
          title: Text('Checking GitHub session'),
        ),
      ),
      error: (error, stackTrace) => Card(
        child: ListTile(
          leading: const Icon(Icons.error_outline),
          title: const Text('GitHub session unavailable'),
          subtitle: Text('$error'),
          trailing: IconButton(
            tooltip: 'Retry',
            onPressed: () => ref.invalidate(authSessionProvider),
            icon: const Icon(Icons.refresh),
          ),
        ),
      ),
    );
  }

  Future<void> _startSignIn() async {
    setState(() {
      _busy = true;
      _message = 'Starting GitHub sign-in...';
    });

    try {
      final auth = ref.read(authRepositoryProvider);
      final flow = await auth.startSignIn();
      if (!mounted) return;
      setState(() {
        _flow = flow;
        _message = 'Approve Narview in GitHub, then return here.';
      });

      await launchUrl(flow.browserUri, mode: LaunchMode.externalApplication);
      await _pollUntilDone(flow);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _message = 'Could not start GitHub sign-in: $error';
        _busy = false;
      });
    }
  }

  Future<void> _pollUntilDone(OAuthStartResponse flow) async {
    var intervalSeconds = flow.intervalSeconds;
    while (mounted) {
      await Future<void>.delayed(Duration(seconds: intervalSeconds));
      final response = await ref.read(authRepositoryProvider).pollSignIn(flow);
      if (!mounted) return;

      switch (response.state) {
        case OAuthPollState.authorized:
          ref.invalidate(authSessionProvider);
          setState(() {
            _flow = null;
            _message = 'Signed in.';
            _busy = false;
          });
          return;
        case OAuthPollState.pending:
          intervalSeconds = response.intervalSeconds;
          setState(() {
            _message =
                response.message ?? 'Waiting for GitHub authorization...';
          });
        case OAuthPollState.denied:
        case OAuthPollState.expired:
          setState(() {
            _message = response.message ?? 'GitHub sign-in did not complete.';
            _busy = false;
          });
          return;
      }
    }
  }

  Future<void> _signOut() async {
    setState(() {
      _busy = true;
    });
    await ref.read(authRepositoryProvider).signOut();
    ref.invalidate(authSessionProvider);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _message = null;
      _flow = null;
    });
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
