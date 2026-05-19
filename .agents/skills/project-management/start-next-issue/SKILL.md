---
name: start-next-issue
description: Select and start the next eligible non-blocked issue for a given project by moving one `ready` issue to `in-progress`, updating both issue frontmatter and `issues/README.md`, then immediately beginning implementation. Allows multiple independent `in-progress` issues so parallel agents can work on non-blocking slices. Use when the user asks to start the next issue for a project Kanban workflow.
---

# Start Next Issue

This skill starts the next actionable implementation slice for a project.

Invoke as `/start-next-issue <project-folder>`.

Optional mode: dry run. In dry run mode, compute the result and return the start packet without mutating files.

## Inputs

- Required: `<project-folder>` (for example `ai-overhaul`)
- Optional: `dry-run` flag/instruction

Project issue directory:
- `prds/<project-folder>/issues/`

## Parallel Work Model

Treat issue status as branch-local coordination, not a global project mutex.

- Multiple issues may be `in-progress` at the same time when their blockers are clear.
- Existing `in-progress` issues are usually claimed by other workers. Leave them untouched.
- Do not start an issue if any `blocked_by` entry points to an issue that is not `done`.
- Start or mutate exactly one issue per invocation unless the user explicitly names a different workflow.
- If the user asks to resume or continue an already active issue, return that issue instead of claiming a new one.

## Selection Rules

Determine eligibility using issue file frontmatter (README is derived):

1. Candidate status must be `ready`.
2. Every entry in `blocked_by` must reference an issue whose status is `done`.
3. Existing `in-progress` issues do not block selection unless they are listed in the candidate's `blocked_by`.

If multiple candidates are eligible:
1. Choose lowest `slice_order`
2. Tie-break by filename lexicographic order

If the user names a specific issue:
- Start it only if it is `ready` and all blockers are `done`.
- If it is already `in-progress`, treat it as the active issue and begin/resume implementation.
- If it is blocked, do not mutate files; report the unmet blockers.

## Mutation Rules

When not in dry run mode and an issue is selected:

1. Update selected issue frontmatter:
   - `status: in-progress`
2. Keep all other issue file statuses unchanged.
3. Update `issues/README.md` to stay consistent:
   - Update the `Status` value in the slice overview table row.
   - Move the issue link from `## Ready` to `## In Progress`.
4. Do not modify the parent PRD file.

Concurrency guard:
- Immediately before editing, re-read the selected issue frontmatter and `issues/README.md`.
- If the selected issue is no longer `ready`, recalculate once from the latest board state.
- Never overwrite unrelated status changes made by another worker.

## Output

Return a compact start packet:

- Selected issue path and title
- Selection rationale (eligible + ordering + blockers clear)
- Acceptance criteria checklist
- Related `depends_on_story_ids`
- Reminder: when complete, move `in-progress` to `done` (or run a completion workflow skill)

## Implementation Kickoff (Default Behavior)

When not in dry run mode, do not stop after status updates.

After moving the issue to `in-progress`:
1. Read the selected issue in full and treat it as the implementation contract.
2. Start implementation immediately:
   - explore relevant code paths,
   - make code changes for the slice,
   - run targeted validation/tests.
3. Use the issue acceptance criteria as the execution checklist and report progress against it.
4. Keep issue status as `in-progress` while work is underway.
5. Only move to `done` when a completion workflow is explicitly run (or equivalent explicit instruction is given).

## No-Start Outcomes

### No eligible parallel issue

If `ready` issues exist but none has all blockers done:
- Do not mutate any files.
- Return whether work is blocked or already underway in existing `in-progress` issue(s).
- List existing `in-progress` issues separately from blocked `ready` issues.
- Suggest next action:
  - complete one of the blocking `in-progress` issue(s),
  - continue a named active issue, or
  - regenerate board slices with `/create-issues` if board state is stale.

### No eligible ready issue

If no `ready` issues remain:
- Do not mutate any files.
- Return whether all issue files are `done` or work remains `in-progress`.
- Suggest next action:
  - run `/complete-issue` for finished work,
  - continue active work, or
  - regenerate board slices with `/create-issues` if more slices are needed.

## Validation

Before applying mutations:
- Verify all `blocked_by` references resolve to existing issue files.
- If any reference is missing, stop and ask for board repair instructions.

After applying mutations:
- Re-read selected issue and `issues/README.md` to confirm consistency.
