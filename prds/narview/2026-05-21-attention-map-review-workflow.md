# Attention Map Review Workflow

## Problem Statement

Developers are reviewing a rapidly growing amount of AI-written code. The hard part is no longer only finding style nits or clearing individual CodeRabbit threads; it is understanding whether the changed logic is correct and what the change affects.

GitHub's file-first pull request view makes that difficult. Reviewers have to reconstruct changed functions, call relationships, tests, existing human feedback, CodeRabbit feedback, and possible impact from a flat diff. Large pull requests turn into repetitive next/next scanning without a global picture of how the changes relate to each other.

Narview needs to support the full review process for both self-review and reviewing another developer's pull request. A reviewer should be able to understand the changed logic, leave GitHub-synced feedback, mark what they handled, and copy human feedback into an external coding agent without losing the distinction between local review attention and GitHub discussion state.

## Solution

Narview will make the **Attention Map** the primary first screen for a **Pull Request**. The Attention Map is a deterministic structural graph of changed code areas and their relationships. It is built from a Narview-managed **Review Clone**, not from the user's coding checkout, so Narview can analyze repository structure without touching the user's active work.

The map shows changed **Attention Nodes**, supporting **Context Nodes**, explainable **Attention Edges**, and collapsed **Attention Clusters**. An ordered **Review Path** appears beside the map and lists **Review Targets**, each representing one coherent logic question for the reviewer. Keyboard navigation moves through the Review Path and focuses the map on the selected target.

Selecting a Review Target opens persistent review content inside the **Guided Review Workspace**, not a modal. The reviewer can inspect the changed context, current head version of the enclosing symbol, related context, tests, existing Review Threads, and GitHub write actions. Review Threads are integrated into the same workflow rather than living in a separate thread-only mode.

Narview remains LLM-free for ranking and analysis. It optimizes developer attention, not automated logic judgment. Success is **Review Confidence**: the reviewer can explain and clear the changed logic with enough context to trust their review.

## User Stories

1. As a reviewer, I want a Pull Request to open into an Attention Map, so that I can see how changed code areas relate before reading individual diffs.
2. As a reviewer, I want Narview to create and manage its own Review Clone, so that review analysis does not affect the checkout I use for coding.
3. As a reviewer, I want Narview to reuse one Review Clone per repository, so that repeated PR review does not require cloning the same repository over and over.
4. As a reviewer, I want Narview to analyze the PR head as the primary code state, so that I review what the author changed rather than synthetic merge noise.
5. As a reviewer, I want Narview to compare the PR head against the base branch, so that I can understand what changed.
6. As a reviewer, I want Narview to support same-repository PRs first and fork PRs when fetchable, so that the common path is reliable while forks degrade clearly.
7. As a reviewer, I want a clear clone-unavailable state, so that I understand when Narview can only provide limited GitHub data.
8. As a reviewer, I want Review Clones to be used only for Read-Only Analysis, so that Narview does not edit code or run project commands.
9. As a reviewer, I want Narview to store Analysis Indexes outside the Review Clone, so that the clone stays clean.
10. As a reviewer, I want Analysis Indexes to persist across app restarts, so that repeat reviews do not always start from cold indexing.
11. As a reviewer, I want the rendered Attention Map to be rebuilt from current inputs, so that stale UI layout does not become source of truth.
12. As a reviewer, I want deep analysis for TypeScript, JavaScript, and Python, so that common AI-written code gets symbol-aware review support.
13. As a reviewer, I want unsupported languages to use hunk fallback nodes, so that every changed file still appears in the review workflow.
14. As a reviewer, I want Attention Nodes to usually represent changed symbols, so that review targets are smaller than files but larger than individual lines.
15. As a reviewer, I want diff hunks to become Attention Nodes when symbols cannot be identified, so that analysis failure does not block review.
16. As a reviewer, I want unchanged callers or related code to appear as Context Nodes, so that I can understand impact without making unchanged code required review work.
17. As a reviewer, I want Context Nodes to be capped or collapsed, so that unchanged references do not overwhelm the map.
18. As a reviewer, I want Attention Edges to be explainable, so that I know why two nodes are related.
19. As a reviewer, I want Call Edges, Module Edges, Test Edges, Review Edges, and same-file relationships, so that the map reflects concrete structural signals.
20. As a reviewer, I want Narview to avoid domain keyword scoring by default, so that paths like auth or billing do not become hardcoded guesses.
21. As a reviewer, I want generated/vendor/build changes to appear as a Generated Cluster, so that they remain visible without dominating the review.
22. As a reviewer, I want the Attention Map to use progressive disclosure, so that large PRs show global structure before every detail.
23. As a reviewer, I want a Review Path beside the Attention Map, so that I have a concrete order through the review.
24. As a reviewer, I want J/K to move through Review Targets, so that I can quickly focus the map on the next target.
25. As a reviewer, I want Review Path ordering to be independent from visual map layout, so that the map explains relationships while the path guides action.
26. As a reviewer, I want the Review Path to start with the Hotspot that deserves earliest inspection, so that the highest-attention area is first.
27. As a reviewer, I want dependency context one action away, so that Review Path order can prioritize attention without hiding prerequisite context.
28. As a reviewer, I want Narview to generate Review Path order, so that the first version is predictable and testable.
29. As a reviewer, I want already Reviewed targets to remain available but deemphasized, so that I can revisit them without cluttering remaining work.
30. As a reviewer, I want Review Targets to represent one coherent logic question, so that each step fits in my head.
31. As a reviewer, I want tightly related nodes to become one Review Target, so that related tiny changes are reviewed together.
32. As a reviewer, I want unrelated or oversized clusters split into separate Review Targets, so that each target stays understandable.
33. As a reviewer, I want selected target content to remain in a persistent inspector, so that repeated review does not become modal open-close work.
34. As a reviewer, I want the selected target to show changed context and the head version of the enclosing symbol first, so that I understand the new logic.
35. As a reviewer, I want the base version available on demand, so that I can compare old behavior when needed.
36. As a reviewer, I want existing Review Threads to attach to the relevant Attention Node or file-level target, so that feedback is reviewed in context.
37. As a reviewer, I want unmapped Review Threads to remain visible as their own review targets or filtered thread results, so that no GitHub feedback disappears.
38. As a reviewer, I want CodeRabbit Threads to be context on Review Targets by default, so that bot feedback informs the logic review without defining the whole path.
39. As a reviewer, I want Human Review Threads to be visible in context, so that developer feedback is easy to handle.
40. As a reviewer, I want File Review Threads to sync from GitHub, so that whole-file feedback is not lost.
41. As a reviewer, I want Narview to create File Review Threads, so that I can leave whole-file feedback without jumping to GitHub.
42. As a reviewer, I want Narview to create line-level Review Threads from valid changed-line anchors, so that code feedback publishes directly to GitHub.
43. As a reviewer, I want Start Review Thread to publish immediately, so that Narview and GitHub stay in sync without a draft review workflow.
44. As a reviewer, I want Narview to avoid creating Pull Request Comments for now, so that review feedback stays attached to code.
45. As a reviewer, I want Read-Only Mode when I lack write permission, so that I can still inspect the PR even if I cannot publish feedback.
46. As a reviewer, I want write-permission limitations to be clear, so that I know why Start Review Thread is unavailable.
47. As a reviewer of my own PR, I want to mark Review Targets Reviewed after inspection, so that I know what changed logic I have cleared.
48. As a reviewer of someone else's PR, I want to mark a Review Target Reviewed after leaving feedback or deciding there is no feedback, so that my review progress is explicit.
49. As a reviewer, I want no-feedback targets to require explicit Reviewed action, so that Narview does not infer attention from scroll position.
50. As a reviewer, I want Reviewed to apply to Review Targets and Review Threads, so that the primary attention state stays simple.
51. As a reviewer, I want Resolved to remain separate from Reviewed, so that GitHub discussion state does not erase local attention state.
52. As a reviewer, I want Review Targets to become Needs Re-Review when their Target Fingerprint changes, so that new commits do not preserve stale review confidence.
53. As a reviewer, I want unchanged target fingerprints to preserve Reviewed state, so that new commits do not reset unrelated work.
54. As a reviewer, I want Needs Re-Review to look different from never-reviewed, so that I can see what changed after I already handled it.
55. As a reviewer, I want Review Work to show target and thread progress separately, so that I understand both changed-logic work and discussion work.
56. As a reviewer, I want a combined remaining Review Work count, so that I have a quick orientation number.
57. As a reviewer, I want unresolved Human Review Threads to be copyable as a Human Feedback Packet, so that I can pass developer feedback to an external coding agent.
58. As a reviewer, I want Human Feedback Packets to preserve raw review conversations, so that Narview does not reinterpret reviewer intent.
59. As a reviewer, I want Human Feedback Packets to include enough PR, thread, URL, state, and nearby context, so that an external agent can verify before implementing.
60. As a reviewer, I want Human Feedback Packets to disclose GitHub data freshness, so that copied feedback is not mistaken for live state.
61. As a reviewer, I want optional CodeRabbit inclusion in Human Feedback Packets, so that I can decide whether bot feedback belongs in the agent handoff.
62. As a reviewer, I want Outdated Review Threads to remain visible and clearly marked, so that I do not confuse old diff feedback with current code.
63. As a reviewer, I want Merge Readiness and Checks to remain review context, so that I can understand blockers without merging from Narview.
64. As a reviewer, I want the Attention Map workflow to remain LLM-free, so that analysis stays fast, private, deterministic, and explainable.
65. As a reviewer, I want Narview to optimize Review Confidence rather than comment volume or approval speed, so that the product supports careful review.

## Implementation Decisions

- The Attention Map becomes the primary Review Overview and the first screen for a Pull Request.
- The Guided Review Workspace is the single primary review surface; the separate thread-only Review Queue concept is retired.
- Thread filters may exist as supporting UI, but Review Path, Review Targets, and Review Threads are the core review concepts.
- Narview requires a managed Review Clone for the full Attention Map experience.
- Review Clones are Narview-owned and separate from the user's coding checkout.
- Review Clones are reused per repository rather than recreated per Pull Request.
- The first Review Clone implementation should stay operationally simple and avoid complex Git orchestration until needed.
- Review Clones are used for Read-Only Analysis only.
- Narview does not edit code, install dependencies, run builds, run tests, or execute project commands from Review Clones.
- Narview may write Analysis Indexes outside the Review Clone.
- Analysis Indexes are keyed by repository, commit, and analysis version.
- Analysis Indexes may persist parsed symbols, structural relationships, Target Fingerprints, and thread-to-target attachment metadata.
- The rendered Attention Map and Review Path presentation are rebuildable from the Analysis Index and current GitHub data.
- Narview analyzes the Pull Request head as the primary code state and uses the base branch or merge base for diff comparison.
- Synthetic merge commits are not the default analysis input.
- Same-repository Pull Requests are supported first.
- Fork Pull Requests are supported when the head ref is fetchable with the user's GitHub access.
- Unfetchable forks show a clear clone-unavailable state and fall back to limited GitHub-provided review data.
- Deep Analysis Languages for the first implementation are TypeScript, JavaScript, and Python.
- Deep analysis means changed-symbol detection, hunk-to-symbol mapping, same-file calls, imports and exports, deterministic test relationships, Review Thread attachment, and explainable edges.
- Deep analysis does not imply type inference, complete runtime call graphs, framework route understanding, or cross-repository analysis.
- Other languages use hunk fallback Attention Nodes.
- Attention Nodes usually represent changed symbols and fall back to diff hunks when symbols cannot be identified.
- Context Nodes represent unchanged related code that explains impact and are not Review Targets by default.
- Context Nodes are capped or collapsed so unchanged code does not dominate the map.
- Attention Edges are limited to explainable relationships: call, module, test, review, and same-file relationships.
- Hotspots are derived from structural signals, not domain keyword categories.
- Generated, vendor, build, and similar low-signal changes appear as Generated Clusters by default.
- Generated Clusters do not dominate the Review Path unless they contain Review Threads or relate to failing Checks.
- The Attention Map uses progressive disclosure; it shows high-priority structure first and reveals lower-signal nodes through zooming, filtering, or selection.
- The Review Path is generated by Narview and cannot be manually reordered in the first version.
- Review Path order is independent from map layout.
- Review Path order prioritizes attention before dependency reading order, with related context one action away.
- Review Targets may be individual Attention Nodes or Attention Clusters.
- Several Attention Nodes can become one Review Target when they answer one coherent logic question.
- Review Targets split when nodes answer different questions or become too large to inspect together.
- Reviewed Review Targets remain available but are visually deemphasized or collapsed.
- Selecting a Review Target shows persistent review content in the Guided Review Workspace rather than opening a modal.
- Selected target content leads with the changed context and current head version of the enclosing symbol.
- Base version comparison is available on demand.
- Existing Review Threads attach to the nearest Attention Node when possible.
- Review Threads that cannot attach to an Attention Node can appear as their own Review Target or through thread filters.
- File Review Threads attach to file-level Review Targets.
- CodeRabbit Threads appear as context on relevant Review Targets by default rather than each becoming its own Review Path item.
- Human Review Threads appear in context and can be included in Human Feedback Packets.
- Narview can start line-level Review Threads only when a valid changed-line anchor exists.
- Narview can start File Review Threads when whole-file feedback is the right anchor.
- New Review Threads publish to GitHub immediately.
- Narview does not collect draft GitHub review comments in this product phase.
- Narview does not create Pull Request Comments in this product phase.
- Narview requires minimal GitHub write permission to start Review Threads.
- Narview can operate in Read-Only Mode when write permission is unavailable.
- Reviewed is the single primary local attention state for both Review Threads and Review Targets.
- Viewed remains secondary file-level fallback state.
- Review Targets are usually marked Reviewed by explicit user action.
- Starting a Review Thread from a Review Target may offer to mark that target Reviewed.
- Resolving a Review Thread in Narview still marks that Review Thread Reviewed for the current user.
- Reviewing all Review Threads inside a Review Target does not automatically mark the Review Target Reviewed.
- Target Fingerprints decide whether Review Target Reviewed state carries forward across new commits.
- Target Fingerprints cover the target's own reviewable content and structural identity, not unrelated Context Nodes.
- Changed previously reviewed targets show Needs Re-Review and count as remaining Review Work.
- Review Work presents target progress and thread progress separately, plus a combined remaining count.
- Human Feedback Packets are a focused Handoff Packet mode for unresolved Human Review Threads by default.
- Human Feedback Packets preserve raw review conversation text and wrap it in structured context.
- Human Feedback Packets are built from the user's current filtered Narview view and disclose GitHub data freshness.
- Human Feedback Packets instruct external coding agents to verify feedback before implementing changes.
- Narview remains LLM-free for Attention Map generation, Hotspot ranking, Review Path ordering, and packet construction.
- Review Confidence is the north-star outcome: the reviewer can explain and clear the changed logic.

## Testing Decisions

- Tests should prioritize external behavior and durable state transitions over graph implementation internals.
- Existing smoke and domain/state tests provide prior art for review state, thread actions, handoff packets, cache behavior, and keyboard flow.
- Clone tests should cover clone creation, clone reuse, fetch/update behavior, same-repository PR checkout, fetchable fork PR checkout, unfetchable fork fallback, and clone-unavailable states.
- Read-Only Analysis tests should verify Narview does not edit repository files, run project commands, or write Analysis Index data into the Review Clone.
- Analysis Index tests should cover persistence, invalidation by commit and analysis version, rebuildability of map presentation, and stale index recovery.
- Parser tests should cover TypeScript, JavaScript, and Python symbol detection, hunk-to-symbol mapping, imports/exports, same-file calls, and fallback behavior.
- Hunk fallback tests should cover unsupported languages, parser failures, binary/non-text files, and file-level fallback targets.
- Attention Map tests should verify node creation, Context Node caps, Generated Cluster behavior, edge explainability, progressive disclosure, and cluster expansion.
- Review Path tests should verify generated ordering, independence from visual layout, highest-attention target ordering, remaining/reviewed grouping, and no manual reordering.
- Review Target tests should cover grouping, splitting, explicit Reviewed action, no-feedback Reviewed action, and target-to-thread attachment.
- Target Fingerprint tests should verify unchanged targets preserve Reviewed state, changed targets become Needs Re-Review, and unrelated Context Node changes do not invalidate a target.
- GitHub write tests should cover immediate line-level Review Thread creation, File Review Thread creation, invalid anchor disabled states, permission failures, network failures, and post-write sync.
- Thread sync tests should cover Human Review Threads, CodeRabbit Threads, File Review Threads, Outdated threads, resolved threads, and line-null thread data.
- Read-Only Mode tests should verify review inspection remains available while Start Review Thread actions are disabled.
- Human Feedback Packet tests should verify unresolved-human default filtering, optional CodeRabbit inclusion, raw conversation preservation, metadata, URLs, nearby context, freshness disclosure, and verify-before-implementing instructions.
- Keyboard Flow tests should verify J/K navigation through Review Targets, map focus behavior, target Reviewed actions, Start Review Thread access, Handoff Packet access, and visible shortcut cues.
- UI layout tests should verify the Attention Map, Review Path, and selected target inspector remain usable together on desktop and adapt without modal review loops on constrained screens.
- Performance tests should use synthetic large PRs with many files, nodes, threads, generated clusters, and context references to verify usable map load and responsive Review Path navigation.
- Privacy tests should verify Analysis Index storage, diagnostics, and logs do not leak OAuth tokens or sensitive review data beyond explicit user-controlled exports.
- No-LLM tests should verify Attention Map generation, Review Path ordering, Hotspots, and packet construction do not call LLM services.

## Out of Scope

- Acting as a code editor.
- Editing files in the Review Clone.
- Running repository install, build, test, lint, or arbitrary project commands.
- Local AI, hosted AI, LLM-generated summaries, or LLM-generated ranking.
- Manual Review Path reordering in the first version.
- Complete type inference, complete runtime call graphs, framework-specific route understanding, and cross-repository analysis.
- Deep structural analysis for languages outside TypeScript, JavaScript, and Python in the first implementation.
- Perfect fork PR support when the head ref is not fetchable with the user's GitHub access.
- Synthetic merge commit analysis as the default mode.
- Draft GitHub review workflows, pending comments, approve, request changes, or full review submission.
- Creating Pull Request Comments attached to the PR as a whole.
- Merging Pull Requests.
- Managing stacked Pull Requests.
- Rich notebook, binary, image, or specialized non-text diffs beyond visibility and fallback representation.
- Team-synced Reviewed state.
- Telemetry or analytics.
- Replacing GitHub, CodeRabbit, CI providers, or external coding agents.

## Further Notes

- This PRD intentionally supersedes the earlier queue-first and remote-first direction for the next-generation review workflow.
- The earlier v1 model still provides useful implementation prior art for OAuth, GitHub fetching, Review Thread actions, local Reviewed state, Handoff Packets, cache behavior, and keyboard navigation.
- The Attention Map redesign depends on several documented decisions from the grilling session: GitHub-visible thread creation, managed Review Clones, Read-Only Analysis, deep analysis for TypeScript/JavaScript/Python, progressive map disclosure, Human Feedback Packets, and Review Confidence as the success metric.
- The first implementation should keep the generated Review Path explainable and conservative. Narview is guiding developer attention, not deciding whether the code is correct.
- The PRD is broken into vertical implementation slices so clone setup, analysis indexing, map rendering, target review, GitHub writes, and handoff packets can land incrementally.

## Implementation Issues

Board manifest: [issues/README.md](./issues/README.md)

19. [Managed Review Clone Setup And Health](./issues/19-managed-review-clone-setup-and-health.md)
20. [PR Head Checkout And Clone Fallbacks](./issues/20-pr-head-checkout-and-clone-fallbacks.md)
21. [Analysis Index And Hunk Map MVP](./issues/21-analysis-index-and-hunk-map-mvp.md)
22. [Deep Analysis For TypeScript JavaScript And Python](./issues/22-deep-analysis-for-typescript-javascript-and-python.md)
23. [Context Nodes Edges And Test Relations](./issues/23-context-nodes-edges-and-test-relations.md)
24. [Structural Hotspots And Generated Clusters](./issues/24-structural-hotspots-and-generated-clusters.md)
25. [Review Target Builder And Grouping](./issues/25-review-target-builder-and-grouping.md)
26. [Review Path Rail Keyboard Focus And Progress](./issues/26-review-path-rail-keyboard-focus-and-progress.md)
27. [Persistent Review Target Inspector](./issues/27-persistent-review-target-inspector.md)
28. [Reviewed State For Targets And Threads](./issues/28-reviewed-state-for-targets-and-threads.md)
29. [Target Fingerprints And Needs Re-Review](./issues/29-target-fingerprints-and-needs-re-review.md)
30. [Review Thread Attachment And File Threads](./issues/30-review-thread-attachment-and-file-threads.md)
31. [Read-Only Mode And GitHub Write Permissions](./issues/31-read-only-mode-and-github-write-permissions.md)
32. [Start Line And File Review Threads](./issues/32-start-line-and-file-review-threads.md)
33. [Human Feedback Packets](./issues/33-human-feedback-packets.md)
34. [Checks Merge Readiness And Outdated Context](./issues/34-checks-merge-readiness-and-outdated-context.md)
35. [Privacy Performance And No-LLM Hardening](./issues/35-privacy-performance-and-no-llm-hardening.md)
36. [Attention Map End-To-End Acceptance Pass](./issues/36-attention-map-end-to-end-acceptance-pass.md)
