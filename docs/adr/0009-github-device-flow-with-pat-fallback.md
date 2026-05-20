# OAuth-only GitHub authentication for v1

Narview authenticates with GitHub through OAuth only in v1. This follows the common desktop-app pattern of browser-based GitHub sign-in and keeps onboarding simple by deferring GitHub App installation, device-flow fallback, and personal access token support.

The app ships with Narview's public GitHub OAuth client ID baked into the desktop binary so users can sign in without creating their own GitHub OAuth app. The client ID is not a secret; OAuth tokens remain private and are stored in OS secure storage. Developers can still override the bundled client ID with `NARVIEW_GITHUB_CLIENT_ID` or `NARVIEW_GITHUB_OAUTH_CLIENT_ID` when testing a separate GitHub OAuth app.

The desktop app shows the device code inside Narview before sending the user to GitHub. The code is large, copyable, and still repeated in the Inspector so GitHub's device authorization page never gets ahead of the in-app sign-in instructions.
