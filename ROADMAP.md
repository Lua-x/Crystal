# Roadmap

Crystal was built in phases, each ending with a release; the seventh became 1.0. What comes
next is collected under [Later](#later).

## ✅ 0.1 – Foundation

Accounts, sign-in with password or single sign-on, invite links, settings, design system,
Docker image, CI.

## ✅ 0.2 – Lists and tasks

Lists with colors and emoji, list groups, tasks with steps, due dates, priority and
Markdown notes, My Day with suggestions, smart lists, drag and drop (mouse, touch,
keyboard), full-text search, task details as panel or sheet.

## ✅ 0.3 – Comfort

Quick entry with natural language in English and German shown as chips, repeating tasks
(from the due date or from completion), tags with their own views, keyboard shortcuts with
an overview (`?`), command palette (⌘K / Ctrl+K).

## ✅ 0.4 – Together

Sharing lists with people on the instance (edit or view), assigning tasks with an “Assigned
to me” list, live updates for everyone involved.

## ✅ 0.5 – Reminders

Reminders per task independent of the due date, notifications through Web Push, ntfy, Gotify,
Apprise and email, a daily summary, notifications about assigned tasks, password reset by
email.

## ✅ 0.6 – Extras

Installable app that works offline and sends queued changes on reconnect, import from
Microsoft To Do (via Outlook) and Todoist plus JSON export, automatic database backups, a
private iCal feed, personal API tokens with documentation at `/api/docs`, attachments,
statistics.

## ✅ 1.0 – Polish

A faster start through loading parts of the app on demand, page titles, a skip link and
page announcements for screen readers, placeholder rows while loading, gentler empty states,
and screenshots in light and dark mode.

## Later

Ideas that were deliberately postponed:

- **Offline changes to lists and sharing.** Offline, tasks and steps can be added and changed;
  creating lists, sharing and settings still need a connection.
- **Attachments in backups and exports.** Automatic backups and the JSON export contain the
  database only; attachments are covered by backing up the data directory.
- **Storage quotas** per person for attachments (today: a size limit per file and 20 files per
  task).
- **PostgreSQL** as an alternative to SQLite (SQLite is plenty for households; supporting two
  databases doubles schemas, migrations and tests).
- **Serving from a sub-path** (e.g. `https://example.com/todo/`); currently Crystal needs the
  root of a domain or subdomain.
- **A “Recently deleted” view.** Deleted tasks are kept for 30 days, but can only be
  restored right away with “Undo” so far.
- **Saved filters** that combine conditions (e.g. `#work` and due this week). Tags have
  their own views, and search finds tags, too.
- **Handing over a list** to another owner. Today the owner can share with editors, but
  ownership stays; deleting an account deletes the lists it owns.
- **Assigning in quick entry** (e.g. `+sam`), and an activity history for shared lists.
- **Snoozing a reminder** right from the notification, and reminders in quick entry (e.g.
  `remind 5pm`).
- **HTML emails** – Crystal sends plain text for now.
- More languages – contributions welcome, see [CONTRIBUTING.md](CONTRIBUTING.md#translations).
