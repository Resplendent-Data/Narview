# Bounded cache with pinned pull requests

Narview uses a bounded cache for pull request metadata and diff content, with explicit pinning for pull requests the user wants to keep available longer. Cache eviction may remove large fetched data, but it must not remove local **Reviewed** state.
