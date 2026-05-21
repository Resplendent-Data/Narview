# Reviewed for review threads and targets

Narview should use **Reviewed** as the single primary local attention state for both **Review Threads** and **Review Targets**. This avoids adding a separate "inspected" concept while still supporting self-review, human review of another developer's pull request, and CodeRabbit or human thread triage; **Viewed** remains a secondary file-level state for file-change fallback workflows.
