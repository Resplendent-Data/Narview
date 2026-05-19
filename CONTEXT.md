# Narview Review Context

Narview helps teams review GitHub pull requests by making review attention visible without changing GitHub's own review resolution state.

## Language

**Workspace**:
The user's saved set of GitHub repositories to review in Narview.
_Avoid_: Organization, team, account

**Pull Request**:
A GitHub request to merge a set of commits from one branch into another.
_Avoid_: Change request, merge request

**Review Thread**:
A GitHub discussion attached to a **Pull Request**, usually anchored to a changed line or file.
_Avoid_: Comment, annotation, note

**Outdated**:
GitHub's state indicating that a **Review Thread** is attached to an older version of a diff.
_Avoid_: Stale, obsolete, old

**CodeRabbit Thread**:
A **Review Thread** authored by CodeRabbit.
_Avoid_: CodeRabbit comment, bot note

**Review Queue**:
A filtered set of **Review Threads** presented for a person to inspect.
_Avoid_: Todo list, checklist, inbox

**Review Path**:
An ordered route through **Hotspots**, **Review Threads**, or **File Changes** for inspecting a **Pull Request**.
_Avoid_: Change stack, file order, walkthrough

**Reviewed**:
Narview's local attention state indicating that the current user has looked at a **Review Thread**.
_Avoid_: Resolved, done, fixed, team-reviewed

**Resolved**:
GitHub's state indicating that a **Review Thread** no longer needs discussion on the pull request.
_Avoid_: Reviewed, fixed, dismissed

**Reply**:
A message added to an existing **Review Thread**.
_Avoid_: Comment, note, response

**Bulk Action**:
A single user command applied to multiple **Review Threads** or **File Changes**.
_Avoid_: Batch job, mass update

**File Change**:
The before-and-after change to one file in a **Pull Request**.
_Avoid_: Diff file, changed file

**Viewed**:
Narview's local attention state indicating that the current user has looked at a **File Change**.
_Avoid_: Reviewed, resolved, read

**Review Session**:
The user's last local position and active context while reviewing a **Pull Request**.
_Avoid_: Progress, state, history

**Review Overview**:
A high-level summary of a **Pull Request** that helps a person decide where to inspect first.
_Avoid_: Dashboard, summary page, landing page

**Guided Review Workspace**:
The primary review surface that guides a person through **Review Queues**, **Hotspots**, and **File Changes**.
_Avoid_: Three-pane layout, diff page, files changed view

**Keyboard Flow**:
The set of visible keyboard actions for moving through and acting on review work.
_Avoid_: Shortcut mode, hotkeys

**Hotspot**:
A **File Change** or area of a **Pull Request** that deserves earlier inspection.
_Avoid_: Risk, issue, warning

**Handoff Packet**:
A prepared bundle of **Pull Request** context intended for use in another tool.
_Avoid_: Prompt, export, AI task

**Check**:
A GitHub status result attached to a **Pull Request**.
_Avoid_: CI job, build

**Merge Readiness**:
The visible state of whether a **Pull Request** appears ready to merge according to GitHub review context.
_Avoid_: Merge action, release readiness, approval

## Relationships

- A **Workspace** contains zero or more GitHub repositories
- A **Pull Request** belongs to exactly one GitHub repository
- A **Pull Request** contains one or more **File Changes**
- A **File Change** may be **Viewed** without all related **Review Threads** being **Reviewed**
- Marking a **File Change** as **Viewed** does not mark related **Review Threads** as **Reviewed**
- A **Pull Request** may have one local **Review Session** for the current user
- A **Pull Request** has one **Review Overview**
- A **Pull Request** is inspected through one **Guided Review Workspace**
- A **Guided Review Workspace** exposes a **Keyboard Flow**
- A **Review Overview** may identify zero or more **Hotspots**
- A **Review Path** orders selected parts of a **Pull Request** for inspection
- A **Handoff Packet** contains selected **Pull Request** context
- A **Pull Request** has zero or more **Review Threads**
- A **CodeRabbit Thread** is exactly one **Review Thread**
- A **Review Thread** may be **Outdated**
- A **Review Queue** contains zero or more **Review Threads**
- A **Review Thread** may be **Reviewed** by one user without being **Reviewed** by another
- A **Review Thread** may be **Reviewed** without being resolved on GitHub
- A **Review Thread** may be **Resolved** on GitHub without being **Reviewed** in Narview
- Resolving a **Review Thread** in Narview also marks it **Reviewed** for the current user
- Unresolving a **Review Thread** in Narview does not remove **Reviewed** for the current user
- A **Review Thread** may have zero or more **Replies**
- A **Bulk Action** may change local Narview state or GitHub **Review Thread** state
- A **Pull Request** has zero or more **Checks**
- A **Pull Request** has one **Merge Readiness**
- Clearing cached GitHub data does not clear **Viewed**, **Reviewed**, or **Review Session** state

## Example dialogue

> **Dev:** "When I open a **Pull Request**, do I need to inspect every **File Change** before dealing with **CodeRabbit Threads**?"
> **Domain expert:** "No — the app should make both paths easy, because some reviews start from changed files and others start from CodeRabbit's feedback."
> **Dev:** "If I mark a **CodeRabbit Thread** as **Reviewed**, is the whole **File Change** **Viewed**?"
> **Domain expert:** "No — **Viewed** is file attention, while **Reviewed** is thread attention."
> **Dev:** "If I mark a **File Change** as **Viewed**, does that clear the file's **Review Threads**?"
> **Domain expert:** "No — **Review Threads** must be **Reviewed** separately unless the user takes an explicit bulk action."
> **Dev:** "If I reopen a **Pull Request**, should Narview treat my last location as progress?"
> **Domain expert:** "No — the **Review Session** is just where I left off, while **Viewed** and **Reviewed** represent attention."
> **Dev:** "If I clear cached diff data, do I lose which threads I **Reviewed**?"
> **Domain expert:** "No — clearing cached GitHub data is separate from resetting local review history."
> **Dev:** "Does Narview show every **Pull Request** my GitHub token can access?"
> **Domain expert:** "No — the **Workspace** is made from repositories the user saved for review."
> **Dev:** "If CodeRabbit auto-resolves a thread, does that make it **Reviewed**?"
> **Domain expert:** "No — **Reviewed** only means a person looked at it in Narview."
> **Dev:** "If Alice marks a **CodeRabbit Thread** as **Reviewed**, does Bob see it as **Reviewed** too?"
> **Domain expert:** "No — **Reviewed** belongs to the current user."
> **Dev:** "Should resolved **CodeRabbit Threads** disappear?"
> **Domain expert:** "No — they can still appear in a **Review Queue** when a filter asks for them."
> **Dev:** "Should **Outdated** **Review Threads** look the same as current ones?"
> **Domain expert:** "No — **Outdated** threads should remain available, but their older diff context must be obvious."
> **Dev:** "Where should a reviewer start when a **Pull Request** is too large to read top to bottom?"
> **Domain expert:** "The **Review Overview** should point them toward **Hotspots** and relevant **Review Queues**."
> **Dev:** "Is Narview just a prettier files-changed page?"
> **Domain expert:** "No — the **Guided Review Workspace** leads with queues and hotspots while still exposing files when needed."
> **Dev:** "Should keyboard shortcuts be hidden in docs?"
> **Domain expert:** "No — the **Keyboard Flow** should be visible in the interface while a person reviews."
> **Dev:** "Does Narview need CodeRabbit's Change Stack to guide review order?"
> **Domain expert:** "No — a **Review Path** can be built from Narview's own queues and hotspots."
> **Dev:** "Does Narview fix code directly?"
> **Domain expert:** "No — Narview can create a **Handoff Packet** for another tool, but it does not apply code changes itself."
> **Dev:** "If I resolve a **Review Thread** in Narview, does that make it **Reviewed**?"
> **Domain expert:** "Yes when the resolve happens in Narview, but the states still mean different things: **Resolved** changes GitHub state, while **Reviewed** records local attention."
> **Dev:** "Can I resolve several **Review Threads** at once?"
> **Domain expert:** "Yes, but GitHub-changing **Bulk Actions** require explicit confirmation."
> **Dev:** "Does Narview merge **Pull Requests**?"
> **Domain expert:** "No — Narview can show **Merge Readiness**, but merging happens outside Narview in v1."
> **Dev:** "If I unresolve a **Review Thread**, does it become unreviewed?"
> **Domain expert:** "No — unresolving changes GitHub state, but it does not erase local **Reviewed** state."

## Flagged ambiguities

- "Comment" can mean an individual message, a threaded GitHub discussion, or a CodeRabbit finding — resolved: use **Review Thread** for the trackable discussion.
- "Stale" and "old" are ambiguous — resolved: use **Outdated** for GitHub's older-diff thread state.
- "Workspace" means a local saved review scope, not a GitHub organization or team.
- "Checklist" makes the product sound like it only tracks tasks — resolved: use **Review Queue** for filtered review work.
- "Viewed" and "Reviewed" are separate states — resolved: **Viewed** belongs to **File Changes**, while **Reviewed** belongs to **Review Threads**.
- "Progress" can mean position or attention — resolved: use **Review Session** for resume position, **Viewed** for file attention, and **Reviewed** for thread attention.
- "Dashboard" suggests generic metrics — resolved: use **Review Overview** for PR-specific review orientation.
- "Three-pane layout" describes screen structure, not product meaning — resolved: use **Guided Review Workspace**.
- "Hotkeys" sounds like hidden shortcuts — resolved: use **Keyboard Flow** for visible keyboard-driven review.
- "Change stack" is CodeRabbit-specific — resolved: use **Review Path** for Narview's ordered review route.
- "Risk" implies proven danger — resolved: use **Hotspot** for areas that deserve earlier inspection.
- "Reviewed" does not mean GitHub-resolved or code-fixed — resolved: **Reviewed** is local human attention state only.
- "Reviewed" could mean personal or team attention — resolved: **Reviewed** is per-user attention state.
- "Resolved" and "Reviewed" are separate states — resolved: **Resolved** belongs to GitHub, while **Reviewed** belongs to Narview.
- "Merge Readiness" is review context, not permission to merge — resolved: Narview does not merge pull requests in v1.
