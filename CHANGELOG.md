# Changelog

All notable changes to Crystal are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Crystal uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-09-30

Extras: offline, import and export, backups, calendar, API, attachments, statistics.

### Added

- Personal access tokens for scripts and other apps (**Settings → API**), read-only or with
  write access, optionally expiring. Tokens reach lists and tasks but never account settings.
  See [docs/api.md](docs/api.md).
- Interactive API documentation at `/api/docs`.
- A private calendar link (**Settings → Calendar**) to subscribe to your due tasks in Apple
  Calendar, Google Calendar, Outlook or Thunderbird. The link can be replaced or turned off.
- Export all lists and tasks as a JSON file, and import from a Crystal export, Todoist (CSV)
  or Microsoft To Do via Outlook (CSV) under **Settings → Import & export**. Imports always
  create new lists; Todoist dates such as “every saturday” become repeating tasks.
- API: `GET /export` and `POST /import`.
- Automatic database backups every 24 hours while Crystal keeps running, keeping the newest
  seven (`BACKUP_INTERVAL_HOURS`, `BACKUP_RETENTION`, `BACKUP_DIR`). Administrators can make and
  download backups under **Settings → Backups**. See [docs/backup.md](docs/backup.md).
- Attach images and PDFs to tasks – with the button or by dropping them on the details – up to
  `ATTACHMENT_MAX_MB` (10 MiB) each and 20 per task. Images show as thumbnails; rows show a
  paperclip.
- Statistics (account menu or command palette): tasks completed per week over the last 12
  weeks, today, in total, and your streak of days with something done.
- Crystal can be installed as an app (on phones via “Add to Home Screen”). It opens without a
  connection and shows your lists and tasks; tasks you add or change offline are saved once
  you are back online, even after closing the app. A banner shows when you are offline.
- Web Push on iPhone and iPad works once Crystal is added to the Home Screen.

### Security

- Invite and calendar links no longer appear in the request log.
- Request bodies are limited to 1 MiB (12 MiB for imports).
- Attachments are recognized by their content, stored under random names and served with a
  sandboxing Content Security Policy, so an uploaded file can never run code.

## [0.5.0] - 2026-09-29

Reminders and notifications.

### Added

- Reminders: pick a date and time per task, independent of the due date, or one of the quick
  choices (later today, tomorrow, next week, when due). The assignee gets the reminder, or
  whoever set it. Repeating tasks move their reminder along, at the same local time.
- Notifications in the browser (Web Push) – per device, with a test button – and through
  ntfy, Gotify, an Apprise API server or email, under **Settings → Notifications**. Failed
  deliveries show why.
- A daily summary at a time of your choice with what is due today and what is overdue.
- A notification when someone assigns a task to you (can be turned off).
- “Forgot password?” sends a reset link by email when SMTP and `BASE_URL` are configured.
- Configuration: `SMTP_*`, `REMINDER_INTERVAL_SECONDS` and `NOTIFY_PRIVATE_NETWORKS`. See
  [docs/configuration.md](docs/configuration.md#notifications).
- API: `remindAt` on tasks, `/notifications/channels`, `/notifications/push` and
  `POST /auth/forgot-password` and `POST /auth/reset-password`.

### Fixed

- Text on hovered and pressed primary buttons could fall below AA contrast in dark mode.

### Security

- Notification services are only reached over http(s), without following redirects, with a
  ten-second limit and without showing their answers. Link-local addresses are always blocked;
  private networks can be blocked, too. Access tokens are stored encrypted.

## [0.4.0] - 2026-09-29

Together: sharing, assigning, live updates.

### Added

- Share lists with other people on the instance, who can edit or only view them. Owners
  change access or remove people; everyone else can leave. The default list stays private.
- Assign tasks to people who can edit the list, and find everything assigned to you in the
  new smart list “Assigned to me”. Repeating tasks keep their assignee.
- Live updates: changes others make to shared lists (and changes from your other tabs)
  appear without reloading. See [docs/reverse-proxy.md](docs/reverse-proxy.md) for Nginx.
- Every person has an avatar color of their own.
- API: `GET /people`, `GET|POST /lists/{id}/members`, `PATCH|DELETE
/lists/{id}/members/{userId}`, `assigneeId` on tasks, the `assigned` smart list and the
  event stream `GET /events`.

### Fixed

- A page that opened while a change was being saved could keep showing stale data.

## [0.3.0] - 2026-09-28

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

[Unreleased]: https://github.com/Lua-x/Crystal/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/Lua-x/Crystal/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Lua-x/Crystal/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Lua-x/Crystal/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Lua-x/Crystal/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Lua-x/Crystal/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Lua-x/Crystal/releases/tag/v0.1.0
