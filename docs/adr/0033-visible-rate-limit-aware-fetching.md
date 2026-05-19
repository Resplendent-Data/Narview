# Visible rate-limit-aware fetching

Narview fetches GitHub data incrementally, caches aggressively, and makes GitHub rate-limit status visible when it affects review data or actions. This prevents large pull requests and fast pull request switching from turning API limits into confusing missing data.
