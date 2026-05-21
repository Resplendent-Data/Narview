# Narview Review Context

Narview helps teams review GitHub pull requests by making review attention visible without changing GitHub's own review resolution state.

## Language

**Workspace**:
The user's saved set of GitHub repositories to review in Narview.
_Avoid_: Organization, team, account

**Review Clone**:
A Narview-managed repository copy used for review analysis, separate from any checkout the user edits.
_Avoid_: User checkout, coding workspace, local project

**Read-Only Analysis**:
Narview's use of repository content to understand review structure without editing code or running project commands.
_Avoid_: Build, test run, code execution

**Read-Only Mode**:
A degraded Narview mode where the user can inspect review data but cannot publish GitHub review feedback.
_Avoid_: Offline mode, analysis mode, limited account

**Analysis Index**:
Narview-owned derived data from a **Review Clone** used to build the **Attention Map**.
_Avoid_: Generated source, repo cache, build artifact

**Deep Analysis Language**:
A programming language where Narview can identify changed symbols and structural relationships for the **Attention Map**.
_Avoid_: Supported language, syntax color, parser plugin

**Pull Request**:
A GitHub request to merge a set of commits from one branch into another.
_Avoid_: Change request, merge request

**Review Thread**:
A GitHub discussion attached to a **Pull Request**, usually anchored to a changed line or file.
_Avoid_: Comment, annotation, note

**Start Review Thread**:
The act of creating a new GitHub-visible **Review Thread** from Narview.
_Avoid_: Add comment, leave note, create local feedback

**Outdated**:
GitHub's state indicating that a **Review Thread** is attached to an older version of a diff.
_Avoid_: Stale, obsolete, old

**CodeRabbit Thread**:
A **Review Thread** authored by CodeRabbit.
_Avoid_: CodeRabbit comment, bot note

**Human Review Thread**:
A **Review Thread** authored by a person.
_Avoid_: Human comment, developer comment, manual note

**File Review Thread**:
A **Review Thread** anchored to a file rather than a specific changed line or symbol.
_Avoid_: Whole-file comment, unanchored comment, orphaned line comment

**Pull Request Comment**:
A GitHub discussion message attached to the **Pull Request** as a whole rather than to a file or changed line.
_Avoid_: Review Thread, summary review, file comment

**Review Path**:
An ordered route through **Review Targets** for inspecting a **Pull Request**.
_Avoid_: Change stack, file order, walkthrough

**Reviewed**:
Narview's local attention state indicating that the current user has handled a **Review Thread** or **Review Target** enough to move on.
_Avoid_: Resolved, done, fixed, team-reviewed, viewed

**Needs Re-Review**:
Narview's local attention state indicating that a previously **Reviewed** **Review Target** changed and needs review again.
_Avoid_: Unreviewed, stale, invalid

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
_Avoid_: Reviewed, resolved, thread viewed, target inspected

**Review Session**:
The user's last local position and active context while reviewing a **Pull Request**.
_Avoid_: Progress, state, history

**Review Overview**:
A high-level summary of a **Pull Request** that helps a person decide where to inspect first.
_Avoid_: Dashboard, summary page, landing page

**Guided Review Workspace**:
The primary review surface that guides a person through the **Attention Map**, **Review Path**, and related **Review Threads**.
_Avoid_: Three-pane layout, diff page, files changed view

**Keyboard Flow**:
The set of visible keyboard actions for moving through and acting on review work.
_Avoid_: Shortcut mode, hotkeys

**Hotspot**:
A **File Change** or area of a **Pull Request** that deserves earlier inspection.
_Avoid_: Risk, issue, warning

**Attention Map**:
A structural view of the changed code areas and their relationships that helps decide where review attention should go first.
_Avoid_: Risk model, AI ranking, domain classifier

**Attention Node**:
A reviewable unit in an **Attention Map**, usually a changed symbol and falling back to a diff hunk when Narview cannot identify a symbol.
_Avoid_: File card, line item, graph bubble

**Context Node**:
An unchanged code unit shown in the **Attention Map** because it helps explain the impact or relationship of an **Attention Node**.
_Avoid_: Review item, hidden change, required inspection

**Attention Edge**:
An explainable relationship between two **Attention Nodes** that helps a reviewer understand why the changed areas should be considered together.
_Avoid_: Mystery link, AI association, dependency blob

**Attention Cluster**:
A grouped set of **Attention Nodes** shown together when the **Attention Map** would otherwise be too dense.
_Avoid_: Folder, collapsed file, hidden work

**Generated Cluster**:
An **Attention Cluster** for generated, vendor, build, or other low-signal changed files.
_Avoid_: Hidden generated files, ignored changes, noise bucket

**Review Target**:
An **Attention Node** or **Attention Cluster** selected for the **Review Path** because it represents one coherent logic question for the reviewer.
_Avoid_: Diff line, file entry, task

**Target Fingerprint**:
A stable summary of a **Review Target**'s reviewed content used to decide whether its **Reviewed** state can be preserved after new commits.
_Avoid_: Hash as identity, cache key, review proof, context hash

**Call Edge**:
An **Attention Edge** indicating that one **Attention Node** calls another changed or relevant symbol.
_Avoid_: Runtime proof, execution path

**Module Edge**:
An **Attention Edge** indicating that **Attention Nodes** are related through imports, exports, or module boundaries.
_Avoid_: Package dependency, ownership link

**Test Edge**:
An **Attention Edge** indicating that a test file or test symbol is related to an **Attention Node**.
_Avoid_: Coverage proof, quality score

**Review Edge**:
An **Attention Edge** indicating that a **Review Thread** is anchored to or near an **Attention Node**.
_Avoid_: Issue link, defect link

**Handoff Packet**:
A prepared bundle of **Pull Request** context intended for use in another tool.
_Avoid_: Prompt, export, AI task

**Human Feedback Packet**:
A **Handoff Packet** focused on human-authored **Review Threads** for use by an external coding agent.
_Avoid_: Copy all comments, developer notes dump, AI fix prompt

**Check**:
A GitHub status result attached to a **Pull Request**.
_Avoid_: CI job, build

**Merge Readiness**:
The visible state of whether a **Pull Request** appears ready to merge according to GitHub review context.
_Avoid_: Merge action, release readiness, approval

**Review Work**:
The remaining **Review Targets** and **Review Threads** a user has not yet marked **Reviewed**.
_Avoid_: Todo count, completion score, approval progress

**Review Confidence**:
The user's ability to explain and clear the changed logic in a **Pull Request** after inspecting the relevant **Review Targets** and **Review Threads**.
_Avoid_: Approval speed, comment volume, merge velocity

## Relationships

- A **Workspace** contains zero or more GitHub repositories
- A GitHub repository may have one **Review Clone**
- A **Review Clone** belongs to Narview rather than the user's coding environment
- A **Review Clone** may be reused across multiple **Pull Requests** from the same GitHub repository
- A **Review Clone** is used for **Read-Only Analysis**
- A **Review Clone** analyzes the **Pull Request** head as the primary code state
- The base branch is used for diff comparison against the **Pull Request** head
- A **Review Clone** supports same-repository **Pull Requests** first
- A **Review Clone** may analyze fork **Pull Requests** when the head ref is fetchable with the user's GitHub access
- An **Analysis Index** is stored outside the **Review Clone**
- An **Analysis Index** may be keyed by repository, commit, and analysis version
- An **Analysis Index** may persist parsed symbols, relationships, **Target Fingerprints**, and thread attachments across app restarts
- The rendered **Attention Map** presentation is rebuildable from the **Analysis Index** and current GitHub data
- TypeScript, JavaScript, and Python are **Deep Analysis Languages**
- A **Pull Request** belongs to exactly one GitHub repository
- A **Pull Request** contains one or more **File Changes**
- A **File Change** may be **Viewed** without all related **Review Threads** being **Reviewed**
- Marking a **File Change** as **Viewed** does not mark related **Review Threads** as **Reviewed**
- A **Pull Request** may have one local **Review Session** for the current user
- A **Pull Request** has one **Review Overview**
- A **Review Overview** may be presented as an **Attention Map**
- A **Pull Request** is inspected through one **Guided Review Workspace**
- A **Guided Review Workspace** exposes a **Keyboard Flow**
- A **Guided Review Workspace** may show the **Attention Map**, **Review Path**, and selected **Review Target** content together
- A **Review Overview** may identify zero or more **Hotspots**
- An **Attention Map** may identify one or more **Hotspots**
- An **Attention Map** requires a **Review Clone** for full structural analysis
- An **Attention Map** contains one or more **Attention Nodes**
- An **Attention Map** may contain **Context Nodes**
- An **Attention Map** may contain **Attention Edges** between related **Attention Nodes**
- An **Attention Map** may show **Attention Clusters** instead of every **Attention Node** at once
- An **Attention Map** may show generated, vendor, or build changes as a **Generated Cluster**
- An **Attention Edge** may be a **Call Edge**, **Module Edge**, **Test Edge**, **Review Edge**, or same-file relationship
- An **Attention Node** usually represents a changed symbol when Narview can identify one
- An **Attention Node** may fall back to a diff hunk when Narview cannot identify a changed symbol
- A **Context Node** is not a **Review Target** by default
- **Context Nodes** should be capped or collapsed so unchanged code does not dominate the **Attention Map**
- Files outside **Deep Analysis Languages** use diff hunk fallback **Attention Nodes**
- A **Deep Analysis Language** supports symbol detection, hunk-to-symbol mapping, same-file calls, imports and exports, test relationships, and Review Thread attachment
- A **Hotspot** may be an **Attention Node** or a cluster of related **Attention Nodes**
- A **Generated Cluster** should not dominate the **Review Path** unless it has **Review Threads** or failing **Checks**
- A **Review Path** orders **Review Targets** for inspection
- A **Review Path** may order **Review Targets**
- A **Review Path** may begin with the **Hotspot** that deserves earliest inspection
- A **Review Path** may focus the **Attention Map** on the selected **Attention Node**
- A **Review Path** is ordered independently from the visual layout of the **Attention Map**
- A **Review Path** prioritizes attention before dependency reading order
- A **Review Target** may expose related context targets without making them next in the **Review Path**
- A **Review Path** order is generated by Narview and is not manually reordered by users in the first version
- A **Review Path** may show remaining **Review Targets** before **Reviewed** targets
- **Reviewed** **Review Targets** may remain available in a collapsed or deemphasized section
- A **Review Target** may be an **Attention Node** or **Attention Cluster**
- A **Review Target** may group tightly related **Attention Nodes** when they fit one coherent logic question
- A **Review Target** should split apart when grouped nodes answer different logic questions or become too large to inspect together
- Selecting an **Attention Node** may show its review content in the **Guided Review Workspace** without leaving the **Attention Map**
- Selecting an **Attention Node** should show the changed context and the current head version of the enclosing symbol
- Selecting an **Attention Node** may expose the base version of the enclosing symbol on demand
- A **Handoff Packet** contains selected **Pull Request** context
- A **Pull Request** has zero or more **Review Threads**
- A **CodeRabbit Thread** is exactly one **Review Thread**
- A **Human Review Thread** is exactly one **Review Thread**
- A **File Review Thread** is exactly one **Review Thread**
- A **File Review Thread** belongs to one **File Change**
- A **File Review Thread** may attach to a file-level **Review Target**
- A person may **Start Review Thread** from Narview while reviewing a **File Change**
- A **Review Thread** started in Narview is visible on GitHub
- Starting a **Review Thread** from Narview publishes it to GitHub immediately
- Narview may start a line-level **Review Thread** or a **File Review Thread**
- Narview does not create **Pull Request Comments** in this product phase
- Narview requires GitHub write permission to **Start Review Thread**
- Narview may operate in **Read-Only Mode** when GitHub write permission is unavailable
- A **Review Thread** may be **Outdated**
- A **Review Thread** may be **Reviewed** by one user without being **Reviewed** by another
- A **Review Thread** may be **Reviewed** without being resolved on GitHub
- A **Review Thread** may be **Resolved** on GitHub without being **Reviewed** in Narview
- A **Review Target** may be **Reviewed** by one user without being **Reviewed** by another
- A **Review Target** may be **Reviewed** without any new **Review Thread** being started
- A **Review Target** is usually marked **Reviewed** by explicit user action
- A **Review Target** with no feedback still requires explicit **Reviewed** action
- A **Review Target** keeps **Reviewed** after new commits only when its **Target Fingerprint** is unchanged
- A **Review Target** needs re-review when its **Target Fingerprint** changes
- A **Review Target** may be **Needs Re-Review** after new commits
- A **Target Fingerprint** covers the reviewable content of the **Review Target**, not unrelated **Context Nodes**
- Resolving a **Review Thread** in Narview also marks it **Reviewed** for the current user
- Starting a **Review Thread** from a **Review Target** may offer to mark that **Review Target** **Reviewed**
- Reviewing every **Review Thread** inside a **Review Target** does not automatically mark the **Review Target** **Reviewed**
- Unresolving a **Review Thread** in Narview does not remove **Reviewed** for the current user
- A **Review Thread** may have zero or more **Replies**
- A **Bulk Action** may change local Narview state or GitHub **Review Thread** state
- **Review Work** may count unreviewed **Review Targets** and unreviewed **Review Threads** separately
- **Review Work** may also present a combined remaining count
- **Review Confidence** is the desired outcome of the **Attention Map** workflow
- A **Human Feedback Packet** contains **Human Review Threads** by default
- A **Human Feedback Packet** may include **CodeRabbit Threads** when selected
- A **Human Feedback Packet** defaults to unresolved **Human Review Threads** unless the user changes the filter
- A **Human Feedback Packet** instructs external coding agents to verify feedback before implementing it
- A **Human Feedback Packet** preserves **Review Thread** conversation text instead of rewriting it into tasks
- A **Human Feedback Packet** is built from the user's current filtered Narview view
- A **Human Feedback Packet** should disclose freshness of the GitHub data it uses
- A **Review Thread** attached to an **Attention Node** should usually appear as context on that node rather than as its own **Review Target**
- A **Review Thread** that cannot be attached to an **Attention Node** may become its own **Review Target**
- A **File Review Thread** should appear as context on the relevant file-level **Review Target** when available
- A **Pull Request** has zero or more **Checks**
- A **Pull Request** has one **Merge Readiness**
- Clearing cached GitHub data does not clear **Viewed**, **Reviewed**, or **Review Session** state

## Example dialogue

> **Dev:** "When I open a **Pull Request**, do I start in a separate thread-only queue?"
> **Domain expert:** "No — the **Guided Review Workspace** starts from the **Attention Map**, with **Review Threads** integrated into relevant **Review Targets**."
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
> **Dev:** "Should Narview analyze the checkout I use for coding?"
> **Domain expert:** "No — Narview should use its own **Review Clone** so branch changes and pull request switching do not affect the user's work."
> **Dev:** "Should Narview clone the same repository again for every **Pull Request**?"
> **Domain expert:** "No — a **Review Clone** should be reusable for the repository unless isolation or corruption requires recreating it."
> **Dev:** "Should Narview analyze a synthetic merge commit?"
> **Domain expert:** "No — Narview should analyze the **Pull Request** head as the primary code state and use the base branch for comparison."
> **Dev:** "What if a **Pull Request** comes from a fork Narview cannot fetch?"
> **Domain expert:** "Narview should show a clear clone-unavailable state and fall back to limited GitHub data instead of blocking all review context."
> **Dev:** "If CodeRabbit auto-resolves a thread, does that make it **Reviewed**?"
> **Domain expert:** "No — **Reviewed** only means a person looked at it in Narview."
> **Dev:** "When I write feedback on a changed line in Narview, is it just local?"
> **Domain expert:** "No — the person is using Narview to **Start Review Thread**, so the discussion is visible on GitHub."
> **Dev:** "Does Narview collect draft review comments before publishing them?"
> **Domain expert:** "No — when a person chooses to **Start Review Thread**, Narview creates the GitHub-visible discussion immediately."
> **Dev:** "What if a reviewer comments on a whole file in GitHub?"
> **Domain expert:** "Narview should sync it as a **File Review Thread** and attach it to the file-level **Review Target**."
> **Dev:** "Can Narview start feedback on a whole file?"
> **Domain expert:** "Yes — Narview may **Start Review Thread** as a **File Review Thread** when file-level feedback is the right anchor."
> **Dev:** "Can Narview leave a general comment on the whole **Pull Request**?"
> **Domain expert:** "Not in this product phase — Narview focuses on line-level and file-level **Review Threads**."
> **Dev:** "What if my GitHub auth can read pull requests but cannot write review feedback?"
> **Domain expert:** "Narview can enter **Read-Only Mode**, but **Start Review Thread** is unavailable until write permission is granted."
> **Dev:** "When I copy all human comments for an AI agent, what am I copying?"
> **Domain expert:** "A **Human Feedback Packet** made from unresolved **Human Review Threads** by default, with enough pull request and diff context for the agent to verify the feedback before changing code."
> **Dev:** "Should Narview turn human review feedback into an implementation checklist?"
> **Domain expert:** "No — the **Human Feedback Packet** should preserve the review conversation and wrap it with structure for verification."
> **Dev:** "If I filter to unresolved human threads and copy feedback, should Narview include resolved threads too?"
> **Domain expert:** "No — the **Human Feedback Packet** should reflect the current filtered Narview view and disclose how fresh the GitHub data is."
> **Dev:** "If Alice marks a **CodeRabbit Thread** as **Reviewed**, does Bob see it as **Reviewed** too?"
> **Domain expert:** "No — **Reviewed** belongs to the current user."
> **Dev:** "If I mark a **Review Target** as **Reviewed**, does that mean the code is correct?"
> **Domain expert:** "No — it only means the current user has handled that review target enough to move on."
> **Dev:** "If a new commit changes a **Review Target**, should it stay **Reviewed**?"
> **Domain expert:** "No — if the **Target Fingerprint** changes, the target needs review again."
> **Dev:** "If an unchanged caller shown as context changes later, does this target's fingerprint change?"
> **Domain expert:** "No — a **Target Fingerprint** follows the target's reviewable content, not unrelated context."
> **Dev:** "Should a changed target look like it was never reviewed?"
> **Domain expert:** "No — use **Needs Re-Review** to show that the target was reviewed before but changed."
> **Dev:** "If I have no feedback on a **Review Target**, should Narview mark it **Reviewed** automatically?"
> **Domain expert:** "No — no-feedback review still needs an explicit **Reviewed** action."
> **Dev:** "If all **Review Threads** inside a **Review Target** are **Reviewed**, is the target also **Reviewed**?"
> **Domain expert:** "No — handling discussion is not the same as reviewing the changed logic."
> **Dev:** "Should Narview show target progress and thread progress separately?"
> **Domain expert:** "Yes — **Review Work** should make both visible, with a combined remaining count for orientation."
> **Dev:** "How do we know the **Attention Map** workflow succeeded?"
> **Domain expert:** "The reviewer can explain and clear the changed logic with **Review Confidence**, not merely move fast or leave many comments."
> **Dev:** "Should every **CodeRabbit Thread** become its own item in the **Review Path**?"
> **Domain expert:** "No — mapped **Review Threads** should appear as context on the relevant **Review Target**, while unmapped threads can become their own targets."
> **Dev:** "Should resolved **CodeRabbit Threads** disappear?"
> **Domain expert:** "No — they can still appear in thread filters when the reviewer asks for them."
> **Dev:** "Should **Outdated** **Review Threads** look the same as current ones?"
> **Domain expert:** "No — **Outdated** threads should remain available, but their older diff context must be obvious."
> **Dev:** "Where should a reviewer start when a **Pull Request** is too large to read top to bottom?"
> **Domain expert:** "The **Review Overview** should start from the **Attention Map** and guide them through **Review Targets**."
> **Dev:** "Does Narview decide that a file is important because its path says `auth` or `billing`?"
> **Domain expert:** "No — Narview should use an **Attention Map** from structural review signals, because domain words do not generalize across repositories."
> **Dev:** "Should an **Attention Node** be a whole file, a line, or a function?"
> **Domain expert:** "Prefer a changed symbol, because files are too broad and lines are too noisy; use a diff hunk when a symbol cannot be identified."
> **Dev:** "Should unchanged callers appear in the **Attention Map**?"
> **Domain expert:** "Yes when they explain impact, but they should appear as **Context Nodes** rather than required **Review Targets**."
> **Dev:** "Should the **Attention Map** show every unchanged caller of a changed symbol?"
> **Domain expert:** "No — **Context Nodes** should be capped or collapsed, with full lists available on demand."
> **Dev:** "Can the **Attention Map** connect two nodes just because Narview thinks they are semantically related?"
> **Domain expert:** "No — an **Attention Edge** should represent an explainable relationship such as calls, module boundaries, tests, review threads, or same-file grouping."
> **Dev:** "Should the **Attention Map** show every **Attention Node** immediately?"
> **Domain expert:** "No — it should preserve global structure with **Attention Clusters** and reveal lower-signal nodes through zooming, filtering, or selection."
> **Dev:** "Should generated files disappear from the **Attention Map**?"
> **Domain expert:** "No — generated, vendor, and build changes should appear as a **Generated Cluster** by default, but not dominate review order."
> **Dev:** "What belongs in the **Review Path**?"
> **Domain expert:** "A **Review Target** belongs there when it represents one coherent logic question, whether that is one **Attention Node** or a small **Attention Cluster**."
> **Dev:** "When should Narview group several **Attention Nodes** into one **Review Target**?"
> **Domain expert:** "Group them when they are tightly related and small enough to review together; split them when they answer different questions or become too large."
> **Dev:** "Should the default **Review Path** start at the top of the diff?"
> **Domain expert:** "No — it should start with the **Hotspot** that deserves earliest inspection."
> **Dev:** "Should visual map position decide the review order?"
> **Domain expert:** "No — the **Attention Map** layout explains relationships, while the **Review Path** order guides action."
> **Dev:** "Should dependency order override the highest-priority **Hotspot**?"
> **Domain expert:** "No — the **Review Path** should start where attention matters most, while related context remains one action away."
> **Dev:** "Can users drag **Review Targets** to manually reorder the **Review Path**?"
> **Domain expert:** "No — the first version keeps **Review Path** order generated by Narview."
> **Dev:** "Should **Reviewed** **Review Targets** disappear from the **Review Path**?"
> **Domain expert:** "No — they should remain available but stop competing with remaining review work."
> **Dev:** "Is Narview just a prettier files-changed page?"
> **Domain expert:** "No — the **Guided Review Workspace** leads with the **Attention Map** and **Review Path** while still exposing files and threads when needed."
> **Dev:** "When I press J or K in the **Review Path**, what should happen?"
> **Domain expert:** "The selected **Attention Node** changes, and the **Attention Map** focuses that part of the pull request."
> **Dev:** "Should selecting an **Attention Node** open a modal?"
> **Domain expert:** "No — the review content should stay in the **Guided Review Workspace** so the **Attention Map** remains visible during repeated review actions."
> **Dev:** "When I review a changed symbol, should I see the old version first?"
> **Domain expert:** "No — show the changed context and current head version first, with the base version available when comparison matters."
> **Dev:** "Should a reviewer lose the **Review Path** when inspecting an **Attention Node**?"
> **Domain expert:** "No — where screen space allows, the **Guided Review Workspace** should keep the **Attention Map**, **Review Path**, and selected node content visible together."
> **Dev:** "Should keyboard shortcuts be hidden in docs?"
> **Domain expert:** "No — the **Keyboard Flow** should be visible in the interface while a person reviews."
> **Dev:** "Does Narview need CodeRabbit's Change Stack to guide review order?"
> **Domain expert:** "No — a **Review Path** can be built from Narview's own **Attention Map**."
> **Dev:** "Does Narview fix code directly?"
> **Domain expert:** "No — Narview can create a **Handoff Packet** for another tool, but it does not apply code changes itself."
> **Dev:** "If Narview has a **Review Clone**, is it a code editor?"
> **Domain expert:** "No — the **Review Clone** exists for review analysis, not for editing code."
> **Dev:** "Should Narview run the repository's tests or build commands from the **Review Clone**?"
> **Domain expert:** "No — the **Review Clone** is for **Read-Only Analysis** unless a later feature deliberately adds command execution."
> **Dev:** "Can Narview cache parsed symbols and graph relationships?"
> **Domain expert:** "Yes — that belongs in an **Analysis Index** stored outside the **Review Clone**, not as files written into the repository."
> **Dev:** "Should Narview persist the exact rendered graph layout as source of truth?"
> **Domain expert:** "No — persist the **Analysis Index** and rebuild the **Attention Map** presentation from current inputs."
> **Dev:** "Does Narview need full structural analysis for every programming language at launch?"
> **Domain expert:** "No — TypeScript, JavaScript, and Python get deep analysis first; other languages still appear through diff hunk fallback nodes."
> **Dev:** "Does deep analysis mean Narview understands every framework convention?"
> **Domain expert:** "No — deep analysis means Narview can detect symbols and explain structural relationships without claiming runtime or framework-level understanding."
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
- "Human comment" can mean an individual message or a thread — resolved: use **Human Review Thread** for the GitHub discussion and **Reply** for an individual message added to it.
- "Whole-file comment" can imply it lacks review identity — resolved: use **File Review Thread** for a **Review Thread** anchored to a file rather than a changed line.
- "PR comment" is not the same as a code review thread — resolved: use **Pull Request Comment** for whole-PR discussion and keep it outside creation scope for now.
- "Comment on code" can imply local private notes or GitHub-visible feedback — resolved: use **Start Review Thread** when Narview creates a new GitHub-visible discussion.
- "Copy all human comments" is an action, not a domain object — resolved: create a **Human Feedback Packet** from filtered **Human Review Threads**.
- "Stale" and "old" are ambiguous — resolved: use **Outdated** for GitHub's older-diff thread state.
- "Workspace" means a local saved review scope, not a GitHub organization or team.
- "Local clone" could mean the user's active coding checkout — resolved: use **Review Clone** for Narview's managed repository copy.
- "Analysis" could imply executing project code — resolved: use **Read-Only Analysis** for Narview's non-editing, non-executing repository inspection.
- "Read-only" means Narview does not modify repository content — resolved: Narview may still store its own **Analysis Index** outside the **Review Clone**.
- "Checklist" and "queue" make the product sound like separate task lists — resolved: use **Review Path** for ordered review work and thread filters for narrowing **Review Threads**.
- "Viewed" and "Reviewed" are separate states — resolved: **Viewed** belongs to **File Changes**, while **Reviewed** belongs to **Review Threads**.
- In the primary **Attention Map** workflow, **Reviewed** applies to both **Review Threads** and **Review Targets**, while **Viewed** remains file-level fallback state.
- "Progress" can mean position or attention — resolved: use **Review Session** for resume position, **Viewed** for file attention, and **Reviewed** for review item attention.
- "Dashboard" suggests generic metrics — resolved: use **Review Overview** for PR-specific review orientation.
- "Three-pane layout" describes screen structure, not product meaning — resolved: use **Guided Review Workspace**.
- "Hotkeys" sounds like hidden shortcuts — resolved: use **Keyboard Flow** for visible keyboard-driven review.
- "Change stack" is CodeRabbit-specific — resolved: use **Review Path** for Narview's ordered review route.
- "Risk" implies proven danger — resolved: use **Hotspot** for areas that deserve earlier inspection.
- "Highest risk impact area" sounds like Narview has proven a defect — resolved: use **Hotspot** for the area that deserves earliest inspection.
- "Complexity heat map" can imply visual decoration or generic code metrics — resolved: use **Attention Map** for structural relationships that guide review attention.
- Domain keyword categories such as `auth` or `billing` do not generalize — resolved: **Hotspots** should come from structural signals, not domain-name matching.
- "Node" is a visual implementation term by itself — resolved: use **Attention Node** for a reviewable unit in the **Attention Map**.
- "Reviewed" does not mean GitHub-resolved, code-fixed, or correct — resolved: **Reviewed** is local human attention state only.
- "Same symbol" does not always mean same reviewed content — resolved: use **Target Fingerprint** to decide whether **Reviewed** can carry forward.
- "Reviewed" could mean personal or team attention — resolved: **Reviewed** is per-user attention state.
- "Resolved" and "Reviewed" are separate states — resolved: **Resolved** belongs to GitHub, while **Reviewed** belongs to Narview.
- "Merge Readiness" is review context, not permission to merge — resolved: Narview does not merge pull requests in v1.
- "Success" should not mean faster approval or more comments — resolved: success means **Review Confidence** over changed logic and review feedback.
