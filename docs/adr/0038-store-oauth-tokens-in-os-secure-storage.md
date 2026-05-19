# Store OAuth tokens in OS secure storage

Narview stores GitHub OAuth tokens in OS secure storage rather than SQLite, config files, or cache directories. macOS uses Keychain and Linux uses the platform's Secret Service or equivalent secure storage; if secure storage is unavailable, Narview should fail clearly instead of silently writing tokens to disk.
