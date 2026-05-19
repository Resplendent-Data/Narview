# Limited offline read support

Narview keeps cached pull request data readable when network access is unavailable, including previously loaded diffs, review threads, and local **Reviewed** state. GitHub writes such as **Replies** and **Resolved** changes require network access in the first version instead of being queued for later sync.
