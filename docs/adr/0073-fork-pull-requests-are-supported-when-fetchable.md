# Fork pull requests are supported when fetchable

Narview's **Review Clone** flow should support same-repository pull requests first and support fork pull requests when the head ref is fetchable with the user's GitHub access. If Narview cannot fetch a fork head because of permissions, deleted branches, or repository access limits, it should show a clear clone-unavailable state and fall back to limited GitHub-provided review data.
