---
title: "Launchable Guided Review Shell"
type: AFK
status: in-progress
blocked_by: []
depends_on_story_ids: [12, 13, 14, 31, 39, 40, 41]
slice_order: 1
---

## What to build

Create the launchable Narview desktop shell with Tauri, React, TypeScript, Rust, shadcn/ui, Tailwind, light/dark themes, compact desktop density, and a fixture-backed Guided Review Workspace. The shell should demonstrate the core navigation shape: review map, review canvas, inspector, focus mode, command palette entry point, and visible Keyboard Flow cues.

## Acceptance criteria

- [ ] The app launches on the local development machine as a Tauri desktop app.
- [ ] The UI uses React, TypeScript, shadcn/ui, Tailwind, and theme tokens for light and dark modes.
- [ ] A fixture-backed Guided Review Workspace renders a left review map, center canvas, and right inspector.
- [ ] Focus mode hides nonessential panels and can be toggled from the UI.
- [ ] A command palette shell opens from UI and keyboard entry points.
- [ ] Major placeholder actions display visible shortcut cues.
- [ ] Automated smoke coverage verifies the shell renders and theme/focus mode toggles work.

## Blocked by

- `None - can start immediately`
