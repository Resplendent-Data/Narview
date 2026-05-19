# Page and cache diffs on demand

Narview loads pull request metadata, review threads, and file-level summaries before loading full diff content, then pages and caches diff hunks as the user drills in. This keeps very large pull requests usable quickly instead of blocking the review on downloading or rendering every changed line.
