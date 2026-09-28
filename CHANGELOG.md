# Changelog

All notable changes to Crystal are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Crystal uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-09-28

Lists and tasks.

### Added

- Lists with twelve colors and an optional emoji, list groups (folders) that can be
  collapsed, and a default list for every account.
- Tasks with steps, due date and optional time, priority, an “important” star and Markdown
  notes; completed tasks are collected in a collapsible section per list.
- My Day with suggestions (overdue, due soon, recently added); it starts empty every day.
- Smart lists Important, Planned (grouped into overdue, today, tomorrow, this week and
  later), Overdue, All and Completed, with counts in the sidebar.
- Drag and drop with mouse, touch and keyboard: sort tasks, move them onto another list,
  and sort lists and groups in the sidebar.
- Full-text search in titles, notes and steps.
- Task details as a side panel on large screens and as a sheet on phones and tablets;
  context menu with the most common actions; undo for deleted tasks.
- Deleted tasks are kept for 30 days before they are removed for good.
- API endpoints for lists, groups, tasks, steps, smart lists and search (see
  `/api/openapi.json`).

### Changed

- My Day is the new start page.
- Only failed sign-in attempts count toward the per-account limit, so signing in often
  from the same device no longer locks you out for a while.

## [0.1.0] - 2026-09-27

The foundation: accounts, sign-in, design system and a production-ready container. Lists
and tasks follow in 0.2.

### Added

- Accounts with usernames and optional email addresses; the first account becomes the
  administrator.
- Registration modes `invite` (default), `open` and `closed`, and invite links with usage
  limits, expiry and revocation.
- Single sign-on with OpenID Connect: automatic account creation, linking to existing
  accounts, admin group mapping.
- Settings for profile, language, time zone, password, appearance and signed-in devices.
- Administration of users (roles, disabling, password reset, deletion) and invite links.
- Design system with light and dark mode, nine accent colors or a custom one, adjusted
  automatically for WCAG AA contrast.
- English and German user interface.
- Docker image for `linux/amd64` and `linux/arm64` (distroless, non-root), Docker Compose
  file, health check at `/api/health`, OpenAPI document at `/api/openapi.json`.
- Security: Argon2id password hashing, hashed session tokens, CSRF protection, rate limiting,
  strict Content Security Policy.

[Unreleased]: https://github.com/Lua-x/Crystal/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/Lua-x/Crystal/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Lua-x/Crystal/releases/tag/v0.1.0
