---
name: complete-issue
description: Infer the issue currently being worked from chat context, project boards, and git changes; mark exactly one issue as `done`; sync the PRD project's `issues/README.md`; then commit and push the completed work on the current branch. Use when the user asks to complete, finish, close, or mark done a PRD implementation issue.
---

# Complete Issue

This skill completes one implementation issue and publishes the current branch.

Invoke as `/complete-issue` or `/complete-issue <project-folder-or-issue-path>`.

## Inputs

- Optional: `<project-folder>` such as `ai-overhaul`
- Optional: explicit issue file path such as `prds/ai-overhaul/issues/03-thing.md`
- Optional: user instruction to skip push, skip commit, or dry-run

Project issue directory:
- `prds/<project-folder>/issues/`

## Inference Rules

Complete exactly one issue per invocation unless the user explicitly asks for multiple.

Choose the issue in this order:

1. Explicit issue path, filename, title, or project named by the user.
2. The issue named in the current chat history, especially a prior `/start-next-issue` start packet.
3. The single `in-progress` issue under the named project.
4. The single `in-progress` issue across `prds/*/issues/`.
5. An `in-progress` issue whose acceptance criteria and title match the current git diff or recent work described in chat.

If more than one issue is plausible and the chat does not disambiguate, stop and ask which issue to complete. Do not guess.

If the inferred issue is `ready`, only complete it when the user explicitly says the work was done without running `/start-next-issue`; otherwise stop and explain that completion expects an active `in-progress` issue.

## Completion Checks

Before mutating board files:

1. Read the inferred issue in full.
2. Compare the work in chat and `git diff` against every acceptance criterion.
3. Run or confirm targeted validation appropriate to the touched code.
4. Inspect `git status --short --branch` so unrelated dirty files are visible.

Do not mark the issue `done` if acceptance criteria are clearly unmet. If validation cannot be run, the user may still explicitly approve completion, but report the unrun validation in the final handoff.

## Mutation Rules

When completing the issue:

1. Update selected issue frontmatter:
   - `status: done`
2. Keep all other issue file statuses unchanged.
3. Update `issues/README.md` to stay consistent:
   - Update the `Status` value in the slice overview table row.
   - Move the issue link from `## In Progress` to `## Done`.
   - Preserve existing ordering by `slice_order` inside each status section when practical.
4. Do not modify the parent PRD file unless it contains explicit issue status fields that would otherwise contradict the issue README.

After applying mutations:
- Re-read the issue and `issues/README.md`.
- Confirm the issue frontmatter and README table/sections agree.

## Git Publish Workflow

After board updates are validated:

1. Review `git status --short --branch`.
2. Stage only files that belong to the completed issue plus the issue board updates.
   - Include implementation, tests, docs, and the selected issue/README changes.
   - Do not stage unrelated user changes.
   - If unrelated dirty files cannot be separated safely, stop and ask before committing.
3. Commit with a conventional commit message derived from the work, for example:
   - `feat: complete frontend export UI`
   - `fix: complete session export access control`
   - `chore: complete dead code cleanup`
4. Do not add AI co-author or contributor trailers.
5. Push the current branch:
   - If the branch has an upstream, use `git push`.
   - If it has no upstream, use `git push -u origin HEAD`.

If commit or push fails, leave the completed board edits in place and report the exact blocker with the next command to run.

## Output

Return a compact completion packet:

- Completed issue path and title
- Acceptance criteria status
- Validation run or explicitly skipped
- Commit hash and branch pushed, when successful
- Any remaining risks or follow-up work

## Dry Run

In dry-run mode:
- Infer the issue.
- Report the board mutations, files that would be staged, commit message, and push target.
- Do not edit files, commit, or push.
