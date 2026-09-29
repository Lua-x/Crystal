# Architecture

## Overview

Crystal is a single container: a Node.js server (Hono) that serves a JSON API under `/api`
and the built React app for every other path. Data is stored in SQLite inside the data
volume.

```
Browser ──HTTPS──▶ reverse proxy ──HTTP──▶ Crystal (Node.js)
                                             ├─ /api/v1/*        JSON API (Zod-validated, OpenAPI)
                                             ├─ /api/health      health check
                                             ├─ /api/openapi.json
                                             └─ /*               web app (static files, SPA fallback)
                                                    │
                                                    ▼
                                             /data/crystal.db  (SQLite, WAL mode)
```

- **Server:** Hono with `@hono/zod-openapi`. Routes validate input with the Zod schemas from
  `packages/shared`; the same definitions produce the OpenAPI document.
- **Database:** SQLite through `better-sqlite3` and Drizzle ORM. Migrations are plain SQL files,
  applied on startup. PostgreSQL support is on the [roadmap](../ROADMAP.md).
- **Web app:** React, TanStack Router and Query, Tailwind CSS with design tokens, Radix UI
  primitives and Motion for animation.

## Data model

Conventions:

- IDs are **UUIDv7** – sortable by creation time and generated in application code, so offline
  clients will be able to create records without a round trip.
- Timestamps are milliseconds since the epoch (UTC).
- Secrets (session, invite, reset and API tokens) are stored only as **SHA-256 hashes**.

Tables:

| Table                   | Purpose                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                 | Accounts: username, display name, optional email, role, Argon2id password hash (null for SSO-only accounts), language, time zone, UI preferences (JSON) |
| `user_identities`       | Linked OpenID Connect identities (issuer + subject)                                                                                                     |
| `sessions`              | Server-side sessions: token hash, device, last activity, expiry                                                                                         |
| `calendar_feeds`        | A person's private iCal link: token hash for lookup, the token sealed with AES-GCM so the link can be shown again                                       |
| `api_tokens`            | Personal access tokens: hash, first characters for display, scope (`read`/`write`), last use, expiry                                                    |
| `invites`               | Invite links: token hash, role, usage limit, expiry, revocation                                                                                         |
| `lists`                 | Name, color, emoji, owner; one default list per account                                                                                                 |
| `list_members`          | Who can see a list with which role (`owner`, `editor`, `viewer`), and each person's own group and position for it in the sidebar                        |
| `list_groups`           | Per-person folders in the sidebar, collapsible                                                                                                          |
| `tasks`                 | Title, notes, due date and time, priority, important flag, position, repeat rule (JSON), completion, soft deletion                                      |
| `subtasks`              | Steps of a task, with their own order and completion                                                                                                    |
| `task_tags`             | Tags of a task, in lower case                                                                                                                           |
| `my_day`                | Which tasks a person added to My Day, and for which date                                                                                                |
| `task_search`           | SQLite FTS5 index over titles, notes, steps and tags                                                                                                    |
| `notification_channels` | A person's ntfy, Gotify, Apprise and email channels; settings encrypted with AES-GCM, last delivery and error                                           |
| `push_subscriptions`    | Browsers that receive Web Push: endpoint and keys                                                                                                       |
| `password_resets`       | Reset links sent by email: token hash, expiry, use                                                                                                      |

Planned additions, each with its own migration when the feature arrives:

| Phase | Tables        |
| ----- | ------------- |
| 6     | `attachments` |

Design decisions for lists and tasks:

- **Access** always goes through `list_members`. A list that does not exist and one you may
  not see both answer `404`, so IDs reveal nothing. Sharing (0.4) only adds rows there.
- **Order** uses fractional indexing (string keys), so moving a task changes a single row.
  If two neighbors ever end up with the same key (for example after concurrent moves), the
  list is renumbered in the same transaction.
- **Due dates** are stored as a local date and optional time without a time zone (`2026-10-01`,
  `18:00`) and interpreted in the user's time zone; **reminders** are absolute UTC instants.
  “Today” is always computed in the user's time zone, on the server and in the app.
- **My Day** entries belong to a date, so the list starts empty every day without a
  scheduled job; old entries are cleaned up hourly.
- **Deletions** are recorded with `deleted_at` first, so offline clients learn about them.
  Deleted tasks can be restored (the app offers “Undo”) and are removed for good after 30
  days.
- **Search** uses an FTS5 index with prefix matching and accent folding (`cafe` finds
  “Café”, `muller` finds “Müller”); the index is updated in the same transaction as the task.
- **Repeating tasks** are a series of separate tasks. Completing one creates the next
  occurrence and hands the rule on (`next_task_id` links them), so history stays intact and
  each series has exactly one open task. Reopening takes the next occurrence back if nobody
  has touched it yet. Monthly and yearly series remember their first due date
  (`recurrence_anchor`) to keep their day across short months. The date arithmetic lives in
  `packages/shared` and is covered by unit tests.
- **Quick entry** is parsed in the browser (`parseQuickEntry` in `packages/shared`); the API
  only receives structured fields, so other clients can create tasks without it.
- **Sharing** adds rows to `list_members` with the role `editor` or `viewer`; every list has
  one owner. Each person keeps their own sidebar placement and groups. Tasks can be assigned
  to people who can edit the list (`tasks.assignee_id`); losing that access unassigns them.
  The default list stays private.

## Live updates

Open apps learn about changes over Server-Sent Events (`GET /api/v1/events`):

```
Tab A ──PATCH /tasks/…──▶ Crystal ──commit──▶ EventHub ──"changed: [listId]"──▶ Tab B, Tab C
       X-Crystal-Client: A                     (members of the list, except tab A)
```

- After every write, the services announce which lists changed to the members of those lists
  (or, for personal changes like sidebar order, to the author's other tabs). Events carry
  only list IDs; clients refetch what they show, through the same permission checks as
  always, so an event never leaks data.
- Each browser tab sends a random `X-Crystal-Client` header with its requests and the same
  value when it opens the stream, so it does not hear about its own changes.
- The stream sends a keep-alive every 25 seconds and ends when the session ends. Browsers
  reconnect on their own; after a reconnect the app refetches everything, since events may
  have been missed.
- Everything lives in the one server process, which fits the single-container design.

On the client, TanStack Query caches lists, tasks and the smart lists. Changes are applied
optimistically and rolled back with an error message when the server rejects them; the
affected queries are refetched afterwards, so counts and smart lists stay consistent.

## Reminders and notifications

```
ReminderService (every 30 s) ──claim due reminders──▶ NotificationService ──▶ Web Push (per browser)
  tasks.remind_at ≤ now, not yet reminded                                   ├─▶ ntfy / Gotify / Apprise
  daily summaries whose local time has come                                 └─▶ email (SMTP)
```

- A reminder is an instant (`tasks.remind_at`), independent of the floating due date. The
  assignee gets it, otherwise whoever set it (`reminder_by`). Each round marks due reminders
  as sent (`reminded_at`) in the same statement that selects them, before sending, so nothing
  goes out twice – not even after a crash. Reminders missed by more than a day (the server was
  down) are dropped.
- Repeating tasks hand the reminder on to the next occurrence, shifted by as many days as the
  due date, at the same local time in the recipient's time zone (also across daylight saving
  time changes).
- The daily summary goes out once per local day (`users.summary_sent_on`), within two hours
  after the chosen time.
- Delivery runs in the background. Every channel records its last success or the reason of its
  last failure; browsers whose subscription expired are forgotten.
- **Web Push** uses VAPID keys derived from `SECRET_KEY` (HKDF), so there is nothing to
  configure or store. The service worker (`/sw.js`) shows the notification and opens the task
  in an existing window when possible.
- **Outgoing requests** to notification services are made with Node's HTTP client and a
  DNS lookup that only hands out allowed addresses, checked at connection time (so DNS
  rebinding does not help). Redirects are not followed and answers are discarded.

## Password reset

With SMTP and `BASE_URL` configured, “Forgot password?” emails a random link (stored as a
hash) that works once within an hour. The answer is the same whether an account exists or
not, and the email is sent in the background so the response time reveals nothing either.
Setting the new password signs the account out everywhere.

## Authentication and security

- **Passwords:** Argon2id (19 MiB, 2 iterations, 1 lane – OWASP recommendation). Unknown
  usernames cost the same time as wrong passwords.
- **Sessions:** a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and
  `__Host-` prefixed over HTTPS). The database stores only its hash. Sessions last
  `SESSION_TTL_DAYS` and are extended while in use. Changing the password signs out all other
  sessions; disabling an account or resetting its password signs it out everywhere.
- **CSRF:** every state-changing request must carry an `Origin` header matching `BASE_URL` (or
  the requested host). Combined with `SameSite=Lax`, this also prevents login CSRF.
- **API tokens:** `Authorization: Bearer crystal_…`. A request with this header is authenticated
  by the token alone – the session cookie is ignored – so it needs no `Origin` check; browsers
  cannot add the header cross-site because Crystal allows no CORS. Tokens only reach task and
  list endpoints (`tokenPolicy`), read-only tokens only `GET`.
- **OpenID Connect:** authorization code flow with PKCE, `state` and `nonce` via
  `openid-client`. The per-attempt secrets travel in an AES-GCM encrypted, short-lived cookie.
  Identities are linked by issuer and subject, never by email.
- **Rate limits:** sign-in attempts per address, failed sign-in attempts per address +
  account (a successful sign-in resets the count), registrations per address, and an
  overall API budget per user.
- **Headers:** strict Content Security Policy (no inline scripts, no third-party origins),
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, optional HSTS. API
  responses are `Cache-Control: no-store`.
- **Container:** distroless base image without shell or package manager, running as user
  `65532`, read-only root filesystem in the provided Compose file.
- **Privacy:** no telemetry. Crystal only contacts other servers for notifications a person
  turned on: the push service of their browser, the ntfy, Gotify or Apprise server they
  entered, and the configured mail server.

## Design system

The UI is built from tokens in `apps/web/src/styles/tokens.css`: warm neutral surfaces, text
colors, fills, a user-selectable accent color, radii, shadows, Apple-like text styles and
motion. Colors adapt with `light-dark()`; the theme follows the system unless the user picks
light or dark. Any accent color is adjusted in OKLCH so that text on it and accent-colored
text reach WCAG AA on every surface in both modes. Unit tests verify all token contrasts, and
the end-to-end tests run axe on every screen in light and dark mode.
