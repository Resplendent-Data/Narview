# Hybrid refresh policy for GitHub data

Narview refreshes pull request data when a pull request opens, when the app regains focus, and when the user manually refreshes, with restrained background refresh for the active pull request. Refreshing must respect cache state, backoff, and visible rate-limit status instead of polling aggressively.
