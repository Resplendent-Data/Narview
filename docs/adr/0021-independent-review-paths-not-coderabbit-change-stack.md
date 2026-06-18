# Review Stacks replace independent Review Paths

This ADR supersedes the earlier decision to avoid CodeRabbit-style change stacks.

Narview now uses a GitHub-first **Review Stack** workflow: deterministic stacks contain ordered layers, layers contain files and diff ranges, and viewed progress syncs to GitHub's pull request file viewed state. The product borrows the useful stack/layer navigation pattern, but Narview owns the grouping, ordering, pending-review flow, and failure handling.

The old **Attention Map**, **Review Path**, **Review Queue**, and **Review Target** concepts are retired from the primary workflow. Optional clone-based analysis may enrich stack labels or context later, but opening and reviewing a pull request must work from GitHub PR data alone.
