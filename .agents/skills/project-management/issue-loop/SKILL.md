---
name: issue-loop
description: Run an autonomous PRD project issue loop by repeatedly starting the next eligible issue, implementing it, completing it, committing and pushing it, then starting the next issue. Use when the user provides a project folder and asks Codex to keep working through start/complete issue cycles, run an issue loop, burn down project issues, or continue a PRD project board until blocked or finished.
---

# Issue Loop

## Overview

Use this skill to keep a PRD project moving without asking the user to manually alternate between issue-start and issue-completion workflows.

Invoke as `/issue-loop <project-folder>`.

The project issue directory is:
- `prds/<project-folder>/issues/`

## Inputs

- Required: `<project-folder>` such as `ai-overhaul`
- Optional: maximum cycle count, explicit stop condition, `dry-run`, `skip-push`, or `skip-commit`

If the user only provides a project folder, start immediately and continue until a stop condition is reached.

## Required Workflow Composition

Do not reimplement the issue board rules in this skill. Compose the existing repo workflows:

- Use `start-next-issue` to select exactly one eligible issue, move it to `in-progress`, and begin implementation.
- Use `complete-issue` to validate exactly one implemented issue, move it to `done`, update the project board, commit, and push.

Treat those skills as the source of truth for selection, blocker handling, acceptance checks, board mutation, staging, commit, and push behavior.

## Loop Algorithm

For each cycle:

1. Invoke the start workflow for the requested project:
   - `/start-next-issue <project-folder>`
2. If it selects an issue, keep working in the same turn until the issue acceptance criteria are satisfied:
   - read the issue as the implementation contract,
   - inspect the relevant code and docs,
   - make the necessary changes,
   - run targeted validation,
   - keep progress tied to the issue checklist.
3. Invoke the completion workflow for the same project or selected issue:
   - `/complete-issue <project-folder>`
   - Prefer the explicit issue path if multiple `in-progress` issues exist.
4. After a successful completion, start the next cycle automatically.
5. Before each new cycle, check the latest board and git state through the composed workflows. Never assume the board state from the previous cycle is still current.

## Stop Conditions

Stop the loop and hand off clearly when any of these occurs:

- No eligible `ready` issue remains.
- All project issues are `done`.
- Remaining `ready` issues are blocked.
- The start workflow reports ambiguity or board corruption.
- The completion workflow cannot infer exactly one issue.
- Acceptance criteria are not met.
- Validation fails and cannot be fixed in the current cycle.
- Commit or push fails.
- Unrelated dirty files cannot be safely separated from the issue work.
- The user-provided maximum cycle count or stop condition is reached.

When stopping, do not force board status changes outside the composed workflows.

## Handoff

Report a compact loop packet:

- Project folder
- Issues completed in this run
- Current issue status if stopped mid-cycle
- Validation run for the last completed issue
- Commit hashes and pushed branch names from completed cycles
- Exact stop reason and the next useful action

If no issue could be started, return the start workflow's no-start outcome and do not mutate files.
