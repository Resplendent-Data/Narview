# Analyze pull request head with base for comparison

Narview should analyze the **Pull Request** head as the primary code state in the **Review Clone**, using the base branch or merge base for diff comparison. It should not default to analyzing a synthetic merge commit, because merge results can introduce base-branch noise and conflict state that obscures the authored change being reviewed.
