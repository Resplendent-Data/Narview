# Start review threads from Narview

Narview supports creating new GitHub-visible **Review Threads** from the review surface, and GitHub-created threads sync back into Narview. This supersedes the earlier v1 limitation that Narview could only reply to existing threads, because the full review workflow needs one place to inspect code, create human feedback, and export that feedback into **Handoff Packets** for external coding agents.

New Review Threads are published immediately rather than collected as a draft GitHub review. This keeps the first full-review workflow simple and avoids draft review lifecycle complexity around pending comments, submit/cancel behavior, approval state, and stale diff positions.
