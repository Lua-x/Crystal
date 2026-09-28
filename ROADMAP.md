# Roadmap

Crystal is built in phases. Each phase ends with a release; 0.7 becomes 1.0.

## ✅ 0.1 – Foundation

Accounts, sign-in with password or single sign-on, invite links, settings, design system,
Docker image, CI.

## ✅ 0.2 – Lists and tasks

Lists with colors and emoji, list groups, tasks with steps, due dates, priority and
Markdown notes, My Day with suggestions, smart lists, drag and drop (mouse, touch,
keyboard), full-text search, task details as panel or sheet.

## 0.3 – Comfort

- Quick entry with natural language in English and German, e.g.
  `Take out the trash tomorrow 6pm every Tuesday !important #household`, shown as chips
- Recurring tasks (daily, weekly on chosen days, monthly, yearly, custom; from due date or
  from completion)
- Tags and filters
- Keyboard shortcuts, command palette (Cmd/Ctrl+K), shortcut overview (`?`)

## 0.4 – Together

- Share lists with other users of the instance (view or edit)
- Assign tasks to people in shared lists
- Real-time updates for everyone involved

## 0.5 – Reminders

- Reminder time per task, independent of the due date
- Web Push, ntfy, Gotify and Apprise
- Optional daily summary (e.g. at 7 am)
- Optional email (SMTP) for reminders, the daily summary and password resets

## 0.6 – Extras

- Installable app (PWA), offline use with sync on reconnect
- Import from Microsoft To Do and Todoist (CSV) and JSON; full JSON export
- Automatic SQLite backups with configurable retention
- iCal feed of due tasks (read-only, secret link)
- Personal API tokens and interactive API documentation at `/api/docs`
- Attachments (images, PDFs) with size limits
- Simple statistics: completed tasks per week, streaks

## 0.7 → 1.0 – Polish

- Animation and empty-state polish, accessibility review, performance (bundle size, lazy
  loading), documentation with screenshots in light and dark mode

## Later

Ideas that were deliberately postponed:

- **PostgreSQL** as an alternative to SQLite (SQLite is plenty for households; supporting two
  databases doubles schemas, migrations and tests).
- **Serving from a sub-path** (e.g. `https://example.com/todo/`); currently Crystal needs the
  root of a domain or subdomain.
- **A “Recently deleted” view.** Deleted tasks are kept for 30 days, but can only be
  restored right away with “Undo” so far.
- More languages – contributions welcome, see [CONTRIBUTING.md](CONTRIBUTING.md#translations).
