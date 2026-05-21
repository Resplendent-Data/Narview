---
title: "Deep Analysis For TypeScript JavaScript And Python"
type: AFK
status: ready
blocked_by: ["21-analysis-index-and-hunk-map-mvp.md"]
depends_on_story_ids: [12, 14, 18]
slice_order: 22
---

## What to build

Add deep structural analysis for TypeScript, JavaScript, and Python. Narview should identify changed symbols, map hunks to enclosing symbols, detect same-file calls, and capture imports and exports without claiming framework-level or runtime understanding.

## Acceptance criteria

- [ ] TypeScript and JavaScript files produce symbol-level Attention Nodes for changed functions, methods, classes, components, module-level constants, and exports.
- [ ] Python files produce symbol-level Attention Nodes for changed functions, methods, classes, and module-level declarations.
- [ ] Diff hunks map to enclosing symbols where possible and fall back to hunk nodes where not possible.
- [ ] Same-file calls between known symbols are detected for supported languages.
- [ ] Imports and exports between changed files are detected where deterministic syntax analysis supports them.
- [ ] Analysis results include human-readable reasons for symbol and relationship detection.
- [ ] Tests cover TS, JS, Python, parser failures, mixed supported/unsupported PRs, and fallback behavior.

## Blocked by

- `21-analysis-index-and-hunk-map-mvp.md`
