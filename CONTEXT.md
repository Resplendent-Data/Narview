# Narview Review Context

Narview helps teams review GitHub pull requests through a GitHub-first **Review Stack** workflow. The app keeps GitHub as the source of truth for pull request data, viewed file state, review threads, and pending reviews while giving reviewers a faster path through related changes.

## Language

**Workspace**:
The user's saved set of GitHub repositories to review in Narview.
_Avoid_: Organization, team, account

**Pull Request**:
A GitHub request to merge a set of commits from one branch into another.
_Avoid_: Change request, merge request

**File Change**:
The before-and-after change to one file in a **Pull Request**.
_Avoid_: Diff file, changed file

**Review Stack**:
A deterministic group of related **File Changes** that should be reviewed together.
_Avoid_: Review Path, Review Queue, Attention Map, CodeRabbit Change Stack

**Review Layer**:
An ordered review step inside a **Review Stack**, usually one file or a narrow set of diff ranges.
_Avoid_: Review Target, node, queue item

**Stack Rail**:
The left-side navigation that shows **Review Stacks**, **Review Layers**, viewed progress, and comment counts.
_Avoid_: Map, queue, sidebar task list

**All Files**:
The search and escape-hatch view that shows every **File Change** outside the canonical stack order.
_Avoid_: Raw diff mode, backup list

**Viewed**:
GitHub's per-user file state for a **File Change** on a **Pull Request**.
_Avoid_: Reviewed, resolved, done, inspected

**Mark File Viewed**:
The act of syncing one **File Change** to GitHub with `markFileAsViewed` or `unmarkFileAsViewed`.
_Avoid_: Local checkoff, review target done

**Mark Stack Viewed**:
The act of marking every unviewed **File Change** in a **Review Stack** viewed on GitHub.
_Avoid_: Resolve stack, approve stack

**Review Thread**:
A GitHub discussion attached to a **Pull Request**, usually anchored to a changed line or file.
_Avoid_: Comment, annotation, note

**File Review Thread**:
A **Review Thread** anchored to a file rather than a specific changed line.
_Avoid_: Whole-file comment, unanchored comment

**Reply**:
A message added to an existing **Review Thread**.
_Avoid_: Comment, note, response

**Pending Review**:
GitHub's draft review object that collects new review threads, replies, and file or range comments before submission.
_Avoid_: Local drafts, temporary comments

**Submit Review**:
The act of submitting a **Pending Review** to GitHub as `COMMENT`, `APPROVE`, or `REQUEST_CHANGES`.
_Avoid_: Publish comments, finalize draft

**Discard Review**:
The act of deleting the viewer's **Pending Review** without submitting its draft feedback.
_Avoid_: Clear local drafts

**Resolved**:
GitHub's state indicating that a **Review Thread** no longer needs discussion on the pull request.
_Avoid_: Reviewed, fixed, dismissed

**Outdated**:
GitHub's state indicating that a **Review Thread** is attached to an older version of a diff.
_Avoid_: Stale, obsolete, old

**Review Workspace**:
The primary three-pane review surface: stack navigation on the left, scoped diff in the center, comments and pending-review controls on the right.
_Avoid_: Guided Review Workspace, dashboard, landing page

**Keyboard Flow**:
Visible keyboard actions for moving between **Review Layers** and switching focus mode.
_Avoid_: Hidden shortcuts, hotkeys

**Review Clone**:
A Narview-managed repository copy used for optional enrichment, separate from any checkout the user edits.
_Avoid_: User checkout, coding workspace, local project

**Read-Only Mode**:
A degraded Narview mode where the user can inspect review data but cannot publish GitHub review feedback.
_Avoid_: Offline mode, analysis mode, limited account

**Review Session**:
The user's last local position and active context while reviewing a **Pull Request**.
_Avoid_: GitHub progress, viewed state

**Check**:
A GitHub status result attached to a **Pull Request**.
_Avoid_: CI job, build

**Merge Readiness**:
The visible state of whether a **Pull Request** appears ready to merge according to GitHub review context.
_Avoid_: Merge action, release readiness, approval

**Review Confidence**:
The user's ability to explain and clear the changed logic in a **Pull Request** after inspecting the relevant **Review Stacks**, **Review Layers**, and **Review Threads**.
_Avoid_: Approval speed, comment volume, merge velocity

## Relationships

- A **Workspace** contains zero or more GitHub repositories.
- A **Pull Request** belongs to exactly one GitHub repository.
- A **Pull Request** contains one or more **File Changes**.
- A **Pull Request** is inspected through one **Review Workspace**.
- A **Review Workspace** exposes a **Keyboard Flow**.
- A **Review Workspace** shows a **Stack Rail**, scoped diff, and review detail panel.
- A **Review Stack** contains one or more **Review Layers**.
- A **Review Layer** contains one or more **File Changes** and may scope the diff to specific changed ranges.
- A **File Change** belongs to one canonical **Review Stack**.
- **All Files** may show every **File Change** even when a file has a canonical stack.
- **Review Stacks** are generated deterministically from GitHub pull request files, paths, hunks, generated-file rules, review threads, and GitHub viewed state.
- Contracts, schemas, config, and migrations should appear before core implementation stacks.
- Core implementation should appear before UI, route, and API-consumer stacks.
- Tests should appear after related implementation when the relationship is detectable from paths.
- Docs, generated, vendor, lockfile, build output, and other low-signal changes should appear last unless review threads make them important to inspect.
- A **File Change** may be text, binary, generated, renamed, deleted, or low signal.
- A **Review Stack** exposes viewed progress from GitHub **Viewed** state.
- A **Review Layer** exposes comment counts from GitHub **Review Threads** anchored to its files or ranges.
- Marking a **File Change** **Viewed** does not resolve or submit any **Review Threads**.
- Marking a **Review Stack** **Viewed** attempts GitHub viewed mutations for each unviewed file in that stack.
- Failed viewed sync should roll back only the failed files and show a concise failure list.
- A **Pending Review** belongs to one viewer and one **Pull Request**.
- Narview should create or reuse the viewer's **Pending Review** before adding draft review feedback.
- Narview may add line, range, file-level, and existing-thread reply feedback to the active **Pending Review** where GitHub supports that workflow.
- Submitting a **Pending Review** uses GitHub's review events: `COMMENT`, `APPROVE`, or `REQUEST_CHANGES`.
- Discarding a **Pending Review** deletes the GitHub draft review.
- Resolving or unresolving a **Review Thread** changes GitHub thread state and is separate from file **Viewed** state.
- A **Review Clone** is optional enrichment for this workflow, not a blocker for opening or reviewing a **Pull Request**.
- GitHub PR data is the source of truth for changed files, patches, viewed state, review threads, pending reviews, and review submission.
- Narview supports github.com for this rebuild and does not yet support GitHub Enterprise.

## Example Dialogue

> **Dev:** "When I open a pull request, do I start in an attention map?"
> **Domain expert:** "No. Open into the **Review Workspace** with **Review Stacks** on the left, scoped diff in the center, and review detail on the right."

> **Dev:** "Can a file appear in more than one stack?"
> **Domain expert:** "Not canonically. A **File Change** has one **Review Stack**, while **All Files** can still show every file."

> **Dev:** "If I mark a stack viewed, is that just local?"
> **Domain expert:** "No. Narview calls GitHub viewed-file mutations for every unviewed file in that **Review Stack**."

> **Dev:** "If a file fails to mark viewed on GitHub, should the whole stack roll back?"
> **Domain expert:** "No. Keep successful files viewed, roll back failed files, and show a concise failure list."

> **Dev:** "Does Viewed mean I approved the pull request?"
> **Domain expert:** "No. **Viewed** is GitHub's file attention state; approval happens only through **Submit Review**."

> **Dev:** "When I write a line comment, should it publish immediately?"
> **Domain expert:** "No. Add it to the viewer's **Pending Review** so they can submit the review as comment, approval, or requested changes."

> **Dev:** "Do review clones block the stack workflow?"
> **Domain expert:** "No. Clones can enrich context later, but the main stack workflow works from GitHub pull request data."

> **Dev:** "Should Narview copy CodeRabbit's behavior exactly?"
> **Domain expert:** "No. Borrow the useful stack/layer pattern, but keep the model deterministic, GitHub-native, and maintainable."

## Flagged Ambiguities

- "Comment" can mean an individual message, a threaded GitHub discussion, or a CodeRabbit finding. Use **Review Thread** for the trackable GitHub discussion and **Reply** for a message added to one.
- "Viewed" and "Reviewed" are separate ideas. In this rebuild, **Viewed** is GitHub file state; review judgment is expressed through **Pending Review** and **Submit Review**.
- "Stack" should not imply CodeRabbit ownership. Use **Review Stack** for Narview's deterministic grouping model.
- "Layer" should not imply local-only progress. A **Review Layer** is navigation and diff scope; file progress still comes from GitHub **Viewed** state.
- "Generated" does not mean hidden. Generated and low-signal files remain visible, but they should not dominate stack order.
- "Review clone" can sound like the user's coding checkout. Use **Review Clone** only for Narview-managed optional analysis.
- "Read-only" means Narview cannot write GitHub review state, not that it cannot cache GitHub data locally.
- "Focus mode" is a workspace presentation state, not a separate review workflow.
