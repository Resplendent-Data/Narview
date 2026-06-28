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
    final authSession = ref.watch(authSessionProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Narview'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () {
              ref.invalidate(authSessionProvider);
              ref.invalidate(pullRequestsProvider);
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: SafeArea(
        child: authSession.when(
          data: (session) {
            if (!session.isSignedIn) {
              return ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  const _OnboardingCard(),
                  const SizedBox(height: 12),
                  _GitHubSignInCard(authSession: authSession),
                ],
              );
            }
            return _SignedInInbox(authSession: authSession);
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, stackTrace) => ListView(
            padding: const EdgeInsets.all(12),
            children: [
              const _OnboardingCard(),
              const SizedBox(height: 12),
              _GitHubSignInCard(authSession: authSession),
            ],
          ),
        ),
      ),
    );
  }
}

class _SignedInInbox extends ConsumerWidget {
  const _SignedInInbox({required this.authSession});

  final AsyncValue<AuthSession> authSession;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pullRequests = ref.watch(pullRequestsProvider);

    return pullRequests.when(
      data: (items) => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _GitHubSignInCard(authSession: authSession),
          const SizedBox(height: 12),
          const _QuickOpenCard(),
          const SizedBox(height: 12),
          _WorkspaceHeader(count: items.length),
          const SizedBox(height: 12),
          if (items.isEmpty) const _EmptyInboxCard(),
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
                onTap: () => context.go(pullRequest.identity.routePath),
              ),
            ),
        ],
      ),
      loading: () => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _GitHubSignInCard(authSession: authSession),
          const SizedBox(height: 12),
          const _QuickOpenCard(),
          const SizedBox(height: 12),
          const Card(
            child: ListTile(
              leading: CircularProgressIndicator(),
              title: Text('Loading Pull Requests'),
              subtitle: Text(
                'Finding review requests, assignments, and authored PRs.',
              ),
            ),
          ),
        ],
      ),
      error: (error, stackTrace) => ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _GitHubSignInCard(authSession: authSession),
          const SizedBox(height: 12),
          const _QuickOpenCard(),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const Icon(Icons.error_outline),
              title: const Text('Could not load Pull Requests'),
              subtitle: Text('$error'),
              trailing: IconButton(
                tooltip: 'Retry',
                onPressed: () => ref.invalidate(pullRequestsProvider),
                icon: const Icon(Icons.refresh),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _OnboardingCard extends StatelessWidget {
  const _OnboardingCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Review PRs from your phone',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            const Text(
              'Sign in with GitHub, open a Pull Request, and move through Review Stacks without switching to the browser.',
            ),
            const SizedBox(height: 16),
            const _SetupStep(number: '1', label: 'Sign in to GitHub'),
            const _SetupStep(
              number: '2',
              label: 'Open a review request or paste a PR URL',
            ),
            const _SetupStep(
              number: '3',
              label: 'Read diffs, threads, and pending review comments',
            ),
          ],
        ),
      ),
    );
  }
}

class _SetupStep extends StatelessWidget {
  const _SetupStep({required this.number, required this.label});

  final String number;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          CircleAvatar(radius: 12, child: Text(number)),
          const SizedBox(width: 10),
          Expanded(child: Text(label)),
        ],
      ),
    );
  }
}

class _QuickOpenCard extends StatefulWidget {
  const _QuickOpenCard();

  @override
  State<_QuickOpenCard> createState() => _QuickOpenCardState();
}

class _QuickOpenCardState extends State<_QuickOpenCard> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Open a Pull Request',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _controller,
              keyboardType: TextInputType.url,
              textInputAction: TextInputAction.go,
              decoration: InputDecoration(
                border: const OutlineInputBorder(),
                hintText: 'https://github.com/owner/repo/pull/123',
                errorText: _error,
                suffixIcon: IconButton(
                  tooltip: 'Open Pull Request',
                  onPressed: () => _open(context),
                  icon: const Icon(Icons.arrow_forward),
                ),
              ),
              onSubmitted: (_) => _open(context),
            ),
          ],
        ),
      ),
    );
  }

  void _open(BuildContext context) {
    try {
      final pullRequest = parsePullRequestUrl(_controller.text);
      context.go(pullRequest.identity.routePath);
    } catch (error) {
      setState(() {
        _error = '$error';
      });
    }
  }
}

class _EmptyInboxCard extends StatelessWidget {
  const _EmptyInboxCard();

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: ListTile(
        leading: Icon(Icons.inbox_outlined),
        title: Text('No open Pull Requests found'),
        subtitle: Text(
          'Paste a GitHub Pull Request URL above, or check that your GitHub account has review requests or assigned PRs.',
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

    OAuthStartResponse flow;
    try {
      final auth = ref.read(authRepositoryProvider);
      flow = await auth.startSignIn();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _message = 'Could not start GitHub sign-in: $error';
        _busy = false;
      });
      return;
    }

    if (!mounted) return;
    setState(() {
      _flow = flow;
      _message = 'Approve Narview in GitHub, then return here.';
    });

    try {
      final opened = await launchUrl(
        flow.browserUri,
        mode: LaunchMode.externalApplication,
      );
      if (!opened && mounted) {
        setState(() {
          _message =
              'Open ${flow.verificationUri} and enter the code, then return here.';
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _message =
              'Open ${flow.verificationUri} and enter the code, then return here.';
        });
      }
    }

    await _pollUntilDone(flow);
  }

  Future<void> _pollUntilDone(OAuthStartResponse flow) async {
    var intervalSeconds = flow.intervalSeconds;
    while (mounted) {
      await Future<void>.delayed(Duration(seconds: intervalSeconds));
      OAuthPollResponse response;
      try {
        response = await ref.read(authRepositoryProvider).pollSignIn(flow);
      } catch (_) {
        if (!mounted) return;
        if (DateTime.now().isAfter(flow.expiresAt)) {
          setState(() {
            _message =
                'GitHub sign-in expired. Start again when the network is available.';
            _busy = false;
          });
          return;
        }
        intervalSeconds = intervalSeconds < 5 ? 5 : intervalSeconds;
        setState(() {
          _message =
              'Network issue while checking GitHub. Keep this screen open; retrying in ${intervalSeconds}s.';
        });
        continue;
      }
      if (!mounted) return;

      switch (response.state) {
        case OAuthPollState.authorized:
          ref.invalidate(authSessionProvider);
          ref.invalidate(pullRequestsProvider);
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
    ref.invalidate(pullRequestsProvider);
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
