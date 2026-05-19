---
name: create-issues
description: Convert a PRD markdown file into board-ready implementation issues as tracer-bullet vertical slices. Save outputs to `prds/<project-folder>/issues/` and update the source PRD with issue links. Use when the user asks to break a PRD into development chunks or generate issues from a PRD.
---

# Create Issues

This skill converts a PRD into implementation issues stored in this repository.

Primary input is a PRD file path. If no PRD path is provided, request it before continuing.

## Process

1. Gather context from the PRD file path.
   - Read the full PRD.
   - Extract user stories and keep stable story IDs (`1`, `2`, etc. from the PRD numbering).
2. Explore the codebase if needed to align terminology with project language and ADRs.
3. Draft tracer-bullet vertical slices.
   - Each slice should be a thin, complete end-to-end increment.
   - Avoid horizontal layer-only slices.
   - Mark each slice as `AFK` (no human interaction needed) or `HITL` (human interaction required).
   - Prefer `AFK` when possible.
4. Quiz the user before writing files.
   - Present a numbered proposal with:
     - `Title`
     - `Type` (`AFK`/`HITL`)
     - `Blocked by`
     - `User stories covered`
   - Ask for approval on granularity, dependencies, merges/splits, and type assignments.
   - Do not write issue files until approved.
5. Write issue artifacts after approval.
   - Derive `<project-folder>` from the PRD path (`prds/<project-folder>/<prd-file>.md`).
   - Ensure `prds/<project-folder>/issues/` exists.
   - Write one file per issue in dependency order:
     - `prds/<project-folder>/issues/<NN>-<issue-title>.md`
   - Generate or update:
     - `prds/<project-folder>/issues/README.md`
6. Update the source PRD.
   - Add (or refresh) a `## Implementation Issues` section.
   - Link to `issues/README.md` and the generated issue files.
   - Keep this update append-only and non-destructive.
7. Return a concise summary with:
   - number of issues
   - path to `issues/README.md`
   - path to updated PRD
   - suggested next command: `/start-next-issue <project-folder>`

## Issue File Requirements

Each issue file must include YAML frontmatter:

```yaml
---
title: "<issue title>"
type: AFK
status: ready
blocked_by: []
depends_on_story_ids: []
slice_order: 1
---
```

Rules:
- Allowed `status` values: `ready`, `in-progress`, `done`.
- Default generated status: `ready`.
- `blocked_by` should reference blocking issue file names (for example `01-create-report-endpoint.md`).
- `depends_on_story_ids` should reference PRD story numbers.
- `slice_order` matches the `NN` file prefix.

## Issue Body Template

## What to build

A concise description of this end-to-end vertical slice.

Avoid specific file paths or code snippets unless a prototype snippet encodes a decision more precisely than prose can.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- Blocking issue file reference(s), or
- `None - can start immediately`

## Kanban Manifest Requirements

`issues/README.md` must work as a board-friendly manifest for planning and execution.

Include:
1. A dependency-ordered slice list table with:
   - order
   - title
   - type
   - status
   - blocked by
   - stories
   - file
2. Three status sections for quick Kanban mapping:
   - `## Ready`
   - `## In Progress`
   - `## Done`

At generation time, all issues start in `Ready`.
