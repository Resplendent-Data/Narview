# GitHub-compatible diffs with internal enrichment

Narview treats GitHub pull request file and review thread data as the source of truth for diff identity and thread placement, then normalizes it into an internal model for rendering, virtualization, hotspot scoring, and local state. This keeps replies and resolutions aligned with GitHub while still allowing a richer review UI than GitHub's raw patch view.
