# Changelog

All notable changes to Crystal are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Crystal uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

Comfort: quick entry, repeats, tags, keyboard.

### Added

- Quick entry understands dates, times, repeats, importance, priority, tags and lists in
  English and German (“Take out the trash tomorrow 6pm every Tuesday !important
  #household”) and shows them as chips that can be dismissed; it can be turned off in the
  account settings. See [docs/quick-entry.md](docs/quick-entry.md).
- Repeating tasks: daily, weekly (optionally on chosen weekdays), monthly or yearly, every n
  periods, counted from the due date or from completion. Completing one creates the next
  occurrence; undoing the tick right away takes it back.
- Tags, with a view per tag, a section in the sidebar and an editor in the task details.
  Search finds tags, too.
- Keyboard shortcuts: `N` new task, `/` search, `G` then a letter to go to a smart list, and
  on a focused task `↑`/`↓`, `X`, `S`, `M` and `Delete`. `?` shows an overview.
- Command palette (⌘K / Ctrl+K) to go to lists, tags and smart lists, find tasks, add a
  task with quick entry and run actions such as switching the appearance.
- API: `recurrence` and `tags` on tasks, `GET /tags` and `GET /tags/{tag}/tasks`.

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
