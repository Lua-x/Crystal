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
- Secrets (session and invite tokens, later API tokens) are stored only as **SHA-256 hashes**.

Tables in 0.1:

| Table             | Purpose                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`           | Accounts: username, display name, optional email, role, Argon2id password hash (null for SSO-only accounts), language, time zone, UI preferences (JSON) |
| `user_identities` | Linked OpenID Connect identities (issuer + subject)                                                                                                     |
| `sessions`        | Server-side sessions: token hash, device, last activity, expiry                                                                                         |
| `invites`         | Invite links: token hash, role, usage limit, expiry, revocation                                                                                         |

Planned additions, each with its own migration when the feature arrives:

| Phase | Tables                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2     | `lists`, `list_members` (role and each person's own sidebar placement), `list_groups`, `tasks`, `subtasks`, `my_day`, full-text index |
| 3     | `task_tags`                                                                                                                           |
| 5     | `push_subscriptions`, `notification_channels`                                                                                         |
| 6     | `api_tokens`, `calendar_feeds`, `attachments`                                                                                         |

Design decisions for tasks (phase 2 onwards):

- **Order** uses fractional indexing (string keys), so moving a task changes a single row.
- **Due dates** are stored as a local date and optional time without a time zone (`2026-10-01`,
  `18:00`) and interpreted in the user's time zone; **reminders** are absolute UTC instants.
- **Deletions** are recorded with `deleted_at` first, so offline clients learn about them.

## Authentication and security

- **Passwords:** Argon2id (19 MiB, 2 iterations, 1 lane – OWASP recommendation). Unknown
  usernames cost the same time as wrong passwords.
- **Sessions:** a random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` and
  `__Host-` prefixed over HTTPS). The database stores only its hash. Sessions last
  `SESSION_TTL_DAYS` and are extended while in use. Changing the password signs out all other
  sessions; disabling an account or resetting its password signs it out everywhere.
- **CSRF:** every state-changing request must carry an `Origin` header matching `BASE_URL` (or
  the requested host). Combined with `SameSite=Lax`, this also prevents login CSRF.
- **OpenID Connect:** authorization code flow with PKCE, `state` and `nonce` via
  `openid-client`. The per-attempt secrets travel in an AES-GCM encrypted, short-lived cookie.
  Identities are linked by issuer and subject, never by email.
- **Rate limits:** sign-in attempts per address and per address + account, registrations per
  address, and an overall API budget per user.
- **Headers:** strict Content Security Policy (no inline scripts, no third-party origins),
  `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, optional HSTS. API
  responses are `Cache-Control: no-store`.
- **Container:** distroless base image without shell or package manager, running as user
  `65532`, read-only root filesystem in the provided Compose file.
- **Privacy:** no telemetry and no requests to third parties.

## Design system

The UI is built from tokens in `apps/web/src/styles/tokens.css`: warm neutral surfaces, text
colors, fills, a user-selectable accent color, radii, shadows, Apple-like text styles and
motion. Colors adapt with `light-dark()`; the theme follows the system unless the user picks
light or dark. Any accent color is adjusted in OKLCH so that text on it and accent-colored
text reach WCAG AA on every surface in both modes. Unit tests verify all token contrasts, and
the end-to-end tests run axe on every screen in light and dark mode.
