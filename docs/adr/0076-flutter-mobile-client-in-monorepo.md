# Flutter Mobile Client in Monorepo

Narview will be organized as a monorepo with separate first-class clients for desktop and mobile.

The existing desktop client remains a Tauri, React, TypeScript, and Rust application under `apps/desktop`. The mobile client is a Flutter application under `apps/mobile`, with Android as the first acceptance target and iOS kept present and compiling.

Shared behavior between clients is coordinated through `packages/contracts`, starting with JSON fixtures for Pull Request review data and Review Stack outputs. The desktop client keeps its TypeScript review-domain implementation, while the mobile client ports the deterministic Review Stack behavior to Dart and proves parity against shared fixtures.

Mobile v1 is GitHub-data-first. It can complete the core Pull Request review loop from GitHub pull request data without requiring a managed Review Clone. Managed Review Clones, deep local indexing, and desktop-native analysis remain desktop capabilities until a separate mobile enrichment design exists.

This avoids forcing mobile to clone and index repositories on-device, keeps Android v1 focused on the review workflow, and prevents TypeScript-to-Dart sharing from becoming a fragile cross-runtime coupling.
