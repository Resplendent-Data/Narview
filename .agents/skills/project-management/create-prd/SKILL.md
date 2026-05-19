---
name: create-prd
description: Synthesize the current conversation and codebase context into a PRD markdown file saved in `prds/<project-folder>/YYYY-MM-DD-short-title.md`. Use when the user asks to create a PRD, convert a discussion into a PRD, or finalize a completed grill-with-docs session.
---

# Create PRD

This skill converts the current conversation context and codebase understanding into a PRD file in this repository.

Do not open a new interview. Synthesize what is already known, then ask only the minimum clarification needed for ambiguous naming.

## Process

1. Explore the repo and current context enough to use project terminology correctly. Respect existing domain language and ADR decisions in the area.
2. Determine the PRD project folder:
   - Use the user-provided project name if present.
   - Otherwise infer it from the dominant feature/domain in the conversation and repo vocabulary.
   - Use kebab-case for folder names.
   - If more than one folder is plausible, ask one disambiguation question.
3. Determine the PRD file name:
   - Format: `YYYY-MM-DD-short-title.md`.
   - Use the current date and a concise kebab-case title.
   - If the title is ambiguous, ask one clarification question.
4. Create directories when needed:
   - Ensure `prds/` exists.
   - Ensure `prds/<project-folder>/` exists.
5. Write the PRD content to `prds/<project-folder>/<file-name>.md` using the template below.
6. Return the saved path and a short summary of what was captured.
7. Proactively suggest the next step:
   - Offer to run `/create-issues <saved-prd-path>` to break the PRD into board-ready implementation slices.

When this skill is used after `/grill-with-docs`, prioritize decisions finalized during the grilling session and preserve agreed terminology.

## PRD Template

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A long, numbered list of user stories in this format:

1. As a <role>, I want <capability>, so that <outcome>.

Cover all major workflow branches and edge cases.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- Modules that will be built or modified
- Interfaces that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do not include specific file paths or code snippets.

Exception: if a prototype snippet expresses a decision more precisely than prose (for example a state shape or schema contract), include only the decision-rich fragment and note that it came from a prototype.

## Testing Decisions

A list of testing decisions that were made. Include:

- What makes a good test (external behavior over implementation details)
- Which modules will be tested
- Prior art for similar tests in the codebase

## Out of Scope

A description of what is not included in this PRD.

## Further Notes

Any additional notes relevant to implementation or rollout.
