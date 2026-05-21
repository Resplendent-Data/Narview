# Managed review clones for attention maps

Narview requires a Narview-owned **Review Clone** for the full **Attention Map** experience, superseding the earlier remote-only review model. The clone gives Narview enough repository context to analyze changed symbols, references, imports, tests, and structural relationships, while staying separate from the user's coding checkout so branch switching and pull request review never disturb active development work.

A **Review Clone** should normally be persistent per repository so Narview can reuse Git objects and analysis indexes across pull requests. Narview should keep the first implementation operationally simple, using a managed clean checkout unless stronger isolation is needed later.
